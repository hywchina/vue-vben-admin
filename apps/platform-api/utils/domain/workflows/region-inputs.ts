const regionKey = /^(number_[1-6]|color_(black|white|red|green|blue|gray))$/;
const colors = new Set([
  '0,0,0',
  '0,0,255',
  '0,255,0',
  '128,128,128',
  '255,0,0',
  '255,255,255',
]);

export function normalizeRegionPrompts(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('每区域修改要求格式无效');
  const entries = Object.entries(value);
  if (
    entries.some(
      ([key, text]) =>
        !regionKey.test(key) || typeof text !== 'string' || text.length > 2000,
    )
  )
    throw new Error('每区域修改要求无效，每项最多2000字');
  return Object.fromEntries(
    entries.map(([key, text]) => [key, (text as string).trim()]),
  );
}

// Validate the platform's existing EasyMark serialization before queuing GPU work.
export function validateRegionMarks(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 1_000_000)
    throw new Error('区域标记数据无效');
  const strokes = value.split('|').filter(Boolean);
  if (strokes.length === 0 || strokes.length > 2000)
    throw new Error('区域笔迹过多');
  let hasRange = false;
  const ranges: Array<{
    area: number;
    box: readonly number[];
    marker?: string;
    shape: string;
  }> = [];
  for (const stroke of strokes) {
    const parts = stroke.split(':');
    const [mode, shape, size, opacity, color] = parts;
    const marker = parts.length === 7 ? parts[5] : undefined;
    if (
      ![6, 7].includes(parts.length) ||
      !['brush', 'erase'].includes(mode ?? '') ||
      !['box', 'free', 'square'].includes(shape ?? '') ||
      !colors.has(color ?? '') ||
      (marker !== undefined && (shape !== 'square' || !/^[1-6]$/.test(marker)))
    )
      throw new Error('区域标记格式无效');
    if (
      !Number.isFinite(Number(size)) ||
      Number(size) < 1 ||
      Number(size) > 256 ||
      !Number.isFinite(Number(opacity)) ||
      Number(opacity) <= 0 ||
      Number(opacity) > 1
    )
      throw new Error('区域画笔参数无效');
    const points = (parts.at(-1) ?? '').split(';');
    if (
      points.length < 2 ||
      points.length > 30_000 ||
      points.some((point) => {
        const pair = point.split(',');
        return (
          pair.length !== 2 ||
          pair.some(
            (x) =>
              !x.trim() ||
              !Number.isFinite(Number(x)) ||
              Math.abs(Number(x)) > 1_000_000,
          )
        );
      })
    )
      throw new Error('区域坐标无效');
    if (mode === 'brush' && new Set(points).size > 1) {
      hasRange = true;
      const coordinates = points.map((point) => point.split(',').map(Number));
      const xs = coordinates.map((pair) => pair[0] ?? 0);
      const ys = coordinates.map((pair) => pair[1] ?? 0);
      const box = [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs),
        Math.max(...ys),
      ] as const;
      ranges.push({
        marker,
        shape: shape ?? '',
        box,
        area: (box[2] - box[0]) * (box[3] - box[1]),
      });
    }
  }
  if (!hasRange) throw new Error('请绘制有效的编辑范围');
  const labels = new Map<object, string>();
  for (const range of ranges) {
    if (!range.marker) continue;
    const [x = 0, y = 0, right = 0, bottom = 0] = range.box;
    const frame = ranges
      .filter((item) => {
        const [a = 0, b = 0, c = 0, d = 0] = item.box;
        return (
          !item.marker &&
          item.shape === 'box' &&
          a <= x &&
          right <= c &&
          b <= y &&
          bottom <= d &&
          range.area < item.area * 0.5
        );
      })
      .toSorted((a, b) => a.area - b.area)[0];
    if (!frame) continue;
    if (labels.has(frame) && labels.get(frame) !== range.marker)
      throw new Error('同一方框存在多个编号，请分别框选完整区域');
    labels.set(frame, range.marker);
  }
}
