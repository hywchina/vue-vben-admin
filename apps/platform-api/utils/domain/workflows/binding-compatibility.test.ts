// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { workflowBindingCompatible } from './binding-compatibility';
import { WORKFLOW_CATALOG } from './catalog';

function contract(key: string) {
  const entry = WORKFLOW_CATALOG.find((item) => item.application.key === key);
  if (!entry) throw new Error('Missing catalog entry');
  return structuredClone(entry.version);
}

describe('workflow replacement contract', () => {
  it.each(WORKFLOW_CATALOG.map((entry) => entry.application.key))(
    'accepts the canonical implementation of %s',
    (key) => {
      const version = contract(key);
      expect(
        workflowBindingCompatible(
          key,
          version.parameterSchema,
          version.outputSchema,
        ),
      ).toBe(true);
    },
  );
  it.each([
    'multiview-to-3d',
    'single-image-edit',
    'text-chat',
    'image-edit-kv',
  ])('rejects %s replacing text-to-image', (key) => {
    const version = contract(key);
    expect(
      workflowBindingCompatible(
        'text-to-image',
        version.parameterSchema,
        version.outputSchema,
      ),
    ).toBe(false);
  });
  it('rejects an ordinary image field replacing a mask and a missing reference input', () => {
    const version = contract('inpaint-single');
    expect(
      workflowBindingCompatible(
        'single-image-edit',
        version.parameterSchema,
        version.outputSchema,
      ),
    ).toBe(false);
    expect(
      workflowBindingCompatible(
        'inpaint-reference',
        version.parameterSchema,
        version.outputSchema,
      ),
    ).toBe(false);
  });
  it('accepts historical region versions without the new optional reference', () => {
    const version = contract('region-marker-edit');
    version.parameterSchema = version.parameterSchema.filter(
      (field) => Reflect.get(field as object, 'key') !== 'regionReference',
    );
    expect(
      workflowBindingCompatible(
        'region-marker-edit',
        version.parameterSchema,
        version.outputSchema,
      ),
    ).toBe(true);
  });
  it('rejects removal of the prompt and malformed schemas', () => {
    const version = contract('text-to-image');
    const fields = version.parameterSchema.filter(
      (field) => Reflect.get(field as object, 'key') !== 'prompt',
    );
    expect(
      workflowBindingCompatible('text-to-image', fields, version.outputSchema),
    ).toBe(false);
    expect(
      workflowBindingCompatible('text-to-image', {}, version.outputSchema),
    ).toBe(false);
    expect(workflowBindingCompatible('unknown', [], [])).toBe(false);
  });
  it('allows changing internal node IDs, model files, labels and auxiliary outputs', () => {
    const version = contract('text-to-image');
    expect(
      workflowBindingCompatible(
        'text-to-image',
        version.parameterSchema.map((field) => ({
          ...(field as object),
          label: '中文参数',
          nodeId: 'custom',
        })),
        [
          ...version.outputSchema,
          { field: 'debug', nodeId: 'debug', kind: 'text', role: 'auxiliary' },
        ],
      ),
    ).toBe(true);
  });
});
