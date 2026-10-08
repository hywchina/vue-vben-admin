import type { TransactionSql } from 'postgres';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { allocateGeneratedAssetName } from '../utils/domain/assets/generated-names';
import { closeDatabase, useDatabase } from '../utils/infrastructure/database';

const sql = useDatabase();
const projectId = randomUUID();
const contextId = randomUUID();
const legacyId = randomUUID();
const previewRollback = new Error('Migration preview completed; rollback only');

async function migrationFixtures(transaction: TransactionSql) {
  const [user] = await transaction<{ id: string }[]>`
    SELECT id FROM users ORDER BY created_at LIMIT 1
  `;
  assert.ok(user);
  await transaction`INSERT INTO projects (id, name, owner_id) VALUES (${projectId}, '命名迁移回滚夹具', ${user.id})`;
  const [conversation] = await transaction<{ publicId: string }[]>`
    INSERT INTO design_conversations (id, user_id, project_id)
    VALUES (${contextId}, ${user.id}, ${projectId}) RETURNING public_id AS "publicId"
  `;
  const [instance] = await transaction<{ publicId: string }[]>`
    INSERT INTO workflow_workspace_instances (id, user_id, project_id, app_key, title)
    VALUES (${legacyId}, ${user.id}, ${projectId}, 'text-to-image', '命名迁移夹具') RETURNING public_id AS "publicId"
  `;
  const [job] = await transaction<{ id: string; publicId: string }[]>`
    INSERT INTO jobs (project_id, app_key, name, created_by, status, design_conversation_id, workspace_instance_id)
    VALUES (${projectId}, 'text-to-image', '命名迁移夹具', ${user.id}, 'succeeded', ${contextId}, ${legacyId})
    RETURNING id, public_id AS "publicId"
  `;
  const [legacy] = await transaction<{ id: string }[]>`
    INSERT INTO jobs (project_id, app_key, name, created_by, status, workspace_instance_id)
    VALUES (${projectId}, 'text-to-image', '旧实例夹具', ${user.id}, 'succeeded', ${legacyId}) RETURNING id
  `;
  assert.ok(conversation && instance && job && legacy);
  const oldName = `${contextId}-20260930-1000.png`;
  const newName = `${conversation.publicId}-20260930-1000.png`;
  const fixtures = [
    {
      name: oldName,
      filename: oldName,
      expected: newName,
      download: newName,
      jobId: job.id,
    },
    {
      name: '用户手动命名',
      filename: oldName,
      expected: '用户手动命名',
      download: newName,
      jobId: job.id,
    },
    {
      name: oldName,
      filename: '用户文件名.txt',
      expected: newName,
      download: '用户文件名.txt',
      jobId: job.id,
    },
    {
      name: oldName,
      filename: oldName,
      expected: oldName,
      download: oldName,
      jobId: job.id,
      source: 'upload',
    },
    {
      name: oldName,
      filename: oldName,
      expected: oldName,
      download: oldName,
      jobId: job.id,
      copy: true,
    },
    {
      name: `${legacyId}-20260930-001.md`,
      filename: `${legacyId}-20260930-001.md`,
      expected: `${instance.publicId}-20260930-001.md`,
      download: `${instance.publicId}-20260930-001.md`,
      jobId: legacy.id,
    },
  ];
  const expected = [];
  for (const fixture of fixtures) {
    const id = randomUUID();
    await transaction`
      INSERT INTO assets (id, project_id, name, kind, source, source_job_id, owner_id, status)
      VALUES (${id}, ${projectId}, ${fixture.name}, 'text', ${fixture.source ?? 'workflow'}, ${fixture.jobId}, ${user.id}, 'available')
    `;
    for (const version of [1, 2]) {
      await transaction`
        INSERT INTO asset_versions (asset_id, version, storage_kind, text_content, original_filename, mime_type, status, created_by)
        VALUES (${id}, ${version}, 'inline', '命名回滚测试夹具', ${fixture.filename}, 'text/plain', 'available', ${user.id})
      `;
    }
    if (!fixture.copy) {
      await transaction`INSERT INTO job_outputs (job_id, asset_id) VALUES (${fixture.jobId}, ${id})`;
    }
    expected.push({ id, name: fixture.expected, filename: fixture.download });
  }
  return expected;
}

async function previewMigration() {
  const migration = await readFile(
    new URL(
      '../migrations/039_generated_asset_business_names.sql',
      import.meta.url,
    ),
    'utf8',
  );
  await sql
    .begin(async (transaction) => {
      await transaction`LOCK TABLE assets, asset_versions, jobs, job_outputs IN SHARE ROW EXCLUSIVE MODE`;
      const fixtures = await migrationFixtures(transaction);
      const snapshot = async (includeNames: boolean) => {
        const [row] = await transaction<{ value: string }[]>`
        SELECT jsonb_build_object(
          'assets', (SELECT jsonb_agg(CASE WHEN ${includeNames} THEN to_jsonb(a) ELSE to_jsonb(a) - 'name' END ORDER BY id) FROM assets a),
          'versions', (SELECT jsonb_agg(CASE WHEN ${includeNames} THEN to_jsonb(v) ELSE to_jsonb(v) - 'original_filename' END ORDER BY id) FROM asset_versions v)
        )::text AS value
      `;
        return row?.value;
      };
      const before = await snapshot(false);
      const original = await snapshot(true);
      await transaction.unsafe(migration);
      for (const fixture of fixtures) {
        const rows = await transaction<{ filename: string; name: string }[]>`
          SELECT a.name, v.original_filename AS filename FROM assets a
          JOIN asset_versions v ON v.asset_id = a.id WHERE a.id = ${fixture.id}
        `;
        assert.equal(rows.length, 2);
        assert.ok(
          rows.every(
            (row) =>
              row.name === fixture.name && row.filename === fixture.filename,
          ),
        );
      }
      assert.equal(
        await snapshot(false),
        before,
        'Migration must only change names',
      );
      const [counts] = await transaction<
        { assets: number; versions: number }[]
      >`
      SELECT (SELECT count(*)::integer FROM generated_asset_business_name_history) AS assets,
        (SELECT count(*)::integer FROM asset_versions v JOIN generated_asset_business_name_history h ON h.asset_id = v.asset_id) AS versions
    `;
      await transaction`
      UPDATE assets a SET name = h.previous_name
      FROM generated_asset_business_name_history h WHERE a.id = h.asset_id
    `;
      await transaction`
      UPDATE asset_versions v SET original_filename = backup.item->>'filename'
      FROM generated_asset_business_name_history h,
        LATERAL jsonb_array_elements(h.previous_filenames) AS backup(item)
      WHERE v.id = (backup.item->>'id')::uuid
    `;
      assert.equal(
        await snapshot(true),
        original,
        'Backup must restore all original names exactly',
      );
      console.warn(
        `迁移预演通过：${counts?.assets} 个历史资产、${counts?.versions} 个版本；非名称字段不变，原名称恢复校验通过。本次事务将回滚。`,
      );
      throw previewRollback;
    })
    .catch((error: unknown) => {
      if (error !== previewRollback) throw error;
    });
}

async function verifyHistory() {
  const [history] = await sql<{ count: number; invalid: number }[]>`
      SELECT count(*)::integer AS count,
        count(*) FILTER (WHERE a.name IS DISTINCT FROM h.renamed_to OR v.original_filename IS DISTINCT FROM replacement.item->>'filename')::integer AS invalid
      FROM generated_asset_business_name_history h
      JOIN assets a ON a.id = h.asset_id
      CROSS JOIN LATERAL jsonb_array_elements(h.renamed_filenames) AS replacement(item)
      JOIN asset_versions v ON v.id = (replacement.item->>'id')::uuid
    `;
  assert.equal(
    history?.invalid,
    0,
    'Historical names must match the migration snapshot, including preserved manual names',
  );
  console.warn(`历史命名核对通过：${history?.count} 个版本符合迁移快照。`);
}

async function verifyAllocation() {
  try {
    const [user] = await sql<
      { id: string }[]
    >`SELECT id FROM users ORDER BY created_at LIMIT 1`;
    assert.ok(user);
    await sql`INSERT INTO projects (id, code, name, owner_id) VALUES (${projectId}, ${`NAME-${projectId.slice(0, 12)}`}, '资产命名集成测试', ${user.id})`;
    const [conversation] = await sql<
      { publicId: string }[]
    >`INSERT INTO design_conversations (id, user_id, project_id) VALUES (${contextId}, ${user.id}, ${projectId}) RETURNING public_id AS "publicId"`;
    const [instance] = await sql<
      { publicId: string }[]
    >`INSERT INTO workflow_workspace_instances (id, user_id, project_id, app_key, title) VALUES (${legacyId}, ${user.id}, ${projectId}, 'text-to-image', '资产命名兼容测试') RETURNING public_id AS "publicId"`;
    assert.ok(conversation && instance);
    const [job] = await sql<{ id: string }[]>`
      INSERT INTO jobs (project_id, app_key, name, created_by, status, design_conversation_id, workspace_instance_id)
      VALUES (${projectId}, 'text-to-image', '命名测试', ${user.id}, 'succeeded', ${contextId}, ${legacyId}) RETURNING id
    `;
    const [legacy] = await sql<{ id: string }[]>`
      INSERT INTO jobs (project_id, app_key, name, created_by, status, workspace_instance_id)
      VALUES (${projectId}, 'text-to-image', '旧实例命名测试', ${user.id}, 'succeeded', ${legacyId}) RETURNING id
    `;
    assert.ok(job);
    assert.ok(legacy);
    await sql`
      INSERT INTO generated_asset_name_counters (context_id, generated_on, last_sequence)
      VALUES (${contextId}, (statement_timestamp() AT TIME ZONE 'Asia/Shanghai')::date - 1, 99)
    `;
    const input = {
      filename: 'external.png',
      jobId: job.id,
      mimeType: 'image/png',
    };
    const names = await Promise.all(
      Array.from({ length: 12 }, () =>
        sql.begin((transaction) =>
          allocateGeneratedAssetName(transaction, input),
        ),
      ),
    );
    assert.equal(new Set(names.map((name) => name.filename)).size, 12);
    assert.deepEqual(
      names.map((name) => name.sequence).toSorted((a, b) => a - b),
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    assert.ok(names.every((name) => name.contextId === contextId));
    assert.ok(
      names.every(
        (name) =>
          name.contextPublicId === conversation.publicId &&
          name.filename.startsWith(`${conversation.publicId}-`),
      ),
    );
    const failure = new Error('Expected rollback');
    await assert.rejects(
      sql.begin(async (transaction) => {
        await allocateGeneratedAssetName(transaction, input);
        throw failure;
      }),
      failure,
    );
    const [secondRound] = await sql<{ id: string }[]>`
      INSERT INTO jobs (project_id, app_key, name, created_by, status, design_conversation_id)
      VALUES (${projectId}, 'text-to-image', '第二轮命名测试', ${user.id}, 'succeeded', ${contextId}) RETURNING id
    `;
    assert.ok(secondRound);
    const next = await sql.begin((transaction) =>
      allocateGeneratedAssetName(transaction, {
        ...input,
        filename: 'report.pptx',
        jobId: secondRound.id,
      }),
    );
    assert.equal(next.sequence, 13);
    assert.ok(next.filename.endsWith('-013.pptx'));
    const fallback = await sql.begin((transaction) =>
      allocateGeneratedAssetName(transaction, { ...input, jobId: legacy.id }),
    );
    assert.equal(fallback.contextId, legacyId);
    assert.equal(fallback.contextPublicId, instance.publicId);
    assert.ok(fallback.filename.startsWith(`${instance.publicId}-`));
    assert.equal(fallback.sequence, 1);
    await sql`UPDATE generated_asset_name_counters SET last_sequence = 999 WHERE context_id = ${contextId} AND generated_on = (statement_timestamp() AT TIME ZONE 'Asia/Shanghai')::date`;
    const over999 = await sql.begin((transaction) =>
      allocateGeneratedAssetName(transaction, input),
    );
    assert.equal(over999.sequence, 1000);
    assert.ok(over999.filename.endsWith('-1000.png'));
    await assert.rejects(
      sql.begin((transaction) =>
        allocateGeneratedAssetName(transaction, {
          ...input,
          jobId: randomUUID(),
        }),
      ),
      /生成资产对应任务不存在/,
    );
    const [day] = await sql<
      { dateStamp: string }[]
    >`SELECT to_char(statement_timestamp() AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDD') AS "dateStamp"`;
    assert.equal(next.dateStamp, day?.dateStamp);
    console.warn(
      '资产命名集成通过：DSC/INS 真实业务编号、会话优先、并发唯一、跨轮次/类型连续编号、超过999、跨日重置、事务回滚、北京时间与不存在任务拒绝。',
    );
  } finally {
    await sql`DELETE FROM generated_asset_name_counters WHERE context_id IN (${contextId}, ${legacyId})`;
    await sql`DELETE FROM jobs WHERE project_id = ${projectId}`;
    await sql`DELETE FROM projects WHERE id = ${projectId}`;
    await sql`DELETE FROM business_id_aliases WHERE entity_type = 'PRJ' AND entity_id = ${projectId}`;
  }
}

try {
  if (process.argv.includes('--preview-migration')) {
    await previewMigration();
  } else if (process.argv.includes('--verify-history')) {
    await verifyHistory();
  } else {
    await verifyAllocation();
  }
} finally {
  await closeDatabase();
}
