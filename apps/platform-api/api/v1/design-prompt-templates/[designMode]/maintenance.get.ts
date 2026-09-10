import { getRouterParam } from 'h3';
import { useDatabase } from '~/utils/database';
import { designPromptTemplateModeSchema } from '~/utils/domain/design-prompt-templates/schema';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:application:write');
  const parsedMode = designPromptTemplateModeSchema.safeParse(
    getRouterParam(event, 'designMode'),
  );
  if (!parsedMode.success)
    throw new ApiError(400, 'VALIDATION_ERROR', '无效的模板类型');
  const mode = parsedMode.data;
  const sql = useDatabase();
  const [defaults] =
    await sql`SELECT version, categories FROM design_prompt_template_defaults WHERE design_mode = ${mode}`;
  const versions =
    await sql`SELECT revision, categories, updated_at AS "updatedAt", reason
    FROM design_prompt_template_versions WHERE design_mode = ${mode} ORDER BY revision DESC LIMIT 50`;
  return { defaults, versions };
});
