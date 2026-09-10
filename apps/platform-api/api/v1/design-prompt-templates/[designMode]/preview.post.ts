import { getRouterParam } from 'h3';
import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import { composePrompt } from '~/utils/domain/design-prompt-templates/compose';
import {
  designPromptTemplateCatalogInputSchema,
  designPromptTemplateModeSchema,
} from '~/utils/domain/design-prompt-templates/schema';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';
export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const parsedMode = designPromptTemplateModeSchema.safeParse(
    getRouterParam(event, 'designMode'),
  );
  if (!parsedMode.success)
    throw new ApiError(400, 'VALIDATION_ERROR', '无效的模板类型');
  const mode = parsedMode.data;
  const input = await parseBody(
    event,
    z.object({
      selected: z.array(z.string().max(130)).max(120),
      workflowKey: z.string().max(100),
      editing: z.boolean().default(false),
      maxLength: z.number().int().min(1).max(100_000).default(10_000),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      categories: z.unknown().optional(),
    }),
  );
  const sql = useDatabase();
  if (input.categories !== undefined)
    requirePermission(identity, 'platform:application:write');
  const [current] =
    await sql`SELECT categories, revision FROM design_prompt_template_catalogs WHERE design_mode = ${mode}`;
  if (!current)
    throw new ApiError(404, 'PROMPT_TEMPLATE_NOT_FOUND', '模板目录不存在');
  const catalog = designPromptTemplateCatalogInputSchema.safeParse({
    categories: input.categories ?? current.categories,
  });
  if (!catalog.success)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      catalog.error.issues.map((issue) => issue.message).join('；'),
    );
  return { ...composePrompt(catalog.data, input), revision: current.revision };
});
