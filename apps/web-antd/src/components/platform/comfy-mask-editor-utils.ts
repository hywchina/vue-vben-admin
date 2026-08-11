export type ColorComparisonMethod = 'hsl' | 'lab' | 'simple';

export interface Point {
  x: number;
  y: number;
}

export interface PixelBuffer {
  data: Uint8ClampedArray;
  height: number;
  width: number;
}

export interface RgbColor {
  b: number;
  g: number;
  r: number;
}

export interface ColorSelectionSettings {
  applyWholeImage: boolean;
  maskBoundary: boolean;
  maskTolerance: number;
  method: ColorComparisonMethod;
  opacity: number;
  tolerance: number;
}

function pixelIndex(x: number, y: number, width: number) {
  return (y * width + x) * 4;
}

function pixelAlpha(buffer: PixelBuffer, x: number, y: number) {
  return buffer.data[pixelIndex(x, y, buffer.width) + 3] ?? 0;
}

function pixelColor(buffer: PixelBuffer, x: number, y: number): RgbColor {
  const index = pixelIndex(x, y, buffer.width);
  return {
    b: buffer.data[index + 2] ?? 0,
    g: buffer.data[index + 1] ?? 0,
    r: buffer.data[index] ?? 0,
  };
}

function setPixel(
  buffer: PixelBuffer,
  x: number,
  y: number,
  alpha: number,
  color: RgbColor,
) {
  const index = pixelIndex(x, y, buffer.width);
  buffer.data[index] = color.r;
  buffer.data[index + 1] = color.g;
  buffer.data[index + 2] = color.b;
  buffer.data[index + 3] = alpha;
}

function rgbToHsl(color: RgbColor) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, l: lightness * 100, s: 0 };
  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return { h: (hue / 6) * 360, l: lightness * 100, s: saturation * 100 };
}

function rgbToLab(color: RgbColor) {
  const convert = (value: number) => {
    const normalized = value / 255;
    return normalized > 0.04045
      ? ((normalized + 0.055) / 1.055) ** 2.4
      : normalized / 12.92;
  };
  const r = convert(color.r) * 100;
  const g = convert(color.g) * 100;
  const b = convert(color.b) * 100;
  const xyz = [
    (r * 0.4124 + g * 0.3576 + b * 0.1805) / 95.047,
    (r * 0.2126 + g * 0.7152 + b * 0.0722) / 100,
    (r * 0.0193 + g * 0.1192 + b * 0.9505) / 108.883,
  ].map((value) =>
    value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116,
  );
  return {
    a: 500 * ((xyz[0] ?? 0) - (xyz[1] ?? 0)),
    b: 200 * ((xyz[1] ?? 0) - (xyz[2] ?? 0)),
    l: 116 * (xyz[1] ?? 0) - 16,
  };
}

export function colorsMatch(
  pixel: RgbColor,
  target: RgbColor,
  tolerance: number,
  method: ColorComparisonMethod,
) {
  if (method === 'hsl') {
    const left = rgbToHsl(pixel);
    const right = rgbToHsl(target);
    const distance = Math.hypot(
      (Math.abs(left.h - right.h) / 360) * 255,
      (Math.abs(left.s - right.s) / 100) * 255,
      (Math.abs(left.l - right.l) / 100) * 255,
    );
    return distance <= tolerance;
  }
  if (method === 'lab') {
    const left = rgbToLab(pixel);
    const right = rgbToLab(target);
    return (
      (Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b) / 100) *
        255 <=
      tolerance
    );
  }
  return (
    Math.hypot(pixel.r - target.r, pixel.g - target.g, pixel.b - target.b) <=
    tolerance
  );
}

export function paintBucketFill(
  mask: PixelBuffer,
  point: Point,
  tolerance: number,
  opacity: number,
  color: RgbColor,
) {
  const startX = Math.floor(point.x);
  const startY = Math.floor(point.y);
  if (
    startX < 0 ||
    startY < 0 ||
    startX >= mask.width ||
    startY >= mask.height
  ) {
    return false;
  }
  const targetAlpha = pixelAlpha(mask, startX, startY);
  const filling = targetAlpha !== 255;
  const visited = new Uint8Array(mask.width * mask.height);
  const stack: Point[] = [{ x: startX, y: startY }];
  const matches = (alpha: number) =>
    filling
      ? alpha !== 255 && Math.abs(alpha - targetAlpha) <= tolerance
      : alpha === 255 || Math.abs(alpha - targetAlpha) <= tolerance;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const index = current.y * mask.width + current.x;
    if (visited[index] || !matches(pixelAlpha(mask, current.x, current.y)))
      continue;
    visited[index] = 1;
    setPixel(mask, current.x, current.y, filling ? opacity : 0, color);
    if (current.x > 0) stack.push({ x: current.x - 1, y: current.y });
    if (current.x + 1 < mask.width)
      stack.push({ x: current.x + 1, y: current.y });
    if (current.y > 0) stack.push({ x: current.x, y: current.y - 1 });
    if (current.y + 1 < mask.height)
      stack.push({ x: current.x, y: current.y + 1 });
  }
  return true;
}

export function colorSelectFill(
  image: PixelBuffer,
  mask: PixelBuffer,
  point: Point,
  settings: ColorSelectionSettings,
  color: RgbColor,
) {
  const startX = Math.floor(point.x);
  const startY = Math.floor(point.y);
  if (
    startX < 0 ||
    startY < 0 ||
    startX >= image.width ||
    startY >= image.height
  ) {
    return false;
  }
  const target = pixelColor(image, startX, startY);
  const matches = (x: number, y: number) =>
    colorsMatch(
      pixelColor(image, x, y),
      target,
      settings.tolerance,
      settings.method,
    );
  if (settings.applyWholeImage) {
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        if (matches(x, y)) setPixel(mask, x, y, settings.opacity, color);
      }
    }
    return true;
  }
  const visited = new Uint8Array(image.width * image.height);
  const stack: Point[] = [{ x: startX, y: startY }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const index = current.y * image.width + current.x;
    if (visited[index] || !matches(current.x, current.y)) continue;
    visited[index] = 1;
    setPixel(mask, current.x, current.y, settings.opacity, color);
    const neighbors = [
      { x: current.x - 1, y: current.y },
      { x: current.x + 1, y: current.y },
      { x: current.x, y: current.y - 1 },
      { x: current.x, y: current.y + 1 },
    ];
    for (const neighbor of neighbors) {
      if (
        neighbor.x < 0 ||
        neighbor.y < 0 ||
        neighbor.x >= image.width ||
        neighbor.y >= image.height ||
        visited[neighbor.y * image.width + neighbor.x] ||
        !matches(neighbor.x, neighbor.y) ||
        (settings.maskBoundary &&
          255 - pixelAlpha(mask, neighbor.x, neighbor.y) <=
            settings.maskTolerance)
      ) {
        continue;
      }
      stack.push(neighbor);
    }
  }
  return true;
}

export function invertMask(mask: PixelBuffer, fallbackColor: RgbColor) {
  let color = fallbackColor;
  for (let index = 0; index < mask.data.length; index += 4) {
    if ((mask.data[index + 3] ?? 0) > 0) {
      color = {
        b: mask.data[index + 2] ?? 0,
        g: mask.data[index + 1] ?? 0,
        r: mask.data[index] ?? 0,
      };
      break;
    }
  }
  for (let index = 0; index < mask.data.length; index += 4) {
    const alpha = mask.data[index + 3] ?? 0;
    mask.data[index + 3] = 255 - alpha;
    if (alpha === 0) {
      mask.data[index] = color.r;
      mask.data[index + 1] = color.g;
      mask.data[index + 2] = color.b;
    }
  }
}

export function recolorMask(mask: PixelBuffer, color: RgbColor) {
  for (let index = 0; index < mask.data.length; index += 4) {
    mask.data[index] = color.r;
    mask.data[index + 1] = color.g;
    mask.data[index + 2] = color.b;
  }
}

export function transformedPixels(
  source: PixelBuffer,
  transform:
    | 'mirror-horizontal'
    | 'mirror-vertical'
    | 'rotate-left'
    | 'rotate-right',
): PixelBuffer {
  const rotated = transform.startsWith('rotate');
  const width = rotated ? source.height : source.width;
  const height = rotated ? source.width : source.height;
  const output: PixelBuffer = {
    data: new Uint8ClampedArray(width * height * 4),
    height,
    width,
  };
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      let targetX = x;
      let targetY = y;
      if (transform === 'rotate-right') {
        targetX = source.height - 1 - y;
        targetY = x;
      } else if (transform === 'rotate-left') {
        targetX = y;
        targetY = source.width - 1 - x;
      } else if (transform === 'mirror-horizontal') {
        targetX = source.width - 1 - x;
      } else {
        targetY = source.height - 1 - y;
      }
      const sourceIndex = pixelIndex(x, y, source.width);
      const targetIndex = pixelIndex(targetX, targetY, width);
      output.data.set(
        source.data.slice(sourceIndex, sourceIndex + 4),
        targetIndex,
      );
    }
  }
  return output;
}
