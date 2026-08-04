import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { getConfig } from '../utils/config';
import { closeDatabase, useDatabase } from '../utils/database';
import { deleteObject } from '../utils/storage';

interface ApiEnvelope<T> {
  code: number | string;
  data: T;
  message: string;
  requestId: string;
}

interface Session {
  cookie: string;
  id: string;
  token: string;
  username: string;
}

const apiUrl = (
  process.env.RAIL_API_URL ?? 'http://localhost:5320/api/v1'
).replace(/\/$/, '');
const runId = `integration-${randomUUID()}`;
const runStartedAt = new Date();
const requestIds: string[] = [];
const sessions: Session[] = [];
let requestSequence = 0;
let projectId: null | string = null;
let conversationId: null | string = null;
let previousCurrentProjectId: null | string = null;
let testOwnerId: null | string = null;
const notificationIds: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function apiRequest<T>(
  path: string,
  options: {
    body?: unknown;
    expectedStatus?: number;
    method?: string;
    session?: Session;
  } = {},
) {
  const requestId = `${runId}-${++requestSequence}`;
  requestIds.push(requestId);
  const headers = new Headers({
    Accept: 'application/json',
    'X-Request-ID': requestId,
  });
  if (options.body !== undefined)
    headers.set('Content-Type', 'application/json');
  if (options.session) {
    headers.set('Authorization', `Bearer ${options.session.token}`);
    if (options.session.cookie) headers.set('Cookie', options.session.cookie);
  }
  const response = await fetch(`${apiUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  const expectedStatus = options.expectedStatus ?? 200;
  assert(
    response.status === expectedStatus,
    `${options.method ?? 'GET'} ${path} 预期 ${expectedStatus}，实际 ${response.status}：${envelope.message}`,
  );
  return { envelope, response };
}

async function login(username: string, password: string) {
  const { envelope, response } = await apiRequest<{ accessToken: string }>(
    '/auth/login',
    { body: { password, username } },
  );
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  const temporary = {
    cookie,
    id: '',
    token: envelope.data.accessToken,
    username,
  };
  const { envelope: identity } = await apiRequest<{ id: string }>(
    '/user/info',
    { session: temporary },
  );
  const session = { ...temporary, id: identity.data.id };
  sessions.push(session);
  return session;
}

async function cleanup() {
  for (const session of sessions) {
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        session,
      });
    } catch (error) {
      console.warn(`清理 ${session.username} 会话失败`, error);
    }
  }

  const sql = useDatabase();
  if (projectId) {
    const objects = await sql<{ objectKey: string }[]>`
      SELECT version.object_key AS "objectKey"
      FROM asset_versions version
      JOIN assets asset ON asset.id = version.asset_id
      WHERE asset.project_id = ${projectId}
        AND version.object_key IS NOT NULL
    `;
    for (const object of objects) {
      await deleteObject(object.objectKey).catch((error) => {
        console.warn(`清理测试对象 ${object.objectKey} 失败`, error);
      });
    }
  }
  if (conversationId) {
    await sql`DELETE FROM ai_conversations WHERE id = ${conversationId}`;
  }
  if (projectId) await sql`DELETE FROM projects WHERE id = ${projectId}`;
  if (testOwnerId) {
    await sql`
      UPDATE user_preferences
      SET current_project_id = ${previousCurrentProjectId}, updated_at = now()
      WHERE user_id = ${testOwnerId}
    `;
  }
  if (notificationIds.length > 0) {
    await sql`DELETE FROM notifications WHERE id = ANY(${notificationIds})`;
  }
  if (requestIds.length > 0) {
    await sql`DELETE FROM audit_events WHERE request_id = ANY(${requestIds})`;
  }
}

async function run() {
  const config = getConfig();
  const live = await apiRequest<{ status: string }>('/health/live');
  assert(live.envelope.data.status === 'up', '存活探针未返回 up');
  const ready = await apiRequest<{
    dependencies: { database: string; storage: string };
  }>('/health/ready');
  assert(
    ready.envelope.data.dependencies.database === 'up' &&
      ready.envelope.data.dependencies.storage === 'up',
    '数据库或对象存储未就绪',
  );

  const user1 = await login(
    config.bootstrapUser1Username,
    config.bootstrapUser1Password,
  );
  testOwnerId = user1.id;
  const sql = useDatabase();
  const [preference] = await sql<{ currentProjectId: null | string }[]>`
    SELECT current_project_id AS "currentProjectId"
    FROM user_preferences
    WHERE user_id = ${user1.id}
  `;
  previousCurrentProjectId = preference?.currentProjectId ?? null;
  const user2 = await login(
    config.bootstrapUser2Username,
    config.bootstrapUser2Password,
  );
  const admin = await login(
    config.bootstrapAdminUsername,
    config.bootstrapAdminPassword,
  );

  const projectName = `自动化验收 ${runId.slice(-8)}`;
  const project = await apiRequest<{ id: string; name: string }>('/projects', {
    body: { description: runId, name: projectName, stage: 'concept' },
    session: user1,
  });
  projectId = project.envelope.data.id;

  const user2Projects = await apiRequest<{ items: Array<{ id: string }> }>(
    '/projects',
    { session: user2 },
  );
  assert(
    !user2Projects.envelope.data.items.some((item) => item.id === projectId),
    '未加入项目的用户看到了测试项目',
  );

  await apiRequest('/assets/text', {
    body: {
      content: '集成测试文本资产',
      description: runId,
      mimeType: 'text/plain',
      name: '验收文本',
      projectId,
      tags: ['integration-test'],
    },
    session: user1,
  });
  await apiRequest(`/assets?projectId=${projectId}`, {
    expectedStatus: 404,
    session: user2,
  });

  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const prepared = await apiRequest<{
    asset: { id: string };
    upload: { headers: Record<string, string>; method: string; url: string };
  }>('/assets/uploads', {
    body: {
      description: runId,
      filename: 'acceptance.png',
      kind: 'image',
      mimeType: 'image/png',
      name: '验收图片',
      projectId,
      sizeBytes: image.byteLength,
      tags: ['integration-test'],
    },
    session: user1,
  });
  const upload = await fetch(prepared.envelope.data.upload.url, {
    body: image,
    headers: prepared.envelope.data.upload.headers,
    method: prepared.envelope.data.upload.method,
  });
  assert(upload.ok, `对象存储上传失败：${upload.status}`);
  await apiRequest(`/assets/${prepared.envelope.data.asset.id}/complete`, {
    method: 'POST',
    session: user1,
  });
  const [createdNotification] = await sql<{ id: string }[]>`
    SELECT id FROM notifications
    WHERE user_id = ${user1.id}
      AND type = 'asset'
      AND message = '资产的新版本 V1 已完成上传并可在项目内使用。'
      AND created_at >= ${runStartedAt}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (createdNotification) notificationIds.push(createdNotification.id);

  const conversation = await apiRequest<{ id: string }>(
    '/assistant/conversations',
    { body: { projectId }, session: user1 },
  );
  conversationId = conversation.envelope.data.id;
  await apiRequest(`/assistant/conversations/${conversationId}/messages`, {
    expectedStatus: 404,
    session: user2,
  });

  const userAudit = await apiRequest<{
    items: Array<{ actorId: null | string }>;
    scope: string;
  }>(`/audit-events?actorId=${user2.id}`, { session: user1 });
  assert(userAudit.envelope.data.scope === 'self', '普通用户日志范围不是 self');
  assert(
    userAudit.envelope.data.items.every((item) => item.actorId === user1.id),
    '普通用户读取到了其他用户日志',
  );

  const adminAudit = await apiRequest<{
    items: Array<{ actorId: null | string }>;
    scope: string;
  }>(`/audit-events?actorId=${user1.id}`, { session: admin });
  assert(adminAudit.envelope.data.scope === 'all', '管理员日志范围不是 all');
  assert(
    adminAudit.envelope.data.items.some((item) => item.actorId === user1.id),
    '管理员未读取到普通用户日志',
  );

  console.warn(
    '集成验收通过：认证、权限隔离、项目、文本/图片资产、对象存储、AI 会话和审计。',
  );
}

let failed = false;
try {
  await run();
} catch (error) {
  failed = true;
  console.error('集成验收失败', error);
} finally {
  try {
    await cleanup();
  } catch (error) {
    failed = true;
    console.error('集成测试清理失败', error);
  }
  await closeDatabase();
}

if (failed) process.exitCode = 1;
