import { getConfig } from '../utils/config';
import { closeDatabase, useDatabase } from '../utils/database';
import { hashPassword } from '../utils/password';

async function seed() {
  const sql = useDatabase();
  const config = getConfig();
  const accounts = [
    {
      department: '平台运营',
      email: config.bootstrapAdminEmail,
      name: config.bootstrapAdminName,
      password: config.bootstrapAdminPassword,
      roleCode: 'admin',
      username: config.bootstrapAdminUsername,
    },
    {
      department: '设计部门',
      email: config.bootstrapUser1Email,
      name: config.bootstrapUser1Name,
      password: config.bootstrapUser1Password,
      roleCode: 'user',
      username: config.bootstrapUser1Username,
    },
    {
      department: '设计部门',
      email: config.bootstrapUser2Email,
      name: config.bootstrapUser2Name,
      password: config.bootstrapUser2Password,
      roleCode: 'user',
      username: config.bootstrapUser2Username,
    },
  ] as const;

  for (const account of accounts) {
    const passwordHash = await hashPassword(account.password);
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (username, password_hash, real_name, department, email)
      VALUES (
        ${account.username},
        ${passwordHash},
        ${account.name},
        ${account.department},
        ${account.email.toLowerCase()}
      )
      ON CONFLICT (lower(username)) DO UPDATE SET
        real_name = EXCLUDED.real_name,
        email = COALESCE(users.email, EXCLUDED.email),
        updated_at = now()
      RETURNING id
    `;

    if (!user) throw new Error(`初始化账号失败：${account.username}`);

    await sql`
      INSERT INTO user_roles (user_id, role_id)
      SELECT ${user.id}, id FROM roles WHERE code = ${account.roleCode}
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO user_preferences (user_id)
      VALUES (${user.id})
      ON CONFLICT (user_id) DO NOTHING
    `;
  }

  console.warn(
    `平台账号已就绪：${accounts.map((account) => account.username).join('、')}`,
  );
}

try {
  await seed();
} finally {
  await closeDatabase();
}
