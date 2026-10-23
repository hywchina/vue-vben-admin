import { z } from 'zod';

import { ApiError } from '../../response';
import {
  parseApiWorkflow,
  publicParameterSchema,
  workflowParameterSchema,
} from './schema';
import { translatedInputLabel } from './ui-parameters';

export const capabilityPresentationInputSchema = z.object({
  fieldLabels: z
    .record(z.string().min(1).max(100), z.string().trim().max(100))
    .refine(
      (labels) => Object.keys(labels).length <= 200,
      '参数名称不能超过 200 项',
    )
    .optional(),
  quickFieldKeys: z.array(z.string().min(1).max(200)).max(200),
  workflowVersionId: z.string().uuid(),
});

export function normalizeFieldLabels(
  parameterSchema: unknown,
  labels: Record<string, string>,
) {
  const allowed = new Set(
    presentationFields(parameterSchema).map((field) => field.key),
  );
  if (Object.keys(labels).some((key) => !allowed.has(key))) {
    throw new ApiError(
      400,
      'CAPABILITY_PRESENTATION_INVALID',
      '参数名称不属于当前工作流的可配置参数',
    );
  }
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([, label]) => label.trim())
      .map(([key, label]) => [key, label.trim()]),
  );
}

export function capabilityPresentationFields(
  parameterSchema: unknown,
  apiJson: unknown,
  labels: Record<string, string> = {},
  includeSources = false,
) {
  const definitions = z.array(workflowParameterSchema).parse(parameterSchema);
  const workflow = includeSources ? parseApiWorkflow(apiJson) : undefined;
  const configurable = new Set(
    presentationFields(parameterSchema).map((field) => field.key),
  );
  return publicParameterSchema(parameterSchema).map((field, index) => {
    const definition = definitions[index];
    const defaultLabel =
      (field.key.startsWith('auto_') && definition?.inputName
        ? translatedInputLabel(definition.inputName)
        : undefined) ?? field.label;
    const customLabel =
      configurable.has(field.key) && Object.hasOwn(labels, field.key)
        ? labels[field.key]?.trim()
        : undefined;
    const node = definition?.nodeId ? workflow?.[definition.nodeId] : undefined;
    return {
      ...field,
      defaultLabel,
      label: customLabel || defaultLabel,
      ...(['proportional_height', 'proportional_width'].includes(
        definition?.inputName ?? '',
      )
        ? {
            help: [
              field.help,
              '自定义宽高比的比例数值，例如 16:9；仅在宽高比设为 custom（自定义）时生效，1 不表示 1 像素。',
            ]
              .filter(Boolean)
              .join(' '),
          }
        : {}),
      ...(includeSources && definition?.nodeId && definition.inputName
        ? {
            source: {
              inputName: definition.inputName,
              nodeId: definition.nodeId,
              nodeTitle:
                node?._meta?.title ?? node?.class_type ?? definition.nodeId,
            },
          }
        : {}),
    };
  });
}

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
