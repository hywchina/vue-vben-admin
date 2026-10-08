import { writeAudit } from '~/utils/audit';
import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { registerAccountSchema } from '~/utils/identity/account-input';
import { hashPassword } from '~/utils/password';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

export default apiHandler(async (event) => {
  if (!getConfig().allowSelfRegistration) {
    throw new ApiError(403, 'REGISTRATION_DISABLED', '系统未开放自助注册');
  }

  const input = await parseBody(event, registerAccountSchema);
  const sql = useDatabase();
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await sql.begin(async (transaction) => {
      const [created] = await transaction<{ id: string }[]>`
        INSERT INTO users (
          username, password_hash, real_name, department
        ) VALUES (
          ${input.username},
          ${passwordHash},
          ${input.realName ?? input.username},
          ${input.department}
        )
        RETURNING id
      `;
      if (!created) throw new Error('创建用户失败');

      await transaction`
        INSERT INTO user_roles (user_id, role_id)
        SELECT ${created.id}, id FROM roles WHERE code = 'user'
      `;
      await transaction`
        INSERT INTO user_preferences (user_id) VALUES (${created.id})
      `;
      return created;
    });

    await writeAudit(event, {
      action: 'auth.register',
      details: { username: input.username },
      module: 'identity',
      targetId: user.id,
      targetType: 'user',
    });
    return { id: user.id, username: input.username };
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new ApiError(409, 'USERNAME_EXISTS', '用户名已存在');
    }
    throw error;
  }
});
