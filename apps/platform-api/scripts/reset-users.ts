import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { getConfig } from '../utils/config';
import { closeDatabase, useDatabase } from '../utils/database';
import { hashPassword } from '../utils/password';

const confirmation = '--confirm=DELETE_ALL_USERS';
if (!process.argv.includes(confirmation)) {
  throw new Error(
    `该操作会删除全部账号。确认执行时必须追加参数：${confirmation}`,
  );
}

async function resetUsers() {
  const config = getConfig();
  const sql = useDatabase();
  const accounts = [
    {
      department: '平台运营',
      email: config.bootstrapAdminEmail.toLowerCase(),
      name: config.bootstrapAdminName,
      password: config.bootstrapAdminPassword,
      roleCode: 'admin',
      username: config.bootstrapAdminUsername,
    },
    {
      department: '设计部门',
      email: config.bootstrapUser1Email.toLowerCase(),
      name: config.bootstrapUser1Name,
      password: config.bootstrapUser1Password,
      roleCode: 'user',
      username: config.bootstrapUser1Username,
    },
    {
      department: '设计部门',
      email: config.bootstrapUser2Email.toLowerCase(),
      name: config.bootstrapUser2Name,
      password: config.bootstrapUser2Password,
      roleCode: 'user',
      username: config.bootstrapUser2Username,
    },
  ] as const;

  if (
    new Set(accounts.map((account) => account.username.toLowerCase())).size !==
      accounts.length ||
    new Set(accounts.map((account) => account.email)).size !== accounts.length
  ) {
    throw new Error('重建账号的用户名和邮箱必须互不重复。');
  }

  const preparedAccounts = await Promise.all(
    accounts.map(async (account) => ({
      ...account,
      passwordHash: await hashPassword(account.password),
      temporaryUsername: `__account_reset_${randomUUID()}`,
    })),
  );

  const summary = await sql.begin(async (transaction) => {
    await transaction`LOCK TABLE users IN ACCESS EXCLUSIVE MODE`;
    const oldUsers = await transaction<{ id: string }[]>`
      SELECT id FROM users ORDER BY created_at FOR UPDATE
    `;
    const oldUserIds = oldUsers.map((user) => user.id);
    const createdAccounts: Array<
      (typeof preparedAccounts)[number] & { id: string }
    > = [];

    for (const account of preparedAccounts) {
      const [created] = await transaction<{ id: string }[]>`
        INSERT INTO users (
          username, password_hash, real_name, department, email, status
        ) VALUES (
          ${account.temporaryUsername}, ${account.passwordHash},
          ${account.name}, ${account.department}, NULL, 'enabled'
        )
        RETURNING id
      `;
      if (!created) throw new Error(`无法创建账号：${account.username}`);
      createdAccounts.push({ ...account, id: created.id });
      await transaction`
        INSERT INTO user_roles (user_id, role_id)
        SELECT ${created.id}, id FROM roles WHERE code = ${account.roleCode}
      `;
      await transaction`
        INSERT INTO user_preferences (user_id) VALUES (${created.id})
      `;
    }

    const administrator = createdAccounts.find(
      (account) => account.roleCode === 'admin',
    );
    if (!administrator) throw new Error('重建账号中缺少管理员。');

    if (oldUserIds.length > 0) {
      await transaction`
        UPDATE projects SET owner_id = ${administrator.id}
        WHERE owner_id = ANY(${oldUserIds}::uuid[])
      `;
      await transaction`
        UPDATE assets SET owner_id = ${administrator.id}
        WHERE owner_id = ANY(${oldUserIds}::uuid[])
      `;
      await transaction`
        UPDATE asset_versions SET created_by = ${administrator.id}
        WHERE created_by = ANY(${oldUserIds}::uuid[])
      `;
      await transaction`
        UPDATE jobs SET created_by = ${administrator.id}
        WHERE created_by = ANY(${oldUserIds}::uuid[])
      `;
    }

    await transaction`
      INSERT INTO project_members (project_id, user_id, project_role)
      SELECT id, ${administrator.id}, 'owner' FROM projects
      ON CONFLICT (project_id, user_id) DO UPDATE
      SET project_role = 'owner'
    `;

    if (oldUserIds.length > 0) {
      await transaction`
        DELETE FROM users WHERE id = ANY(${oldUserIds}::uuid[])
      `;
    }

    for (const account of createdAccounts) {
      await transaction`
        UPDATE users SET
          username = ${account.username},
          email = ${account.email},
          updated_at = now()
        WHERE id = ${account.id}
      `;
    }

    await transaction`
      UPDATE user_preferences SET
        current_project_id = (
          SELECT id FROM projects
          WHERE archived_at IS NULL
          ORDER BY created_at
          LIMIT 1
        ),
        updated_at = now()
      WHERE user_id = ${administrator.id}
    `;

    await transaction`
      INSERT INTO audit_events (
        actor_id, actor_username, actor_real_name, actor_roles,
        action, module, target_type, target_id, result, details,
        request_id, user_agent
      ) VALUES (
        NULL, 'system', '系统维护', '{}',
        'system.users.reset', 'identity', 'users', 'all', 'success',
        ${transaction.json({
          createdUsernames: createdAccounts.map((account) => account.username),
          removedCount: oldUsers.length,
        })},
        ${randomUUID()}, 'database reset script'
      )
    `;

    return {
      createdUsernames: createdAccounts.map((account) => account.username),
      removedCount: oldUsers.length,
    };
  });

  console.warn(
    `已删除 ${summary.removedCount} 个旧账号并创建：${summary.createdUsernames.join('、')}`,
  );
  console.warn('原有项目、资产、版本和任务归属已转移给新管理员。');
}

try {
  await resetUsers();
} finally {
  await closeDatabase();
}
