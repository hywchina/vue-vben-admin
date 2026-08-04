import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { hashPassword } from '~/utils/password';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const registerSchema = z.object({
  department: z.string().trim().max(100).optional().default(''),
  email: z.string().trim().email('请输入有效的企业邮箱').max(254),
  password: z
    .string()
    .min(8, '密码至少需要 8 个字符')
    .max(128)
    .regex(/[A-Za-z]/, '密码必须包含字母')
    .regex(/\d/, '密码必须包含数字')
    .regex(/[^\dA-Za-z]/, '密码必须包含符号'),
  realName: z.string().trim().min(1).max(100).optional(),
  username: z
    .string()
    .trim()
    .min(3, '用户名至少需要 3 个字符')
    .max(32)
    .regex(/^[\w.-]+$/, '用户名只能包含字母、数字、点、横线和下划线'),
});

export default apiHandler(async (event) => {
  if (!getConfig().allowSelfRegistration) {
    throw new ApiError(403, 'REGISTRATION_DISABLED', '系统未开放自助注册');
  }

  const input = await parseBody(event, registerSchema);
  const sql = useDatabase();
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await sql.begin(async (transaction) => {
      const [created] = await transaction<{ id: string }[]>`
        INSERT INTO users (
          username, password_hash, real_name, department, email
        ) VALUES (
          ${input.username},
          ${passwordHash},
          ${input.realName ?? input.username},
          ${input.department},
          ${input.email.toLowerCase()}
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
    if (
      (error as { constraint_name?: string }).constraint_name ===
      'users_email_lower_uidx'
    ) {
      throw new ApiError(409, 'EMAIL_EXISTS', '该企业邮箱已被使用');
    }
    if ((error as { code?: string }).code === '23505') {
      throw new ApiError(409, 'USERNAME_EXISTS', '用户名已存在');
    }
    throw error;
  }
});
