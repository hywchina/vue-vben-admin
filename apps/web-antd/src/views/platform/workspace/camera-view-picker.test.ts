import type { CapabilityField } from '#/modules/platform/types';

import { describe, expect, it } from 'vitest';

import {
  cameraCountField,
  restoreCameraViews,
  setCameraViewParameters,
} from '#/modules/platform/camera-views';

const views = [
  { id: 'view0', enabled: true, horizontal: 45, vertical: 0, zoom: 5 },
  { id: 'view1', enabled: false, horizontal: 0, vertical: 0, zoom: 5 },
];
describe('camera selection state', () => {
  it('resets quantity on selection changes and preserves it on angle edits', () => {
    const values: Record<string, unknown> = {
      cameraViews: views,
      generationCount: 8,
    };
    setCameraViewParameters(values, [
      { ...views[0], horizontal: 90 },
      views[1],
    ]);
    expect(values.generationCount).toBe(8);
    setCameraViewParameters(
      values,
      views.map((view) => ({ ...view, enabled: true })),
    );
    expect(values.generationCount).toBe(2);
    expect(
      cameraCountField({ key: 'generationCount' } as CapabilityField, values)
        .min,
    ).toBe(2);
  });
  it('restores an old draft with edited camera controls and limits its selected views to its old output count', () => {
    const fields = [
      { key: 'cameraViews', defaultValue: views },
      {
        key: 'angle',
        uiControl: 'camera-horizontal',
        uiGroup: '镜头 1',
        defaultValue: 45,
      },
      {
        key: 'vertical',
        uiControl: 'camera-vertical',
        uiGroup: '镜头 1',
        defaultValue: 0,
      },
      {
        key: 'zoom',
        uiControl: 'camera-zoom',
        uiGroup: '镜头 1',
        defaultValue: 5,
      },
    ] as CapabilityField[];
    // Camera descriptor lookup also examines other fields' uiControl.
    fields[0] = { ...fields[0], uiControl: 'default' } as CapabilityField;
    expect(
      restoreCameraViews(fields, {
        angle: 180,
        vertical: 60,
        zoom: 8,
        generationCount: 1,
      }),
    ).toEqual([
      { ...views[0], horizontal: 180, vertical: 60, zoom: 8 },
      views[1],
    ]);
  });
  it('keeps a saved empty selection so refresh never silently restores defaults', () => {
    const empty = views.map((view) => ({ ...view, enabled: false }));
    expect(restoreCameraViews([], { cameraViews: empty })).toEqual(empty);
  });
});
