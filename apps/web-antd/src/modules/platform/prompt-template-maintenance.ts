import type { DesignPromptTemplateCategory } from './types';

export function cloneTemplateCategories(
  categories: DesignPromptTemplateCategory[],
) {
  return JSON.parse(
    JSON.stringify(categories),
  ) as DesignPromptTemplateCategory[];
}
/** Restore builtin items while retaining custom categories/options unless a full reset was requested. */
export function restoreTemplateDefaults(
  current: DesignPromptTemplateCategory[],
  defaults: DesignPromptTemplateCategory[],
  scope: { categoryId?: string; full?: boolean; optionId?: string } = {},
) {
  const original = cloneTemplateCategories(current);
  const builtin = cloneTemplateCategories(defaults);
  if (scope.full) return builtin;
  if (scope.optionId) {
    const category = original.find((item) => item.id === scope.categoryId);
    const option = builtin
      .find((item) => item.id === scope.categoryId)
      ?.options.find((item) => item.id === scope.optionId);
    if (category && option) {
      const index = category.options.findIndex((item) => item.id === option.id);
      if (index === -1) category.options.push(option);
      else category.options[index] = option;
    }
    return original;
  }
  const merged = (defaultCategory: DesignPromptTemplateCategory) => ({
    ...defaultCategory,
    options: [
      ...defaultCategory.options,
      ...(original
        .find((item) => item.id === defaultCategory.id)
        ?.options.filter(
          (item) =>
            !defaultCategory.options.some((option) => option.id === item.id),
        ) ?? []),
    ],
  });
  if (scope.categoryId) {
    const category = builtin.find((item) => item.id === scope.categoryId);
    if (!category) return original;
    const index = original.findIndex((item) => item.id === category.id);
    if (index === -1) original.push(merged(category));
    else original[index] = merged(category);
    return original;
  }
  return [
    ...builtin.map((category) => merged(category)),
    ...original.filter(
      (item) => !builtin.some((category) => category.id === item.id),
    ),
  ];
}
export function templateChangeSummary(
  before: DesignPromptTemplateCategory[],
  after: DesignPromptTemplateCategory[],
) {
  const flatten = (categories: DesignPromptTemplateCategory[]) =>
    new Map(
      categories.flatMap(
        (category) =>
          [
            [
              `${category.id}`,
              JSON.stringify({ ...category, options: undefined }),
            ],
            ...category.options.map((option) => [
              `${category.id}/${option.id}`,
              JSON.stringify(option),
            ]),
          ] as [string, string][],
      ),
    );
  const next = flatten(after);
  const previous = flatten(before);
  return {
    added: [...next.keys()].filter((key) => !previous.has(key)),
    removed: [...previous.keys()].filter((key) => !next.has(key)),
    changed: [...next.keys()].filter(
      (key) => previous.has(key) && previous.get(key) !== next.get(key),
    ),
  };
}
