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
  value: z.string().trim().min(1).max(2000),
  description: z.string().trim().max(300).default(''),
  target: z.string().trim().max(120).default(''),
  editValue: z.string().trim().max(2000).default(''),
  enabled: z.boolean().default(true),
  workflows: z.array(identifierSchema).max(100).default([]),
  requires: z.array(z.string().max(130)).max(20).default([]),
  conflicts: z.array(z.string().max(130)).max(20).default([]),
  includes: z.array(z.string().max(130)).max(20).default([]),
  aspectRatio: z
    .string()
    .regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/, '比例格式应为宽:高，如16:9')
    .optional(),
  width: z.number().int().positive().max(16_384).optional(),
  height: z.number().int().positive().max(16_384).optional(),
});

export const designPromptTemplateCategorySchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(40),
  section: z
    .enum([
      'subject',
      'scene',
      'camera',
      'appearance',
      'style',
      'lighting',
      'constraints',
      'parameters',
      'preset',
    ])
    .optional(),
  selection: z.enum(['single', 'multiple']).default('single'),
  options: z.array(designPromptTemplateOptionSchema).min(1).max(60),
});

export const designPromptTemplateCatalogInputSchema = z
  .object({
    categories: z.array(designPromptTemplateCategorySchema).min(1).max(20),
  })
  .superRefine((catalog, context) => {
    const references = new Set(
      catalog.categories.flatMap((category) =>
        category.options.map((option) => `${category.id}/${option.id}`),
      ),
    );
    const graph = new Map<string, string[]>();
    for (const category of catalog.categories) {
      for (const option of category.options) {
        const reference = `${category.id}/${option.id}`;
        graph.set(reference, option.includes);
        for (const key of ['includes', 'requires', 'conflicts'] as const) {
          if (
            new Set(option[key]).size !== option[key].length ||
            option[key].some(
              (item) => !references.has(item) || item === reference,
            )
          ) {
            context.addIssue({
              code: 'custom',
              message: `${option.label}的${key}引用不存在、自引用或重复`,
            });
          }
        }
        if ((option.width === undefined) !== (option.height === undefined))
          context.addIssue({
            code: 'custom',
            message: '尺寸必须同时设置宽度和高度',
          });
        if (option.aspectRatio && option.width && option.height) {
          const [rw, rh] = option.aspectRatio.split(':').map(Number);
          if (!rw || !rh || option.width * rh !== option.height * rw)
            context.addIssue({
              code: 'custom',
              message: '模板比例与宽高不一致',
            });
        }
        if (/\{(?!target\})[^}]*\}/.test(option.value + option.editValue))
          context.addIssue({
            code: 'custom',
            message: '仅支持 {target} 作用对象变量',
          });
        if (
          (option.value + option.editValue).includes('{target}') &&
          !option.target
        )
          context.addIssue({
            code: 'custom',
            message: '使用 {target} 时必须填写作用对象',
          });
      }
    }
    const visited = new Set<string>();
    const visiting = new Set<string>();
    function visit(id: string): boolean {
      if (visiting.has(id)) return false;
      if (visited.has(id)) return true;
      visiting.add(id);
      if ((graph.get(id) ?? []).some((child) => !visit(child))) return false;
      visiting.delete(id);
      visited.add(id);
      return true;
    }
    if ([...graph.keys()].some((id) => !visit(id)))
      context.addIssue({ code: 'custom', message: '组合预设存在循环引用' });
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
