import { workflowParameterSchema } from './workflows/schema';

export const DEFAULT_DESIGN_CONVERSATION_TITLE = '新设计会话';
export const DESIGN_CONVERSATION_TITLE_LENGTH = 20;

export function deriveDesignConversationTitle(
  parameters: Record<string, unknown>,
  parameterSchema: unknown,
) {
  const parsed = workflowParameterSchema.array().safeParse(parameterSchema);
  if (!parsed.success) return undefined;
  const fields = parsed.data
    .filter((field) => ['text', 'textarea'].includes(field.type))
    .toSorted((left, right) => {
      const score = (field: (typeof parsed.data)[number]) => {
        if (field.key === 'prompt') return 0;
        if (field.type === 'textarea') return 1;
        if (field.required) return 2;
        return 3;
      };
      return score(left) - score(right);
    });
  const source = fields
    .map((field) => parameters[field.key])
    .find((value) => typeof value === 'string' && value.trim());
  if (typeof source !== 'string') return undefined;
  const normalized = source.replaceAll(/\s+/g, ' ').trim();
  const characters = [...normalized];
  if (characters.length <= DESIGN_CONVERSATION_TITLE_LENGTH) return normalized;
  return `${characters.slice(0, DESIGN_CONVERSATION_TITLE_LENGTH - 1).join('')}…`;
}
