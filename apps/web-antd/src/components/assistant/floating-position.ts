export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  height: number;
  width: number;
}

export function clampFloatingPosition(
  position: Point,
  size: Viewport,
  viewport: Viewport,
  margin = 10,
): Point {
  return {
    x: Math.max(
      margin,
      Math.min(position.x, viewport.width - size.width - margin),
    ),
    y: Math.max(
      margin,
      Math.min(position.y, viewport.height - size.height - margin),
    ),
  };
}

export function assistantPanelSize(viewport: Viewport): Viewport {
  const mobile = viewport.width <= 640;
  return {
    width: mobile ? viewport.width - 20 : Math.min(430, viewport.width - 32),
    height: mobile ? viewport.height - 20 : Math.min(720, viewport.height - 48),
  };
}
