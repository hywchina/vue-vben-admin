import { describe, expect, it } from 'vitest';

import { buildCompleteWorkflowParameterSchema } from './ui-parameters';

describe('comfyUI full parameter schema', () => {
  it('keeps curated fields and adds every literal input with UI metadata', () => {
    const schema = buildCompleteWorkflowParameterSchema(
      {
        1: {
          class_type: 'ExampleNode',
          inputs: {
            connected: ['2', 0],
            mode: 'fast',
            prompt: 'hello',
            strength: 0.5,
          },
        },
        2: { class_type: 'SourceNode', inputs: {} },
      },
      [
        {
          inputName: 'prompt',
          key: 'prompt',
          label: '提示词',
          nodeId: '1',
          type: 'textarea',
        },
      ],
      {
        ExampleNode: {
          display_name: '示例节点',
          input: {
            required: {
              mode: [['fast', 'quality']],
              prompt: ['STRING', { multiline: true }],
              strength: ['FLOAT', { max: 1, min: 0, step: 0.05 }],
            },
          },
        },
      },
    );

    expect(schema).toHaveLength(3);
    expect(schema.find((field) => field.key === 'prompt')).toBeTruthy();
    expect(schema.find((field) => field.inputName === 'mode')).toMatchObject({
      group: '示例节点',
      options: [
        { label: 'fast', value: 'fast' },
        { label: 'quality', value: 'quality' },
      ],
      type: 'select',
    });
    expect(
      schema.find((field) => field.inputName === 'strength'),
    ).toMatchObject({ max: 1, min: 0, step: 0.05, type: 'number' });
  });

  it('marks Qwen camera values as one semantic camera control group', () => {
    const schema = buildCompleteWorkflowParameterSchema(
      {
        22: {
          class_type: 'QwenMultiangleCameraNode',
          inputs: {
            horizontal_angle: 45,
            vertical_angle: 0,
            zoom: 5,
          },
        },
      },
      [],
      {
        QwenMultiangleCameraNode: {
          input: {
            required: {
              horizontal_angle: ['FLOAT', { max: 360, min: 0, step: 1 }],
              vertical_angle: ['FLOAT', { max: 60, min: -30, step: 1 }],
              zoom: ['FLOAT', { max: 10, min: 0, step: 0.1 }],
            },
          },
        },
      },
    );

    expect(schema).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputName: 'horizontal_angle',
          uiControl: 'camera-horizontal',
          uiGroup: '镜头 1',
        }),
        expect.objectContaining({
          inputName: 'vertical_angle',
          uiControl: 'camera-vertical',
          uiGroup: '镜头 1',
        }),
        expect.objectContaining({
          inputName: 'zoom',
          uiControl: 'camera-zoom',
          uiGroup: '镜头 1',
        }),
      ]),
    );
  });
});
