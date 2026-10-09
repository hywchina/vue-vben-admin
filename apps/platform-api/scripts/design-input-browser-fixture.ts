// Disposable local browser fixture. Never changes the source conversation,
// its drafts or images; object copies have independent keys for safe cleanup.
import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { closeDatabase, useDatabase } from '../utils/infrastructure/database';
import { copyObject, deleteObject } from '../utils/infrastructure/storage';

const sql = useDatabase();
const marker = 'IT-DESIGN-INPUT-';
try {
  const [mode, id] = process.argv.slice(2);
  if (!id || !/^[\da-f-]{36}$/i.test(id)) throw new Error('需要明确的 UUID');
  if (mode === 'inspect') {
    const [state] = await sql`
      SELECT (SELECT count(*)::int FROM assets WHERE project_id = ${id} AND saved_at IS NULL) AS "unsavedImages",
        (SELECT count(*)::int FROM assets WHERE project_id = ${id} AND saved_at IS NOT NULL) AS "savedAssets",
        (SELECT count(*)::int FROM jobs WHERE project_id = ${id}) AS "jobs",
        (SELECT count(*)::int FROM design_conversation_drafts d JOIN design_conversations c ON c.id = d.conversation_id
          WHERE c.project_id = ${id} AND d.input_asset_ids <> '{}') AS "draftsWithImages"
    `;
    console.warn(JSON.stringify(state));
  } else if (mode === 'cleanup') {
    const [project] = await sql<{ fixtureJobsOnly: boolean; name: string }[]>`
      SELECT name,
        EXISTS (SELECT 1 FROM jobs WHERE project_id = ${id} AND stage = '验收夹具，无 GPU 执行')
        AND NOT EXISTS (SELECT 1 FROM jobs WHERE project_id = ${id} AND stage <> '验收夹具，无 GPU 执行')
          AS "fixtureJobsOnly"
      FROM projects WHERE id = ${id}
    `;
    if (
      !project ||
      project.name !== '继续编辑 · 临时验收项目' ||
      !project.fixtureJobsOnly
    )
      throw new Error('仅可清理本脚本创建的测试项目');
    const objects = await sql<{ key: string }[]>`
      SELECT v.object_key AS key FROM asset_versions v JOIN assets a ON a.id = v.asset_id
      WHERE a.project_id = ${id} AND v.object_key IS NOT NULL
    `;
    if (
      objects.some(
        (object) =>
          !object.key.startsWith(`${id}/`) ||
          !object.key.endsWith('/fixture.png'),
      )
    )
      throw new Error('存在非本轮夹具对象，拒绝清理');
    for (const object of objects) await deleteObject(object.key);
    await sql`DELETE FROM projects WHERE id = ${id}`;
    console.warn(
      '本轮临时项目、会话、草稿、任务和独立图片副本已清理；原数据不变。',
    );
  } else if (mode === 'create') {
    const [source] = await sql<
      { key: string; mime: string; size: string; userId: string }[]
    >`
      SELECT v.object_key AS key, v.mime_type AS mime, v.size_bytes AS size, c.user_id AS "userId"
      FROM design_conversations c JOIN jobs j ON j.design_conversation_id = c.id
      JOIN job_outputs o ON o.job_id = j.id JOIN assets a ON a.id = o.asset_id
      JOIN asset_versions v ON v.asset_id = a.id AND v.version = a.current_version
      WHERE c.id = ${id} AND c.archived_at IS NULL AND a.kind = 'image'
        AND a.status = 'available' AND a.deleted_at IS NULL
        AND v.status = 'available' AND v.object_key IS NOT NULL
      ORDER BY j.created_at DESC LIMIT 1
    `;
    if (!source) throw new Error('源会话没有可用图片');
    const projectId = randomUUID();
    const conversationId = randomUUID();
    const jobId = randomUUID();
    const objects: string[] = [];
    try {
      await sql.begin(async (tx) => {
        await tx`INSERT INTO projects (id, code, name, description, owner_id)
          VALUES (${projectId}, ${marker + projectId.slice(0, 8)}, '继续编辑 · 临时验收项目', ${marker + projectId}, ${source.userId})`;
        await tx`INSERT INTO project_members (project_id, user_id, project_role)
          VALUES (${projectId}, ${source.userId}, 'owner')`;
        await tx`INSERT INTO design_conversations (id, user_id, project_id, title)
          VALUES (${conversationId}, ${source.userId}, ${projectId}, '继续编辑 · 临时验收会话')`;
        await tx`INSERT INTO jobs (id, project_id, app_key, name, parameters, created_by,
          status, progress, stage, design_conversation_id)
          VALUES (${jobId}, ${projectId}, 'text-to-image', '直接复用图片验收', '{}', ${source.userId},
            'succeeded', 100, '验收夹具，无 GPU 执行', ${conversationId})`;
        for (let position = 0; position < 4; position += 1) {
          const assetId = randomUUID();
          const key = `${projectId}/${assetId}/fixture.png`;
          objects.push(key);
          await copyObject(source.key, key);
          await tx`INSERT INTO assets (id, project_id, name, kind, source, source_app_key, source_job_id, owner_id, status, saved_at)
            VALUES (${assetId}, ${projectId}, ${`未入库验收图 ${position + 1}`}, 'image', 'workflow', 'text-to-image',
              ${jobId}, ${source.userId}, 'available', NULL)`;
          await tx`INSERT INTO asset_versions (id, asset_id, version, storage_kind, object_key, original_filename,
            mime_type, size_bytes, status, created_by, completed_at)
            VALUES (${randomUUID()}, ${assetId}, 1, 'object', ${key}, 'fixture.png', ${source.mime},
              ${source.size}, 'available', ${source.userId}, now())`;
          await tx`INSERT INTO job_outputs (job_id, asset_id, position) VALUES (${jobId}, ${assetId}, ${position})`;
        }
      });
    } catch (error) {
      for (const key of objects) await deleteObject(key).catch(() => undefined);
      throw error;
    }
    console.warn(
      JSON.stringify({
        projectId,
        conversationId,
        url: `http://localhost:5666/design?conversationId=${conversationId}&projectId=${projectId}`,
      }),
    );
  } else
    throw new Error('使用 create <源会话 UUID> 或 cleanup <临时项目 UUID>');
} finally {
  await closeDatabase();
}
