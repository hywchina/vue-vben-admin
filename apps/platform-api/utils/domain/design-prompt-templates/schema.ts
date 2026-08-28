import { z } from 'zod';

export const designPromptTemplateModeSchema = z.enum([
  'cabin',
  'cmf',
  'component',
]);

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, '标识只能包含小写字母、数字和连字符');

export const designPromptTemplateOptionSchema = z.object({
  id: identifierSchema,
  label: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(240),
});

export const designPromptTemplateCategorySchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(40),
  options: z.array(designPromptTemplateOptionSchema).min(1).max(60),
});

export const designPromptTemplateCatalogInputSchema = z
  .object({
    categories: z.array(designPromptTemplateCategorySchema).min(1).max(20),
  })
  .superRefine((catalog, context) => {
    const categoryIds = new Set<string>();
    const categoryNames = new Set<string>();
    for (const [categoryIndex, category] of catalog.categories.entries()) {
      if (categoryIds.has(category.id)) {
        context.addIssue({
          code: 'custom',
          message: '分类标识不能重复',
          path: ['categories', categoryIndex, 'id'],
        });
      }
      if (categoryNames.has(category.name)) {
        context.addIssue({
          code: 'custom',
          message: '分类名称不能重复',
          path: ['categories', categoryIndex, 'name'],
        });
      }
      categoryIds.add(category.id);
      categoryNames.add(category.name);

      const optionIds = new Set<string>();
      for (const [optionIndex, option] of category.options.entries()) {
        if (optionIds.has(option.id)) {
          context.addIssue({
            code: 'custom',
            message: '同一分类中的选项标识不能重复',
            path: ['categories', categoryIndex, 'options', optionIndex, 'id'],
          });
        }
        optionIds.add(option.id);
      }
    }
  });

export type DesignPromptTemplateCatalogInput = z.infer<
  typeof designPromptTemplateCatalogInputSchema
>;
export type DesignPromptTemplateMode = z.infer<
  typeof designPromptTemplateModeSchema
>;

export function countDesignPromptTemplateOptions(
  catalog: DesignPromptTemplateCatalogInput,
) {
  return catalog.categories.reduce(
    (total, category) => total + category.options.length,
    0,
  );
}
