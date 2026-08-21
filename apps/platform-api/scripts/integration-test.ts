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
const disposableProjectIds: string[] = [];
let conversationId: null | string = null;
let visibilityTestApplication: null | { key: string; visible: boolean } = null;
const notificationIds: string[] = [];
const testUserIds: string[] = [];

const avatarPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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

async function apiMultipartRequest<T>(
  path: string,
  file: { bytes: Uint8Array; filename: string; mimeType: string },
  session: Session,
  expectedStatus = 200,
) {
  const requestId = `${runId}-${++requestSequence}`;
  requestIds.push(requestId);
  const headers = new Headers({
    Accept: 'application/json',
    Authorization: `Bearer ${session.token}`,
    'X-Request-ID': requestId,
  });
  if (session.cookie) headers.set('Cookie', session.cookie);
  const formData = new FormData();
  const blobBytes = new Uint8Array(file.bytes.byteLength);
  blobBytes.set(file.bytes);
  formData.append(
    'file',
    new Blob([blobBytes.buffer], { type: file.mimeType }),
    file.filename,
  );
  const response = await fetch(`${apiUrl}${path}`, {
    body: formData,
    headers,
    method: 'POST',
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  assert(
    response.status === expectedStatus,
    `POST ${path} 预期 ${expectedStatus}，实际 ${response.status}：${envelope.message}`,
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
  if (disposableProjectIds.length > 0) {
    await sql`DELETE FROM projects WHERE id = ANY(${disposableProjectIds})`;
  }
  if (notificationIds.length > 0) {
    await sql`DELETE FROM notifications WHERE id = ANY(${notificationIds})`;
  }
  if (requestIds.length > 0) {
    await sql`DELETE FROM audit_events WHERE request_id = ANY(${requestIds})`;
  }
  if (testUserIds.length > 0) {
    const avatars = await sql<{ objectKey: string }[]>`
      SELECT avatar_object_key AS "objectKey"
      FROM users
      WHERE id = ANY(${testUserIds}) AND avatar_object_key IS NOT NULL
    `;
    for (const avatar of avatars) {
      await deleteObject(avatar.objectKey).catch((error) => {
        console.warn(`清理测试头像 ${avatar.objectKey} 失败`, error);
      });
    }
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
  const account4 = await createTestAccount('user', 4);
  const user1 = await login(account1.username, account1.password);
  const sql = useDatabase();
  const user2 = await login(account2.username, account2.password);
  const admin = await login(adminAccount.username, adminAccount.password);
  const user4 = await login(account4.username, account4.password);

  const invalidAvatar = await apiMultipartRequest(
    '/user/avatar',
    {
      bytes: new TextEncoder().encode('not-an-image'),
      filename: 'avatar.png',
      mimeType: 'image/png',
    },
    user1,
    400,
  );
  assert(
    invalidAvatar.envelope.code === 'AVATAR_TYPE_INVALID',
    '伪造图片签名的头像没有被拒绝',
  );
  const uploadedAvatar = await apiMultipartRequest<{
    avatar: string;
    mimeType: string;
    sizeBytes: number;
  }>(
    '/user/avatar',
    { bytes: avatarPng, filename: 'avatar.png', mimeType: 'image/png' },
    user1,
  );
  assert(
    uploadedAvatar.envelope.data.mimeType === 'image/png' &&
      uploadedAvatar.envelope.data.sizeBytes === avatarPng.byteLength,
    '头像上传没有返回真实文件元数据',
  );
  const nonSquareAvatar = new Uint8Array(avatarPng);
  nonSquareAvatar[19] = 2;
  const rejectedNonSquareAvatar = await apiMultipartRequest(
    '/user/avatar',
    {
      bytes: nonSquareAvatar,
      filename: 'avatar-wide.png',
      mimeType: 'image/png',
    },
    user1,
    400,
  );
  assert(
    rejectedNonSquareAvatar.envelope.code === 'AVATAR_MUST_BE_SQUARE',
    '服务端没有拒绝绕过裁剪提交的非方形头像',
  );
  const avatarInfo = await apiRequest<{ avatar: string }>('/user/info', {
    session: user1,
  });
  assert(
    avatarInfo.envelope.data.avatar !== '/rail-logo.svg',
    '上传头像后用户信息仍返回默认头像',
  );
  const avatarPreview = await fetch(avatarInfo.envelope.data.avatar);
  assert(
    avatarPreview.ok &&
      Buffer.from(await avatarPreview.arrayBuffer()).equals(avatarPng),
    '用户信息返回的头像地址不能读取真实对象内容',
  );

  const projectName = `自动化验收 ${runId.slice(-8)}`;
  const project = await apiRequest<{ code: string; id: string; name: string }>(
    '/projects',
    {
      body: { description: runId, name: projectName, stage: 'concept' },
      session: user1,
    },
  );
  projectId = project.envelope.data.id;
  assert(
    /^CR-\d{4}-\d{4}$/.test(project.envelope.data.code),
    '项目业务 ID 格式不正确',
  );
  const renamedProjectName = `${projectName}（已重命名）`;
  const updatedProjectDescription = `${runId} 项目说明已更新`;
  await apiRequest(`/projects/${projectId}`, {
    body: { description: updatedProjectDescription, name: renamedProjectName },
    method: 'PATCH',
    session: user1,
  });
  await apiRequest(`/projects/${projectId}/pin`, {
    body: { pinned: true },
    method: 'PATCH',
    session: user1,
  });
  const pinnedProjects = await apiRequest<{
    items: Array<{
      activeJobCount: number;
      canDelete: boolean;
      description: string;
      id: string;
      isPinned: boolean;
      jobCount: number;
      name: string;
    }>;
  }>('/projects', { session: user1 });
  const pinnedProject = pinnedProjects.envelope.data.items.find(
    (item) => item.id === projectId,
  );
  assert(
    pinnedProject?.isPinned &&
      pinnedProject.canDelete &&
      pinnedProject.name === renamedProjectName &&
      pinnedProject.description === updatedProjectDescription,
    '项目信息修改或用户级置顶没有持久化',
  );
  const sortProjectA = await apiRequest<{ id: string }>('/projects', {
    body: {
      description: '项目排序验收 A',
      name: `A-${runId.slice(-8)}`,
      stage: 'concept',
    },
    session: user1,
  });
  const sortProjectZ = await apiRequest<{ id: string }>('/projects', {
    body: {
      description: '项目排序验收 Z',
      name: `Z-${runId.slice(-8)}`,
      stage: 'concept',
    },
    session: user1,
  });
  disposableProjectIds.push(
    sortProjectA.envelope.data.id,
    sortProjectZ.envelope.data.id,
  );
  const projectsByNameAsc = await apiRequest<{
    items: Array<{ id: string }>;
  }>('/projects?sortBy=name&sortOrder=asc', { session: user1 });
  const projectsByNameDesc = await apiRequest<{
    items: Array<{ id: string }>;
  }>('/projects?sortBy=name&sortOrder=desc', { session: user1 });
  assert(
    projectsByNameAsc.envelope.data.items.findIndex(
      (item) => item.id === sortProjectA.envelope.data.id,
    ) <
      projectsByNameAsc.envelope.data.items.findIndex(
        (item) => item.id === sortProjectZ.envelope.data.id,
      ) &&
      projectsByNameDesc.envelope.data.items.findIndex(
        (item) => item.id === sortProjectA.envelope.data.id,
      ) >
        projectsByNameDesc.envelope.data.items.findIndex(
          (item) => item.id === sortProjectZ.envelope.data.id,
        ),
    '项目名称正反序没有由服务端正确执行',
  );
  await apiRequest('/projects?sortBy=createdAt&sortOrder=asc', {
    session: user1,
  });
  await apiRequest('/projects?sortBy=updatedAt&sortOrder=desc', {
    session: user1,
  });
  await apiRequest(`/projects/${projectId}`, {
    body: { name: '越权项目重命名' },
    expectedStatus: 404,
    method: 'PATCH',
    session: user2,
  });

  const adminDeletedProject = await apiRequest<{ id: string }>('/projects', {
    body: {
      description: '用于验证管理员删除其他用户创建的项目',
      name: `管理员删除验收 ${runId.slice(-8)}`,
      stage: 'concept',
    },
    session: user1,
  });
  disposableProjectIds.push(adminDeletedProject.envelope.data.id);
  await sql`
    INSERT INTO project_members (project_id, user_id, project_role)
    VALUES (${adminDeletedProject.envelope.data.id}, ${user2.id}, 'editor')
  `;
  await apiRequest(`/projects/${adminDeletedProject.envelope.data.id}`, {
    expectedStatus: 403,
    method: 'DELETE',
    session: user2,
  });
  await apiRequest(`/projects/${adminDeletedProject.envelope.data.id}`, {
    method: 'DELETE',
    session: admin,
  });
  const [adminArchivedProject] = await sql<
    { archivedBy: string; id: string }[]
  >`
    SELECT id, archived_by AS "archivedBy"
    FROM projects
    WHERE id = ${adminDeletedProject.envelope.data.id}
  `;
  assert(
    adminArchivedProject?.archivedBy === admin.id,
    '管理员删除项目没有记录归档操作者',
  );

  const ownerDeletedProject = await apiRequest<{ id: string }>('/projects', {
    body: {
      description: '用于验证普通用户删除自己创建的项目',
      name: `创建者删除验收 ${runId.slice(-8)}`,
      stage: 'concept',
    },
    session: user1,
  });
  disposableProjectIds.push(ownerDeletedProject.envelope.data.id);
  await apiRequest(`/projects/${ownerDeletedProject.envelope.data.id}`, {
    method: 'DELETE',
    session: user1,
  });
  const ownerProjectsAfterDelete = await apiRequest<{
    items: Array<{ id: string }>;
  }>('/projects', { session: user1 });
  assert(
    !ownerProjectsAfterDelete.envelope.data.items.some(
      (item) => item.id === ownerDeletedProject.envelope.data.id,
    ),
    '普通用户删除自己创建的项目后，项目仍显示在项目空间',
  );

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

  const textAsset = await apiRequest<{ id: string; publicId: string }>(
    '/assets/text',
    {
      body: {
        content: '集成测试文本资产',
        description: runId,
        mimeType: 'text/plain',
        name: '验收文本',
        projectId,
        tags: ['integration-test'],
      },
      session: user1,
    },
  );
  assert(
    /^AST-\d{8}$/.test(textAsset.envelope.data.publicId),
    '资产业务 ID 格式不正确',
  );
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

  const image = avatarPng;
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
  const favoriteImage = await apiRequest<{
    favorite: boolean;
    folderId?: string;
  }>(`/assets/${prepared.envelope.data.asset.id}/favorite`, {
    body: { favorite: true },
    method: 'PATCH',
    session: user1,
  });
  assert(
    favoriteImage.envelope.data.favorite &&
      favoriteImage.envelope.data.folderId === undefined,
    '收藏资产改变了原始目录归属',
  );
  const favoriteFolders = await apiRequest<
    Array<{
      assetCount: number;
      id: string;
      kind: 'favorites' | 'normal';
      name: string;
    }>
  >(`/asset-folders?projectId=${projectId}`, { session: user1 });
  const matchingFavoriteFolders = favoriteFolders.envelope.data.filter(
    (folder) => folder.name === '收藏',
  );
  assert(
    matchingFavoriteFolders.length === 1 &&
      matchingFavoriteFolders[0]?.kind === 'favorites' &&
      matchingFavoriteFolders[0]?.assetCount === 1,
    '首次收藏没有幂等创建根级“收藏”软链接文件夹',
  );
  const favoriteFolderId = matchingFavoriteFolders[0]?.id;
  assert(favoriteFolderId, '收藏文件夹缺少稳定编号');
  const rootAssetsAfterFavorite = await apiRequest<
    Array<{ favorite: boolean; folderId?: string; id: string }>
  >(`/assets?projectId=${projectId}&folderId=root`, { session: user1 });
  assert(
    rootAssetsAfterFavorite.envelope.data.some(
      (asset) =>
        asset.id === prepared.envelope.data.asset.id &&
        asset.favorite &&
        asset.folderId === undefined,
    ),
    '收藏后原资产没有保留在根目录',
  );
  await apiRequest(`/assets/${prepared.envelope.data.asset.id}/favorite`, {
    body: { favorite: true },
    method: 'PATCH',
    session: user1,
  });
  const foldersAfterRepeatedFavorite = await apiRequest<
    Array<{ id: string; name: string }>
  >(`/asset-folders?projectId=${projectId}`, { session: user1 });
  assert(
    foldersAfterRepeatedFavorite.envelope.data.filter(
      (folder) => folder.name === '收藏',
    ).length === 1,
    '重复收藏创建了多个“收藏”文件夹',
  );
  const favoriteFolderAssets = await apiRequest<
    Array<{ favorite: boolean; id: string }>
  >(`/assets?projectId=${projectId}&folderId=${favoriteFolderId}`, {
    session: user1,
  });
  assert(
    favoriteFolderAssets.envelope.data.some(
      (asset) => asset.id === prepared.envelope.data.asset.id && asset.favorite,
    ),
    '收藏文件夹没有返回已收藏的目标资产',
  );
  const unfavoriteImage = await apiRequest<{
    favorite: boolean;
    folderId?: string;
  }>(`/assets/${prepared.envelope.data.asset.id}/favorite`, {
    body: { favorite: false },
    method: 'PATCH',
    session: user1,
  });
  assert(
    !unfavoriteImage.envelope.data.favorite &&
      unfavoriteImage.envelope.data.folderId === undefined,
    '取消收藏改变了原资产所在文件夹',
  );
  const emptyFavoriteFolder = await apiRequest<Array<{ id: string }>>(
    `/assets?projectId=${projectId}&folderId=${favoriteFolderId}`,
    { session: user1 },
  );
  assert(
    emptyFavoriteFolder.envelope.data.length === 0,
    '取消收藏后收藏文件夹仍保留软链接',
  );
  await apiRequest(`/assets/${prepared.envelope.data.asset.id}/favorite`, {
    body: { favorite: true },
    expectedStatus: 404,
    method: 'PATCH',
    session: user2,
  });
  const rootFolder = await apiRequest<{
    id: string;
    name: string;
    parentId: null | string;
  }>('/asset-folders', {
    body: { name: `方案资料-${runId.slice(-6)}`, projectId },
    session: user1,
  });
  const childFolder = await apiRequest<{ id: string }>('/asset-folders', {
    body: {
      name: '效果图',
      parentId: rootFolder.envelope.data.id,
      projectId,
    },
    session: user1,
  });
  await apiRequest(`/asset-folders/${childFolder.envelope.data.id}`, {
    body: { name: '效果图归档' },
    method: 'PATCH',
    session: user1,
  });
  await apiRequest('/assets/batch', {
    body: {
      assetIds: [prepared.envelope.data.asset.id],
      operation: 'copy',
      projectId,
      targetFolderId: childFolder.envelope.data.id,
    },
    session: user1,
  });
  const childAssets = await apiRequest<
    Array<{ folderId?: string; id: string; name: string }>
  >(`/assets?projectId=${projectId}&folderId=${childFolder.envelope.data.id}`, {
    session: user1,
  });
  const copiedImage = childAssets.envelope.data.find(
    (asset) => asset.name === '验收图片 - 副本',
  );
  assert(
    copiedImage?.folderId === childFolder.envelope.data.id,
    '批量复制没有在目标文件夹创建独立资产',
  );
  const copiedPreview = await apiRequest<{ mode: string; url: string }>(
    `/assets/${copiedImage?.id}/preview`,
    { session: user1 },
  );
  const copiedObject = await fetch(copiedPreview.envelope.data.url);
  assert(
    copiedObject.ok &&
      Buffer.from(await copiedObject.arrayBuffer()).equals(image),
    '复制后的对象资产内容与原资产不一致',
  );
  await apiRequest('/assets/batch', {
    body: {
      assetIds: [copiedImage?.id],
      operation: 'move',
      projectId,
      targetFolderId: rootFolder.envelope.data.id,
    },
    session: user1,
  });
  const movedAssets = await apiRequest<Array<{ id: string }>>(
    `/assets?projectId=${projectId}&folderId=${rootFolder.envelope.data.id}`,
    { session: user1 },
  );
  assert(
    movedAssets.envelope.data.some((asset) => asset.id === copiedImage?.id),
    '批量移动没有更新资产文件夹',
  );
  await apiRequest(`/asset-folders/${rootFolder.envelope.data.id}`, {
    method: 'DELETE',
    session: user1,
  });
  await apiRequest(`/assets/${copiedImage?.id}/preview`, {
    expectedStatus: 404,
    session: user1,
  });
  const renamedTextName = `ZZZ-${runId}`;
  const renamedTextAsset = await apiRequest<{ id: string; name: string }>(
    `/assets/${textAsset.envelope.data.id}`,
    {
      body: { name: renamedTextName },
      method: 'PATCH',
      session: user1,
    },
  );
  assert(
    renamedTextAsset.envelope.data.name === renamedTextName,
    '资产详情修改名称后没有返回持久化结果',
  );
  const linkedAssetDetail = await apiRequest<{
    id: string;
    name: string;
    projectId: string;
  }>(`/assets/${textAsset.envelope.data.id}`, { session: user1 });
  assert(
    linkedAssetDetail.envelope.data.id === textAsset.envelope.data.id &&
      linkedAssetDetail.envelope.data.name === renamedTextName &&
      linkedAssetDetail.envelope.data.projectId === projectId,
    '资产详情深链没有返回目标资产的持久化信息',
  );
  await apiRequest(`/assets/${textAsset.envelope.data.id}`, {
    expectedStatus: 404,
    session: user2,
  });
  await apiRequest(`/assets/${textAsset.envelope.data.id}`, {
    body: { name: '越权重命名' },
    expectedStatus: 404,
    method: 'PATCH',
    session: user2,
  });
  const alphabeticTextAsset = await apiRequest<{ id: string }>('/assets/text', {
    body: {
      content: '用于资产名称排序验收',
      description: runId,
      mimeType: 'text/plain',
      name: `AAA-${runId}`,
      projectId,
      tags: ['integration-test', 'sort'],
    },
    session: user1,
  });
  const assetsByNameAsc = await apiRequest<Array<{ id: string; name: string }>>(
    `/assets?projectId=${projectId}&sortBy=name&sortOrder=asc`,
    {
      session: user1,
    },
  );
  const sortedTextIds = assetsByNameAsc.envelope.data
    .filter((asset) =>
      [
        alphabeticTextAsset.envelope.data.id,
        textAsset.envelope.data.id,
      ].includes(asset.id),
    )
    .map((asset) => asset.id);
  assert(
    sortedTextIds[0] === alphabeticTextAsset.envelope.data.id &&
      sortedTextIds[1] === textAsset.envelope.data.id,
    '资产名称正序没有由服务端稳定执行',
  );
  const assetsByNameDesc = await apiRequest<Array<{ id: string }>>(
    `/assets?projectId=${projectId}&sortBy=name&sortOrder=desc`,
    { session: user1 },
  );
  const reverseSortedTextIds = assetsByNameDesc.envelope.data
    .filter((asset) => sortedTextIds.includes(asset.id))
    .map((asset) => asset.id);
  assert(
    reverseSortedTextIds[0] === textAsset.envelope.data.id &&
      reverseSortedTextIds[1] === alphabeticTextAsset.envelope.data.id,
    '资产名称倒序没有由服务端稳定执行',
  );
  const assetsByType = await apiRequest<Array<{ id: string; type: string }>>(
    `/assets?projectId=${projectId}&sortBy=type&sortOrder=asc`,
    { session: user1 },
  );
  const typeOrder = assetsByType.envelope.data
    .filter((asset) =>
      [prepared.envelope.data.asset.id, textAsset.envelope.data.id].includes(
        asset.id,
      ),
    )
    .map((asset) => asset.type);
  assert(
    typeOrder.join(',') === 'image,text',
    `资产类型排序错误：${typeOrder.join(',')}`,
  );
  const assetsByCreatedAt = await apiRequest<Array<{ createdAt: string }>>(
    `/assets?projectId=${projectId}&sortBy=createdAt&sortOrder=desc`,
    { session: user1 },
  );
  assert(
    assetsByCreatedAt.envelope.data.every(
      (asset, index, items) =>
        index === 0 ||
        Date.parse(items[index - 1]?.createdAt ?? '') >=
          Date.parse(asset.createdAt),
    ),
    '资产创建时间倒序不正确',
  );
  const modelBytes = Buffer.from('glTF-integration-preview');
  const preparedModel = await apiRequest<{
    asset: { id: string };
    upload: { headers: Record<string, string>; method: string; url: string };
  }>('/assets/uploads', {
    body: {
      description: runId,
      filename: 'integration.glb',
      kind: 'model3d',
      mimeType: 'model/gltf-binary',
      name: '集成验收三维模型',
      projectId,
      sizeBytes: modelBytes.byteLength,
      tags: ['integration-test', 'model3d'],
    },
    session: user1,
  });
  const modelUpload = await fetch(preparedModel.envelope.data.upload.url, {
    body: modelBytes,
    headers: preparedModel.envelope.data.upload.headers,
    method: preparedModel.envelope.data.upload.method,
  });
  assert(modelUpload.ok, `3D 模型对象上传失败：${modelUpload.status}`);
  await apiRequest(`/assets/${preparedModel.envelope.data.asset.id}/complete`, {
    method: 'POST',
    session: user1,
  });
  const modelPreview = await apiRequest<{
    mimeType: string;
    mode: string;
    url: string;
  }>(`/assets/${preparedModel.envelope.data.asset.id}/preview`, {
    session: user1,
  });
  const modelPreviewObject = await fetch(modelPreview.envelope.data.url);
  assert(
    modelPreview.envelope.data.mode === 'url' &&
      modelPreview.envelope.data.mimeType === 'model/gltf-binary' &&
      modelPreviewObject.ok &&
      Buffer.from(await modelPreviewObject.arrayBuffer()).equals(modelBytes),
    '3D 模型没有返回可供网页查看器加载的真实对象地址',
  );
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

  const automaticTitleConversation = await apiRequest<{
    id: string;
    title: string;
  }>('/design-conversations', {
    body: { projectId },
    session: user1,
  });
  const automaticTitleJob = await apiRequest<{ id: string }>('/jobs', {
    body: {
      appKey: textToImageTarget.key,
      designConversationId: automaticTitleConversation.envelope.data.id,
      inputAssetIds: [],
      name: '自动会话标题验收',
      parameters: {
        prompt: '设计现代轨道客室空间并优化照明与耐用材质并提升乘客体验',
      },
      projectId,
    },
    session: user1,
  });
  const automaticallyTitled = await apiRequest<
    Array<{ id: string; title: string }>
  >(`/design-conversations?projectId=${projectId}`, { session: user1 });
  assert(
    automaticallyTitled.envelope.data.find(
      (item) => item.id === automaticTitleConversation.envelope.data.id,
    )?.title === '设计现代轨道客室空间并优化照明与耐用材…',
    '新设计会话没有使用首次文本生成简短名称',
  );
  await sql`
    UPDATE jobs
    SET status = 'cancelled', stage = '自动标题验收完成', completed_at = now()
    WHERE id = ${automaticTitleJob.envelope.data.id}
  `;
  await apiRequest(
    `/design-conversations/${automaticTitleConversation.envelope.data.id}`,
    {
      body: { projectId, title: '用户手动命名的设计会话' },
      method: 'PATCH',
      session: user1,
    },
  );
  const manualTitleJob = await apiRequest<{ id: string }>('/jobs', {
    body: {
      appKey: textToImageTarget.key,
      designConversationId: automaticTitleConversation.envelope.data.id,
      inputAssetIds: [],
      name: '手动会话标题保护验收',
      parameters: { prompt: '这段新文本不能覆盖用户手动设置的会话名称' },
      projectId,
    },
    session: user1,
  });
  const manuallyTitled = await apiRequest<Array<{ id: string; title: string }>>(
    `/design-conversations?projectId=${projectId}`,
    { session: user1 },
  );
  assert(
    manuallyTitled.envelope.data.find(
      (item) => item.id === automaticTitleConversation.envelope.data.id,
    )?.title === '用户手动命名的设计会话',
    '后续任务覆盖了用户手动设置的会话名称',
  );
  await sql`
    UPDATE jobs
    SET status = 'cancelled', stage = '手动标题保护验收完成', completed_at = now()
    WHERE id = ${manualTitleJob.envelope.data.id}
  `;

  const designConversation = await apiRequest<{ id: string; title: string }>(
    '/design-conversations',
    {
      body: { projectId, title: '统一设计会话验收' },
      session: user1,
    },
  );
  const parallelDesignConversation = await apiRequest<{ id: string }>(
    '/design-conversations',
    { body: { projectId, title: '并行设计会话验收' }, session: user1 },
  );
  const listedDesignConversations = await apiRequest<
    Array<{ id: string; title: string }>
  >(`/design-conversations?projectId=${projectId}`, { session: user1 });
  assert(
    listedDesignConversations.envelope.data.some(
      (item) => item.id === designConversation.envelope.data.id,
    ),
    '新建设计会话没有出现在项目历史列表',
  );
  await apiRequest(`/design-conversations?projectId=${projectId}`, {
    expectedStatus: 404,
    session: user2,
  });
  await apiRequest(
    `/design-conversations/${designConversation.envelope.data.id}`,
    {
      body: { projectId, title: '重命名后的统一设计会话' },
      method: 'PATCH',
      session: user1,
    },
  );

  const activeDesignJobId = randomUUID();
  await sql`
    INSERT INTO jobs (
      id, project_id, app_key, name, parameters, created_by,
      status, progress, stage, design_conversation_id
    ) VALUES (
      ${activeDesignJobId}, ${projectId}, ${textToImageTarget.key},
      '设计会话互斥验收', '{}'::jsonb, ${user1.id},
      'queued', 0, '等待执行', ${designConversation.envelope.data.id}
    )
  `;
  const duplicateDesignJob = await apiRequest<unknown>('/jobs', {
    body: {
      appKey: textToImageTarget.key,
      designConversationId: designConversation.envelope.data.id,
      inputAssetIds: [],
      name: '同一设计会话重复任务',
      parameters: {},
      projectId,
    },
    expectedStatus: 409,
    session: user1,
  });
  assert(
    duplicateDesignJob.envelope.code === 'DESIGN_CONVERSATION_JOB_ACTIVE',
    '同一设计会话的第二个进行中任务没有被后端阻止',
  );
  const parallelDesignJob = await apiRequest<{ id: string; publicId: string }>(
    '/jobs',
    {
      body: {
        appKey: textToImageTarget.key,
        designConversationId: parallelDesignConversation.envelope.data.id,
        inputAssetIds: [],
        name: '不同设计会话并行任务',
        parameters: {},
        projectId,
      },
      session: user1,
    },
  );
  assert(
    /^TSK-\d{8}$/.test(parallelDesignJob.envelope.data.publicId),
    '任务业务 ID 格式不正确',
  );
  await apiRequest('/jobs/batch', {
    body: {
      jobIds: [activeDesignJobId],
      operation: 'archive',
      projectId,
    },
    expectedStatus: 409,
    session: user1,
  });
  await sql`
    UPDATE jobs
    SET status = 'cancelled', stage = '设计会话并发验收完成', completed_at = now()
    WHERE id IN ${sql([activeDesignJobId, parallelDesignJob.envelope.data.id])}
  `;

  const designDraftPath = `/design-conversations/${designConversation.envelope.data.id}/drafts/${flowTarget.key}`;
  await apiRequest(designDraftPath, {
    body: {
      inputAssetIds: { 0: prepared.envelope.data.asset.id },
      parameterValues: { prompt: '在同一设计会话中继续编辑' },
      projectId,
    },
    method: 'PUT',
    session: user1,
  });
  const restoredDesignDraft = await apiRequest<{
    inputAssetIds: Record<string, string>;
    parameterValues: Record<string, unknown>;
  }>(`${designDraftPath}?projectId=${projectId}`, { session: user1 });
  assert(
    restoredDesignDraft.envelope.data.inputAssetIds['0'] ===
      prepared.envelope.data.asset.id &&
      restoredDesignDraft.envelope.data.parameterValues.prompt ===
        '在同一设计会话中继续编辑',
    '设计会话没有按应用恢复输入资产与参数草稿',
  );
  const annotatedJob = await apiRequest<{
    id: string;
    inputs: Array<{ annotationAssetId?: string; assetId: string }>;
  }>('/jobs', {
    body: {
      appKey: flowTarget.key,
      designConversationId: designConversation.envelope.data.id,
      inputAnnotations: [
        { assetId: derivedPrepared.envelope.data.asset.id, position: 0 },
      ],
      inputAssetIds: [prepared.envelope.data.asset.id],
      name: '分区标记输入快照验收',
      parameters: { prompt: '保留原图输入并登记分区标记快照' },
      projectId,
    },
    session: user1,
  });
  assert(
    annotatedJob.envelope.data.inputs[0]?.assetId ===
      prepared.envelope.data.asset.id &&
      annotatedJob.envelope.data.inputs[0]?.annotationAssetId ===
        derivedPrepared.envelope.data.asset.id,
    '任务创建响应没有区分原始输入与分区标记快照',
  );
  const jobsWithAnnotation = await apiRequest<
    Array<{
      id: string;
      inputs: Array<{ annotationAssetId?: string; assetId: string }>;
    }>
  >(`/jobs?projectId=${projectId}`, { session: user1 });
  const restoredAnnotationJob = jobsWithAnnotation.envelope.data.find(
    (job) => job.id === annotatedJob.envelope.data.id,
  );
  assert(
    restoredAnnotationJob?.inputs[0]?.assetId ===
      prepared.envelope.data.asset.id &&
      restoredAnnotationJob.inputs[0].annotationAssetId ===
        derivedPrepared.envelope.data.asset.id,
    '任务历史没有恢复分区标记图与原图的关联',
  );
  await sql`
    UPDATE jobs
    SET status = 'cancelled', stage = '分区标记快照验收完成', completed_at = now()
    WHERE id = ${annotatedJob.envelope.data.id}
  `;
  const rejectedAnnotation = await apiRequest<unknown>('/jobs', {
    body: {
      appKey: flowTarget.key,
      designConversationId: designConversation.envelope.data.id,
      inputAnnotations: [
        { assetId: derivedPrepared.envelope.data.asset.id, position: 1 },
      ],
      inputAssetIds: [prepared.envelope.data.asset.id],
      name: '错位分区标记输入验收',
      parameters: { prompt: '不能把标记图关联到不存在的输入位' },
      projectId,
    },
    expectedStatus: 400,
    session: user1,
  });
  assert(
    rejectedAnnotation.envelope.code === 'INVALID_JOB_ANNOTATIONS',
    '任务接口接受了与原始输入位置不匹配的分区标记图',
  );
  const jobsBeforeArchive = await sql<{ count: number }[]>`
    SELECT count(*)::integer AS count
    FROM jobs
    WHERE design_conversation_id = ${parallelDesignConversation.envelope.data.id}
  `;
  await apiRequest(
    `/design-conversations/${parallelDesignConversation.envelope.data.id}?projectId=${projectId}`,
    { method: 'DELETE', session: user1 },
  );
  const jobsAfterArchive = await sql<{ count: number }[]>`
    SELECT count(*)::integer AS count
    FROM jobs
    WHERE design_conversation_id = ${parallelDesignConversation.envelope.data.id}
  `;
  assert(
    jobsBeforeArchive[0]?.count === jobsAfterArchive[0]?.count,
    '软删除设计会话时任务台账被删除',
  );
  const conversationsAfterArchive = await apiRequest<Array<{ id: string }>>(
    `/design-conversations?projectId=${projectId}`,
    { session: user1 },
  );
  assert(
    !conversationsAfterArchive.envelope.data.some(
      (item) => item.id === parallelDesignConversation.envelope.data.id,
    ),
    '软删除后的设计会话仍显示在历史列表',
  );

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
  const stagedOutputFolder = await apiRequest<{ id: string }>(
    '/asset-folders',
    {
      body: { name: `工作流成果-${runId.slice(-6)}`, projectId },
      session: user1,
    },
  );
  await apiRequest(`/assets/${stagedAssetId}/save`, {
    body: { folderId: favoriteFolderId },
    expectedStatus: 400,
    method: 'POST',
    session: user1,
  });
  const savedStagedOutput = await apiRequest<{ folderId?: string }>(
    `/assets/${stagedAssetId}/save`,
    {
      body: { folderId: stagedOutputFolder.envelope.data.id },
      method: 'POST',
      session: user1,
    },
  );
  assert(
    savedStagedOutput.envelope.data.folderId ===
      stagedOutputFolder.envelope.data.id,
    '工作流结果没有保存到用户选择的资产文件夹',
  );
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

  const user2Info = await apiRequest<{ publicId: string }>('/user/info', {
    session: user2,
  });
  const user1Info = await apiRequest<{ publicId: string }>('/user/info', {
    session: user1,
  });
  const adminInfo = await apiRequest<{ publicId: string }>('/user/info', {
    session: admin,
  });
  const user4Info = await apiRequest<{ publicId: string }>('/user/info', {
    session: user4,
  });
  assert(
    /^USR-\d{6}$/.test(user2Info.envelope.data.publicId),
    '用户业务 ID 格式不正确',
  );
  await apiRequest(`/projects/${projectId}/members`, {
    body: {
      projectRole: 'editor',
      userPublicId: user2Info.envelope.data.publicId,
    },
    session: user1,
  });
  await apiRequest(`/projects/${projectId}/members`, {
    body: {
      projectRole: 'viewer',
      userPublicId: adminInfo.envelope.data.publicId,
    },
    expectedStatus: 403,
    session: user2,
  });
  const adminMemberList = await apiRequest<{ canInvite: boolean }>(
    `/projects/${projectId}/members`,
    { session: admin },
  );
  assert(
    adminMemberList.envelope.data.canInvite,
    '管理员在非本人创建的项目中没有获得邀请权限',
  );
  await apiRequest(`/projects/${projectId}/members`, {
    body: {
      projectRole: 'editor',
      userPublicId: user4Info.envelope.data.publicId,
    },
    session: admin,
  });
  const memberList = await apiRequest<{
    canInvite: boolean;
    items: Array<{ publicId: string; userId: string }>;
  }>(`/projects/${projectId}/members`, { session: user2 });
  assert(
    !memberList.envelope.data.canInvite &&
      memberList.envelope.data.items.some(
        (member) => member.publicId === user2Info.envelope.data.publicId,
      ) &&
      memberList.envelope.data.items.some(
        (member) => member.publicId === user4Info.envelope.data.publicId,
      ),
    '受邀成员列表或创建者/管理员邀请边界不正确',
  );
  const user2ProjectsAfterInvite = await apiRequest<{
    items: Array<{ id: string }>;
  }>('/projects', { session: user2 });
  assert(
    user2ProjectsAfterInvite.envelope.data.items.some(
      (item) => item.id === projectId,
    ),
    '通过用户 ID 邀请后，成员仍无法访问项目',
  );
  const user4ProjectsAfterInvite = await apiRequest<{
    items: Array<{ id: string }>;
  }>('/projects', { session: user4 });
  assert(
    user4ProjectsAfterInvite.envelope.data.items.some(
      (item) => item.id === projectId,
    ),
    '管理员通过用户 ID 邀请后，成员仍无法访问项目',
  );
  const user4Asset = await apiRequest<{ id: string }>('/assets/text', {
    body: {
      content: '成员移除后必须继续保留的项目资产。',
      description: '成员移除数据保留验收',
      mimeType: 'text/markdown',
      name: '成员贡献保留验收.md',
      projectId,
      tags: ['member-removal-retention'],
    },
    session: user4,
  });
  await apiRequest(
    `/projects/${projectId}/members/${user4Info.envelope.data.publicId}`,
    { expectedStatus: 403, method: 'DELETE', session: user2 },
  );
  await apiRequest(
    `/projects/${projectId}/members/${user1Info.envelope.data.publicId}`,
    { expectedStatus: 409, method: 'DELETE', session: user1 },
  );
  await apiRequest(
    `/projects/${projectId}/members/${user4Info.envelope.data.publicId}`,
    { method: 'DELETE', session: admin },
  );
  const user4ProjectsAfterRemoval = await apiRequest<{
    items: Array<{ id: string }>;
  }>('/projects', { session: user4 });
  assert(
    !user4ProjectsAfterRemoval.envelope.data.items.some(
      (item) => item.id === projectId,
    ),
    '成员被移除后仍可访问原项目',
  );
  await apiRequest(`/projects/${projectId}/members`, {
    expectedStatus: 404,
    session: user4,
  });
  const [retainedUser4Asset] = await sql<
    { ownerId: string; projectId: string }[]
  >`
    SELECT project_id AS "projectId", owner_id AS "ownerId"
    FROM assets WHERE id = ${user4Asset.envelope.data.id}
  `;
  assert(
    retainedUser4Asset?.projectId === projectId &&
      retainedUser4Asset.ownerId === user4.id,
    '移除成员错误删除或改写了该成员已有资产',
  );
  const memberListAfterRemoval = await apiRequest<{
    items: Array<{ publicId: string }>;
  }>(`/projects/${projectId}/members`, { session: user1 });
  assert(
    !memberListAfterRemoval.envelope.data.items.some(
      (member) => member.publicId === user4Info.envelope.data.publicId,
    ),
    '成员移除后仍出现在项目成员列表',
  );

  const secondaryDashboardAsset = await apiRequest<{ id: string }>(
    '/assets/text',
    {
      body: {
        content: '用于验证首页跨项目汇总的数据。',
        description: runId,
        mimeType: 'text/markdown',
        name: `跨项目首页统计-${runId}`,
        projectId: sortProjectA.envelope.data.id,
        tags: ['integration-test', 'dashboard'],
      },
      session: user1,
    },
  );
  assert(secondaryDashboardAsset.envelope.data.id, '跨项目统计资产创建失败');
  const [visibleDashboardAssetTotal] = await sql<{ count: number }[]>`
    SELECT count(*)::integer AS count
    FROM assets asset
    JOIN projects project ON project.id = asset.project_id
    WHERE asset.deleted_at IS NULL
      AND asset.saved_at IS NOT NULL
      AND project.archived_at IS NULL
      AND EXISTS (
        SELECT 1 FROM project_members member
        WHERE member.project_id = project.id AND member.user_id = ${user1.id}
      )
  `;

  const dashboard = await apiRequest<{
    assetTypes: Array<{ count: number; type: string }>;
    currentProject: null | { id: string; name: string };
    flow: {
      applicationCount: number;
      assetCount: number;
      conversationCount: number;
      resultCount: number;
    };
    jobTrend: Array<{ day: string }>;
    recentConversations: Array<{ id: string; projectId: string }>;
    recentProjects: Array<{
      assetTypes: Array<{ count: number; type: string }>;
      id: string;
    }>;
    summary: { projectCount: number };
  }>('/dashboard', { session: user1 });
  assert(
    dashboard.envelope.data.currentProject?.id === projectId,
    '设计工作台没有继承当前项目上下文',
  );
  assert(
    dashboard.envelope.data.summary.projectCount >= 1 &&
      dashboard.envelope.data.recentProjects.some(
        (item) => item.id === projectId,
      ),
    '设计工作台没有返回用户可访问项目',
  );
  assert(
    dashboard.envelope.data.flow.applicationCount > 0 &&
      dashboard.envelope.data.flow.assetCount > 0 &&
      dashboard.envelope.data.flow.conversationCount > 0,
    '设计工作台核心闭环统计不是来自真实项目数据',
  );
  assert(
    dashboard.envelope.data.flow.assetCount ===
      visibleDashboardAssetTotal?.count &&
      dashboard.envelope.data.recentProjects
        .find((item) => item.id === sortProjectA.envelope.data.id)
        ?.assetTypes.some((item) => item.type === 'text' && item.count > 0),
    '设计工作台没有汇总全部可访问项目，或缺少项目级资产类型拆分',
  );
  assert(
    dashboard.envelope.data.jobTrend.length === 7 &&
      dashboard.envelope.data.assetTypes.some(
        (item) => item.type === 'image',
      ) &&
      dashboard.envelope.data.recentConversations.some(
        (item) => item.projectId === projectId,
      ),
    '设计工作台图表或最近设计数据不完整',
  );
  const emptyDashboard = await apiRequest<{
    currentProject: null | { id: string };
    summary: { projectCount: number };
  }>('/dashboard', { session: user4 });
  assert(
    emptyDashboard.envelope.data.currentProject === null &&
      emptyDashboard.envelope.data.summary.projectCount === 0,
    '无项目用户的工作台空状态数据不正确',
  );

  await apiRequest('/jobs/batch', {
    body: {
      jobIds: [parallelDesignJob.envelope.data.id],
      operation: 'archive',
      projectId,
    },
    session: user1,
  });
  const visibleJobsAfterArchive = await apiRequest<Array<{ id: string }>>(
    `/jobs?projectId=${projectId}`,
    { session: user1 },
  );
  assert(
    !visibleJobsAfterArchive.envelope.data.some(
      (job) => job.id === parallelDesignJob.envelope.data.id,
    ),
    '软删除任务后仍出现在任务中心列表',
  );
  const [archivedJob] = await sql<{ id: string }[]>`
    SELECT id FROM jobs
    WHERE id = ${parallelDesignJob.envelope.data.id} AND archived_at IS NOT NULL
  `;
  assert(
    archivedJob?.id === parallelDesignJob.envelope.data.id,
    '任务没有保留为软删除台账',
  );

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
    '集成验收通过：认证、权限隔离、项目、设计会话、工作流并发、文本/图片资产、对象存储、AI 会话和审计。',
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
