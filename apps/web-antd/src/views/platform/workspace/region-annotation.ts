export interface RegionPoint {
  x: number;
  y: number;
}

export interface RegionStroke {
  color: string;
  marker?: string;
  mode: 'brush' | 'erase';
  opacity: number;
  points: RegionPoint[];
  size: number;
  type: 'box' | 'free' | 'square';
}

export function parseRegionStrokes(value: string) {
  if (!value) return [];
  return value.split('|').flatMap((serialized): RegionStroke[] => {
    const parts = serialized.split(':');
    if (parts.length < 6) return [];
    const [mode, type, size, opacity, color] = parts;
    let marker: string | undefined;
    let pointsIndex = 5;
    if (/^[1-6]$/.test(parts[5] ?? '') && parts.length >= 7) {
      marker = parts[5];
      pointsIndex = 6;
    }
    if (
      !['brush', 'erase'].includes(mode ?? '') ||
      !['box', 'free', 'square'].includes(type ?? '')
    ) {
      return [];
    }
    const points = parts
      .slice(pointsIndex)
      .join(':')
      .split(';')
      .flatMap((point) => {
        const coordinates = point.split(',');
        const x = Number(coordinates[0]);
        const y = Number(coordinates[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
      });
    if (points.length === 0) return [];
    return [
      {
        color: color ?? '255,0,0',
        marker,
        mode: mode as RegionStroke['mode'],
        opacity: Number(opacity) || 1,
        points,
        size: Number(size) || 4,
        type: type as RegionStroke['type'],
      },
    ];
  });
}

const regionColors: Record<string, [string, string]> = {
  '0,0,0': ['black', '黑色'],
  '255,255,255': ['white', '白色'],
  '255,0,0': ['red', '红色'],
  '0,255,0': ['green', '绿色'],
  '0,0,255': ['blue', '蓝色'],
  '128,128,128': ['gray', '灰色'],
};

export function regionPromptGroups(value: string) {
  const strokes = parseRegionStrokes(value).filter(
    (stroke) => stroke.mode === 'brush',
  );
  const bounds = strokes.map((stroke) => {
    const xs = stroke.points.map(({ x }) => x);
    const ys = stroke.points.map(({ y }) => y);
    return [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ] as const;
  });
  const keys = strokes.map((stroke) =>
    stroke.marker
      ? `number_${stroke.marker}`
      : `color_${regionColors[stroke.color]?.[0] ?? 'red'}`,
  );
  strokes.forEach((stroke, index) => {
    if (!stroke.marker) return;
    const [x, y, right, bottom] = bounds[index] ?? [0, 0, 0, 0];
    const frame = strokes
      .map((item, j) => ({
        item,
        j,
        box: bounds[j] ?? ([0, 0, 0, 0] as const),
      }))
      .filter(
        ({ item, box: [a, b, c, d] }) =>
          !item.marker &&
          item.type === 'box' &&
          a <= x &&
          right <= c &&
          b <= y &&
          bottom <= d &&
          (right - x) * (bottom - y) < (c - a) * (d - b) * 0.5,
      )
      .toSorted(
        (a, b) =>
          (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]) -
          (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]),
      )[0];
    if (frame) keys[frame.j] = keys[index] ?? keys[frame.j] ?? 'color_red';
  });
  return [...new Set(keys)].map((key) => ({
    key,
    label: key.startsWith('number_')
      ? `区域${key.slice(7)}`
      : `${Object.values(regionColors).find(([name]) => key === `color_${name}`)?.[1] ?? '颜色'}区域`,
  }));
}

export function drawRegionStroke(
  context: CanvasRenderingContext2D,
  stroke: RegionStroke,
) {
  if (stroke.points.length === 0) return;
  const first = stroke.points[0] ?? { x: 0, y: 0 };
  const last = stroke.points.at(-1) ?? first;
  context.save();
  context.globalAlpha = stroke.opacity;
  if (stroke.mode === 'erase') {
    context.globalCompositeOperation = 'destination-out';
  }
  context.beginPath();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = stroke.size;
  context.strokeStyle = `rgb(${stroke.color})`;
  context.fillStyle = stroke.marker ? '#ffe34d' : `rgb(${stroke.color})`;
  if (stroke.type === 'free') {
    context.moveTo(first.x, first.y);
    for (const point of stroke.points.slice(1))
      context.lineTo(point.x, point.y);
    context.stroke();
  } else {
    const x = Math.min(first.x, last.x);
    const y = Math.min(first.y, last.y);
    const width = Math.abs(last.x - first.x);
    const height = Math.abs(last.y - first.y);
    if (stroke.type === 'box') context.strokeRect(x, y, width, height);
    else context.fillRect(x, y, width, height);
    if (stroke.marker) {
      context.globalAlpha = 1;
      context.fillStyle = '#111';
      context.font = `700 ${Math.max(14, Math.min(width, height) * 0.55)}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(stroke.marker, x + width / 2, y + height / 2);
    }
  }
  context.restore();
}

export function serializeRegionStrokes(strokes: RegionStroke[]) {
  return strokes
    .filter((stroke) => stroke.points.length > 0)
    .map(
      (stroke) =>
        `${stroke.mode}:${stroke.type}:${stroke.size}:${stroke.opacity}:${stroke.color}${
          stroke.marker ? `:${stroke.marker}` : ''
        }:${stroke.points
          .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
          .join(';')}`,
    )
    .join('|');
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener(
      'error',
      () => reject(new Error('分区底图读取失败')),
      { once: true },
    );
    image.src = url;
  });
}

export async function createRegionAnnotationFile(input: {
  fileName: string;
  sourceUrl: string;
  value: string;
}) {
  const image = await loadImage(input.sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法生成分区标记图');
  context.drawImage(image, 0, 0);
  const overlay = document.createElement('canvas');
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  const overlayContext = overlay.getContext('2d');
  if (!overlayContext) throw new Error('浏览器无法生成分区标记图');
  for (const stroke of parseRegionStrokes(input.value)) {
    drawRegionStroke(overlayContext, stroke);
  }
  context.drawImage(overlay, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('分区标记图生成失败');
  return new File([blob], input.fileName, { type: 'image/png' });
}

export async function createRegionInputAnnotations(input: {
  fields: Array<{ assetIndex?: number; key: string; type: string }>;
  parameterValues: Record<string, unknown>;
  resolvePreviewUrl: (assetId: string) => Promise<string>;
  saveAnnotation: (input: {
    file: File;
    originalAssetId: string;
  }) => Promise<{ id: string }>;
  selectedAssets: Record<number, string>;
}) {
  const annotations: Array<{ assetId: string; position: number }> = [];
  let position = 0;
  for (const field of input.fields) {
    if (field.assetIndex === undefined) continue;
    const originalAssetId = input.selectedAssets[field.assetIndex];
    if (!originalAssetId) continue;
    if (field.type === 'region') {
      const value = String(input.parameterValues[field.key] ?? '');
      if (value) {
        const sourceUrl = await input.resolvePreviewUrl(originalAssetId);
        const file = await createRegionAnnotationFile({
          fileName: `region-annotation-${Date.now()}-${position + 1}.png`,
          sourceUrl,
          value,
        });
        const annotation = await input.saveAnnotation({
          file,
          originalAssetId,
        });
        annotations.push({ assetId: annotation.id, position });
      }
    }
    position += 1;
  }
  return annotations;
}
