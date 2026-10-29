import type { Buffer } from 'node:buffer';
import type { z } from 'zod';

import type { createModelSchema, ModelCategory, ModelFile } from './schema';

import { createHash, randomUUID } from 'node:crypto';
import { lstat, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { getConfig } from '../../config';
import { useDatabase } from '../../database';
import { ApiError } from '../../response';
import { ComfyUiClient } from '../capabilities/comfyui/client';
import {
  assembleModelFile,
  availableModelBytes,
  checkedDirectory,
  modelRoot,
  writeModelPart,
} from './files';
import { MODEL_PART_BYTES, modelInputs } from './schema';

export interface ManagedModel {
  id: string;
  name: string;
  category: ModelCategory;
  note: string;
  files: ModelFile[];
  status:
    | 'cancelled'
    | 'failed'
    | 'queued'
    | 'ready'
    | 'uploading'
    | 'verifying';
  totalBytes: number;
  progress: number;
  error: null | string;
  createdBy: string;
  createdAt: Date;
}
const columns = `id, name, category, note, files, status, total_bytes::float8 AS "totalBytes", CASE WHEN status = 'uploading' THEN COALESCE((SELECT floor(sum(p.size)::numeric * 100 / managed_models.total_bytes)::integer FROM managed_model_parts p WHERE p.model_id = managed_models.id), 0) ELSE progress END AS progress, error, created_by AS "createdBy", created_at AS "createdAt"`;
export async function getManagedModel(id: string) {
  const [model] = await useDatabase().unsafe<ManagedModel[]>(
    `SELECT ${columns} FROM managed_models WHERE id = $1`,
    [id],
  );
  if (!model) throw new ApiError(404, 'MODEL_NOT_FOUND', '模型记录不存在');
  return model;
}
export async function listManagedModels() {
  return useDatabase().unsafe<ManagedModel[]>(
    `SELECT ${columns} FROM managed_models ORDER BY created_at DESC LIMIT 500`,
  );
}
export async function createManagedModel(
  input: z.infer<typeof createModelSchema>,
  actor: string,
) {
  const config = getConfig();
  const total = input.files.reduce((n, f) => n + f.size, 0);
  if (total > config.managedModelsMaxBytes)
    throw new ApiError(
      413,
      'MODEL_TOO_LARGE',
      '模型文件总量超出管理员模型上传上限',
    );
  const available = await availableModelBytes();
  const sql = useDatabase();
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended('managed-model-storage', 0))`;
    const [pending] = await tx<
      { bytes: string }[]
    >`SELECT COALESCE(sum(total_bytes)*2,0)::text AS bytes FROM managed_models WHERE status IN ('uploading','queued','verifying')`;
    if (
      BigInt(total) * 2n +
        BigInt(pending?.bytes ?? '0') +
        512n * 1024n * 1024n >
      available
    )
      throw new ApiError(
        409,
        'MODEL_STORAGE_FULL',
        '磁盘可用空间不足，需为上传分片和完整文件预留空间',
      );
    const [created] = await tx<
      { id: string }[]
    >`INSERT INTO managed_models(name,category,note,files,total_bytes,created_by) VALUES (${input.name},${input.category},${input.note},${tx.json(input.files)},${total},${actor}) RETURNING id`;
    if (!created) throw new Error('Managed model was not created');
    return { id: created.id, partBytes: MODEL_PART_BYTES };
  });
}
export async function modelUploadStatus(id: string) {
  const model = await getManagedModel(id);
  const parts = await useDatabase()<
    { fileIndex: number; partIndex: number; sha256: string; size: number }[]
  >`SELECT file_index AS "fileIndex", part_index AS "partIndex", size, sha256 FROM managed_model_parts WHERE model_id=${id} ORDER BY file_index,part_index`;
  return { ...model, parts, partBytes: MODEL_PART_BYTES };
}
export async function putModelPart(
  id: string,
  fileIndex: number,
  partIndex: number,
  bytes: Buffer,
) {
  const sql = useDatabase();
  return sql.begin(async (tx) => {
    const [state] = await tx<
      { files: ModelFile[]; status: string }[]
    >`SELECT status,files FROM managed_models WHERE id=${id} FOR UPDATE`;
    if (!state) throw new ApiError(404, 'MODEL_NOT_FOUND', '模型记录不存在');
    if (state.status !== 'uploading')
      throw new ApiError(
        409,
        'MODEL_UPLOAD_CLOSED',
        '当前上传任务不可继续写入',
      );
    const file = state.files[fileIndex];
    const expected = file
      ? Math.min(MODEL_PART_BYTES, file.size - partIndex * MODEL_PART_BYTES)
      : 0;
    if (!file || expected <= 0 || bytes.length !== expected)
      throw new ApiError(400, 'MODEL_PART_INVALID', '上传分片位置或长度不正确');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const [previous] = await tx<
      { sha256: string }[]
    >`SELECT sha256 FROM managed_model_parts WHERE model_id=${id} AND file_index=${fileIndex} AND part_index=${partIndex}`;
    if (previous && previous.sha256 !== digest)
      throw new ApiError(
        409,
        'MODEL_PART_MISMATCH',
        '已上传分片内容不同，请重新建立上传任务',
      );
    const part = await writeModelPart(id, fileIndex, partIndex, bytes);
    await tx`INSERT INTO managed_model_parts(model_id,file_index,part_index,size,sha256) VALUES (${id},${fileIndex},${partIndex},${part.size},${part.sha256}) ON CONFLICT(model_id,file_index,part_index) DO NOTHING`;
    await tx`UPDATE managed_models SET updated_at=now() WHERE id=${id}`;
    return part;
  });
}
export async function completeModelUpload(id: string) {
  const sql = useDatabase();
  return sql.begin(async (tx) => {
    const [model] = await tx<
      { files: ModelFile[]; status: string }[]
    >`SELECT status,files FROM managed_models WHERE id=${id} FOR UPDATE`;
    if (!model) throw new ApiError(404, 'MODEL_NOT_FOUND', '模型记录不存在');
    if (['queued', 'ready', 'verifying'].includes(model.status)) return { id };
    if (model.status !== 'uploading')
      throw new ApiError(409, 'MODEL_UPLOAD_CLOSED', '上传任务已关闭');
    const parts = await tx<
      { fileIndex: number; partIndex: number; size: number }[]
    >`SELECT file_index AS "fileIndex",part_index AS "partIndex",size FROM managed_model_parts WHERE model_id=${id}`;
    for (const [i, f] of model.files.entries())
      for (let p = 0; p < Math.ceil(f.size / MODEL_PART_BYTES); p++) {
        if (
          !parts.some(
            (v) =>
              v.fileIndex === i &&
              v.partIndex === p &&
              v.size ===
                Math.min(MODEL_PART_BYTES, f.size - p * MODEL_PART_BYTES),
          )
        )
          throw new ApiError(
            409,
            'MODEL_UPLOAD_INCOMPLETE',
            '文件分片尚未全部上传',
          );
      }
    await tx`UPDATE managed_models SET status='queued',progress=0,updated_at=now() WHERE id=${id}`;
    return { id };
  });
}
export async function cancelModelUpload(id: string) {
  const sql = useDatabase();
  const [row] =
    await sql`UPDATE managed_models SET status='cancelled',lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE id=${id} AND status IN ('uploading','failed') RETURNING id`;
  if (!row)
    throw new ApiError(
      409,
      'MODEL_CANCEL_UNAVAILABLE',
      '校验中的任务或已入库模型不可取消',
    );
  await rm(join(await modelRoot(), '.uploads', id), {
    recursive: true,
    force: true,
  });
  await rm(join(await modelRoot(), '.staging', id), {
    recursive: true,
    force: true,
  });
  const model = await getManagedModel(id);
  await rm(join(await modelRoot(), model.category, 'platform', id), {
    recursive: true,
    force: true,
  });
  return { id };
}
export function managedFileName(id: string, filePath: string) {
  return `platform/${id}/${filePath}`;
}
export function comfyModelClient() {
  const c = getConfig();
  if (!c.comfyuiApiUrl)
    throw new ApiError(503, 'COMFYUI_NOT_CONFIGURED', 'ComfyUI 服务未配置');
  return new ComfyUiClient({
    apiUrl: c.comfyuiApiUrl,
    apiToken: c.comfyuiApiToken,
    timeoutMs: c.comfyuiTimeoutMs,
  });
}
export function loaderOptions(info: Record<string, unknown>) {
  const result: Array<{
    category: ModelCategory;
    classType: string;
    files: string[];
    inputName: string;
  }> = [];
  for (const [classType, value] of Object.entries(info)) {
    const node = value as {
      input?: {
        optional?: Record<string, unknown>;
        required?: Record<string, unknown>;
      };
    };
    for (const [inputName, raw] of Object.entries({
      ...node.input?.required,
      ...node.input?.optional,
    })) {
      const category = modelInputs[inputName];
      if (
        category &&
        Array.isArray(raw) &&
        Array.isArray(raw[0]) &&
        raw[0].every((v) => typeof v === 'string')
      )
        result.push({ classType, inputName, category, files: raw[0] });
    }
  }
  return result;
}

export class ManagedModelWorker {
  async runOnce() {
    if (!getConfig().managedModelsRoot) return;
    const owner = randomUUID();
    const sql = useDatabase();
    const [claim] = await sql<
      { id: string }[]
    >`UPDATE managed_models SET status='verifying',lease_owner=${owner},lease_until=now()+interval '90 seconds',updated_at=now() WHERE id=(SELECT id FROM managed_models WHERE status='queued' OR (status='verifying' AND lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`;
    if (!claim) return;
    const model = await getManagedModel(claim.id);
    const root = await modelRoot();
    const staging = await checkedDirectory(root, ['.staging', model.id, owner]);
    const targetParent = await checkedDirectory(root, [
      model.category,
      'platform',
    ]);
    const destination = join(targetParent, model.id);
    let lastBeat = 0;
    let transferred = 0;
    try {
      const parts = await sql<
        { fileIndex: number; partIndex: number; sha256: string; size: number }[]
      >`SELECT file_index AS "fileIndex",part_index AS "partIndex",size,sha256 FROM managed_model_parts WHERE model_id=${model.id}`;
      const files: ModelFile[] = [];
      for (const [fileIndex, file] of model.files.entries()) {
        const sha = await assembleModelFile({
          id: model.id,
          fileIndex,
          relativePath: file.path,
          size: file.size,
          directory: staging,
          parts: parts.filter((p) => p.fileIndex === fileIndex),
          onProgress: async (bytes) => {
            transferred += bytes;
            if (Date.now() - lastBeat < 5000) return;
            lastBeat = Date.now();
            const updated =
              await sql`UPDATE managed_models SET lease_until=now()+interval '90 seconds',progress=${Math.min(99, Math.floor((transferred / model.totalBytes) * 100))},updated_at=now() WHERE id=${model.id} AND lease_owner=${owner} RETURNING id`;
            if (updated.length === 0) throw new Error('模型校验任务租约已失效');
          },
        });
        if (file.sha256 && file.sha256 !== sha)
          throw new Error('模型 SHA-256 与预期值不一致');
        files.push({ ...file, actualSha256: sha });
      }
      // Shard indexes may only reference files in this immutable upload snapshot.
      for (const file of files.filter((f) => f.path.endsWith('.index.json'))) {
        const { readFile } = await import('node:fs/promises');
        const index = JSON.parse(
          await readFile(join(staging, file.path), 'utf8'),
        ) as { weight_map?: Record<string, string> };
        if (
          !index.weight_map ||
          Object.values(index.weight_map).length === 0 ||
          !Object.values(index.weight_map).every(
            (value) =>
              typeof value === 'string' &&
              files.some(
                (f) =>
                  f.path ===
                  [...file.path.split('/').slice(0, -1), value].join('/'),
              ),
          )
        )
          throw new Error('模型分片索引引用的文件不完整');
      }
      await sql.begin(async (tx) => {
        const [current] =
          await tx`SELECT id FROM managed_models WHERE id=${model.id} AND lease_owner=${owner} FOR UPDATE`;
        if (!current) throw new Error('模型校验任务租约已失效');
        try {
          const existing = await lstat(destination);
          if (!existing.isDirectory() || existing.isSymbolicLink())
            throw new Error('目标模型目录不安全');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          await rename(staging, destination);
        }
        // A prior worker may have committed the atomic rename before crashing.
        // Reverify that snapshot before registering it; never replace its bytes.
        const { open } = await import('node:fs/promises');
        const { constants } = await import('node:fs');
        const { createHash } = await import('node:crypto');
        for (const file of files) {
          const h = createHash('sha256');
          const source = await open(
            join(destination, file.path),
            constants.O_RDONLY | constants.O_NOFOLLOW,
          );
          try {
            for await (const chunk of source.createReadStream({
              autoClose: false,
            }))
              h.update(chunk);
          } finally {
            await source.close();
          }
          if (h.digest('hex') !== file.actualSha256)
            throw new Error('已发布模型目录内容不一致');
        }
        await tx`UPDATE managed_models SET status='ready',progress=100,files=${tx.json(files)},error=NULL,lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE id=${model.id}`;
      });
      await rm(join(root, '.uploads', model.id), {
        recursive: true,
        force: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '模型入库失败';
      await sql`UPDATE managed_models SET status='failed',error=${message.slice(0, 500)},lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE id=${model.id} AND lease_owner=${owner}`;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  async runUntil(stopping: () => boolean) {
    while (!stopping()) {
      try {
        await this.runOnce();
      } catch (error) {
        console.error('管理员模型入库失败', error);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
