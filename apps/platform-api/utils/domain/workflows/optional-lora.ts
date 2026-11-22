import type { ApiWorkflow } from './schema';

import { z } from 'zod';

import { getConfig } from '../../config';
import { ApiError } from '../../response';
import { ComfyUiClient } from '../capabilities/comfyui/client';
import { parseApiWorkflow, workflowOutputSchema } from './schema';

export const optionalLoraKey = 'optionalLora';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const loraSelectionSchema = z
  .object({
    targetId: z.string().regex(/^branch-\d+$/),
    name: z.string().min(1).max(512),
    sha256: digest,
    baseFingerprint: digest,
    strength: z.number().finite().min(0.05).max(2),
  })
  .strict();
export const optionalLoraSchema = z
  .object({
    enabled: z.boolean(),
    selections: z.array(loraSelectionSchema).max(32),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasSelections = value.selections.length > 0;
    if (
      value.enabled !== hasSelections ||
      new Set(value.selections.map((item) => item.targetId)).size !==
        value.selections.length
    )
      ctx.addIssue({
        code: 'custom',
        message: '启用 LoRA 时须选择模型，同一模型分支只能选择一次',
      });
  });
export type OptionalLora = z.infer<typeof optionalLoraSchema>;

export interface LoraTarget {
  id: string;
  nodeId: string;
  kind: 'clip' | 'context' | 'hypir' | 'model';
  category: string;
  base: string;
  label: string;
}

export const loraOptionsSchema = z.object({
  targets: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      base: z.string(),
      baseFingerprint: digest,
      family: z.string(),
      options: z.array(z.object({ name: z.string(), sha256: digest })),
      rejected: z.number().int().nonnegative(),
      reason: z.string().optional(),
    }),
  ),
});

export function splitOptionalLora(parameters: Record<string, unknown>) {
  const { [optionalLoraKey]: raw, ...workflowParameters } = parameters;
  return {
    lora: raw === undefined ? undefined : optionalLoraSchema.parse(raw),
    workflowParameters,
  };
}

export function optionalLoraField(code: string) {
  return {
    acceptedKinds: [],
    advanced: false,
    defaultValue: { enabled: false, selections: [] },
    help: '可选；只显示与当前基础模型适配的 LoRA，不选时沿用原工作流。',
    integer: false,
    key: optionalLoraKey,
    label: 'LoRA',
    options: [],
    required: false,
    type: 'json' as const,
    uiControl: 'default' as const,
    loraCapabilityCode: code,
  };
}

// File dependencies belong to versioned administrator configuration, not free-form generation input.
export function fixedWorkflowModelFields(
  apiJson: unknown,
  parameterSchema: unknown,
) {
  const graph = parseApiWorkflow(apiJson);
  const inputs = new Set([
    'base_model_path',
    'ckpt_name',
    'clip_name',
    'clip_name1',
    'clip_name2',
    'clip_name3',
    'control_net_name',
    'diffusion_model',
    'lora_name',
    'model_name',
    'unet_name',
    'vae_name',
  ]);
  return (
    parameterSchema as { inputName?: string; key: string; nodeId?: string }[]
  ).filter((field) => {
    const node = field.nodeId ? graph[field.nodeId] : undefined;
    return Boolean(
      node &&
      field.inputName &&
      (inputs.has(field.inputName) ||
        (node.class_type === 'sum_load_adv' &&
          ['clip1', 'clip2', 'clip3', 'clip4', 'lora', 'vae'].includes(
            field.inputName,
          ))),
    );
  });
}

export function assertFixedWorkflowModels(
  apiJson: unknown,
  materialized: unknown,
  parameterSchema: unknown,
) {
  const base = parseApiWorkflow(apiJson);
  const next = parseApiWorkflow(materialized);
  for (const field of fixedWorkflowModelFields(base, parameterSchema)) {
    if (!field.nodeId || !field.inputName) continue;
    if (
      base[field.nodeId]?.inputs[field.inputName] !==
      next[field.nodeId]?.inputs[field.inputName]
    )
      throw new ApiError(
        400,
        'WORKFLOW_MODEL_OVERRIDE_FORBIDDEN',
        '基础模型和固定 LoRA 由管理员通过版本管理；额外 LoRA 请使用兼容选择器',
      );
  }
}

export function workflowLoraTargets(
  apiJson: unknown,
  outputSchema?: unknown,
): LoraTarget[] {
  const graph = parseApiWorkflow(apiJson);
  const reachable = new Set<string>();
  function visit(id: string) {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const value of Object.values(graph[id]?.inputs ?? {}))
      if (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[1] === 'number' &&
        graph[String(value[0])]
      )
        visit(String(value[0]));
  }
  if (outputSchema !== undefined)
    for (const output of workflowOutputSchema.array().parse(outputSchema))
      if (output.role === 'primary') visit(output.nodeId);
  const targets: LoraTarget[] = [];
  function add(
    nodeId: string,
    kind: LoraTarget['kind'],
    category: string,
    base: unknown,
    label: string,
  ) {
    if (typeof base !== 'string' || !base || base === 'None') return;
    targets.push({
      id: `branch-${targets.length}`,
      nodeId,
      kind,
      category,
      base,
      label,
    });
  }
  for (const [id, node] of Object.entries(graph)) {
    if (outputSchema !== undefined && !reachable.has(id)) continue;
    if (node.class_type === 'UNETLoader')
      add(id, 'model', 'diffusion_models', node.inputs.unet_name, '生成模型');
    else if (
      [
        'CheckpointLoader',
        'CheckpointLoaderSimple',
        'ImageOnlyCheckpointLoader',
      ].includes(node.class_type)
    )
      add(id, 'model', 'checkpoints', node.inputs.ckpt_name, '生成模型');
    else if (node.class_type === 'sum_load_adv') {
      if (Array.isArray(node.inputs.over_model)) continue;
      const checkpoint =
        node.inputs.ckpt_name && node.inputs.ckpt_name !== 'None';
      add(
        id,
        'context',
        checkpoint ? 'checkpoints' : 'diffusion_models',
        checkpoint ? node.inputs.ckpt_name : node.inputs.unet_name,
        '分区生成模型',
      );
    } else if (node.class_type === 'HYPIRAdvancedRestoration')
      add(id, 'hypir', 'hypir', node.inputs.base_model_path, '图像放大模型');
  }
  if (
    targets.length === 0 &&
    Object.values(graph).some((node) => node.class_type === 'TextGenerate')
  )
    for (const [id, node] of Object.entries(graph))
      if (
        node.class_type === 'CLIPLoader' &&
        (outputSchema === undefined || reachable.has(id))
      )
        add(id, 'clip', 'text_encoders', node.inputs.clip_name, '文本模型');
  return targets;
}

export async function getLoraOptions(
  apiJson: unknown,
  client?: ComfyUiClient,
  outputSchema?: unknown,
) {
  let service = client;
  if (!service) {
    const config = getConfig();
    if (!config.comfyuiApiUrl)
      throw new ApiError(
        503,
        'ADAPTER_NOT_CONFIGURED',
        '工作流服务未配置，暂不能读取 LoRA',
      );
    service = new ComfyUiClient({
      apiUrl: config.comfyuiApiUrl,
      apiToken: config.comfyuiApiToken,
      timeoutMs: config.comfyuiTimeoutMs,
    });
  }
  try {
    return loraOptionsSchema.parse(
      await service.loraOptions(workflowLoraTargets(apiJson, outputSchema)),
    );
  } catch (error) {
    throw new ApiError(
      503,
      'LORA_CATALOG_UNAVAILABLE',
      error instanceof Error
        ? `LoRA 兼容目录不可用：${error.message}`
        : 'LoRA 兼容目录不可用',
    );
  }
}

export async function validateOptionalLora(
  apiJson: unknown,
  lora: OptionalLora | undefined,
  client?: ComfyUiClient,
  outputSchema?: unknown,
) {
  if (!lora?.enabled) return;
  const catalog = await getLoraOptions(apiJson, client, outputSchema);
  for (const selected of lora.selections) {
    const target = catalog.targets.find(
      (item) => item.id === selected.targetId,
    );
    if (
      !target ||
      target.baseFingerprint !== selected.baseFingerprint ||
      !target.options.some(
        (item) =>
          item.name === selected.name && item.sha256 === selected.sha256,
      )
    )
      throw new ApiError(
        409,
        'LORA_INCOMPATIBLE',
        'LoRA 不适配当前基础模型，或模型文件已更新，请重新选择',
      );
  }
}

// Compile only this execution graph. Published versions and historical JSON stay immutable.
export function applyOptionalLora(
  apiJson: unknown,
  lora?: OptionalLora,
  legacyTestNodeId?: string,
  outputSchema?: unknown,
): ApiWorkflow {
  const graph = parseApiWorkflow(structuredClone(apiJson));
  // Only new requests opt into optional loading. Old test jobs keep their original mandatory loader.
  if (lora && legacyTestNodeId) {
    const previous = graph[legacyTestNodeId];
    if (
      previous?.class_type !== 'LoraLoaderModelOnly' ||
      !Array.isArray(previous.inputs.model)
    )
      throw new Error('原 LoRA 测试节点已变化，需要重新适配');
    for (const other of Object.values(graph))
      for (const [key, value] of Object.entries(other.inputs))
        if (
          Array.isArray(value) &&
          String(value[0]) === legacyTestNodeId &&
          value[1] === 0
        )
          other.inputs[key] = [...previous.inputs.model];
    Reflect.deleteProperty(graph, legacyTestNodeId);
  }
  if (!lora?.enabled) return graph;
  const targets = workflowLoraTargets(graph, outputSchema);
  for (const selection of lora.selections) {
    const target = targets.find((item) => item.id === selection.targetId);
    if (!target) throw new Error('LoRA 对应的模型分支已变更');
    const node = graph[target.nodeId];
    if (!node) throw new Error('LoRA 对应的模型节点不存在');
    const nodeId = `rail_lora_${selection.targetId}`;
    if (graph[nodeId]) throw new Error('LoRA 执行节点编码冲突');
    const settings = JSON.stringify({
      ...selection,
      category: target.category,
      base: target.base,
    });
    if (target.kind === 'hypir') {
      node.class_type = 'RailHYPIRLora';
      node.inputs.rail_lora = settings;
      continue;
    }
    const input = target.kind === 'context' ? 'context' : target.kind;
    const classType = {
      context: 'RailContextLora',
      model: 'RailModelLora',
      clip: 'RailClipLora',
    }[target.kind];
    for (const other of Object.values(graph))
      for (const [key, value] of Object.entries(other.inputs))
        if (
          Array.isArray(value) &&
          String(value[0]) === target.nodeId &&
          (value[1] === 0 || (target.kind === 'context' && value[1] === 1))
        )
          other.inputs[key] = [nodeId, value[1]];
    graph[nodeId] = {
      class_type: classType,
      inputs: { [input]: [target.nodeId, 0], settings },
    };
  }
  return graph;
}
