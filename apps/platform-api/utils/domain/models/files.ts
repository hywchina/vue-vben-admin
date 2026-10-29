import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  statfs,
  unlink,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { getConfig } from '../../config';
import { ApiError } from '../../response';
import { MODEL_PART_BYTES, safeModelPath } from './schema';

export async function modelRoot() {
  const configured = getConfig().managedModelsRoot;
  if (!configured)
    throw new ApiError(
      503,
      'MODEL_STORAGE_NOT_CONFIGURED',
      '管理员模型存储未配置',
    );
  const root = resolve(configured);
  await mkdir(root, { recursive: true });
  const rootStat = await lstat(root);
  if (rootStat.isSymbolicLink())
    throw new ApiError(503, 'MODEL_STORAGE_UNSAFE', '模型存储不能使用符号链接');
  return await realpath(root);
}

export async function checkedDirectory(root: string, components: string[]) {
  let result = root;
  for (const part of components) {
    if (!part || part === '..' || part.includes('/') || part.includes('\\'))
      throw new Error('Unsafe storage component');
    result = join(result, part);
    await mkdir(result).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const st = await lstat(result);
    if (!st.isDirectory() || st.isSymbolicLink())
      throw new ApiError(
        409,
        'MODEL_STORAGE_UNSAFE',
        '模型目录包含不安全的路径',
      );
  }
  return result;
}

export async function partDirectory(id: string) {
  return checkedDirectory(await modelRoot(), ['.uploads', id]);
}

export async function writeModelPart(
  id: string,
  fileIndex: number,
  partIndex: number,
  bytes: Buffer,
) {
  const directory = await partDirectory(id);
  const target = join(directory, `${fileIndex}-${partIndex}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const temp = `${target}.${randomUUID()}.tmp`;
  const file = await open(
    temp,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temp, target).catch(async (error) => {
    await unlink(temp).catch(() => {});
    throw error;
  });
  return { sha256, size: bytes.length };
}

export async function availableModelBytes() {
  const st = await statfs(await modelRoot(), { bigint: true });
  return st.bavail * st.bsize;
}

function parseModelJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('模型 JSON 格式无效');
  }
}

export async function validateModelFile(path: string, size: number) {
  const extension = path.split('.').at(-1)?.toLowerCase();
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (extension === 'safetensors') {
      const prefix = Buffer.alloc(8);
      const prefixRead = await file.read(prefix, 0, 8, 0);
      if (prefixRead.bytesRead !== 8)
        throw new Error('safetensors 文件头不完整');
      const length = prefix.readBigUInt64LE();
      if (
        length < 2n ||
        length > 16n * 1024n * 1024n ||
        length + 8n >= BigInt(size)
      )
        throw new Error('safetensors 文件头长度无效');
      const header = Buffer.alloc(Number(length));
      const headerRead = await file.read(header, 0, header.length, 8);
      if (headerRead.bytesRead !== header.length)
        throw new Error('safetensors 文件头不完整');
      const parsed = parseModelJson(header.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('safetensors 元数据无效');
      const tensors = Object.entries(parsed).filter(
        ([key]) => key !== '__metadata__',
      );
      if (tensors.length === 0) throw new Error('safetensors 没有张量');
      const ranges: Array<[number, number]> = [];
      for (const [, tensor] of tensors) {
        const t = tensor as {
          data_offsets?: unknown;
          dtype?: unknown;
          shape?: unknown;
        };
        const offsets = t?.data_offsets;
        if (
          !Array.isArray(offsets) ||
          offsets.length !== 2 ||
          !offsets.every((n) => Number.isSafeInteger(n) && n >= 0) ||
          offsets[0] > offsets[1] ||
          offsets[1] > size - 8 - header.length ||
          typeof t.dtype !== 'string' ||
          !Array.isArray(t.shape) ||
          !t.shape.every((n) => Number.isSafeInteger(n) && n >= 0)
        )
          throw new Error('safetensors 张量范围无效');
        ranges.push([offsets[0], offsets[1]]);
      }
      ranges.sort((a, b) => a[0] - b[0]);
      let end = 0;
      for (const [start, next] of ranges) {
        if (start !== end) throw new Error('safetensors 数据范围不连续');
        end = next;
      }
      if (end !== size - 8 - header.length)
        throw new Error('safetensors 文件长度与张量不符');
    } else if (extension === 'json') {
      if (size > 16 * 1024 ** 2) throw new Error('模型 JSON 配置过大');
      parseModelJson(await file.readFile('utf8'));
    } else if (extension === 'gguf') {
      const header = Buffer.alloc(24);
      const headerRead = await file.read(header, 0, 24, 0);
      if (
        headerRead.bytesRead !== 24 ||
        header.toString('ascii', 0, 4) !== 'GGUF' ||
        ![2, 3].includes(header.readUInt32LE(4))
      )
        throw new Error('GGUF 文件头无效');
    }
  } finally {
    await file.close();
  }
}

export async function assembleModelFile(input: {
  directory: string;
  fileIndex: number;
  id: string;
  onProgress: (bytes: number) => Promise<void>;
  parts: Array<{ partIndex: number; sha256: string; size: number }>;
  relativePath: string;
  size: number;
}) {
  if (!safeModelPath(input.relativePath)) throw new Error('Unsafe model path');
  const pieces = input.relativePath.split('/');
  const filename = pieces.pop();
  if (!filename) throw new Error('Unsafe model filename');
  const directory = await checkedDirectory(input.directory, pieces);
  const target = join(directory, filename);
  const hash = createHash('sha256');
  const file = await open(
    target,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NOFOLLOW,
    0o644,
  );
  let size = 0;
  try {
    for (
      let index = 0;
      index < Math.ceil(input.size / MODEL_PART_BYTES);
      index++
    ) {
      const part = input.parts.find((p) => p.partIndex === index);
      if (!part) throw new Error('模型上传分片缺失');
      const source = await open(
        join(await partDirectory(input.id), `${input.fileIndex}-${index}`),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      let bytes: Buffer;
      try {
        bytes = await source.readFile();
      } finally {
        await source.close();
      }
      if (
        bytes.length !== part.size ||
        createHash('sha256').update(bytes).digest('hex') !== part.sha256
      )
        throw new Error('模型上传分片已损坏');
      await file.writeFile(bytes);
      hash.update(bytes);
      size += bytes.length;
      await input.onProgress(bytes.length);
    }
    await file.sync();
  } finally {
    await file.close();
  }
  if (size !== input.size) throw new Error('模型文件长度不匹配');
  await validateModelFile(target, size);
  return hash.digest('hex');
}
