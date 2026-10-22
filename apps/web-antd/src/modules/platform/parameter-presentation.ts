import type { CapabilityField } from './types';

export function configurableQuickFields(fields: CapabilityField[]) {
  const prompt = fields.find(
    (field) =>
      field.key === 'prompt' ||
      field.type === 'textarea' ||
      (field.type === 'text' && field.required),
  );
  return fields.filter(
    (field) =>
      field.key !== prompt?.key &&
      ['boolean', 'json', 'number', 'select', 'text', 'textarea'].includes(
        field.type,
      ),
  );
}

// 输入标识决定行为，管理员修改展示名称不能改变捕获频率。
export function captureRefreshRateValue(
  fields: CapabilityField[],
  values: Record<string, unknown>,
) {
  const field = fields.find((item) => item.key.includes('_refresh_rate_'));
  const value = field ? (values[field.key] ?? field.defaultValue) : undefined;
  return typeof value === 'number' ? value : 500;
}
