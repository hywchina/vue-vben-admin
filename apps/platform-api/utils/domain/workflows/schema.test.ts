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
  it('enforces the same 1–8 generation quantity for old and new workflow schemas', () => {
    for (const previousMax of [4, 8, 4096]) {
      const fields = [
        {
          key: 'batchSize',
          label: '生成数量',
          type: 'number',
          nodeId: '1',
          inputName: 'batch_size',
          min: 1,
          max: previousMax,
          defaultValue: 1,
        },
      ];
      const workflow = {
        '1': { class_type: 'EmptyLatentImage', inputs: { batch_size: 1 } },
      };
      expect(publicParameterSchema(fields)[0]).toMatchObject({
        min: 1,
        max: 8,
        integer: true,
      });
      expect(publicParameterSchema(fields)[0]?.help).toContain('最多 8');
      expect(
        materializeWorkflow(workflow, fields, { batchSize: 8 })['1']?.inputs
          .batch_size,
      ).toBe(8);
      for (const invalid of [0, 9, 4096, 1.5]) {
        expect(() =>
          materializeWorkflow(workflow, fields, { batchSize: invalid }),
        ).toThrow(/不能小于|不能大于|安全整数/);
      }
      expect(fields[0]?.max).toBe(previousMax);
    }
  });
  it('recognizes generated batch keys while leaving unrelated dimensions unchanged', () => {
    const fields = [
      {
        key: 'auto_batch',
        label: '生成数量',
        type: 'number',
        nodeId: '1',
        inputName: 'batch_size',
        max: 4096,
        defaultValue: 20,
      },
      {
        key: 'width',
        label: '图片宽度',
        type: 'number',
        nodeId: '1',
        inputName: 'width',
        max: 4096,
      },
    ];
    expect(publicParameterSchema(fields)[0]).toMatchObject({
      max: 8,
      defaultValue: 8,
    });
    expect(publicParameterSchema(fields)[1]?.max).toBe(4096);
  });

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

  it('applies internal parameter prefixes without exposing them', () => {
    const prefixedSchema = [
      {
        ...parameterSchema[0],
        valuePrefix: '固定工作流协议：',
      },
    ];
    const result = materializeWorkflow(apiJson, prefixedSchema, {
      prompt: '用户设计要求',
    });
    expect(result['1']?.inputs.value).toBe('固定工作流协议：用户设计要求');
    expect(publicParameterSchema(prefixedSchema)[0]).not.toHaveProperty(
      'valuePrefix',
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
