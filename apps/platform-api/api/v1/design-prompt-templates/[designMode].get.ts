import { getRouterParam } from 'h3';
import { useDatabase } from '~/utils/database';
import {
  designPromptTemplateCatalogInputSchema,
  designPromptTemplateModeSchema,
} from '~/utils/domain/design-prompt-templates/schema';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  await requireIdentity(event);
  const parsedMode = designPromptTemplateModeSchema.safeParse(
    getRouterParam(event, 'designMode'),
  );
  if (!parsedMode.success) {
    throw new ApiError(
      400,
      'DESIGN_PROMPT_TEMPLATE_MODE_INVALID',
      '提示词模板业务模式无效',
    );
  }

  const sql = useDatabase();
  const [catalog] = await sql<
    { categories: unknown; updatedAt: Date; updatedBy: null | string }[]
  >`
    SELECT
      categories,
      updated_by AS "updatedBy",
      updated_at AS "updatedAt"
    FROM design_prompt_template_catalogs
    WHERE design_mode = ${parsedMode.data}
  `;
  if (!catalog) {
    return {
      categories: [],
      designMode: parsedMode.data,
      updatedAt: null,
      updatedBy: null,
    };
  }

  const categories = designPromptTemplateCatalogInputSchema.parse({
    categories: catalog.categories,
  }).categories;
  return {
    categories,
    designMode: parsedMode.data,
    updatedAt: catalog.updatedAt.toISOString(),
    updatedBy: catalog.updatedBy,
  };
});
