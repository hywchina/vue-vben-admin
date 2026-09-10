import type { DesignPromptTemplateCatalogInput } from './schema';

type Category = DesignPromptTemplateCatalogInput['categories'][number];
const sections = [
  'subject',
  'scene',
  'camera',
  'appearance',
  'style',
  'lighting',
  'constraints',
  'parameters',
  'preset',
];
export function categorySection(category: Category) {
  if (category.section) return category.section;
  if (/(^|-)(size|ratio)(-|$)/.test(category.id)) return 'parameters';
  if (/type|subject/.test(category.id)) return 'subject';
  if (/camera|view|composition/.test(category.id)) return 'camera';
  if (/light|window|environment/.test(category.id)) return 'lighting';
  if (/style|form/.test(category.id)) return 'style';
  return 'appearance';
}
export function composePrompt(
  catalog: DesignPromptTemplateCatalogInput,
  input: {
    editing: boolean;
    height?: number;
    maxLength: number;
    selected: string[];
    width?: number;
    workflowKey: string;
  },
) {
  const errors: string[] = [];
  let size:
    | undefined
    | { aspectRatio?: string; height?: number; width?: number };
  const entries = catalog.categories.flatMap((category) =>
    category.options.map((option) => ({
      category,
      option,
      id: `${category.id}/${option.id}`,
    })),
  );
  const lookup = new Map(entries.map((entry) => [entry.id, entry]));
  const expanded = new Set<string>();
  function expand(id: string) {
    if (expanded.has(id)) return;
    expanded.add(id);
    const entry = lookup.get(id);
    if (!entry) {
      errors.push('所选模板已不存在，请重新选择');
      return;
    }
    entry.option.includes.forEach(expand);
  }
  input.selected.forEach(expand);
  const chosen = entries.filter((entry) => expanded.has(entry.id));
  for (const { category, option } of chosen) {
    if (
      !option.enabled ||
      (option.workflows.length > 0 &&
        !option.workflows.includes(input.workflowKey))
    )
      errors.push(`${option.label}不适用于当前工作流`);
    for (const reference of option.requires)
      if (!expanded.has(reference))
        errors.push(
          `${option.label}需要同时选择${lookup.get(reference)?.option.label ?? reference}`,
        );
    for (const reference of option.conflicts)
      if (expanded.has(reference))
        errors.push(
          `${option.label}与${lookup.get(reference)?.option.label ?? reference}冲突`,
        );
    const sameCategory = chosen.filter(
      (entry) => entry.category.id === category.id,
    );
    if (category.selection === 'single' && sameCategory.length > 1)
      errors.push(`${category.name}只能选择一项`);
    if (categorySection(category) === 'parameters') {
      const legacy = option.aspectRatio
        ? null
        : /([0-9]+)[×x]([0-9]+)/i.exec(option.value);
      const width = option.width ?? (legacy ? Number(legacy[1]) : undefined);
      const height = option.height ?? (legacy ? Number(legacy[2]) : undefined);
      const aspectRatio =
        option.aspectRatio ??
        /([1-9]\d*)\s*[:：]\s*([1-9]\d*)/
          .exec(option.value)
          ?.slice(1)
          .join(':');
      if ((!width || !height) && !aspectRatio)
        errors.push(`${option.label}尚未配置有效宽高或比例，请联系管理员`);
      else {
        const next = { width, height, aspectRatio };
        if (size && JSON.stringify(size) !== JSON.stringify(next))
          errors.push('所选模板包含互相冲突的尺寸，请只保留一个尺寸选项');
        size = next;
        if (width && height && aspectRatio) {
          const [rw, rh] = aspectRatio.split(':').map(Number);
          if (!rw || !rh || Math.abs(width * rh - height * rw) > 0.000001)
            errors.push('模板比例与宽高不一致，请调整模板');
        }
      }
    }
  }
  const ordered = [...chosen].toSorted(
    (a, b) =>
      sections.indexOf(categorySection(a.category)) -
      sections.indexOf(categorySection(b.category)),
  );
  const sentences = ordered
    .filter(
      ({ category, option }) =>
        categorySection(category) !== 'parameters' &&
        option.includes.length === 0,
    )
    .map(({ category, option }) => {
      const value = (
        input.editing && option.editValue ? option.editValue : option.value
      )
        .replaceAll('{target}', option.target)
        .replace(/[。；;\s]+$/u, '');
      const section = categorySection(category);
      // Named clauses give legacy short entries explicit semantic roles without inventing objects.
      const labels: Record<string, string> = {
        subject: '设计主体',
        scene: '场景要求',
        camera: '视角与构图',
        appearance: '外观要求',
        style: '风格要求',
        lighting: '光照与环境',
        constraints: '保留与限制',
      };
      return `${labels[section] ?? category.name}${option.target && !option.value.includes('{target}') ? `（${option.target}）` : ''}：${value}。`;
    });
  const text = [...new Set(sentences)].join('\n');
  if (!text && !size) errors.push('请至少选择一项内容或尺寸模板');
  if (text.length > input.maxLength)
    errors.push(
      `提示词共 ${text.length} 字，超过当前工作流 ${input.maxLength} 字限制，请减少选项或调整模板`,
    );
  return {
    size,
    text,
    errors: [...new Set(errors)],
    expanded: chosen.map(({ id, option }) => ({ id, label: option.label })),
    length: text.length,
  };
}
