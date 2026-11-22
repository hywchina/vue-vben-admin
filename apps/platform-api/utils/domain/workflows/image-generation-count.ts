import type { ApiWorkflow, WorkflowOutputDefinition } from './schema';

import { z } from 'zod';

import {
  cameraViewPrompt,
  cameraViewsKey,
  parseCameraViews,
} from './camera-views';
import {
  parseApiWorkflow,
  workflowOutputSchema,
  workflowParameterSchema,
} from './schema';

const imageGenerationApps = new Set([
  'camera-control-multi',
  'camera-control-single',
  'image-edit-kv',
  'image-upscale',
  'inpaint-reference',
  'inpaint-single',
  'multi-image-edit',
  'outpaint',
  'region-edit',
  'region-marker-edit',
  'screen-capture-edit',
  'single-image-edit',
]);
const nativeBatchApps = new Set([
  'camera-control-single',
  'image-edit-kv',
  'multi-image-edit',
  'outpaint',
  'screen-capture-edit',
  'single-image-edit',
]);
const latentBatchClasses = new Set([
  'EmptyFlux2LatentImage',
  'EmptyLatentImage',
]);
const seedInputs = new Set(['noise_seed', 'seed']);

export const imageGenerationCountKey = 'generationCount';
export const maxImageGenerationCount = 8;

export function imageGenerationCountField(appKey: string) {
  if (!imageGenerationApps.has(appKey)) return;
  const multiAngle = appKey === 'camera-control-multi';
  return {
    acceptedKinds: [],
    advanced: false,
    defaultLabel: '生成数量',
    defaultValue: multiAngle ? 5 : 1,
    help: multiAngle
      ? '每个已选视角至少生成一张；增加总数时按所选视角顺序补充，最多 8 张。'
      : '设置本次输出的图片张数，最多 8 张。',
    integer: true,
    key: imageGenerationCountKey,
    label: '生成数量',
    max: maxImageGenerationCount,
    min: 1,
    options: [],
    required: false,
    step: 1,
    type: 'number' as const,
    uiControl: 'default' as const,
  };
}

export function legacyImageCountKey(
  apiJson: unknown,
  parameterSchema: unknown,
) {
  const graph = parseApiWorkflow(apiJson);
  return z
    .array(workflowParameterSchema)
    .parse(parameterSchema)
    .find(
      (field) =>
        field.type === 'number' &&
        field.inputName === 'batch_size' &&
        field.nodeId &&
        latentBatchClasses.has(graph[field.nodeId]?.class_type ?? ''),
    )?.key;
}

export function readImageGenerationCount(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > maxImageGenerationCount
  ) {
    throw new Error('生成数量必须是 1–8 的整数');
  }
  return value;
}

export function splitImageGenerationParameters(
  parameters: Record<string, unknown>,
) {
  const { [imageGenerationCountKey]: value, ...workflowParameters } =
    parameters;
  const views = workflowParameters[cameraViewsKey];
  Reflect.deleteProperty(workflowParameters, cameraViewsKey);
  return {
    views: views === undefined ? undefined : parseCameraViews(views, true),
    count: value === undefined ? undefined : readImageGenerationCount(value),
    workflowParameters,
  };
}

export function normalizeImageGenerationParameters(
  appKey: string,
  apiJson: unknown,
  parameterSchema: unknown,
  parameters: Record<string, unknown>,
) {
  const field = imageGenerationCountField(appKey);
  if (!field) return parameters;
  const { count, views, workflowParameters } =
    splitImageGenerationParameters(parameters);
  if (views && appKey !== 'camera-control-multi')
    throw new Error('当前功能不支持多视角选择');
  const selected = views
    ? parseCameraViews(views).filter(({ enabled }) => enabled)
    : undefined;
  const legacyKey = legacyImageCountKey(apiJson, parameterSchema);
  const legacyValue = legacyKey ? workflowParameters[legacyKey] : undefined;
  if (legacyKey) Reflect.deleteProperty(workflowParameters, legacyKey);
  const legacyCount =
    legacyValue === undefined || legacyValue === null || legacyValue === ''
      ? undefined
      : Math.min(
          maxImageGenerationCount,
          readImageGenerationCount(Number(legacyValue)) * field.defaultValue,
        );
  const total = readImageGenerationCount(
    count ?? legacyCount ?? selected?.length ?? field.defaultValue,
  );
  if (selected && total < selected.length)
    throw new Error('生成数量不能少于已选视角数');
  return {
    ...workflowParameters,
    ...(views && { [cameraViewsKey]: views }),
    [imageGenerationCountKey]: total,
  };
}

type Connection = [number | string, number];

function asConnection(
  value: unknown,
  graph: ApiWorkflow,
): Connection | undefined {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    (typeof value[0] === 'number' || typeof value[0] === 'string') &&
    Object.hasOwn(graph, String(value[0])) &&
    typeof value[1] === 'number'
  ) {
    return [value[0], value[1]];
  }
}

function workflowNode(graph: ApiWorkflow, id: string) {
  const node = graph[id];
  if (!node) throw new Error(`找不到图片输出依赖的工作流节点：${id}`);
  return node;
}

function imageAncestors(graph: ApiWorkflow, nodeId: string) {
  const ids = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string) {
    if (ids.has(id)) return;
    if (visiting.has(id)) throw new Error('图片输出依赖中存在循环连接');
    const node = workflowNode(graph, id);
    visiting.add(id);
    for (const value of Object.values(node.inputs)) {
      const link = asConnection(value, graph);
      if (link) visit(String(link[0]));
    }
    visiting.delete(id);
    ids.add(id);
  }
  visit(nodeId);
  return [...ids];
}

function cameraViewPrompts(graph: ApiWorkflow, ancestors: string[]) {
  for (const id of ancestors) {
    const prompt = asConnection(graph[id]?.inputs.prompt, graph);
    if (!prompt || prompt[1] !== 1) continue;
    const source = graph[String(prompt[0])];
    if (source?.class_type !== 'easy promptList') continue;
    const views = Object.entries(source.inputs)
      .filter(([name, value]) => /^prompt_\d+$/.test(name) && value !== '')
      .toSorted(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .map(([, value]) => value);
    if (views.length > 0) return { nodeId: id, views };
  }
}

/**
 * Plan one ComfyUI prompt and an ordered list of its expected image outputs.
 * Build from the saved graph so node identities can be recovered after restarts.
 */
export function planImageGeneration(
  appKey: string,
  apiJson: unknown,
  outputSchema: unknown,
  count: number,
  configuredViews?: unknown,
) {
  readImageGenerationCount(count);
  const graph = parseApiWorkflow(apiJson);
  const outputs = workflowOutputSchema.array().parse(outputSchema);
  const primary = outputs.find(
    ({ kind, role }) => kind === 'image' && role === 'primary',
  );
  if (!primary) throw new Error('未配置主要图片输出，无法设置生成数量');
  const otherOutputs = outputs.filter(({ kind }) => kind !== 'image');
  const ancestors = imageAncestors(graph, primary.nodeId);
  const latentNodes = ancestors.filter((id) => {
    const node = workflowNode(graph, id);
    return (
      latentBatchClasses.has(node.class_type) &&
      typeof node.inputs.batch_size === 'number'
    );
  });
  const nativeNode =
    nativeBatchApps.has(appKey) && latentNodes.length === 1
      ? latentNodes[0]
      : undefined;

  if (nativeNode) {
    return {
      apply(prompt: ApiWorkflow) {
        workflowNode(prompt, nativeNode).inputs.batch_size = count;
        return prompt;
      },
      imageOutputs: [{ ...primary, count }],
      otherOutputs,
    };
  }

  let camera =
    appKey === 'camera-control-multi'
      ? cameraViewPrompts(graph, ancestors)
      : undefined;
  if (configuredViews !== undefined) {
    if (!camera || appKey !== 'camera-control-multi')
      throw new Error('当前工作流不支持视角选择');
    const selected = parseCameraViews(configuredViews).filter(
      ({ enabled }) => enabled,
    );
    if (count < selected.length) throw new Error('生成数量不能少于已选视角数');
    camera = {
      ...camera,
      views: selected.map((view) => cameraViewPrompt(view)),
    };
  }
  const images: Array<WorkflowOutputDefinition & { count: number }> = [
    { ...primary, count: 1 },
  ];
  const branches: Array<{
    id: string;
    links: Map<string, string>;
    seedOffset: number;
    sourceId: string;
    view?: unknown;
  }> = [];
  const usedIds = new Set(Object.keys(graph));
  let nextId = 1;
  function allocateId() {
    while (usedIds.has(String(nextId))) nextId++;
    const id = String(nextId++);
    usedIds.add(id);
    return id;
  }

  // Clone only changed paths. Input uploads, model loaders and unchanged
  // conditioning stay shared by all outputs in the same ComfyUI execution.
  for (let index = 1; index < count; index++) {
    const offset = camera ? Math.floor(index / camera.views.length) : index;
    const links = new Map<string, string>();
    const view = camera?.views[index % camera.views.length];
    for (const id of ancestors) {
      const entries = Object.entries(workflowNode(graph, id).inputs);
      const changed = entries.some(([, value]) => {
        const link = asConnection(value, graph);
        return link && String(link[0]) !== links.get(String(link[0]));
      });
      const changesSeed =
        offset > 0 &&
        entries.some(
          ([name, value]) => seedInputs.has(name) && typeof value === 'number',
        );
      const changesView = id === camera?.nodeId;
      const newId =
        changed || changesSeed || changesView || id === primary.nodeId
          ? allocateId()
          : id;
      links.set(id, newId);
      if (id === primary.nodeId)
        images.push({ ...primary, count: 1, nodeId: newId });
      if (newId !== id)
        branches.push({
          id: newId,
          links,
          seedOffset: offset,
          sourceId: id,
          ...(changesView ? { view } : {}),
        });
    }
  }

  return {
    apply(prompt: ApiWorkflow) {
      for (const id of latentNodes)
        workflowNode(prompt, id).inputs.batch_size = 1;
      // Read originals until every branch is assembled, then set the first view.
      for (const branch of branches) {
        const original = workflowNode(prompt, branch.sourceId);
        const inputs = Object.fromEntries(
          Object.entries(original.inputs).map(([name, value]) => {
            if (name === 'prompt' && branch.view !== undefined)
              return [name, branch.view];
            const link = asConnection(value, graph);
            if (link)
              return [
                name,
                [branch.links.get(String(link[0])) ?? link[0], link[1]],
              ];
            if (
              branch.seedOffset &&
              seedInputs.has(name) &&
              typeof value === 'number'
            ) {
              const seed = Math.max(-1, value);
              const offset = branch.seedOffset;
              return [
                name,
                seed <= Number.MAX_SAFE_INTEGER - offset
                  ? seed + offset
                  : offset - 1,
              ];
            }
            return [name, value];
          }),
        );
        prompt[branch.id] = { ...original, inputs };
      }
      if (camera)
        workflowNode(prompt, camera.nodeId).inputs.prompt = camera.views[0];
      return prompt;
    },
    imageOutputs: images,
    otherOutputs,
  };
}
