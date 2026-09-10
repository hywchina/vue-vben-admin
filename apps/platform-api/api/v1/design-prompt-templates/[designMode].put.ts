import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
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
  if (!parsedMode.success)
    throw new ApiError(400, 'VALIDATION_ERROR', '无效的模板类型');
  const mode = parsedMode.data;
  const input = await parseBody(
    event,
    z.object({
      categories: z.unknown(),
      expectedRevision: z.number().int().positive(),
      reason: z
        .enum(['save', 'restore-defaults', 'restore-version'])
        .default('save'),
    }),
  );
  const parsedCatalog = designPromptTemplateCatalogInputSchema.safeParse(input);
  if (!parsedCatalog.success)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      parsedCatalog.error.issues.map((issue) => issue.message).join('；'),
    );
  const { categories } = parsedCatalog.data;
  const sql = useDatabase();
  const catalog = await sql.begin(async (tx) => {
    const [current] =
      await tx`SELECT revision FROM design_prompt_template_catalogs WHERE design_mode = ${mode} FOR UPDATE`;
    if (!current || current.revision !== input.expectedRevision)
      throw new ApiError(
        409,
        'PROMPT_TEMPLATE_CONFLICT',
        '模板已被其他管理员修改，请重新加载后合并修改',
      );
    const [saved] = await tx`
      UPDATE design_prompt_template_catalogs SET categories = ${tx.json(categories)}, revision = revision + 1,
      updated_by = ${identity.id}, updated_at = now() WHERE design_mode = ${mode}
      RETURNING categories, revision, updated_by AS "updatedBy", updated_at AS "updatedAt"`;
    if (!saved) throw new Error('模板保存失败');
    await tx`INSERT INTO design_prompt_template_versions (design_mode, revision, categories, updated_by, updated_at, reason)
      VALUES (${mode}, ${saved.revision}, ${tx.json(categories)}, ${identity.id}, ${saved.updatedAt}, ${input.reason})`;
    return saved;
  });
  await writeAudit(event, {
    action: 'design_prompt_template.update',
    actor: identity,
    details: {
      designMode: mode,
      categoryCount: categories.length,
      revision: catalog.revision,
      reason: input.reason,
    },
    module: 'application',
    targetId: mode,
    targetType: 'design_prompt_template_catalog',
  });
  return {
    ...catalog,
    designMode: mode,
    updatedAt: catalog.updatedAt.toISOString(),
  };
});
