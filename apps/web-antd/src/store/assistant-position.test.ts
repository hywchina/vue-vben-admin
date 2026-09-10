import { describe, expect, it } from 'vitest';

import {
  assistantPanelSize,
  clampFloatingPosition,
} from '#/components/assistant/floating-position';

describe('assistant floating boundaries', () => {
  it('keeps launcher and panel within every edge', () => {
    const viewport = { width: 1440, height: 900 };
    expect(
      clampFloatingPosition(
        { x: -100, y: -100 },
        { width: 56, height: 56 },
        viewport,
      ),
    ).toEqual({ x: 10, y: 10 });
    expect(
      clampFloatingPosition(
        { x: 2000, y: 2000 },
        assistantPanelSize(viewport),
        viewport,
      ),
    ).toEqual({ x: 1000, y: 170 });
  });
  it('fits portrait and short landscape viewports after resizing', () => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      const size = assistantPanelSize(viewport);
      const point = clampFloatingPosition({ x: 1400, y: 800 }, size, viewport);
      expect(point.x + size.width).toBeLessThanOrEqual(viewport.width - 10);
      expect(point.y + size.height).toBeLessThanOrEqual(viewport.height - 10);
    }
  });
});
