import { getRouterParam } from 'h3';
import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import { getModelUpdate } from '~/utils/domain/models/updates';
import {
  imageGenerationCountField,
  splitImageGenerationParameters,
} from '~/utils/domain/workflows/image-generation-count';
import {
  assertFixedWorkflowModels,
  getLoraOptions,
} from '~/utils/domain/workflows/optional-lora';
import { getCapabilityByCode } from '~/utils/domain/workflows/repository';
import { materializeWorkflow } from '~/utils/domain/workflows/schema';
import { hasAdministrativeRole, requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  let capability = await getCapabilityByCode(
    getRouterParam(event, 'code') ?? '',
  );
  if (!capability)
    throw new ApiError(404, 'CAPABILITY_NOT_FOUND', '能力不存在或尚未发布');
  if (!hasAdministrativeRole(identity)) {
    const [application] =
      await useDatabase()`SELECT visible FROM applications WHERE key=${capability.appKey}`;
    if (!application?.visible)
      throw new ApiError(404, 'CAPABILITY_NOT_FOUND', '能力不存在或尚未发布');
  }
  const input = await parseBody(
    event,
    z.object({
      modelUpdateId: z.string().uuid().optional(),
      parameters: z
        .record(z.string(), z.unknown())
        .refine((v) => Object.keys(v).length <= 200)
        .default({}),
    }),
  );
  if (input.modelUpdateId) {
    if (!hasAdministrativeRole(identity))
      throw new ApiError(403, 'FORBIDDEN', '仅管理员可试运行模型更新');
    const update = await getModelUpdate(input.modelUpdateId);
    if (
      update.record.publishedAt ||
      update.capability.code !== capability.code ||
      update.record.baseVersionId !== capability.workflowVersionId
    )
      throw new ApiError(
        409,
        'MODEL_BINDING_CHANGED',
        '模型更新已发布或工作流绑定已变化',
      );
    capability = update.capability;
    for (const field of capability.parameterSchema as {
      defaultValue?: unknown;
      inputName?: string;
      key: string;
      nodeId?: string;
    }[])
      if (
        update.record.replacements.some(
          (item) =>
            item.nodeId === field.nodeId && item.inputName === field.inputName,
        )
      )
        input.parameters[field.key] = field.defaultValue;
  }
  let graph;
  try {
    graph = materializeWorkflow(
      capability.apiJson,
      capability.parameterSchema,
      imageGenerationCountField(capability.appKey)
        ? splitImageGenerationParameters(input.parameters).workflowParameters
        : input.parameters,
    );
    assertFixedWorkflowModels(
      capability.apiJson,
      graph,
      capability.parameterSchema,
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      400,
      'WORKFLOW_PARAMETER_INVALID',
      '工作流参数无效，请检查当前输入',
    );
  }
  return getLoraOptions(graph, undefined, capability.outputSchema);
});
