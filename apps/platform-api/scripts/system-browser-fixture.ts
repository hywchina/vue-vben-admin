import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { hashPassword } from '../utils/identity/password';
import { closeDatabase, useDatabase } from '../utils/infrastructure/database';
import { deleteObject } from '../utils/infrastructure/storage';

const marker = 'system-browser-acceptance';

async function main() {
  const sql = useDatabase();
  const [action, userId] = process.argv.slice(2);
  if (action === 'create') {
    const username = `rail_system_${randomUUID().replaceAll('-', '')}`;
    const password = `RailTest-${randomUUID()}!`;
    const passwordHash = await hashPassword(password);
    const user = await sql.begin(async (tx) => {
      const [created] = await tx<{ id: string }[]>`
        INSERT INTO users (username, password_hash, real_name, department)
        VALUES (${username}, ${passwordHash}, '系统回归临时用户', ${marker})
        RETURNING id
      `;
      if (!created) throw new Error('创建临时用户失败');
      await tx`INSERT INTO user_roles (user_id, role_id)
        SELECT ${created.id}, id FROM roles WHERE code = 'user'`;
      await tx`INSERT INTO user_preferences (user_id) VALUES (${created.id})`;
      return created;
    });
    console.warn(JSON.stringify({ password, userId: user.id, username }));
    return;
  }
  if (action !== 'cleanup' || !userId || !/^[\da-f-]{36}$/i.test(userId)) {
    throw new Error(
      'Usage: system-browser-fixture.ts create | cleanup <user UUID>',
    );
  }
  const [user] = await sql<{ username: string }[]>`
    SELECT username FROM users WHERE id = ${userId}
      AND department = ${marker} AND username LIKE 'rail_system_%'
  `;
  if (!user) throw new Error('只允许清理本脚本创建的临时用户');
  const projects = await sql<{ id: string }[]>`
    SELECT id FROM projects WHERE owner_id = ${userId}
  `;
  const projectIds = projects.map((project) => project.id);
  const [foreignMembers] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM project_members
    WHERE project_id = ANY(${projectIds}::uuid[]) AND user_id <> ${userId}
  `;
  if (foreignMembers?.count) throw new Error('临时项目存在其他成员，拒绝清理');
  const [activeJobs] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM jobs
    WHERE project_id = ANY(${projectIds}::uuid[]) AND status IN ('queued', 'running')
  `;
  if (activeJobs?.count) throw new Error('临时项目仍有活动任务，拒绝清理');
  const contexts = await sql<{ id: string }[]>`
    SELECT id FROM design_conversations WHERE project_id = ANY(${projectIds}::uuid[])
    UNION SELECT id FROM workflow_workspace_instances WHERE project_id = ANY(${projectIds}::uuid[])
  `;
  const contextIds = contexts.map((context) => context.id);
  const objects = await sql<{ key: string }[]>`
    SELECT av.object_key AS key FROM asset_versions av
      JOIN assets a ON a.id = av.asset_id
      WHERE a.project_id = ANY(${projectIds}::uuid[]) AND av.object_key IS NOT NULL
    UNION SELECT object_key FROM ai_attachments WHERE user_id = ${userId}
    UNION SELECT avatar_object_key FROM users WHERE id = ${userId}
      AND avatar_object_key IS NOT NULL
  `;
  for (const object of objects) await deleteObject(object.key);
  await sql.begin(async (tx) => {
    await tx`DELETE FROM audit_events WHERE actor_id = ${userId}`;
    await tx`DELETE FROM audit_events WHERE target_id IN (
      SELECT id::text FROM jobs WHERE project_id = ANY(${projectIds}::uuid[])
    )`;
    await tx`DELETE FROM generated_asset_name_counters WHERE context_id = ANY(${contextIds}::uuid[])`;
    await tx`DELETE FROM projects WHERE id = ANY(${projectIds}::uuid[])`;
    await tx`DELETE FROM users WHERE id = ${userId}`;
  });
  console.warn(
    JSON.stringify({
      cleanedObjects: objects.length,
      cleanedProjects: projects.length,
      userId,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
