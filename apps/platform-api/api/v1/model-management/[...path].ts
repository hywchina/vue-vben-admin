import { Buffer } from 'node:buffer';

import { getHeader, getMethod, getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { getConfig } from '~/utils/config';
import {
  cancelModelUpload,
  comfyModelClient,
  completeModelUpload,
  createManagedModel,
  listManagedModels,
  loaderOptions,
  modelUploadStatus,
  putModelPart,
} from '~/utils/domain/models/repository';
import {
  createModelSchema,
  MODEL_PART_BYTES,
  modelReplacementSchema,
} from '~/utils/domain/models/schema';
import {
  createModelUpdate,
  getModelUpdate,
  listModelUpdates,
  modelReferences,
  publishModelUpdate,
} from '~/utils/domain/models/updates';
import {
  hasAdministrativeRole,
  requireIdentity,
  requirePermission,
} from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

export default apiHandler(async (event) => {
  const actor = await requireIdentity(event);
  if (!hasAdministrativeRole(actor))
    throw new ApiError(403, 'FORBIDDEN', '仅管理员可管理系统模型');
  const method = getMethod(event);
  requirePermission(
    actor,
    method === 'GET' ? 'platform:workflow:read' : 'platform:workflow:write',
  );
  const route = (getRouterParam(event, 'path') ?? '')
    .split('/')
    .filter(Boolean);
  if (
    route.length > 0 &&
    !(route[0] === 'updates'
      ? z.string().uuid().safeParse(route[1]).success
      : z.string().uuid().safeParse(route[0]).success)
  )
    throw new ApiError(400, 'RESOURCE_ID_INVALID', '资源编号无效');
  const id = (route[0] === 'updates' ? route[1] : route[0]) ?? '';
  let result: unknown;
  let action = '';
  if (route.length === 0 && method === 'GET') {
    let serviceError: null | string = null;
    let choices: ReturnType<typeof loaderOptions> = [];
    try {
      choices = loaderOptions(await comfyModelClient().objectInfo());
    } catch {
      serviceError = 'ComfyUI 未配置或不可达，当前不能验证或发布模型引用';
    }
    return {
      models: await listManagedModels(),
      references: await modelReferences(),
      updates: await listModelUpdates(actor.id),
      choices,
      serviceError,
      storageConfigured: Boolean(getConfig().managedModelsRoot),
      partBytes: MODEL_PART_BYTES,
      maxBytes: getConfig().managedModelsMaxBytes,
    };
  }
  if (route.length === 0 && method === 'POST') {
    result = await createManagedModel(
      await parseBody(event, createModelSchema),
      actor.id,
    );
    action = 'model.upload.create';
  } else if (route.length === 1 && method === 'GET')
    return modelUploadStatus(id);
  else if (route[0] === 'updates' && route.length === 2 && method === 'GET') {
    const update = await getModelUpdate(id);
    const fields = update.capability.parameterSchema as {
      defaultValue?: unknown;
      inputName?: string;
      key: string;
      nodeId?: string;
    }[];
    const lockedParameters = Object.fromEntries(
      fields
        .filter((f) =>
          update.record.replacements.some(
            (r) => r.nodeId === f.nodeId && r.inputName === f.inputName,
          ),
        )
        .map((f) => [f.key, f.defaultValue]),
    );
    return {
      id,
      modelId: update.record.modelId,
      capabilityCode: update.record.capabilityCode,
      appKey: update.capability.appKey,
      versionId: update.record.candidateVersionId,
      publishedAt: update.record.publishedAt,
      capability: update.publicCapability,
      lockedParameters,
      tests: update.tests.filter((t) => t.createdBy === actor.id),
    };
  } else if (
    route[0] === 'updates' &&
    route[2] === 'publish' &&
    route.length === 3 &&
    method === 'POST'
  ) {
    result = await publishModelUpdate(id, actor.id);
    action = 'model.workflow.publish';
  } else if (route.length === 4 && route[1] === 'parts' && method === 'PUT') {
    if (!/^\d{1,6}$/.test(route[2] ?? '') || !/^\d{1,6}$/.test(route[3] ?? ''))
      throw new ApiError(400, 'MODEL_PART_INVALID', '分片编号无效');
    const length = Number(getHeader(event, 'content-length'));
    if (
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      length > MODEL_PART_BYTES
    )
      throw new ApiError(413, 'MODEL_PART_TOO_LARGE', '模型分片长度无效');
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const raw of event.node.req) {
      const chunk = Buffer.from(raw);
      total += chunk.length;
      if (total > MODEL_PART_BYTES)
        throw new ApiError(413, 'MODEL_PART_TOO_LARGE', '上传分片超过限制');
      chunks.push(chunk);
    }
    if (total !== length)
      throw new ApiError(400, 'MODEL_PART_INVALID', '分片传输不完整');
    result = await putModelPart(
      id,
      Number(route[2]),
      Number(route[3]),
      Buffer.concat(chunks),
    );
  } else if (
    route.length === 2 &&
    route[1] === 'complete' &&
    method === 'POST'
  ) {
    result = await completeModelUpload(id);
    action = 'model.upload.complete';
  } else if (route.length === 2 && route[1] === 'cancel' && method === 'POST') {
    result = await cancelModelUpload(id);
    action = 'model.upload.cancel';
  } else if (
    route.length === 2 &&
    route[1] === 'updates' &&
    method === 'POST'
  ) {
    result = await createModelUpdate(
      id,
      await parseBody(event, modelReplacementSchema),
      actor.id,
    );
    action = 'model.workflow.prepare';
  } else throw new ApiError(404, 'NOT_FOUND', '模型管理接口不存在');
  if (action)
    await writeAudit(event, {
      actor,
      action,
      module: 'model',
      targetType: 'system-model',
      targetId: id || (result as { id: string }).id,
      details: {},
    });
  return result;
});
