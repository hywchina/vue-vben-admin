import { describe, expect, it } from 'vitest';

import {
  toPublicCapability,
  workflowSupportsImageComparison,
} from './repository';

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

it('isolates label overrides by the bound workflow version', () => {
  const row = {
    apiJson: { '1': { class_type: 'Size', inputs: { width: 512 } } },
    appKey: 'test',
    code: 'test',
    description: '',
    name: '测试',
    outputSchema: [],
    parameterSchema: [
      {
        key: 'width',
        label: '宽度',
        type: 'number',
        nodeId: '1',
        inputName: 'width',
      },
    ],
    provider: 'comfyui',
    workflowCode: 'test',
    workflowName: '测试',
    workflowVersion: 1,
    workflowVersionId: 'current',
    labelWorkflowVersionId: 'current',
    fieldLabels: { width: '管理员名称' },
  };
  expect(toPublicCapability(row).fields[0]?.label).toBe('管理员名称');
  const rebound = toPublicCapability({ ...row, workflowVersionId: 'new' });
  expect(rebound.fields[0]?.label).toBe('宽度');
  expect(rebound.presentation.fieldLabels).toEqual({});
});
