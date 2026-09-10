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
