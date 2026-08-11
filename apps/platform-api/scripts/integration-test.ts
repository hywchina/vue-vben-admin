import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { closeDatabase, useDatabase } from '../utils/database';
import { hashPassword } from '../utils/password';
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
let visibilityTestApplication: null | { key: string; visible: boolean } = null;
const notificationIds: string[] = [];
const testUserIds: string[] = [];

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

async function createTestAccount(roleCode: 'admin' | 'user', index: number) {
  const suffix = runId.replaceAll('-', '').slice(-16);
  const username = `rail_it_${suffix}_${index}`;
  const password = `RailIntegration${index}!2026`;
  const sql = useDatabase();
  const passwordHash = await hashPassword(password);
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (
      username, password_hash, real_name, department, email
    ) VALUES (
      ${username}, ${passwordHash}, ${`集成验收账号 ${index}`},
      '自动化验收', ${`${username}@rail.local`}
    )
    RETURNING id
  `;
  if (!user) throw new Error('创建集成验收账号失败');
  testUserIds.push(user.id);
  await sql`
    INSERT INTO user_roles (user_id, role_id)
    SELECT ${user.id}, id FROM roles WHERE code = ${roleCode}
  `;
  await sql`
    INSERT INTO user_preferences (user_id) VALUES (${user.id})
  `;
  return { password, username };
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
  if (visibilityTestApplication) {
    await sql`
      UPDATE applications
      SET visible = ${visibilityTestApplication.visible}, updated_at = now()
      WHERE key = ${visibilityTestApplication.key}
    `;
  }
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
  if (notificationIds.length > 0) {
    await sql`DELETE FROM notifications WHERE id = ANY(${notificationIds})`;
  }
  if (requestIds.length > 0) {
    await sql`DELETE FROM audit_events WHERE request_id = ANY(${requestIds})`;
  }
  if (testUserIds.length > 0) {
    await sql`DELETE FROM users WHERE id = ANY(${testUserIds})`;
  }
}

async function run() {
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

  const account1 = await createTestAccount('user', 1);
  const account2 = await createTestAccount('user', 2);
  const adminAccount = await createTestAccount('admin', 3);
  const user1 = await login(account1.username, account1.password);
  const sql = useDatabase();
  const user2 = await login(account2.username, account2.password);
  const admin = await login(adminAccount.username, adminAccount.password);

  const projectName = `自动化验收 ${runId.slice(-8)}`;
  const project = await apiRequest<{ id: string; name: string }>('/projects', {
    body: { description: runId, name: projectName, stage: 'concept' },
    session: user1,
  });
  projectId = project.envelope.data.id;

  const adminApplications = await apiRequest<
    Array<{
      acceptedAssetTypes: string[];
      canManageVisibility: boolean;
      capabilityCode?: string;
      key: string;
      visible: boolean;
    }>
  >('/applications', { session: admin });
  const visibilityTarget = adminApplications.envelope.data.find(
    (application) => application.capabilityCode,
  );
  assert(visibilityTarget, '没有可用于可见性验收的应用');
  const flowTarget = adminApplications.envelope.data.find(
    (application) =>
      application.key === 'single-image-edit' &&
      application.acceptedAssetTypes.includes('image'),
  );
  assert(flowTarget, '没有可用于资产流转验收的单图工作流');
  const multiFlowTarget = adminApplications.envelope.data.find(
    (application) =>
      application.key === 'multi-image-edit' &&
      application.acceptedAssetTypes.includes('image'),
  );
  assert(multiFlowTarget, '没有可用于精确输入位验收的多图工作流');
  const textToImageTarget = adminApplications.envelope.data.find(
    (application) => application.key === 'text-to-image',
  );
  assert(textToImageTarget, '没有可用于应用单任务互斥验收的文生图工作流');
  assert(
    visibilityTarget.canManageVisibility,
    '管理员应用列表没有返回可见性管理能力',
  );
  visibilityTestApplication = {
    key: visibilityTarget.key,
    visible: visibilityTarget.visible,
  };
  const visibilityWorkspace = await apiRequest<{ id: string }>(
    '/workflow-instances',
    {
      body: { appKey: visibilityTarget.key, projectId },
      session: user1,
    },
  );
  await apiRequest(`/applications/${visibilityTarget.key}/visibility`, {
    body: { visible: false },
    method: 'PATCH',
    session: admin,
  });
  const hiddenAdminApplications = await apiRequest<
    Array<{ key: string; visible: boolean }>
  >('/applications', { session: admin });
  assert(
    hiddenAdminApplications.envelope.data.some(
      (application) =>
        application.key === visibilityTarget.key && !application.visible,
    ),
    '管理员无法查看已隐藏应用',
  );
  const userApplications = await apiRequest<Array<{ key: string }>>(
    '/applications',
    { session: user1 },
  );
  assert(
    !userApplications.envelope.data.some(
      (application) => application.key === visibilityTarget.key,
    ),
    '普通用户看到了管理员隐藏的应用',
  );
  await apiRequest(`/applications/${visibilityTarget.key}/visibility`, {
    body: { visible: true },
    expectedStatus: 403,
    method: 'PATCH',
    session: user1,
  });
  await apiRequest(`/capabilities/${visibilityTarget.capabilityCode}`, {
    expectedStatus: 404,
    session: user1,
  });
  await apiRequest('/jobs', {
    body: {
      appKey: visibilityTarget.key,
      inputAssetIds: [],
      name: '隐藏应用越权验收',
      parameters: {},
      projectId,
      workspaceInstanceId: visibilityWorkspace.envelope.data.id,
    },
    expectedStatus: 404,
    session: user1,
  });
  await apiRequest(`/applications/${visibilityTarget.key}/visibility`, {
    body: { visible: visibilityTarget.visible },
    method: 'PATCH',
    session: admin,
  });

  const user2Projects = await apiRequest<{ items: Array<{ id: string }> }>(
    '/projects',
    { session: user2 },
  );
  assert(
    !user2Projects.envelope.data.items.some((item) => item.id === projectId),
    '未加入项目的用户看到了测试项目',
  );

  const textAsset = await apiRequest<{ id: string }>('/assets/text', {
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
  const textPreview = await apiRequest<{
    content: string;
    mimeType: string;
    mode: string;
  }>(`/assets/${textAsset.envelope.data.id}/preview`, { session: user1 });
  assert(
    textPreview.envelope.data.mode === 'inline' &&
      textPreview.envelope.data.content === '集成测试文本资产',
    '文本资产没有返回可阅读的内容预览',
  );
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
  const derivedPrepared = await apiRequest<{
    asset: { id: string };
    upload: { headers: Record<string, string>; method: string; url: string };
  }>('/assets/uploads', {
    body: {
      derivedFromAssetId: prepared.envelope.data.asset.id,
      description: `${runId} mask`,
      filename: 'acceptance-mask.png',
      kind: 'image',
      mimeType: 'image/png',
      name: '验收遮罩输入',
      projectId,
      sizeBytes: image.byteLength,
      tags: ['integration-test', '遮罩'],
    },
    session: user1,
  });
  const derivedUpload = await fetch(derivedPrepared.envelope.data.upload.url, {
    body: image,
    headers: derivedPrepared.envelope.data.upload.headers,
    method: derivedPrepared.envelope.data.upload.method,
  });
  assert(derivedUpload.ok, `遮罩资产上传失败：${derivedUpload.status}`);
  await apiRequest(
    `/assets/${derivedPrepared.envelope.data.asset.id}/complete`,
    { method: 'POST', session: user1 },
  );
  const assetsWithLineage = await apiRequest<
    Array<{ derivedFromAssetId?: string; id: string }>
  >(`/assets?projectId=${projectId}`, { session: user1 });
  assert(
    assetsWithLineage.envelope.data.find(
      (asset) => asset.id === derivedPrepared.envelope.data.asset.id,
    )?.derivedFromAssetId === prepared.envelope.data.asset.id,
    '遮罩资产没有返回遮罩前原始底图血缘',
  );
  const rejectedDerivedAsset = await apiRequest<unknown>('/assets/uploads', {
    body: {
      derivedFromAssetId: textAsset.envelope.data.id,
      description: `${runId} invalid mask source`,
      filename: 'invalid-mask-source.png',
      kind: 'image',
      mimeType: 'image/png',
      name: '非法遮罩血缘',
      projectId,
      sizeBytes: image.byteLength,
      tags: ['integration-test'],
    },
    expectedStatus: 400,
    session: user1,
  });
  assert(
    rejectedDerivedAsset.envelope.code === 'INVALID_DERIVED_ASSET',
    '遮罩资产接受了非图片原始资产作为血缘',
  );
  const imagePreview = await apiRequest<{
    mimeType: string;
    mode: string;
    url: string;
  }>(`/assets/${prepared.envelope.data.asset.id}/preview`, { session: user1 });
  assert(
    imagePreview.envelope.data.mode === 'url' &&
      imagePreview.envelope.data.mimeType === 'image/png',
    '图片资产没有返回浏览器预览地址',
  );
  const previewObject = await fetch(imagePreview.envelope.data.url);
  assert(previewObject.ok, `图片预览对象读取失败：${previewObject.status}`);
  assert(
    Buffer.from(await previewObject.arrayBuffer()).equals(image),
    '图片预览内容与原始资产不一致',
  );
  await apiRequest(`/assets/${prepared.envelope.data.asset.id}/preview`, {
    expectedStatus: 404,
    session: user2,
  });

  const textWorkspace = await apiRequest<{ id: string }>(
    '/workflow-instances',
    {
      body: { appKey: textToImageTarget.key, projectId },
      session: user1,
    },
  );
  const alternateTextWorkspace = await apiRequest<{ id: string }>(
    '/workflow-instances',
    {
      body: { appKey: textToImageTarget.key, projectId },
      session: user1,
    },
  );
  const flowWorkspace = await apiRequest<{ id: string }>(
    '/workflow-instances',
    {
      body: { appKey: flowTarget.key, projectId },
      session: user1,
    },
  );
  const multiFlowWorkspace = await apiRequest<{ id: string }>(
    '/workflow-instances',
    {
      body: { appKey: multiFlowTarget.key, projectId },
      session: user1,
    },
  );
  const stagingWorkspace = visibilityWorkspace;

  const activeWorkspaceJobId = randomUUID();
  await sql`
    INSERT INTO jobs (
      id, project_id, app_key, name, parameters, created_by,
      status, progress, stage, workspace_instance_id
    ) VALUES (
      ${activeWorkspaceJobId}, ${projectId}, ${textToImageTarget.key},
      '单实例互斥验收', '{}'::jsonb, ${user1.id},
      'queued', 0, '等待执行', ${textWorkspace.envelope.data.id}
    )
  `;
  const duplicateWorkspaceJob = await apiRequest<unknown>('/jobs', {
    body: {
      appKey: textToImageTarget.key,
      inputAssetIds: [],
      name: '重复应用任务',
      parameters: {},
      projectId,
      workspaceInstanceId: textWorkspace.envelope.data.id,
    },
    expectedStatus: 409,
    session: user1,
  });
  assert(
    duplicateWorkspaceJob.envelope.code === 'WORKSPACE_INSTANCE_JOB_ACTIVE',
    '同一应用会话的第二个进行中任务没有被后端阻止',
  );
  const parallelWorkspaceJob = await apiRequest<{ id: string }>('/jobs', {
    body: {
      appKey: textToImageTarget.key,
      inputAssetIds: [],
      name: '另一应用会话任务',
      parameters: {},
      projectId,
      workspaceInstanceId: alternateTextWorkspace.envelope.data.id,
    },
    session: user1,
  });
  await sql`
    UPDATE jobs
    SET status = 'cancelled', stage = '互斥验收完成', completed_at = now()
    WHERE id IN ${sql([
      activeWorkspaceJobId,
      parallelWorkspaceJob.envelope.data.id,
    ])}
  `;

  const savedWorkspaceDraft = await apiRequest<{
    inputAssetIds: Record<string, string>;
    parameterValues: Record<string, unknown>;
  }>('/workflow-drafts', {
    body: {
      appKey: flowTarget.key,
      inputAssetIds: { 0: prepared.envelope.data.asset.id },
      parameterValues: { prompt: '保持当前工作区输入并继续编辑' },
      projectId,
      workspaceInstanceId: flowWorkspace.envelope.data.id,
    },
    method: 'PUT',
    session: user1,
  });
  assert(
    savedWorkspaceDraft.envelope.data.inputAssetIds['0'] ===
      prepared.envelope.data.asset.id,
    '工作区草稿没有保存图片输入位',
  );
  const restoredWorkspaceDraft = await apiRequest<{
    inputAssetIds: Record<string, string>;
    parameterValues: Record<string, unknown>;
  }>(
    `/workflow-drafts?projectId=${projectId}&appKey=${flowTarget.key}&workspaceInstanceId=${flowWorkspace.envelope.data.id}`,
    { session: user1 },
  );
  assert(
    restoredWorkspaceDraft.envelope.data.inputAssetIds['0'] ===
      prepared.envelope.data.asset.id &&
      restoredWorkspaceDraft.envelope.data.parameterValues.prompt ===
        '保持当前工作区输入并继续编辑',
    '重新进入应用后没有恢复工作区图片和参数',
  );
  await apiRequest(
    `/workflow-drafts?projectId=${projectId}&appKey=${flowTarget.key}&workspaceInstanceId=${flowWorkspace.envelope.data.id}`,
    { expectedStatus: 404, session: user2 },
  );

  const stagedJobId = randomUUID();
  const stagedAssetId = randomUUID();
  const stagedVersionId = randomUUID();
  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO jobs (
        id, project_id, app_key, name, parameters, created_by,
        status, progress, stage, started_at, completed_at,
        workspace_instance_id
      ) VALUES (
        ${stagedJobId}, ${projectId}, ${visibilityTarget.key},
        ${`工作流暂存验收 ${runId}`}, '{}'::jsonb, ${user1.id},
        'succeeded', 100, '执行完成', now(), now(),
        ${stagingWorkspace.envelope.data.id}
      )
    `;
    await transaction`
      INSERT INTO assets (
        id, project_id, name, description, kind, source, source_app_key,
        source_job_id, owner_id, status, saved_at
      ) VALUES (
        ${stagedAssetId}, ${projectId}, '待确认工作流结果', ${runId},
        'image', 'workflow', ${visibilityTarget.key}, ${stagedJobId},
        ${user1.id}, 'available', NULL
      )
    `;
    await transaction`
      INSERT INTO asset_versions (
        id, asset_id, version, storage_kind, text_content,
        original_filename, mime_type, size_bytes, status, created_by,
        completed_at
      ) VALUES (
        ${stagedVersionId}, ${stagedAssetId}, 1, 'inline',
        '暂存工作流输出', 'workflow-output.png', 'image/png', 24,
        'available', ${user1.id}, now()
      )
    `;
    await transaction`
      INSERT INTO job_outputs (job_id, asset_id, position)
      VALUES (${stagedJobId}, ${stagedAssetId}, 0)
    `;
  });
  const assetsBeforeSave = await apiRequest<Array<{ id: string }>>(
    `/assets?projectId=${projectId}`,
    { session: user1 },
  );
  assert(
    !assetsBeforeSave.envelope.data.some((asset) => asset.id === stagedAssetId),
    '未确认的工作流结果提前出现在资产中心',
  );
  const jobsWithStagedOutput = await apiRequest<
    Array<{
      id: string;
      outputs: Array<{ assetId: string; saved: boolean }>;
    }>
  >(`/jobs?projectId=${projectId}`, { session: user1 });
  assert(
    jobsWithStagedOutput.envelope.data
      .find((job) => job.id === stagedJobId)
      ?.outputs.some(
        (output) => output.assetId === stagedAssetId && !output.saved,
      ),
    '任务接口没有返回可流转的暂存结果',
  );
  const rejectedTransfer = await apiRequest<unknown>('/workflow-transfers', {
    body: {
      assetId: stagedAssetId,
      targetAppKey: flowTarget.key,
      targetAssetIndex: 0,
      targetInstanceId: flowWorkspace.envelope.data.id,
    },
    expectedStatus: 409,
    session: user1,
  });
  assert(
    rejectedTransfer.envelope.code === 'WORKFLOW_OUTPUT_NOT_SAVED',
    '未加入资产的工作流结果没有被后端阻止流转',
  );
  const rejectedJobInput = await apiRequest<unknown>('/jobs', {
    body: {
      appKey: flowTarget.key,
      inputAssetIds: [stagedAssetId],
      name: '未登记结果越权复用验收',
      parameters: {},
      projectId,
      workspaceInstanceId: flowWorkspace.envelope.data.id,
    },
    expectedStatus: 400,
    session: user1,
  });
  assert(
    rejectedJobInput.envelope.code === 'INVALID_JOB_ASSETS',
    '未加入资产的工作流结果被任务接口当作正式输入使用',
  );
  await apiRequest(`/assets/${stagedAssetId}/save`, {
    method: 'POST',
    session: user1,
  });
  const assetsAfterSave = await apiRequest<Array<{ id: string }>>(
    `/assets?projectId=${projectId}`,
    { session: user1 },
  );
  assert(
    assetsAfterSave.envelope.data.some((asset) => asset.id === stagedAssetId),
    '用户确认后工作流结果没有进入资产中心',
  );
  const exactSlotTransfer = await apiRequest<{
    id: string;
    targetAssetIndex: number;
  }>('/workflow-transfers', {
    body: {
      assetId: stagedAssetId,
      targetAppKey: multiFlowTarget.key,
      targetAssetIndex: 2,
      targetInstanceId: multiFlowWorkspace.envelope.data.id,
    },
    session: user1,
  });
  assert(
    exactSlotTransfer.envelope.data.targetAssetIndex === 2,
    '多图工作流没有保留用户指定的第三个输入位',
  );
  const multiPendingTransfers = await apiRequest<
    Array<{ id: string; targetAssetIndex: number }>
  >(
    `/workflow-transfers?projectId=${projectId}&targetAppKey=${multiFlowTarget.key}&targetInstanceId=${multiFlowWorkspace.envelope.data.id}`,
    { session: user1 },
  );
  assert(
    multiPendingTransfers.envelope.data.some(
      (item) =>
        item.id === exactSlotTransfer.envelope.data.id &&
        item.targetAssetIndex === 2,
    ),
    '刷新多图工作流后没有恢复第三个输入位的流转资产',
  );
  await apiRequest(
    `/workflow-transfers/${exactSlotTransfer.envelope.data.id}`,
    { method: 'DELETE', session: user1 },
  );
  const transfer = await apiRequest<{
    id: string;
    targetAppKey: string;
    targetAssetIndex: number;
  }>('/workflow-transfers', {
    body: {
      assetId: stagedAssetId,
      targetAppKey: flowTarget.key,
      targetAssetIndex: 0,
      targetInstanceId: flowWorkspace.envelope.data.id,
    },
    session: user1,
  });
  assert(
    transfer.envelope.data.targetAssetIndex === 0,
    '资产没有流转到目标工作流的第一个兼容空输入位',
  );
  const pendingTransfers = await apiRequest<Array<{ id: string }>>(
    `/workflow-transfers?projectId=${projectId}&targetAppKey=${flowTarget.key}&targetInstanceId=${flowWorkspace.envelope.data.id}`,
    { session: user1 },
  );
  assert(
    pendingTransfers.envelope.data.some(
      (item) => item.id === transfer.envelope.data.id,
    ),
    '刷新目标工作区时无法读取持久化流转记录',
  );
  await apiRequest(
    `/workflow-transfers?projectId=${projectId}&targetAppKey=${flowTarget.key}&targetInstanceId=${flowWorkspace.envelope.data.id}`,
    { expectedStatus: 404, session: user2 },
  );
  const consumedJob = await apiRequest<{ id: string }>('/jobs', {
    body: {
      appKey: flowTarget.key,
      inputAssetIds: [stagedAssetId],
      inputTransferIds: [transfer.envelope.data.id],
      name: '持久化流转消费验收',
      parameters: { prompt: '保留本轮输入快照并生成新方案' },
      projectId,
      workspaceInstanceId: flowWorkspace.envelope.data.id,
    },
    session: user1,
  });
  const jobsWithConversationSnapshot = await apiRequest<
    Array<{
      createdBy: string;
      id: string;
      inputs: Array<{ assetId: string; position: number }>;
      ownedByCurrentUser: boolean;
      parameters: Record<string, unknown>;
    }>
  >(`/jobs?projectId=${projectId}`, { session: user1 });
  const conversationRound = jobsWithConversationSnapshot.envelope.data.find(
    (job) => job.id === consumedJob.envelope.data.id,
  );
  assert(
    conversationRound?.ownedByCurrentUser &&
      conversationRound.createdBy === user1.id &&
      conversationRound.parameters.prompt === '保留本轮输入快照并生成新方案' &&
      conversationRound.inputs[0]?.assetId === stagedAssetId &&
      conversationRound.inputs[0]?.position === 0,
    '任务接口没有完整恢复当前用户的参数和有序输入快照',
  );
  const transfersAfterJob = await apiRequest<Array<{ id: string }>>(
    `/workflow-transfers?projectId=${projectId}&targetAppKey=${flowTarget.key}&targetInstanceId=${flowWorkspace.envelope.data.id}`,
    { session: user1 },
  );
  assert(
    !transfersAfterJob.envelope.data.some(
      (item) => item.id === transfer.envelope.data.id,
    ),
    '任务提交后流转记录仍重复占用目标输入位',
  );
  await apiRequest(`/assets/${stagedAssetId}`, {
    method: 'DELETE',
    session: user1,
  });
  await apiRequest(`/assets/${stagedAssetId}/preview`, {
    expectedStatus: 404,
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
