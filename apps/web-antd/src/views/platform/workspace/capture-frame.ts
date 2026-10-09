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
