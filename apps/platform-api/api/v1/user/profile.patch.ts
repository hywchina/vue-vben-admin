import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  department: z.string().trim().max(100, '部门名称不能超过 100 个字符'),
  email: z.string().trim().email('请输入有效的企业邮箱').max(254),
  introduction: z.string().trim().max(500, '个人简介不能超过 500 个字符'),
  realName: z
    .string()
    .trim()
    .min(1, '姓名不能为空')
    .max(100, '姓名不能超过 100 个字符'),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const input = await parseBody(event, schema);
  const sql = useDatabase();
  let updated:
    | undefined
    | {
        department: string;
        email: string;
        introduction: string;
        realName: string;
      };
  try {
    [updated] = await sql<
      {
        department: string;
        email: string;
        introduction: string;
        realName: string;
      }[]
    >`
      UPDATE users SET
        real_name = ${input.realName},
        department = ${input.department},
        email = ${input.email.toLowerCase()},
        introduction = ${input.introduction},
        updated_at = now()
      WHERE id = ${identity.id} AND status = 'enabled'
      RETURNING
        real_name AS "realName",
        department,
        email,
        introduction
    `;
  } catch (error) {
    if (
      (error as { constraint_name?: string }).constraint_name ===
      'users_email_lower_uidx'
    ) {
      throw new ApiError(409, 'EMAIL_EXISTS', '该企业邮箱已被其他账号使用');
    }
    throw error;
  }

  if (!updated) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');
  await writeAudit(event, {
    action: 'user.profile.update',
    actor: identity,
    details: {
      department: updated.department,
      email: updated.email,
      realName: updated.realName,
    },
    module: 'identity',
    targetId: identity.id,
    targetType: 'user',
  });
  return updated;
});
