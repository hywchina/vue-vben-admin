import { describe, expect, it } from 'vitest';

import { categorySection, composePrompt } from './compose';
import { designPromptTemplateCatalogInputSchema } from './schema';
const context = {
  selected: ['light/night'],
  workflowKey: 'text-to-image',
  editing: false,
  maxLength: 5000,
};
const catalog = () =>
  designPromptTemplateCatalogInputSchema.parse({
    categories: [
      {
        id: 'light',
        name: '灯光',
        section: 'lighting',
        options: [
          {
            id: 'night',
            label: '夜间',
            target: '客室内部',
            value: '{target}采用夜间照明',
            editValue: '仅将{target}改为夜间照明，保留结构',
            conflicts: ['outside/day'],
          },
        ],
      },
      {
        id: 'subject',
        name: '主体',
        section: 'subject',
        options: [{ id: 'cabin', label: '客室', value: '轨道客室' }],
      },
      {
        id: 'outside',
        name: '窗外',
        section: 'lighting',
        options: [
          { id: 'night', label: '窗外夜景', value: '窗外为夜间' },
          { id: 'day', label: '窗外日景', value: '窗外为白天' },
        ],
      },
      {
        id: 'preset',
        name: '预设',
        section: 'preset',
        options: [
          {
            id: 'night',
            label: '夜间客室',
            value: '组合',
            includes: ['light/night', 'outside/night'],
          },
        ],
      },
    ],
  });
describe('deterministic prompt expansion', () => {
  it('orders semantic sections independently from display order and expands targets', () => {
    const result = composePrompt(catalog(), {
      ...context,
      selected: ['light/night', 'subject/cabin'],
    });
    expect(result.errors).toEqual([]);
    expect(result.text).toBe(
      '设计主体：轨道客室。\n光照与环境：客室内部采用夜间照明。',
    );
    expect(
      composePrompt(catalog(), {
        ...context,
        selected: ['subject/cabin', 'light/night'],
      }).text,
    ).toBe(result.text);
  });
  it('uses edit instructions and expands referenced presets once', () => {
    const result = composePrompt(catalog(), {
      ...context,
      editing: true,
      selected: ['preset/night', 'light/night'],
    });
    expect(result.errors).toEqual([]);
    expect(result.text).toContain('保留结构');
    expect(result.text.match(/保留结构/g)).toHaveLength(1);
    expect(result.text).not.toContain('组合');
  });
  it('blocks conflicts and single-choice violations', () => {
    expect(
      composePrompt(catalog(), {
        ...context,
        selected: ['preset/night', 'outside/day'],
      }).errors.join(','),
    ).toMatch(/冲突/);
    expect(
      composePrompt(catalog(), {
        ...context,
        selected: ['outside/night', 'outside/day'],
      }).errors.join(','),
    ).toMatch(/只能选择一项/);
  });
  it('blocks missing requirements, disabled and incompatible workflows', () => {
    const data = catalog();
    const option = first(first(data.categories).options);
    option.requires = ['subject/cabin'];
    option.enabled = false;
    option.workflows = ['inpaint'];
    const result = composePrompt(data, context);
    expect(result.errors.join(',')).toMatch(/不适用/);
    expect(result.errors.join(',')).toMatch(/需要同时选择/);
  });
  it('blocks oversized text rather than truncating it', () => {
    const result = composePrompt(catalog(), { ...context, maxLength: 3 });
    expect(result.text.length).toBeGreaterThan(3);
    expect(result.errors.join(',')).toContain('超过');
  });
  it('returns legacy dimensions for atomic application without writing them into the prompt', () => {
    const data = catalog();
    data.categories.push(
      ...designPromptTemplateCatalogInputSchema.parse({
        categories: [
          {
            id: 'image-size',
            name: '尺寸',
            options: [
              { id: 'square', label: '方形', value: '方形构图，1024×1024' },
            ],
          },
        ],
      }).categories,
    );
    const input = {
      ...context,
      selected: ['light/night', 'image-size/square'],
      width: 2048,
      height: 1080,
    };
    expect(composePrompt(data, input).errors).toEqual([]);
    expect(composePrompt(data, input).size).toMatchObject({
      width: 1024,
      height: 1024,
    });
    const valid = composePrompt(data, { ...input, width: 1024, height: 1024 });
    expect(valid.errors).toEqual([]);
    expect(valid.text).not.toContain('1024');
  });
  it('rejects stale selections', () =>
    expect(
      composePrompt(catalog(), {
        ...context,
        selected: ['missing/nope'],
      }).errors.join(','),
    ).toContain('不存在'));
  it('rejects dangling references, cycles, and unknown placeholders at save time', () => {
    const data = catalog();
    first(first(data.categories).options).includes = ['preset/night'];
    expect(designPromptTemplateCatalogInputSchema.safeParse(data).success).toBe(
      false,
    );
    first(first(data.categories).options).includes = ['missing/nope'];
    expect(designPromptTemplateCatalogInputSchema.safeParse(data).success).toBe(
      false,
    );
    first(first(data.categories).options).includes = [];
    first(first(data.categories).options).value = '{secret}';
    expect(designPromptTemplateCatalogInputSchema.safeParse(data).success).toBe(
      false,
    );
  });
});

it('does not interpret integration identifiers as ratio categories', () => {
  const { categories } = designPromptTemplateCatalogInputSchema.parse({
    categories: [
      {
        id: 'integration-color',
        name: '颜色',
        options: [{ id: 'red', label: '红色', value: '红色' }],
      },
    ],
  });
  expect(categorySection(first(categories))).toBe('appearance');
});

function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('Missing test fixture');
  return item;
}

it('supports ratio-only templates and size-only application', () => {
  const data = designPromptTemplateCatalogInputSchema.parse({
    categories: [
      {
        id: 'image-size',
        name: '比例',
        options: [
          {
            id: 'wide',
            label: '横向',
            value: '1024×1024',
            aspectRatio: '16:9',
          },
        ],
      },
    ],
  });
  const result = composePrompt(data, {
    ...context,
    selected: ['image-size/wide'],
  });
  expect(result.size).toMatchObject({ aspectRatio: '16:9' });
  expect(result.size?.width).toBeUndefined();
  expect(result.errors).toEqual([]);
  expect(result.text).toBe('');
});
