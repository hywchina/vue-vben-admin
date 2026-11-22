import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { closeDatabase, useDatabase } from '../utils/database';
import { hashPassword } from '../utils/password';
import { deleteObject } from '../utils/storage';
const objectKeys: string[] = [];

if (
  !/^\/rail_test_[\da-f]{32}$/.test(
    new URL(process.env.DATABASE_URL ?? '').pathname,
  )
)
  throw new Error(
    'Asset category acceptance requires an isolated integration database',
  );
const sql = useDatabase();
const username = `asset_scope_${randomUUID().slice(0, 12)}`;
const password = `Asset-scope-1!${randomUUID()}`;
let token = '';
async function api<T = any>(
  path: string,
  body?: unknown,
  expected = 200,
  method = body ? 'POST' : 'GET',
): Promise<T> {
  const response = await fetch(`${process.env.RAIL_API_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(20_000),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = (await response.json()) as { data: T; message: string };
  assert.equal(response.status, expected, `${path}: ${result.message}`);
  return result.data;
}
try {
  const [user] =
    await sql`INSERT INTO users(username,password_hash,real_name) VALUES(${username},${await hashPassword(password)},'分类目录验收') RETURNING id`;
  assert.ok(user);
  await sql`INSERT INTO user_roles(user_id,role_id) SELECT ${user.id},id FROM roles WHERE code='user'`;
  const login = await api('/auth/login', { username, password });
  token = login.accessToken;
  const project = await api('/projects', { name: username });
  const foreignProject = await api('/projects', { name: `${username}-other` });
  const foreignFolder = await api('/asset-folders', {
    projectId: foreignProject.id,
    name: '方案',
    generationCategory: 'cmf',
  });
  const cmf = await api('/asset-folders', {
    projectId: project.id,
    name: '方案',
    generationCategory: 'cmf',
  });
  const child = await api('/asset-folders', {
    projectId: project.id,
    name: '面料',
    parentId: cmf.id,
  });
  const cabin = await api('/asset-folders', {
    projectId: project.id,
    name: '方案',
    generationCategory: 'cabin',
  });
  const legacy = await api('/asset-folders', {
    projectId: project.id,
    name: '旧资料',
  });
  assert.equal(child.generationCategory, 'cmf');
  const item = await api('/assets/text', {
    projectId: project.id,
    name: 'CMF成果',
    content: '目录契约验收',
    generationCategory: 'cmf',
  });
  for (const operation of ['move', 'copy']) {
    for (const targetFolderId of [cabin.id, legacy.id, foreignFolder.id])
      await api(
        '/assets/batch',
        {
          projectId: project.id,
          assetIds: [item.id],
          operation,
          targetFolderId,
        },
        400,
      );
  }
  await api(
    '/assets/text',
    {
      projectId: project.id,
      name: '伪造分类',
      content: '拒绝',
      generationCategory: 'cmf',
      folderId: cabin.id,
    },
    400,
  );
  await api(
    '/assets/uploads',
    {
      projectId: project.id,
      name: '伪造上传',
      filename: 'test.png',
      mimeType: 'image/png',
      kind: 'image',
      sizeBytes: 10,
      generationCategory: 'cmf',
      folderId: cabin.id,
    },
    400,
  );
  await api('/assets/batch', {
    projectId: project.id,
    assetIds: [item.id],
    operation: 'move',
    targetFolderId: child.id,
  });
  const moved = await api(`/assets/${item.id}`);
  assert.equal(moved.folderId, child.id);
  await api('/assets/batch', {
    projectId: project.id,
    assetIds: [item.id],
    operation: 'move',
    targetFolderId: null,
  });
  const rootItem = await api(`/assets/${item.id}`);
  assert.equal(rootItem.generationCategory, 'cmf');
  assert.ok(!rootItem.folderId);
  const copy = await api('/assets/batch', {
    projectId: project.id,
    assetIds: [item.id],
    operation: 'copy',
    targetFolderId: child.id,
  });
  const copied = await api(`/assets/${copy.copiedAssetIds[0]}`);
  assert.equal(copied.generationCategory, 'cmf');
  const cabinAsset = await api('/assets/text', {
    projectId: project.id,
    name: '客室',
    content: '客室',
    generationCategory: 'cabin',
  });
  await api(
    '/assets/batch',
    {
      projectId: project.id,
      assetIds: [item.id, cabinAsset.id],
      operation: 'move',
      targetFolderId: null,
    },
    400,
  );
  const conversation = await api('/design-conversations', {
    projectId: project.id,
  });
  // An explicit CPU fixture tests save semantics, without creating a GPU task.
  const [job] =
    await sql`INSERT INTO jobs(project_id,app_key,name,parameters,created_by,status,progress,design_conversation_id,design_mode)
    VALUES(${project.id},'text-to-image','分类保存夹具','{}',${user.id},'succeeded',100,${conversation.id},'cmf') RETURNING id`;
  assert.ok(job);
  const staged = await api('/assets/text', {
    projectId: project.id,
    name: '未入库夹具',
    content: '非真实模型输出',
    generationCategory: 'cmf',
  });
  await sql`UPDATE assets SET source='workflow',source_job_id=${job.id},saved_at=NULL WHERE id=${staged.id}`;
  await sql`INSERT INTO job_outputs(job_id,asset_id,position) VALUES(${job.id},${staged.id},0)`;
  await api(
    `/assets/${staged.id}/save`,
    { folderId: cabin.id, jobId: job.id },
    400,
  );
  await api(
    `/assets/${staged.id}/save`,
    { folderId: foreignFolder.id, jobId: job.id },
    400,
  );
  await api(`/assets/${staged.id}/save`, { jobId: randomUUID() }, 400);
  const [stillUnsaved] =
    await sql`SELECT saved_at FROM assets WHERE id=${staged.id}`;
  assert.equal(stillUnsaved?.saved_at, null);
  const context = await api(`/assets/${staged.id}/save?jobId=${job.id}`);
  assert.equal(context.generationCategory, 'cmf');
  await api(`/assets/${staged.id}/save?jobId=${randomUUID()}`, undefined, 400);
  const ownerToken = token;
  token = '';
  await api(`/assets/${staged.id}/save`, undefined, 401);
  token = ownerToken;
  const saved = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      api(`/assets/${staged.id}/save`, {
        jobId: job.id,
        folderId: index % 2 === 0 ? child.id : undefined,
      }),
    ),
  );
  assert.equal(saved[0].folderId, saved[1].folderId);
  assert.equal(saved[0].generationCategory, 'cmf');
  const audit =
    await sql`SELECT id FROM audit_events WHERE action='asset.workflow-output.save' AND target_id=${staged.id}`;
  assert.equal(audit.length, 1);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const upload = await api('/assets/uploads', {
    projectId: project.id,
    designConversationId: conversation.id,
    name: '原始输入',
    filename: 'input.png',
    mimeType: 'image/png',
    kind: 'image',
    sizeBytes: png.length,
  });
  const [object] =
    await sql`SELECT object_key FROM asset_versions WHERE asset_id=${upload.asset.id}`;
  assert.ok(object?.object_key);
  objectKeys.push(object.object_key);
  const stored = await fetch(upload.upload.url, {
    method: 'PUT',
    headers: upload.upload.headers,
    body: png,
  });
  assert.equal(stored.ok, true);
  await api(`/assets/${upload.asset.id}/complete`, {});
  await sql`INSERT INTO job_inputs(job_id,asset_id,position) VALUES(${job.id},${upload.asset.id},0)`;
  const inputContext = await api(
    `/assets/${upload.asset.id}/save?jobId=${job.id}`,
  );
  assert.equal(inputContext.generationCategory, 'cmf');
  const savedInput = await api(`/assets/${upload.asset.id}/save`, {
    jobId: job.id,
    folderId: child.id,
  });
  assert.equal(savedInput.generationCategory, 'cmf');
  assert.equal(savedInput.folderId, child.id);
  const root = await api(`/assets/${item.id}/save`, {});
  assert.equal(root.generationCategory, 'cmf');
  assert.ok(!root.folderId);
  const folders = await api(`/asset-folders?projectId=${project.id}`);
  assert.equal(
    folders.find((f: { id: string }) => f.id === child.id).generationCategory,
    'cmf',
  );
  const aggregated = await api(
    `/assets?projectId=${project.id}&generationCategory=cmf`,
  );
  assert.ok(aggregated.some((a: { id: string }) => a.id === item.id));
  assert.ok(
    aggregated.some((a: { id: string }) => a.id === copy.copiedAssetIds[0]),
  );
  console.warn(
    '资产大类目录验收通过：同类根目录/子目录、保存/移动/复制、跨类及跨项目拒绝、分类上传保护、并发保存幂等与审计；使用CPU夹具，未调用GPU。',
  );
} finally {
  await Promise.all(objectKeys.map((key) => deleteObject(key)));
  await closeDatabase();
}
