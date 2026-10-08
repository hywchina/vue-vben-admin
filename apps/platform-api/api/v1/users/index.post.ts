import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { createAccountSchema } from '~/utils/identity/account-input';
import { createNotification } from '~/utils/notifications';
import { hashPassword } from '~/utils/password';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:user:write');
  requirePermission(identity, 'platform:role:write');
  const input = await parseBody(event, createAccountSchema);
  const passwordHash = await hashPassword(input.password);
  const sql = useDatabase();

  try {
    const created = await sql.begin(async (transaction) => {
      const [user] = await transaction<
        {
          department: string;
          email: string;
          id: string;
          name: string;
          publicId: string;
          username: string;
        }[]
      >`
        INSERT INTO users (
          username, password_hash, real_name, department
        ) VALUES (
          ${input.username}, ${passwordHash}, ${input.realName},
          ${input.department}
        )
        RETURNING
          id, public_id AS "publicId", username, real_name AS name,
          department, COALESCE(email, '') AS email
      `;
      if (!user) throw new Error('创建用户失败');
      await transaction`
        INSERT INTO user_roles (user_id, role_id)
        SELECT ${user.id}, id FROM roles WHERE code = ${input.role}
      `;
      await transaction`
        INSERT INTO user_preferences (user_id) VALUES (${user.id})
      `;
      return user;
    });

    await createNotification({
      message: `管理员 ${identity.realName} 已为你创建平台账号。`,
      preference: 'systemMessage',
      title: '平台账号已创建',
      type: 'account',
      userId: created.id,
    }).catch((error) => console.warn('创建账号通知失败', error));
    await writeAudit(event, {
      action: 'user.create',
      actor: identity,
      details: {
        publicId: created.publicId,
        role: input.role,
        username: created.username,
      },
      module: 'identity',
      targetId: created.id,
      targetType: 'user',
    });
    return {
      ...created,
      lastActive: new Date().toISOString(),
      projectCount: 0,
      roleCodes: [input.role],
      roles: [input.role === 'admin' ? '管理员' : '普通用户'],
      status: 'enabled' as const,
    };
  } catch (error) {
    const constraint = (error as { constraint_name?: string }).constraint_name;
    if (constraint === 'users_username_lower_uidx') {
      throw new ApiError(409, 'USERNAME_EXISTS', '用户名已存在');
    }
    throw error;
  }
});
