import { describe, expect, it } from 'vitest';

import {
  restoreTemplateDefaults,
  templateChangeSummary,
} from '#/modules/platform/prompt-template-maintenance';
const defaults = [
  {
    id: 'light',
    name: '灯光',
    options: [{ id: 'night', label: '夜光', value: '默认夜光' }],
  },
];
const current = [
  {
    id: 'light',
    name: '灯光修改',
    options: [
      { id: 'night', label: '夜光改', value: '自定义夜光' },
      { id: 'custom', label: '新增', value: '自定义' },
    ],
  },
  {
    id: 'custom-cat',
    name: '新增分类',
    options: [{ id: 'custom', label: '新增', value: '新增' }],
  },
];
describe('prompt template restore', () => {
  it('restores defaults while preserving custom data without mutating current config', () => {
    const restored = restoreTemplateDefaults(current, defaults);
    expect(restored[0]?.name).toBe('灯光');
    expect(restored[0]?.options).toHaveLength(2);
    expect(restored).toHaveLength(2);
    expect(current[0]?.name).toBe('灯光修改');
  });
  it('supports option/category scopes and full reset with deletion preview', () => {
    expect(
      restoreTemplateDefaults(current, defaults, {
        categoryId: 'light',
        optionId: 'night',
      })[0]?.name,
    ).toBe('灯光修改');
    expect(
      restoreTemplateDefaults(current, defaults, { categoryId: 'light' })[0]
        ?.options,
    ).toHaveLength(2);
    const reset = restoreTemplateDefaults(current, defaults, { full: true });
    expect(reset).toEqual(defaults);
    expect(templateChangeSummary(current, reset).removed).toContain(
      'light/custom',
    );
    expect(templateChangeSummary(current, reset).removed).toContain(
      'custom-cat',
    );
  });
});
