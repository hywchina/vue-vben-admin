import { describe, expect, it } from 'vitest';

import {
  materializeWorkflow,
  materializeWorkflowAssets,
  parseWorkflowVersion,
  publicParameterSchema,
  validateWorkflowAssetInputs,
  workflowParameterSchema,
  workflowValidationErrorMessage,
} from './schema';

const apiJson = {
  '1': {
    class_type: 'PrimitiveStringMultiline',
    inputs: { value: 'default' },
  },
  '2': {
    class_type: 'SaveImage',
    inputs: { filename_prefix: 'Rail', images: ['1', 0] },
  },
};

const parameterSchema = [
  {
    advanced: false,
    defaultValue: 'default',
    inputName: 'value',
    integer: false,
    key: 'prompt',
    label: '提示词',
    maxLength: 100,
    nodeId: '1',
    options: [],
    required: true,
    type: 'textarea',
  },
];

describe('comfyUI workflow schema', () => {
  it('materializes only published parameters without mutating the template', () => {
    const result = materializeWorkflow(apiJson, parameterSchema, {
      prompt: '客室方案',
    });
    expect(result['1']?.inputs.value).toBe('客室方案');
    expect(apiJson['1'].inputs.value).toBe('default');
    expect(publicParameterSchema(parameterSchema)[0]).not.toHaveProperty(
      'nodeId',
    );
  });

  it('rejects unknown parameters and connection mappings', () => {
    expect(() =>
      materializeWorkflow(apiJson, parameterSchema, { hidden: true }),
    ).toThrow('未公开');
    expect(() =>
      parseWorkflowVersion({
        apiJson,
        outputSchema: [
          {
            field: 'images',
            kind: 'image',
            nodeId: '2',
            role: 'primary',
            tags: [],
          },
        ],
        parameterSchema: [
          {
            ...parameterSchema[0],
            inputName: 'images',
            nodeId: '2',
          },
        ],
      }),
    ).toThrow('不能覆盖节点连接');
  });

  it('maps project assets without exposing node targets to the browser', () => {
    const mediaSchema = [
      {
        acceptedKinds: ['image'],
        advanced: false,
        assetIndex: 0,
        key: 'sourceImage',
        label: '底图',
        required: true,
        targets: [{ inputName: 'value', nodeId: '1', transport: 'upload' }],
        type: 'asset',
      },
    ];
    expect(() =>
      validateWorkflowAssetInputs(mediaSchema, [{ kind: 'text' }]),
    ).toThrow('不兼容');
    validateWorkflowAssetInputs(mediaSchema, [{ kind: 'image' }]);
    const result = materializeWorkflowAssets(
      apiJson,
      mediaSchema,
      new Map([
        [
          0,
          {
            dataUrl: 'data:image/png;base64,AA==',
            kind: 'image',
            uploadName: 'rail/input.png',
          },
        ],
      ]),
    );
    expect(result['1']?.inputs.value).toBe('rail/input.png');
    expect(publicParameterSchema(mediaSchema)[0]).not.toHaveProperty('targets');
  });

  it('does not expose internal Zod unions when a worker schema is stale', () => {
    const parsed = workflowParameterSchema.safeParse({ type: 'stale-type' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(workflowValidationErrorMessage(parsed.error)).toBe(
      '工作流参数协议与当前服务版本不一致，请刷新服务后重新提交',
    );
  });
});
