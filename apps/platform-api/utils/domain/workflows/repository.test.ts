import { describe, expect, it } from 'vitest';

import { workflowSupportsImageComparison } from './repository';

describe('workflow public presentation', () => {
  it('detects both ComfyUI image comparison node families', () => {
    expect(
      workflowSupportsImageComparison({
        1: { class_type: 'ImageCompare', inputs: {} },
      }),
    ).toBe(true);
    expect(
      workflowSupportsImageComparison({
        1: { class_type: 'Image Comparer (rgthree)', inputs: {} },
      }),
    ).toBe(true);
  });

  it('does not expose comparison for ordinary image output nodes', () => {
    expect(
      workflowSupportsImageComparison({
        1: { class_type: 'SaveImage', inputs: {} },
      }),
    ).toBe(false);
  });
});
