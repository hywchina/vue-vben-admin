export interface CaptureCrop {
  height: number;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
  x: number;
  y: number;
}

/** Preview and uploaded frames share source coordinates; only destination resolution differs. */
export function drawCapturedFrame(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  crop?: CaptureCrop,
  maximumEdge?: number,
) {
  if (!video.videoWidth || !video.videoHeight)
    throw new Error('实时画面尚未就绪');
  const area =
    crop?.sourceWidth === video.videoWidth &&
    crop.sourceHeight === video.videoHeight
      ? crop
      : { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
  const scale = maximumEdge
    ? Math.min(1, maximumEdge / Math.max(area.width, area.height))
    : 1;
  const width = Math.max(1, Math.round(area.width * scale));
  const height = Math.max(1, Math.round(area.height * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法绘制捕获画面');
  context.drawImage(
    video,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    width,
    height,
  );
}

// Preserve the edited mask's alpha while replacing RGB with the next captured frame.
export function copyCaptureMaskAlpha(
  frame: Uint8ClampedArray,
  mask: Uint8ClampedArray,
) {
  if (frame.length !== mask.length) throw new Error('实时画面与遮罩尺寸不匹配');
  for (let index = 3; index < frame.length; index += 4)
    frame[index] = mask[index] ?? 255;
}

export async function applyCaptureMask(frame: File, maskUrl: string) {
  const load = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.addEventListener('load', () => resolve(image), { once: true });
      image.addEventListener(
        'error',
        () => reject(new Error('实时遮罩读取失败')),
        { once: true },
      );
      image.src = url;
    });
  const url = URL.createObjectURL(frame);
  try {
    const [image, mask] = await Promise.all([load(url), load(maskUrl)]);
    if (
      image.naturalWidth !== mask.naturalWidth ||
      image.naturalHeight !== mask.naturalHeight
    )
      throw new Error('捕获尺寸已变化，请重新捕获当前帧并编辑遮罩');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法应用实时遮罩');
    context.drawImage(mask, 0, 0);
    const alpha = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    copyCaptureMaskAlpha(pixels.data, alpha);
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) throw new Error('实时遮罩生成失败');
    return new File([blob], `live-mask-${Date.now()}.png`, {
      type: 'image/png',
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
