import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { closeDatabase, useDatabase } from '../utils/infrastructure/database';

const registry = [
  ['users', 'USR'],
  ['projects', 'PRJ'],
  ['design_conversations', 'DSC'],
  ['ai_conversations', 'AIC'],
  ['jobs', 'TSK'],
  ['assets', 'AST'],
  ['asset_versions', 'ASV'],
  ['asset_folders', 'FLD'],
  ['workflow_definitions', 'WFL'],
  ['workflow_versions', 'WFV'],
  ['workflow_workspace_instances', 'INS'],
  ['ai_messages', 'MSG'],
  ['ai_attachments', 'ATT'],
  ['notifications', 'NTF'],
  ['audit_events', 'AUD'],
] as const;
const sql = useDatabase();
const rollback = new Error('Rollback test records only');

try {
  for (const [table, prefix] of registry) {
    const [result] = await sql.unsafe<{ invalid: number }[]>(
      `SELECT count(*)::int AS invalid FROM ${table} WHERE public_id IS NULL OR public_id !~ $1`,
      [`^${prefix}-[0-9]{8,}$`],
    );
    assert.equal(
      result?.invalid,
      0,
      `${table}: all persisted numbers must be canonical`,
    );
  }
  const [overflow] = await sql<{ value: string }[]>`
    SELECT format_business_id('AST', 100000000) AS value
  `;
  assert.equal(
    overflow?.value,
    'AST-100000000',
    'Sequence overflow must not truncate',
  );
  const [aliases] = await sql<{ invalid: number }[]>`
    SELECT count(*)::int AS invalid FROM business_id_aliases alias
    JOIN users account ON account.id = alias.entity_id
    WHERE alias.entity_type = 'USR'
      AND account.public_id <> format_business_id('USR', substring(alias.legacy_id FROM 5)::bigint)
  `;
  assert.equal(
    aliases?.invalid,
    0,
    'Historical user aliases must still identify the same UUID',
  );

  await sql
    .begin(async (transaction) => {
      const [user] = await transaction<{ id: string; publicId: string }[]>`
      INSERT INTO users(username, real_name, password_hash)
      VALUES (${`id-test-${randomUUID()}`}, 'ID integration fixture', 'not-a-login-hash')
      RETURNING id, public_id AS "publicId"
    `;
      assert.ok(user && /^USR-\d{8,}$/.test(user.publicId));
      const [project] = await transaction<
        { code: string; id: string; publicId: string }[]
      >`
      INSERT INTO projects(name, owner_id) VALUES ('ID integration fixture', ${user.id})
      RETURNING id, public_id AS "publicId", code
    `;
      assert.ok(project && /^PRJ-\d{8,}$/.test(project.publicId));
      assert.equal(project.code, project.publicId);
      const [conversation] = await transaction<{ publicId: string }[]>`
      INSERT INTO design_conversations(user_id, project_id, title)
      VALUES (${user.id}, ${project.id}, 'ID fixture') RETURNING public_id AS "publicId"
    `;
      assert.ok(conversation);
      assert.match(conversation.publicId, /^DSC-\d{8,}$/);
      const [assistant] = await transaction<{ publicId: string }[]>`
      INSERT INTO ai_conversations(user_id) VALUES (${user.id}) RETURNING public_id AS "publicId"
    `;
      assert.ok(assistant);
      assert.match(assistant.publicId, /^AIC-\d{8,}$/);
      const numbers = await Promise.all(
        Array.from({ length: 20 }, async () => {
          const [notification] = await transaction<{ publicId: string }[]>`
        INSERT INTO notifications(user_id, title, message)
        VALUES (${user.id}, 'ID fixture', 'ID fixture') RETURNING public_id AS "publicId"
      `;
          assert.ok(notification);
          return notification.publicId;
        }),
      );
      assert.equal(new Set(numbers).size, 20);
      for (const number of numbers) assert.match(number, /^NTF-\d{8,}$/);
      const legacyCode = `LEGACY-ID-TEST-${randomUUID()}`;
      const [legacyProject] = await transaction<
        { id: string; publicId: string }[]
      >`
      INSERT INTO projects(code, name, owner_id) VALUES (${legacyCode}, 'Legacy client fixture', ${user.id})
      RETURNING id, public_id AS "publicId"
    `;
      const [mapped] = await transaction<{ entityId: string }[]>`
      SELECT entity_id AS "entityId" FROM business_id_aliases
      WHERE entity_type = 'PRJ' AND legacy_id = ${legacyCode}
    `;
      assert.equal(mapped?.entityId, legacyProject?.id);
      await assert.rejects(
        transaction.savepoint(async (savepoint) => {
          await savepoint`UPDATE users SET public_id = 'USR-99999999' WHERE id = ${user.id}`;
        }),
        /immutable/,
      );
      await assert.rejects(
        transaction.savepoint(async (savepoint) => {
          await savepoint`UPDATE projects SET code = 'PRJ-99999999' WHERE id = ${project.id}`;
        }),
        /immutable/,
      );
      throw rollback;
    })
    .catch((error: unknown) => {
      if (error !== rollback) throw error;
    });
  console.warn(
    '业务编号验收通过：15 类历史数据、旧用户映射、创建/唯一性、8 位溢出、编号不可修改。测试记录全部回滚，序列允许留空号。',
  );
} finally {
  await closeDatabase();
}
