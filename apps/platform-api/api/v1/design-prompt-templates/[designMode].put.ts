import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
  countDesignPromptTemplateOptions,
  designPromptTemplateCatalogInputSchema,
  designPromptTemplateModeSchema,
} from '~/utils/domain/design-prompt-templates/schema';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:application:write');
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
  const input = await parseBody(event, designPromptTemplateCatalogInputSchema);
  const sql = useDatabase();
  const [catalog] = await sql<
    { categories: unknown; updatedAt: Date; updatedBy: string }[]
  >`
    INSERT INTO design_prompt_template_catalogs (
      design_mode, categories, updated_by
    ) VALUES (
      ${parsedMode.data},
      ${sql.json(input.categories)},
      ${identity.id}
    )
    ON CONFLICT (design_mode) DO UPDATE
    SET
      categories = EXCLUDED.categories,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING
      categories,
      updated_by AS "updatedBy",
      updated_at AS "updatedAt"
  `;
  if (!catalog) throw new Error('提示词模板目录保存失败');

  await writeAudit(event, {
    action: 'design_prompt_template.update',
    actor: identity,
    details: {
      categoryCount: input.categories.length,
      designMode: parsedMode.data,
      optionCount: countDesignPromptTemplateOptions(input),
    },
    module: 'application',
    targetId: parsedMode.data,
    targetType: 'design_prompt_template_catalog',
  });

  return {
    categories: designPromptTemplateCatalogInputSchema.parse({
      categories: catalog.categories,
    }).categories,
    designMode: parsedMode.data,
    updatedAt: catalog.updatedAt.toISOString(),
    updatedBy: catalog.updatedBy,
  };
});
