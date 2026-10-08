import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { updateProfileSchema } from '~/utils/identity/account-input';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const input = await parseBody(event, updateProfileSchema);
  const sql = useDatabase();
  const [updated] = await sql<
    {
      department: string;
      introduction: string;
      realName: string;
    }[]
  >`
      UPDATE users SET
        real_name = ${input.realName},
        department = ${input.department},
        introduction = ${input.introduction},
        updated_at = now()
      WHERE id = ${identity.id} AND status = 'enabled'
      RETURNING
        real_name AS "realName",
        department,
        introduction
    `;

  if (!updated) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');
  await writeAudit(event, {
    action: 'user.profile.update',
    actor: identity,
    details: {
      department: updated.department,
      realName: updated.realName,
    },
    module: 'identity',
    targetId: identity.id,
    targetType: 'user',
  });
  return updated;
});
