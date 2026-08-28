import { describe, expect, it } from 'vitest';

import {
  countDesignPromptTemplateOptions,
  designPromptTemplateCatalogInputSchema,
} from './schema';

describe('design prompt template catalog schema', () => {
  it('accepts an ordered maintainable catalog', () => {
    const catalog = designPromptTemplateCatalogInputSchema.parse({
      categories: [
        {
          id: 'color',
          name: '颜色',
          options: [
            { id: 'red', label: '红色', value: '红色' },
            { id: 'blue', label: '蓝色', value: '蓝色' },
          ],
        },
      ],
    });

    expect(countDesignPromptTemplateOptions(catalog)).toBe(2);
  });

  it('rejects duplicate category and option identifiers', () => {
    const result = designPromptTemplateCatalogInputSchema.safeParse({
      categories: [
        {
          id: 'color',
          name: '颜色',
          options: [
            { id: 'red', label: '红色', value: '红色' },
            { id: 'red', label: '深红', value: '深红色' },
          ],
        },
        {
          id: 'color',
          name: '颜色',
          options: [{ id: 'blue', label: '蓝色', value: '蓝色' }],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
