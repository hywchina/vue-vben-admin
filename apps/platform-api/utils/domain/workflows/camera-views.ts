import { z } from 'zod';

import { parseApiWorkflow } from './schema';

export const cameraViewsKey = 'cameraViews';
const directions = [0, 45, 90, 135, 180, 225, 270, 315];
const viewSchema = z
  .object({
    enabled: z.boolean(),
    horizontal: z.number().refine((value) => directions.includes(value)),
    id: z.string().regex(/^view[0-7]$/),
    vertical: z.number().refine((value) => [-30, 0, 30, 60].includes(value)),
    zoom: z.number().refine((value) => [1, 5, 8].includes(value)),
  })
  .strict();
export type CameraView = z.infer<typeof viewSchema>;

export function parseCameraViews(value: unknown, allowEmpty = false) {
  const result = viewSchema.array().min(1).max(8).safeParse(value);
  if (!result.success)
    throw new Error('视角配置无效，请重新选择方向、俯仰和景别');
  const views = result.data;
  if (new Set(views.map(({ id }) => id)).size !== views.length)
    throw new Error('视角编号不能重复');
  const selected = views.filter(({ enabled }) => enabled);
  if (!allowEmpty && selected.length === 0)
    throw new Error('请至少选择一个视角');
  const combinations = selected.map(
    ({ horizontal, vertical, zoom }) => `${horizontal}/${vertical}/${zoom}`,
  );
  if (new Set(combinations).size !== combinations.length)
    throw new Error('已选视角的方向、俯仰和景别不能完全相同');
  return views;
}

export function cameraViewsField(appKey: string, apiJson: unknown) {
  if (appKey !== 'camera-control-multi') return;
  const graph = parseApiWorkflow(apiJson);
  const list = Object.values(graph).find(
    (node) => node.class_type === 'easy promptList',
  );
  const nodes = Object.entries(list?.inputs ?? {})
    .filter(([key]) => /^prompt_\d+$/.test(key))
    .toSorted(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .flatMap(([, link]) => {
      const node = Array.isArray(link) ? graph[String(link[0])] : undefined;
      return node?.class_type === 'QwenMultiangleCameraNode' ? [node] : [];
    });
  const configured: CameraView[] = nodes.slice(0, 8).map((node, index) => {
    let zoom = 5;
    if (Number(node.inputs.zoom) < 2) zoom = 1;
    if (Number(node.inputs.zoom) >= 6) zoom = 8;
    const vertical = Number(node.inputs.vertical_angle);
    const verticalPreset =
      [-30, 0, 30, 60].find((angle) => vertical < angle + 15) ?? 60;
    return {
      enabled: true,
      horizontal:
        (((Math.round(Number(node.inputs.horizontal_angle) / 45) * 45) % 360) +
          360) %
        360,
      id: `view${index}`,
      vertical: verticalPreset,
      zoom,
    };
  });
  for (const horizontal of directions) {
    if (configured.length >= 8) break;
    if (!configured.some((view) => view.horizontal === horizontal))
      configured.push({
        enabled: false,
        horizontal,
        id: `view${configured.length}`,
        vertical: 0,
        zoom: 5,
      });
  }
  return {
    acceptedKinds: [],
    advanced: false,
    defaultLabel: '视角选择',
    defaultValue: configured,
    integer: false,
    key: cameraViewsKey,
    label: '视角选择',
    options: [],
    required: false,
    type: 'json' as const,
    uiControl: 'default' as const,
  };
}

export function cameraViewPrompt(view: CameraView) {
  const horizontal = [
    'front view',
    'front-right quarter view',
    'right side view',
    'back-right quarter view',
    'back view',
    'back-left quarter view',
    'left side view',
    'front-left quarter view',
  ][directions.indexOf(view.horizontal)];
  const vertical = new Map([
    [-30, 'low-angle shot'],
    [0, 'eye-level shot'],
    [30, 'elevated shot'],
    [60, 'high-angle shot'],
  ]).get(view.vertical);
  const distance = new Map([
    [1, 'wide shot'],
    [5, 'medium shot'],
    [8, 'close-up'],
  ]).get(view.zoom);
  return `<sks> ${horizontal} ${vertical} ${distance}`;
}
