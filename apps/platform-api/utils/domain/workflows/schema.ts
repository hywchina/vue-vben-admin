import { z } from 'zod';

import { ASSET_KINDS } from '../assets/validation';

export const workflowScalarParameterTypeSchema = z.enum([
  'boolean',
  'number',
  'select',
  'text',
  'textarea',
]);

export const workflowMediaParameterTypeSchema = z.enum([
  'asset',
  'capture',
  'mask',
  'region',
]);

export const workflowParameterTypeSchema = z.union([
  workflowScalarParameterTypeSchema,
  workflowMediaParameterTypeSchema,
]);

const workflowAssetTargetSchema = z.object({
  inputName: z.string().trim().min(1).max(100),
  nodeId: z.string().trim().min(1).max(100),
  transport: z.enum(['data-url', 'upload']).default('upload'),
});

export const workflowParameterSchema = z
  .object({
    acceptedKinds: z.array(z.enum(ASSET_KINDS)).max(8).default([]),
    advanced: z.boolean().default(false),
    assetIndex: z.number().int().min(0).max(99).optional(),
    defaultValue: z.unknown().optional(),
    help: z.string().trim().max(500).optional(),
    inputName: z.string().trim().min(1).max(100).optional(),
    integer: z.boolean().default(false),
    key: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-zA-Z0-9_]*$/),
    label: z.string().trim().min(1).max(100),
    max: z.number().optional(),
    maxLength: z.number().int().positive().optional(),
    min: z.number().optional(),
    nodeId: z.string().trim().min(1).max(100).optional(),
    options: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(100),
          value: z.union([z.number(), z.string()]),
        }),
      )
      .max(200)
      .default([]),
    placeholder: z.string().trim().max(200).optional(),
    required: z.boolean().default(false),
    step: z.number().positive().optional(),
    targets: z.array(workflowAssetTargetSchema).max(20).default([]),
    type: workflowParameterTypeSchema,
  })
  .superRefine((definition, context) => {
    const media = workflowMediaParameterTypeSchema.safeParse(definition.type);
    if (media.success) {
      if (definition.assetIndex === undefined) {
        context.addIssue({
          code: 'custom',
          message: '媒体字段必须指定资产位置',
          path: ['assetIndex'],
        });
      }
      if (definition.acceptedKinds.length === 0) {
        context.addIssue({
          code: 'custom',
          message: '媒体字段必须声明允许的资产类型',
          path: ['acceptedKinds'],
        });
      }
      if (definition.targets.length === 0) {
        context.addIssue({
          code: 'custom',
          message: '媒体字段必须至少映射一个工作流输入',
          path: ['targets'],
        });
      }
      if (
        definition.type === 'region' &&
        (!definition.nodeId || !definition.inputName)
      ) {
        context.addIssue({
          code: 'custom',
          message: '区域标注字段必须指定笔画数据映射',
          path: ['nodeId'],
        });
      }
      return;
    }
    if (!definition.nodeId || !definition.inputName) {
      context.addIssue({
        code: 'custom',
        message: '业务参数必须指定工作流节点与输入字段',
        path: ['nodeId'],
      });
    }
  });

export const workflowOutputSchema = z.object({
  field: z.string().trim().min(1).max(100),
  kind: z.enum(ASSET_KINDS),
  nodeId: z.string().trim().min(1).max(100),
  role: z.enum(['auxiliary', 'primary']).default('primary'),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});

export const workflowVersionSchema = z.object({
  apiJson: z.record(z.string(), z.unknown()),
  modelRequirements: z
    .array(z.string().trim().min(1).max(255))
    .max(100)
    .default([]),
  outputSchema: z.array(workflowOutputSchema).min(1).max(100),
  parameterSchema: z.array(workflowParameterSchema).max(200),
});

export type WorkflowOutputDefinition = z.infer<typeof workflowOutputSchema>;
export type WorkflowParameterDefinition = z.infer<
  typeof workflowParameterSchema
>;
export type WorkflowVersionInput = z.infer<typeof workflowVersionSchema>;

export interface ApiWorkflowNode {
  _meta?: { title?: string };
  class_type: string;
  inputs: Record<string, unknown>;
}

export type ApiWorkflow = Record<string, ApiWorkflowNode>;

function isConnection(value: unknown, workflow: ApiWorkflow) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[1] === 'number' &&
    String(value[0]) in workflow
  );
}

export function isWorkflowMediaParameter(
  definition: WorkflowParameterDefinition,
) {
  return workflowMediaParameterTypeSchema.safeParse(definition.type).success;
}

export function parseApiWorkflow(value: unknown): ApiWorkflow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('工作流 API JSON 根节点必须是非空对象');
  }
  const entries = Object.entries(value);
  if (entries.length === 0) throw new Error('工作流 API JSON 不能为空');
  if (entries.length > 2000) throw new Error('工作流节点数量超过 2000 个');

  const workflow: ApiWorkflow = {};
  for (const [nodeId, rawNode] of entries) {
    if (
      !rawNode ||
      typeof rawNode !== 'object' ||
      Array.isArray(rawNode) ||
      typeof (rawNode as { class_type?: unknown }).class_type !== 'string' ||
      !(rawNode as { inputs?: unknown }).inputs ||
      typeof (rawNode as { inputs?: unknown }).inputs !== 'object' ||
      Array.isArray((rawNode as { inputs?: unknown }).inputs)
    ) {
      throw new Error(`节点 ${nodeId} 不是有效的 ComfyUI API 节点`);
    }
    const node = rawNode as ApiWorkflowNode;
    workflow[nodeId] = {
      ...(node._meta ? { _meta: node._meta } : {}),
      class_type: node.class_type,
      inputs: node.inputs,
    };
  }
  return workflow;
}

function assertLiteralTarget(
  workflow: ApiWorkflow,
  nodeId: string,
  inputName: string,
) {
  const node = workflow[nodeId];
  if (!node) throw new Error(`参数映射节点不存在：${nodeId}`);
  if (!(inputName in node.inputs)) {
    throw new Error(`参数映射字段不存在：${nodeId}.${inputName}`);
  }
  if (isConnection(node.inputs[inputName], workflow)) {
    throw new Error(`参数不能覆盖节点连接：${nodeId}.${inputName}`);
  }
}

export function validateWorkflowMappings(
  workflow: ApiWorkflow,
  parameters: WorkflowParameterDefinition[],
  outputs: WorkflowOutputDefinition[],
) {
  const parameterKeys = new Set<string>();
  const assetIndexes = new Set<number>();
  for (const parameter of parameters) {
    if (parameterKeys.has(parameter.key)) {
      throw new Error(`工作流参数编码重复：${parameter.key}`);
    }
    parameterKeys.add(parameter.key);
    if (isWorkflowMediaParameter(parameter)) {
      if (parameter.assetIndex === undefined) {
        throw new Error(`媒体参数缺少资产位置：${parameter.key}`);
      }
      if (assetIndexes.has(parameter.assetIndex)) {
        throw new Error(`工作流资产位置重复：${parameter.assetIndex}`);
      }
      assetIndexes.add(parameter.assetIndex);
      for (const target of parameter.targets) {
        assertLiteralTarget(workflow, target.nodeId, target.inputName);
      }
      if (parameter.type !== 'region') continue;
    }
    if (!parameter.nodeId || !parameter.inputName) {
      throw new Error(`工作流参数映射不完整：${parameter.key}`);
    }
    assertLiteralTarget(workflow, parameter.nodeId, parameter.inputName);
  }
  for (const output of outputs) {
    if (!workflow[output.nodeId]) {
      throw new Error(`输出映射节点不存在：${output.nodeId}`);
    }
  }
}

function normalizeParameterValue(
  definition: WorkflowParameterDefinition,
  value: unknown,
) {
  if (value === undefined || value === null || value === '') {
    if (definition.defaultValue !== undefined) return definition.defaultValue;
    if (definition.required) throw new Error(`${definition.label}不能为空`);
    return value;
  }
  if (definition.type === 'number') {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      throw new TypeError(`${definition.label}必须是有效数字`);
    }
    if (definition.integer && !Number.isSafeInteger(numeric)) {
      throw new Error(`${definition.label}必须是安全整数`);
    }
    if (definition.min !== undefined && numeric < definition.min) {
      throw new Error(`${definition.label}不能小于 ${definition.min}`);
    }
    if (definition.max !== undefined && numeric > definition.max) {
      throw new Error(`${definition.label}不能大于 ${definition.max}`);
    }
    return numeric;
  }
  if (definition.type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new TypeError(`${definition.label}必须是布尔值`);
    }
    return value;
  }
  if (typeof value !== 'string') {
    throw new TypeError(`${definition.label}必须是文本`);
  }
  if (definition.maxLength && value.length > definition.maxLength) {
    throw new Error(
      `${definition.label}不能超过 ${definition.maxLength} 个字符`,
    );
  }
  if (
    definition.type === 'select' &&
    !definition.options.some((option) => option.value === value)
  ) {
    throw new Error(`${definition.label}不是允许的选项`);
  }
  return value;
}

export function materializeWorkflow(
  apiJson: unknown,
  parameterSchema: unknown,
  parameters: Record<string, unknown>,
) {
  const workflow = parseApiWorkflow(structuredClone(apiJson));
  const definitions = z.array(workflowParameterSchema).parse(parameterSchema);
  const scalarDefinitions = definitions.filter(
    (item) => !isWorkflowMediaParameter(item) || item.type === 'region',
  );
  const allowedKeys = new Set(scalarDefinitions.map((item) => item.key));
  const unknownKeys = Object.keys(parameters).filter(
    (key) => !allowedKeys.has(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(`包含未公开的工作流参数：${unknownKeys.join('、')}`);
  }
  for (const definition of scalarDefinitions) {
    const value = normalizeParameterValue(
      definition,
      parameters[definition.key],
    );
    if (value !== undefined) {
      if (!definition.nodeId || !definition.inputName) {
        throw new Error('工作流参数映射已失效');
      }
      const node = workflow[definition.nodeId];
      if (!node) throw new Error('工作流参数映射已失效');
      node.inputs[definition.inputName] = value;
    }
  }
  return workflow;
}

export interface WorkflowAssetValue {
  dataUrl: string;
  kind: string;
  uploadName: string;
}

export function materializeWorkflowAssets(
  apiJson: unknown,
  parameterSchema: unknown,
  assets: Map<number, WorkflowAssetValue>,
) {
  const workflow = parseApiWorkflow(structuredClone(apiJson));
  const definitions = z.array(workflowParameterSchema).parse(parameterSchema);
  for (const definition of definitions.filter((item) =>
    isWorkflowMediaParameter(item),
  )) {
    if (definition.assetIndex === undefined) continue;
    const asset = assets.get(definition.assetIndex);
    if (!asset) {
      if (definition.required) throw new Error(`${definition.label}不能为空`);
      continue;
    }
    if (!definition.acceptedKinds.some((kind) => kind === asset.kind)) {
      throw new Error(`${definition.label}的资产类型不兼容`);
    }
    for (const target of definition.targets) {
      const node = workflow[target.nodeId];
      if (!node) throw new Error('工作流资产映射已失效');
      node.inputs[target.inputName] =
        target.transport === 'data-url' ? asset.dataUrl : asset.uploadName;
    }
  }
  return workflow;
}

export function validateWorkflowAssetInputs(
  parameterSchema: unknown,
  assets: Array<{ kind: string }>,
) {
  const definitions = z.array(workflowParameterSchema).parse(parameterSchema);
  const media = definitions.filter((item) => isWorkflowMediaParameter(item));
  const expectedIndexes = new Set(
    media.flatMap((field) =>
      field.assetIndex === undefined ? [] : [field.assetIndex],
    ),
  );
  for (const field of media) {
    if (field.assetIndex === undefined) continue;
    const asset = assets[field.assetIndex];
    if (!asset) {
      if (field.required) throw new Error(`${field.label}不能为空`);
      continue;
    }
    if (!field.acceptedKinds.some((kind) => kind === asset.kind)) {
      throw new Error(`${field.label}的资产类型不兼容`);
    }
  }
  const unexpected = assets.findIndex(
    (_, index) => !expectedIndexes.has(index),
  );
  if (unexpected !== -1) {
    throw new Error(`输入资产位置 ${unexpected + 1} 没有对应的工作流字段`);
  }
}

export function publicParameterSchema(value: unknown) {
  return z
    .array(workflowParameterSchema)
    .parse(value)
    .map((definition) => {
      const {
        inputName: _inputName,
        nodeId: _nodeId,
        targets: _targets,
        ...publicDefinition
      } = definition;
      return publicDefinition;
    });
}

export function parseWorkflowVersion(input: unknown) {
  const parsed = workflowVersionSchema.parse(input);
  const workflow = parseApiWorkflow(parsed.apiJson);
  validateWorkflowMappings(
    workflow,
    parsed.parameterSchema,
    parsed.outputSchema,
  );
  return { ...parsed, apiJson: workflow };
}
