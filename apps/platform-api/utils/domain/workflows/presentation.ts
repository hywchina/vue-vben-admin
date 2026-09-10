import { ApiError } from '../../response';
import { publicParameterSchema } from './schema';

export function presentationFields(parameterSchema: unknown) {
  const fields = publicParameterSchema(parameterSchema);
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

export function resolveQuickFieldKeys(
  parameterSchema: unknown,
  configured?: null | string[],
) {
  const fields = presentationFields(parameterSchema);
  return configured === undefined || configured === null
    ? fields
        .filter(
          (field) =>
            !field.advanced &&
            field.uiControl === 'default' &&
            ['boolean', 'number', 'select', 'text'].includes(field.type),
        )
        .map((field) => field.key)
    : configured.filter((key) => fields.some((field) => field.key === key));
}

export function assertQuickFieldKeys(parameterSchema: unknown, keys: string[]) {
  const allowed = new Set(
    presentationFields(parameterSchema).map((field) => field.key),
  );
  if (
    new Set(keys).size !== keys.length ||
    keys.some((key) => !allowed.has(key))
  ) {
    throw new ApiError(
      400,
      'CAPABILITY_PRESENTATION_INVALID',
      '外显参数重复或不属于当前工作流的可配置参数',
    );
  }
}
