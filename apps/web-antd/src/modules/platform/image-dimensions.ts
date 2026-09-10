import type { CapabilityField } from './types';
export type DimensionLimit = Pick<CapabilityField, 'max' | 'min' | 'step'>;
export interface ImageSize {
  width: number;
  height: number;
}
export interface TemplateSize {
  width?: number;
  height?: number;
  aspectRatio?: string;
}
export const imageRatios = ['9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9'];
export function imageDimensionFields(fields: CapabilityField[]) {
  const find = (name: string, label: string) =>
    fields.find((field) => field.type === 'number' && field.label === label) ??
    fields.find(
      (field) =>
        field.type === 'number' &&
        new RegExp(`(^|[_-])${name}$`, 'i').test(field.key),
    );
  const width = find('width', '图片宽度');
  const height = find('height', '图片高度');
  return width && height ? { width, height } : undefined;
}
export function sizeRatio(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    return '';
  let a = width;
  let b = height;
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return `${width / a}:${height / a}`;
}
export function validDimension(value: number, limit: DimensionLimit = {}) {
  const min = Math.max(1, limit.min ?? 1);
  const step = Math.max(1, limit.step ?? 1);
  return (
    Number.isInteger(value) &&
    value >= min &&
    value <= (limit.max ?? 16_384) &&
    Math.abs(
      (value - (limit.min ?? 0)) / step -
        Math.round((value - (limit.min ?? 0)) / step),
    ) < 0.000001
  );
}
export function linkedSize(
  ratio: string,
  value: number,
  side: 'height' | 'width',
  widthLimit: DimensionLimit = {},
  heightLimit: DimensionLimit = {},
): ImageSize {
  const [rw, rh] = ratio.split(':').map(Number);
  if (!rw || !rh || !Number.isFinite(value) || value <= 0)
    throw new Error('请输入有效比例和尺寸');
  let result: ImageSize | undefined;
  let distance = Infinity;
  const max = Math.min(widthLimit.max ?? 16_384, 65_536);
  for (
    let width = Math.ceil(Math.max(1, widthLimit.min ?? 1));
    width <= max;
    width++
  ) {
    if (!validDimension(width, widthLimit)) continue;
    const height = (width * rh) / rw;
    if (!validDimension(height, heightLimit)) continue;
    const delta = Math.abs((side === 'width' ? width : height) - value);
    if (delta < distance) {
      result = { width, height };
      distance = delta;
    }
  }
  if (!result) throw new Error('当前工作流的尺寸范围与步长无法满足该比例');
  return result;
}
export function resolveTemplateSize(
  size: TemplateSize,
  current: ImageSize,
  widthLimit: DimensionLimit = {},
  heightLimit: DimensionLimit = {},
): ImageSize {
  if (size.width !== undefined && size.height !== undefined) {
    if (
      !validDimension(size.width, widthLimit) ||
      !validDimension(size.height, heightLimit)
    )
      throw new Error('模板尺寸超出工作流范围或不符合步长，请调整模板尺寸');
    if (
      size.aspectRatio &&
      sizeRatio(size.width, size.height) !==
        sizeRatio(
          ...(size.aspectRatio.split(':').map(Number) as [number, number]),
        )
    )
      throw new Error('模板比例与宽高不一致');
    return { width: size.width, height: size.height };
  }
  if (!size.aspectRatio) throw new Error('模板尚未设置完整宽高或比例');
  return linkedSize(
    size.aspectRatio,
    current.width,
    'width',
    widthLimit,
    heightLimit,
  );
}

/** Only replace the dedicated template ratio line; leave free-form user prose intact. */
export function syncPromptRatio(text: string, size: ImageSize, insert = false) {
  const line = `画面比例：${sizeRatio(size.width, size.height)}（${size.width}×${size.height}）。`;
  const pattern = /^画面比例：[0-9]+:[0-9]+（[0-9]+×[0-9]+）。$/gm;
  if (pattern.test(text)) return text.replace(pattern, line);
  return insert ? [text.trimEnd(), line].filter(Boolean).join('\n') : text;
}
