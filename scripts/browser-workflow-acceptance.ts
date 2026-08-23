import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { chromium } from 'playwright';

import {
  closeDatabase,
  useDatabase,
} from '../apps/platform-api/utils/database';
import {
  deleteObject,
  readObject,
  storeObject,
} from '../apps/platform-api/utils/storage';

interface ApiEnvelope<T> {
  data: T;
  message: string;
}

const webUrl = (process.env.RAIL_WEB_URL ?? 'http://localhost:5666').replace(
  /\/$/,
  '',
);
const apiUrl = `${webUrl}/api/v1`;
const runId = randomUUID().replaceAll('-', '');
const username = `rail_ui_${runId.slice(-16)}`;
const password = 'RailBrowserAcceptance!2026';
const email = `${username}@rail.local`;
const primaryProjectName = `浏览器验收 ${runId.slice(-6)}`;
const secondaryProjectName = `浏览器验收备用项目 ${runId.slice(-6)}`;
const acceptanceMarker = 'browser-workflow-acceptance';
const screenshotPath =
  process.env.RAIL_BROWSER_SCREENSHOT ??
  '/tmp/rail-workflow-browser-acceptance.png';
const cameraScreenshotPath = screenshotPath.replace(/\.png$/i, '-camera.png');
const captureScreenshotPath = screenshotPath.replace(/\.png$/i, '-capture.png');
const regionScreenshotPath = screenshotPath.replace(/\.png$/i, '-region.png');
const maskScreenshotPath = screenshotPath.replace(/\.png$/i, '-mask.png');
const conversationScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-conversation.png',
);
const comparisonScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-comparison.png',
);
const designScreenshotPath = screenshotPath.replace(/\.png$/i, '-design.png');
const designDefaultScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-design-default.png',
);
const designLongInputScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-design-long-input.png',
);
const designInputScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-design-input.png',
);
const designQuickScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-design-quick.png',
);
const designRunningScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-design-running.png',
);
const designInputHoverScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-design-input-hover.png',
);
const designMarkdownScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-design-markdown.png',
);
const model3dScreenshotPath = screenshotPath.replace(/\.png$/i, '-model3d.png');
const projectSpaceScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-project-space.png',
);
const assetFoldersScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-asset-folders.png',
);
const jobsScreenshotPath = screenshotPath.replace(/\.png$/i, '-jobs.png');
const profileAvatarScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-profile-avatar.png',
);
const dashboardScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  '-dashboard.png',
);
let projectId = '';
let secondaryProjectId = '';
let userId = '';
let invitedMemberId = '';
let multiImageVisibility: boolean | undefined;

async function cleanupStaleAcceptanceData() {
  const sql = useDatabase();
  const staleProjects = await sql<{ id: string }[]>`
    SELECT project.id
    FROM projects project
    JOIN users creator ON creator.id = project.owner_id
    WHERE project.description LIKE 'browser-acceptance-%'
      AND creator.username LIKE 'rail_ui_%'
      AND project.created_at < now() - interval '30 minutes'
  `;
  for (const project of staleProjects) {
    const objects = await sql<{ objectKey: string }[]>`
      SELECT DISTINCT version.object_key AS "objectKey"
      FROM asset_versions version
      JOIN assets asset ON asset.id = version.asset_id
      WHERE asset.project_id = ${project.id}
        AND version.object_key IS NOT NULL
    `;
    for (const object of objects) {
      await deleteObject(object.objectKey).catch(() => undefined);
    }
    await sql`DELETE FROM projects WHERE id = ${project.id}`;
  }
  const staleUsers = await sql<{ id: string; objectKey: null | string }[]>`
    SELECT id, avatar_object_key AS "objectKey"
    FROM users
    WHERE username LIKE 'rail_ui_%' OR username LIKE 'rail_member_%'
  `;
  for (const user of staleUsers) {
    const [referenced] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM projects WHERE owner_id = ${user.id}
        UNION ALL
        SELECT 1 FROM project_members WHERE user_id = ${user.id}
      ) AS exists
    `;
    if (referenced?.exists) continue;
    if (user.objectKey)
      await deleteObject(user.objectKey).catch(() => undefined);
    await sql`DELETE FROM audit_events WHERE actor_id = ${user.id}`;
    await sql`DELETE FROM users WHERE id = ${user.id}`;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createTriangleGlb() {
  const binary = Buffer.alloc(44);
  const positions = [-1, -1, 0, 1, -1, 0, 0, 1, 0];
  positions.forEach((value, index) => binary.writeFloatLE(value, index * 4));
  binary.writeUInt16LE(0, 36);
  binary.writeUInt16LE(1, 38);
  binary.writeUInt16LE(2, 40);

  const document = {
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        max: [1, 1, 0],
        min: [-1, -1, 0],
        type: 'VEC3',
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: 3,
        max: [2],
        min: [0],
        type: 'SCALAR',
      },
    ],
    asset: { generator: 'rail-browser-acceptance', version: '2.0' },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteLength: 36, byteOffset: 0, target: 34_962 },
      { buffer: 0, byteLength: 6, byteOffset: 36, target: 34_963 },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.72, 0.06, 0.14, 1],
          metallicFactor: 0.08,
          roughnessFactor: 0.48,
        },
      },
    ],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    nodes: [{ mesh: 0 }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
  const jsonText = JSON.stringify(document);
  const jsonLength = Math.ceil(Buffer.byteLength(jsonText) / 4) * 4;
  const json = Buffer.alloc(jsonLength, 0x20);
  json.write(jsonText);
  const totalLength = 12 + 8 + json.byteLength + 8 + binary.byteLength;
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 4, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.byteLength, 0);
  jsonHeader.write('JSON', 4, 4, 'ascii');
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.byteLength, 0);
  binaryHeader.write('BIN\0', 4, 4, 'ascii');
  return Buffer.concat([header, jsonHeader, json, binaryHeader, binary]);
}

async function apiRequest<T>(
  path: string,
  options: {
    body?: unknown;
    method?: string;
    token?: string;
  } = {},
) {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body !== undefined)
    headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  const response = await fetch(`${apiUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  assert(response.ok, `${path} 失败：${response.status} ${envelope.message}`);
  return envelope.data;
}

async function setupAcceptanceData() {
  await cleanupStaleAcceptanceData();
  const registered = await apiRequest<{ id: string }>('/auth/register', {
    body: {
      department: '自动化验收',
      email,
      password,
      realName: '浏览器验收账号',
      username,
    },
  });
  userId = registered.id;
  const sql = useDatabase();
  const [multiImageApplication] = await sql<{ visible: boolean }[]>`
    SELECT visible FROM applications WHERE key = 'multi-image-edit'
  `;
  multiImageVisibility = multiImageApplication?.visible;
  await sql`
    UPDATE applications SET visible = true WHERE key = 'multi-image-edit'
  `;
  await sql`
    UPDATE user_roles
    SET role_id = (SELECT id FROM roles WHERE code = 'admin')
    WHERE user_id = ${userId}
  `;
  const login = await apiRequest<{ accessToken: string }>('/auth/login', {
    body: { password, username },
  });
  const token = login.accessToken;
  const invitedUsername = `rail_member_${runId.slice(-16)}`;
  const invitedPassword = 'RailMemberAcceptance!2026';
  const invitedRegistration = await apiRequest<{ id: string }>(
    '/auth/register',
    {
      body: {
        department: '设计部门',
        email: `${invitedUsername}@rail.local`,
        password: invitedPassword,
        realName: '待移除验收成员',
        username: invitedUsername,
      },
    },
  );
  invitedMemberId = invitedRegistration.id;
  const invitedLogin = await apiRequest<{ accessToken: string }>(
    '/auth/login',
    {
      body: { password: invitedPassword, username: invitedUsername },
    },
  );
  const invitedMemberToken = invitedLogin.accessToken;
  const invitedMemberInfo = await apiRequest<{ publicId: string }>(
    '/user/info',
    { token: invitedMemberToken },
  );
  const project = await apiRequest<{ id: string }>('/projects', {
    body: {
      description: `browser-acceptance-${runId}`,
      name: primaryProjectName,
      stage: 'concept',
    },
    token,
  });
  projectId = project.id;
  const secondaryProject = await apiRequest<{ id: string }>('/projects', {
    body: {
      description: `browser-acceptance-secondary-${runId}`,
      name: secondaryProjectName,
      stage: 'design',
    },
    token,
  });
  secondaryProjectId = secondaryProject.id;
  await apiRequest('/assets/text', {
    body: {
      content: '用于验证首页按全部可访问项目聚合。',
      description: 'browser acceptance dashboard aggregation',
      mimeType: 'text/markdown',
      name: '首页跨项目统计资产.md',
      projectId: secondaryProjectId,
      tags: ['browser-acceptance', 'dashboard'],
    },
    token,
  });
  await apiRequest(`/projects/${secondaryProjectId}/members`, {
    body: {
      projectRole: 'editor',
      userPublicId: invitedMemberInfo.publicId,
    },
    token,
  });
  await apiRequest('/users/me/current-project', {
    body: { projectId },
    method: 'PUT',
    token,
  });
  const inputFolder = await apiRequest<{ id: string }>('/asset-folders', {
    body: {
      name: '设计输入素材',
      projectId,
    },
    token,
  });
  await apiRequest('/assets/text', {
    body: {
      content: '这是用于验收资产中心阅读能力的真实文本。',
      description: 'browser acceptance',
      mimeType: 'text/plain',
      name: '浏览器验收文本',
      projectId,
      tags: ['browser-acceptance'],
    },
    token,
  });
  await apiRequest('/assets/text', {
    body: {
      content:
        '# 浏览器 Markdown 输入\n\n用于验证项目资产可以作为设计会话文本来源。\n\n![不应加载的图片](https://example.test/ignored.png)',
      description: 'browser acceptance Markdown input',
      folderId: inputFolder.id,
      mimeType: 'text/markdown',
      name: '浏览器验收输入.md',
      projectId,
      tags: ['browser-acceptance', 'markdown-input'],
    },
    token,
  });

  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAg0lEQVR4nO3PQQ0AIBDAsAP/nuGNAvZoFSzZOjNnyNiB1QOsHmD1AKsHWD3A6gFWD7B6gNUDrB5g9QCrB1g9wOoBVg+weoDVA6weYPUAqwdYPcDqAVYPsHqA1QOsHmD1AKsHWD3A6gFWD7B6gNUDrB5g9QCrB1g9wOoBVg+weoDVAywPFowJ/KE92QAAAABJRU5ErkJggg==',
    'base64',
  );
  const prepared = await apiRequest<{
    asset: { id: string };
    upload: {
      headers: Record<string, string>;
      method: string;
      url: string;
    };
  }>('/assets/uploads', {
    body: {
      description: 'browser acceptance',
      filename: 'browser-acceptance.png',
      kind: 'image',
      mimeType: 'image/png',
      name: '浏览器验收图片',
      projectId,
      sizeBytes: image.byteLength,
      tags: ['browser-acceptance'],
    },
    token,
  });
  const uploaded = await fetch(prepared.upload.url, {
    body: image,
    headers: prepared.upload.headers,
    method: prepared.upload.method,
  });
  assert(uploaded.ok, `浏览器验收图片上传失败：${uploaded.status}`);
  await apiRequest(`/assets/${prepared.asset.id}/complete`, {
    method: 'POST',
    token,
  });

  const modelBytes = createTriangleGlb();
  const preparedModel = await apiRequest<{
    asset: { id: string };
    upload: {
      headers: Record<string, string>;
      method: string;
      url: string;
    };
  }>('/assets/uploads', {
    body: {
      description: 'browser acceptance 3D model',
      filename: 'browser-acceptance.glb',
      kind: 'model3d',
      mimeType: 'model/gltf-binary',
      name: '浏览器验收三维模型',
      projectId,
      sizeBytes: modelBytes.byteLength,
      tags: ['browser-acceptance', 'model3d'],
    },
    token,
  });
  const uploadedModel = await fetch(preparedModel.upload.url, {
    body: modelBytes,
    headers: preparedModel.upload.headers,
    method: preparedModel.upload.method,
  });
  assert(uploadedModel.ok, `浏览器验收 GLB 上传失败：${uploadedModel.status}`);
  await apiRequest(`/assets/${preparedModel.asset.id}/complete`, {
    method: 'POST',
    token,
  });

  const [version] = await sql<
    {
      mimeType: string;
      objectKey: string;
      originalFilename: string;
      sizeBytes: number;
    }[]
  >`
    SELECT
      object_key AS "objectKey",
      original_filename AS "originalFilename",
      mime_type AS "mimeType",
      size_bytes::float8 AS "sizeBytes"
    FROM asset_versions
    WHERE asset_id = ${prepared.asset.id} AND version = 1
  `;
  assert(version?.objectKey, '浏览器验收图片没有对象存储记录');
  const jobId = randomUUID();
  const historyJobId = randomUUID();
  const comparisonJobId = randomUUID();
  const failedJobId = randomUUID();
  const regionComparisonJobId = randomUUID();
  const markdownJobId = randomUUID();
  const modelJobId = randomUUID();
  const dashboardOutputAssetId = randomUUID();
  const designConversationId = randomUUID();
  const textWorkspaceInstanceId = randomUUID();
  const comparisonWorkspaceInstanceId = randomUUID();
  const multiWorkspaceInstanceId = randomUUID();
  const outputAssetId = randomUUID();
  const historyOutputAssetId = randomUUID();
  const comparisonOutputAssetId = randomUUID();
  const comparisonMaskAssetId = randomUUID();
  const markdownOutputAssetId = randomUUID();
  const outputObjectKey = `${projectId}/browser-acceptance/${randomUUID()}.png`;
  const historyOutputObjectKey = `${projectId}/browser-acceptance/${randomUUID()}.png`;
  const comparisonOutputObjectKey = `${projectId}/browser-acceptance/${randomUUID()}.png`;
  const comparisonMaskObjectKey = `${projectId}/browser-acceptance/${randomUUID()}.png`;
  const dashboardOutputObjectKey = `${projectId}/browser-acceptance/${randomUUID()}.png`;
  const sourceBytes = await readObject(version.objectKey);
  await storeObject(outputObjectKey, version.mimeType, sourceBytes);
  await storeObject(historyOutputObjectKey, version.mimeType, sourceBytes);
  await storeObject(comparisonOutputObjectKey, version.mimeType, sourceBytes);
  await storeObject(comparisonMaskObjectKey, version.mimeType, sourceBytes);
  await storeObject(dashboardOutputObjectKey, version.mimeType, sourceBytes);
  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO workflow_workspace_instances (
        id, user_id, project_id, app_key, title
      ) VALUES
        (
          ${textWorkspaceInstanceId}, ${userId}, ${projectId},
          'text-to-image', '文生图 · 浏览器验收会话'
        ),
        (
          ${comparisonWorkspaceInstanceId}, ${userId}, ${projectId},
          'inpaint-single', '单图局部重绘 · 浏览器验收会话'
        ),
        (
          ${multiWorkspaceInstanceId}, ${userId}, ${projectId},
          'multi-image-edit', '多图融合编辑 · 已有目标会话'
        )
    `;
    await transaction`
      INSERT INTO design_conversations (
        id, user_id, project_id, title
      ) VALUES
        (
          ${designConversationId}, ${userId}, ${projectId},
          '浏览器验收 · 多应用设计会话'
        ),
        (
          ${textWorkspaceInstanceId}, ${userId}, ${projectId},
          '文生图 · 旧版应用记录'
        ),
        (
          ${comparisonWorkspaceInstanceId}, ${userId}, ${projectId},
          '单图局部重绘 · 旧版应用记录'
        ),
        (
          ${multiWorkspaceInstanceId}, ${userId}, ${projectId},
          '多图融合编辑 · 旧版应用记录'
        )
    `;
    await transaction`
      INSERT INTO jobs (
        id, project_id, app_key, name, parameters, created_by,
        status, progress, stage, started_at, completed_at, created_at,
        workspace_instance_id, design_conversation_id
      ) VALUES (
        ${historyJobId}, ${projectId}, 'text-to-image', '浏览器历史任务',
        ${transaction.json({ prompt: '第一轮：阳光下的现代轨道客室设计' })},
        ${userId}, 'succeeded', 100, '执行完成', now(), now(),
        now() - interval '5 minutes', ${textWorkspaceInstanceId},
        ${designConversationId}
      )
    `;
    await transaction`
      INSERT INTO jobs (
        id, project_id, app_key, name, parameters, created_by,
        status, progress, stage, started_at, completed_at,
        design_conversation_id, created_at
      ) VALUES (
        ${regionComparisonJobId}, ${projectId}, 'region-marker-edit',
        '浏览器分区标记对比任务',
        ${transaction.json({ editPrompt: '按编号分区替换座椅材质', regionMarks: 'brush:square:24:1:255,0,0:1:1,1;20,20' })},
        ${userId}, 'succeeded', 100, '执行完成', now(), now(),
        ${designConversationId}, now() - interval '4 minutes'
      )
    `;
    await transaction`
      INSERT INTO jobs (
        id, project_id, app_key, name, parameters, created_by,
        status, progress, stage, started_at, completed_at, created_at,
        design_conversation_id
      ) VALUES (
        ${modelJobId}, ${projectId}, 'multiview-to-3d', '浏览器三维模型任务',
        ${transaction.json({ prompt: '生成轨道客室座椅三维模型' })},
        ${userId}, 'succeeded', 100, '执行完成', now(), now(),
        now() - interval '90 seconds', ${designConversationId}
      )
    `;
    await transaction`
      INSERT INTO jobs (
        id, project_id, app_key, name, parameters, created_by,
        status, progress, stage, started_at, completed_at, created_at,
        design_conversation_id
      ) VALUES (
        ${markdownJobId}, ${projectId}, 'text-chat', '浏览器 Markdown 任务',
        ${transaction.json({ prompt: '整理一份轨道客室方案说明' })},
        ${userId}, 'succeeded', 100, '执行完成', now(), now(),
        now() - interval '2 minutes', ${designConversationId}
      )
    `;
    await transaction`
      INSERT INTO jobs (
        id, project_id, app_key, name, parameters, created_by,
        status, progress, stage, started_at, workspace_instance_id,
        design_conversation_id
      ) VALUES (
        ${jobId}, ${projectId}, 'text-to-image', '浏览器活跃任务',
        ${transaction.json({
          acceptanceMarker,
          prompt: '第二轮：夜景氛围的轨道客室设计',
        })},
        ${userId}, 'running', 32, '真实页面验收中', now(),
        ${textWorkspaceInstanceId}, ${designConversationId}
      )
    `;
    await transaction`
      INSERT INTO jobs (
        id, project_id, app_key, name, parameters, created_by,
        status, progress, stage, started_at, completed_at,
        workspace_instance_id, design_conversation_id
      ) VALUES (
        ${comparisonJobId}, ${projectId}, 'inpaint-single', '浏览器图像对比任务',
        ${transaction.json({ prompt: '保持结构，调整材质和照明' })},
        ${userId}, 'succeeded', 100, '执行完成', now(), now(),
        ${comparisonWorkspaceInstanceId}, ${designConversationId}
      )
    `;
    await transaction`
      INSERT INTO jobs (
        id, project_id, app_key, name, parameters, created_by,
        status, progress, stage, error, started_at, completed_at,
        design_conversation_id
      ) VALUES (
        ${failedJobId}, ${projectId}, 'inpaint-single',
        '浏览器失败日志越界验收', '{}'::jsonb, ${userId},
        'failed', 0, '工作流执行失败',
        ${transaction.json({
          code: 'INVALID_WORKFLOW_PARAMETERS',
          message:
            '[{"code":"invalid_union","errors":[{"code":"invalid_value","values":["boolean","number","select","text","textarea"],"path":[],"message":"Invalid option: expected one of boolean number select text textarea; this deliberately long validation message must remain inside the task row and open in a readable dialog"}]}]',
        })},
        now(), now(), ${designConversationId}
      )
    `;
    await transaction`
      INSERT INTO assets (
        id, project_id, name, description, kind, source,
        owner_id, status, saved_at
      ) VALUES (
        ${comparisonMaskAssetId}, ${projectId}, '浏览器遮罩输入',
        '由原始底图派生的带 Alpha 遮罩输入。', 'image', 'upload',
        ${userId}, 'available', now()
      )
    `;
    await transaction`
      INSERT INTO assets (
        id, project_id, name, description, kind, source, source_app_key,
        source_job_id, owner_id, status, saved_at
      ) VALUES (
        ${dashboardOutputAssetId}, ${projectId}, '首页最近成果深链验收',
        '用于验证首页可直接打开具体资产详情。', 'image', 'workflow',
        'text-to-image', ${historyJobId}, ${userId}, 'available', now()
      )
    `;
    await transaction`
      INSERT INTO assets (
        id, project_id, name, description, kind, source, source_app_key,
        source_job_id, owner_id, status, saved_at
      ) VALUES (
        ${markdownOutputAssetId}, ${projectId}, '文本生成 · browser-output.md',
        '用于 Markdown 文本结果验收。', 'text', 'workflow',
        'text-chat', ${markdownJobId}, ${userId}, 'available', NULL
      )
    `;
    await transaction`
      INSERT INTO assets (
        id, project_id, name, description, kind, source, source_app_key,
        source_job_id, owner_id, status, saved_at
      ) VALUES (
        ${outputAssetId}, ${projectId}, '浏览器暂存结果',
        '由浏览器验收任务生成，等待用户确认是否保存到资产中心。',
        'image', 'workflow', 'text-to-image', ${jobId}, ${userId},
        'available', NULL
      )
    `;
    await transaction`
      INSERT INTO assets (
        id, project_id, name, description, kind, source, source_app_key,
        source_job_id, owner_id, status, saved_at
      ) VALUES (
        ${historyOutputAssetId}, ${projectId}, '浏览器第一轮结果',
        '用于多轮会话恢复验收。', 'image', 'workflow', 'text-to-image',
        ${historyJobId}, ${userId}, 'available', NULL
      )
    `;
    await transaction`
      INSERT INTO assets (
        id, project_id, name, description, kind, source, source_app_key,
        source_job_id, owner_id, status, saved_at
      ) VALUES (
        ${comparisonOutputAssetId}, ${projectId}, '浏览器对比结果',
        '用于图像左右滑动对比验收。', 'image', 'workflow',
        'inpaint-single', ${comparisonJobId}, ${userId}, 'available', NULL
      )
    `;
    await transaction`
      INSERT INTO asset_versions (
        asset_id, version, storage_kind, object_key, original_filename,
        mime_type, size_bytes, status, metadata, created_by, completed_at
      ) VALUES (
        ${comparisonMaskAssetId}, 1, 'object', ${comparisonMaskObjectKey},
        'browser-acceptance-mask.png', ${version.mimeType}, ${version.sizeBytes},
        'available',
        ${transaction.json({ derivedFromAssetId: prepared.asset.id })},
        ${userId}, now()
      )
    `;
    await transaction`
      INSERT INTO asset_versions (
        asset_id, version, storage_kind, object_key, original_filename,
        mime_type, size_bytes, status, created_by, completed_at
      ) VALUES (
        ${dashboardOutputAssetId}, 1, 'object', ${dashboardOutputObjectKey},
        ${version.originalFilename}, ${version.mimeType}, ${version.sizeBytes},
        'available', ${userId}, now()
      )
    `;
    await transaction`
      INSERT INTO asset_versions (
        asset_id, version, storage_kind, text_content, original_filename,
        mime_type, size_bytes, status, created_by, completed_at
      ) VALUES (
        ${markdownOutputAssetId}, 1, 'inline',
        ${'# 轨道客室方案\n\n围绕空间、人机、材质与维护形成以下设计建议。\n\n- 优化乘客动线\n- 使用耐久易维护材料\n\n> 本方案可继续流转到图像生成能力。'},
        'browser-output.md', 'text/markdown', 186,
        'available', ${userId}, now()
      )
    `;
    await transaction`
      INSERT INTO asset_versions (
        asset_id, version, storage_kind, object_key, original_filename,
        mime_type, size_bytes, status, created_by, completed_at
      ) VALUES (
        ${outputAssetId}, 1, 'object', ${outputObjectKey},
        ${version.originalFilename}, ${version.mimeType}, ${version.sizeBytes},
        'available', ${userId}, now()
      )
    `;
    await transaction`
      INSERT INTO asset_versions (
        asset_id, version, storage_kind, object_key, original_filename,
        mime_type, size_bytes, status, created_by, completed_at
      ) VALUES (
        ${historyOutputAssetId}, 1, 'object', ${historyOutputObjectKey},
        ${version.originalFilename}, ${version.mimeType}, ${version.sizeBytes},
        'available', ${userId}, now()
      )
    `;
    await transaction`
      INSERT INTO asset_versions (
        asset_id, version, storage_kind, object_key, original_filename,
        mime_type, size_bytes, status, created_by, completed_at
      ) VALUES (
        ${comparisonOutputAssetId}, 1, 'object', ${comparisonOutputObjectKey},
        ${version.originalFilename}, ${version.mimeType}, ${version.sizeBytes},
        'available', ${userId}, now()
      )
    `;
    await transaction`
      INSERT INTO job_outputs (job_id, asset_id, position)
      VALUES (${jobId}, ${outputAssetId}, 0)
    `;
    await transaction`
      INSERT INTO job_outputs (job_id, asset_id, position)
      VALUES (${historyJobId}, ${historyOutputAssetId}, 0)
    `;
    await transaction`
      INSERT INTO job_inputs (job_id, asset_id, position)
      VALUES (${comparisonJobId}, ${comparisonMaskAssetId}, 0)
    `;
    await transaction`
      INSERT INTO job_inputs (
        job_id, asset_id, position, annotation_asset_id
      ) VALUES (
        ${regionComparisonJobId}, ${prepared.asset.id}, 0,
        ${comparisonMaskAssetId}
      )
    `;
    await transaction`
      INSERT INTO job_outputs (job_id, asset_id, position)
      VALUES (${comparisonJobId}, ${comparisonOutputAssetId}, 0)
    `;
    await transaction`
      INSERT INTO job_outputs (job_id, asset_id, position)
      VALUES (${regionComparisonJobId}, ${comparisonOutputAssetId}, 0)
    `;
    await transaction`
      INSERT INTO job_outputs (job_id, asset_id, position)
      VALUES (${markdownJobId}, ${markdownOutputAssetId}, 0)
    `;
    await transaction`
      INSERT INTO job_outputs (job_id, asset_id, position)
      VALUES (${modelJobId}, ${preparedModel.asset.id}, 0)
    `;
  });
  return {
    comparisonJobId,
    comparisonMaskAssetId,
    comparisonOriginalAssetId: prepared.asset.id,
    comparisonWorkspaceInstanceId,
    dashboardOutputAssetId,
    designConversationId,
    historyJobId,
    imageAssetId: prepared.asset.id,
    jobId,
    markdownJobId,
    modelAssetId: preparedModel.asset.id,
    modelJobId,
    multiWorkspaceInstanceId,
    regionComparisonJobId,
    textWorkspaceInstanceId,
    invitedMemberPublicId: invitedMemberInfo.publicId,
    invitedMemberToken,
  };
}

async function cleanupAcceptanceData() {
  const sql = useDatabase();
  if (multiImageVisibility !== undefined) {
    await sql`
      UPDATE applications
      SET visible = ${multiImageVisibility}
      WHERE key = 'multi-image-edit'
    `;
  }
  if (projectId) {
    const objects = await sql<{ objectKey: string }[]>`
      SELECT DISTINCT version.object_key AS "objectKey"
      FROM asset_versions version
      JOIN assets asset ON asset.id = version.asset_id
      WHERE asset.project_id = ${projectId}
        AND version.object_key IS NOT NULL
    `;
    for (const object of objects) {
      await deleteObject(object.objectKey).catch(() => undefined);
    }
    await sql`DELETE FROM projects WHERE id = ${projectId}`;
  }
  if (secondaryProjectId) {
    await sql`DELETE FROM projects WHERE id = ${secondaryProjectId}`;
  }
  if (userId) {
    const [avatar] = await sql<{ objectKey: null | string }[]>`
      SELECT avatar_object_key AS "objectKey" FROM users WHERE id = ${userId}
    `;
    if (avatar?.objectKey) {
      await deleteObject(avatar.objectKey).catch(() => undefined);
    }
    await sql`DELETE FROM audit_events WHERE actor_id = ${userId}`;
    await sql`DELETE FROM users WHERE id = ${userId}`;
  }
  if (invitedMemberId) {
    await sql`DELETE FROM audit_events WHERE actor_id = ${invitedMemberId}`;
    await sql`DELETE FROM users WHERE id = ${invitedMemberId}`;
  }
}

async function runBrowserAcceptance() {
  const acceptanceSql = useDatabase();
  const {
    comparisonJobId,
    comparisonMaskAssetId,
    comparisonOriginalAssetId,
    comparisonWorkspaceInstanceId,
    designConversationId,
    historyJobId,
    invitedMemberPublicId,
    invitedMemberToken,
    jobId,
    markdownJobId,
    modelAssetId,
    modelJobId,
    multiWorkspaceInstanceId,
    regionComparisonJobId,
    textWorkspaceInstanceId,
  } = await setupAcceptanceData();
  const browserExecutable = process.env.RAIL_BROWSER_EXECUTABLE;
  const browser = await chromium.launch({
    ...(browserExecutable ? { executablePath: browserExecutable } : {}),
    args: [
      '--enable-webgl',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
    ],
    headless: true,
  });
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { height: 1000, width: 1600 },
  });
  const iconifyNetworkRequests: string[] = [];
  await context.route(
    /https:\/\/(?:api\.iconify\.design|api\.simplesvg\.com|api\.unisvg\.com)\/.*/,
    async (route) => {
      iconifyNetworkRequests.push(route.request().url());
      await route.abort('internetdisconnected');
    },
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: webUrl,
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const waitForWorkspaceTransition = async (
    expectsGeneratedInstance = false,
  ) => {
    if (expectsGeneratedInstance) await page.waitForURL(/instanceId=/);
    await page.waitForFunction(
      () => document.querySelectorAll('.capability-studio').length === 1,
    );
  };

  try {
    await page.goto(`${webUrl}/auth/login`);
    await page.getByText('欢迎回来 👋🏻').waitFor();
    const loginInputs = page.locator('form input:visible');
    await loginInputs.nth(0).fill(username);
    await loginInputs.nth(1).fill(password);
    await page.locator('button').filter({ hasText: '登录' }).last().click();
    await page.waitForURL((url) => url.pathname === '/home');
    await page
      .getByRole('heading', {
        name: '欢迎来到客运装备内装模块化分区快速设计平台',
      })
      .waitFor();
    assert(
      (await page.getByRole('menuitem', { name: '首页' }).count()) === 1,
      '登录默认入口没有统一命名为“首页”',
    );
    const homeEntryLabels = await page
      .locator('.home-entry-grid > button')
      .allTextContents();
    assert(
      JSON.stringify(homeEntryLabels.map((item) => item.trim())) ===
        JSON.stringify([
          '开始新设计',
          '查看我的设计',
          '查看资产中心',
          '开始模型训练',
          '开始报告生成',
          '设计工作台',
        ]),
      `首页六个入口的名称或顺序不符合需求：${JSON.stringify(homeEntryLabels)}`,
    );
    const homeLayout = await page.locator('.home-stage').evaluate((element) => {
      const welcome = element.querySelector('.home-welcome');
      const grid = element.querySelector('.home-entry-grid');
      const firstButton = grid?.querySelector('button');
      const stageBox = element.getBoundingClientRect();
      const welcomeBox = welcome?.getBoundingClientRect();
      const gridStyle = grid ? getComputedStyle(grid) : undefined;
      return {
        buttonBackground: firstButton
          ? getComputedStyle(firstButton).backgroundColor
          : '',
        columnCount:
          gridStyle?.gridTemplateColumns.split(' ').filter(Boolean).length ?? 0,
        gridWidth: grid?.getBoundingClientRect().width ?? 0,
        stageCenterOffset: welcomeBox
          ? Math.abs(
              welcomeBox.left +
                welcomeBox.width / 2 -
                (stageBox.left + stageBox.width / 2),
            )
          : Number.POSITIVE_INFINITY,
        welcomeBackground: welcome
          ? getComputedStyle(welcome).backgroundColor
          : '',
        welcomeWidth: welcomeBox?.width ?? 0,
      };
    });
    assert(
      homeLayout.columnCount === 3 &&
        homeLayout.welcomeWidth >= 600 &&
        homeLayout.gridWidth >= 560 &&
        homeLayout.stageCenterOffset <= 2 &&
        homeLayout.welcomeBackground === 'rgb(244, 246, 248)' &&
        homeLayout.buttonBackground === 'rgb(255, 240, 242)',
      `首页欢迎区或 3×2 功能区没有按需求图布局：${JSON.stringify(homeLayout)}`,
    );
    assert(
      (await page
        .locator(
          '.design-cycle, .dashboard-grid, .dashboard-panel, .dashboard-entry-panel',
        )
        .count()) === 0,
      '首页仍然包含设计闭环、统计图表或旧版仪表盘卡片',
    );

    const newDesignEntry = page.locator(
      '.home-entry-grid [data-action="new-design"]',
    );
    await newDesignEntry.click();
    const newDesignDialog = page
      .getByRole('dialog')
      .filter({ has: page.getByText('开始新设计', { exact: true }) });
    await newDesignDialog.waitFor();
    await newDesignDialog.locator('.ant-modal-close').click();
    await newDesignDialog.waitFor({ state: 'hidden' });

    const historyEntry = page.locator(
      '.home-entry-grid [data-action="history"]',
    );
    await historyEntry.click();
    const historyDialog = page
      .getByRole('dialog')
      .filter({ has: page.getByText('查看我的设计', { exact: true }) });
    await historyDialog.waitFor();
    await historyDialog.locator('.ant-modal-close').click();
    await historyDialog.waitFor({ state: 'hidden' });

    await page.locator('.home-entry-grid [data-action="training"]').click();
    await page.getByTestId('training-layout').waitFor();
    assert(
      (await page.getByText(/不能开始训练/).count()) === 1,
      '模型训练布局没有明确标识训练服务尚未接入',
    );
    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('.home-entry-grid [data-action="report"]').click();
    await page
      .getByText('该外部服务与能力契约尚未接入', { exact: true })
      .waitFor();
    assert(
      new URL(page.url()).pathname === '/home',
      '未接入的训练和报告入口不应离开首页',
    );

    await page.screenshot({
      fullPage: true,
      path: dashboardScreenshotPath,
    });

    await page.goto(`${webUrl}/profile`);
    const avatarButton = page.getByRole('button', { name: '修改头像' });
    await avatarButton.waitFor();
    const avatarHint = avatarButton.locator('.profile-avatar__hint');
    const avatarHintText = await avatarHint.textContent();
    assert(
      avatarHintText?.trim() === '修改头像',
      '个人头像没有提供“修改头像”悬浮提示',
    );
    await avatarButton.hover();
    await page.waitForFunction(() => {
      const hint = document.querySelector('.profile-avatar__hint');
      return hint && Number.parseFloat(getComputedStyle(hint).opacity) > 0.95;
    });
    assert(
      Number.parseFloat(
        await avatarHint.evaluate(
          (element) => getComputedStyle(element).opacity,
        ),
      ) > 0.95,
      '鼠标悬浮头像后“修改头像”提示没有显示',
    );
    const previousAvatar = await avatarButton
      .locator('img')
      .getAttribute('src');
    const rectangularAvatarBytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法创建头像验收画布');
      const gradient = context.createLinearGradient(0, 0, 640, 360);
      gradient.addColorStop(0, '#c51c37');
      gradient.addColorStop(1, '#1c2730');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 640, 360);
      context.fillStyle = '#ffffff';
      context.font = 'bold 88px sans-serif';
      context.fillText('RAIL', 190, 210);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('PNG'))),
          'image/png',
        ),
      );
      return [...new Uint8Array(await blob.arrayBuffer())];
    });
    await page.locator('[data-testid="avatar-file-input"]').setInputFiles({
      buffer: Buffer.from(rectangularAvatarBytes),
      mimeType: 'image/png',
      name: 'profile-avatar-wide.png',
    });
    const cropDialog = page.getByRole('dialog').filter({ hasText: '裁剪头像' });
    await cropDialog.getByText('profile-avatar-wide.png').waitFor();
    const cropCanvas = cropDialog.getByLabel('头像方形裁剪区域');
    const cropBounds = await cropCanvas.boundingBox();
    assert(cropBounds, '非方形头像没有显示方形裁剪区域');
    await page.mouse.move(
      cropBounds.x + cropBounds.width * 0.45,
      cropBounds.y + cropBounds.height * 0.5,
    );
    await page.mouse.down();
    await page.mouse.move(
      cropBounds.x + cropBounds.width * 0.58,
      cropBounds.y + cropBounds.height * 0.5,
    );
    await page.mouse.up();
    await cropDialog.getByLabel('裁剪缩放').fill('1.25');
    await cropDialog.getByRole('button', { name: '向右旋转' }).click();
    await cropDialog.getByRole('button', { name: '重置裁剪' }).click();
    await page.screenshot({
      fullPage: true,
      path: profileAvatarScreenshotPath,
    });
    await cropDialog.getByRole('button', { name: '确定' }).click();
    await page.getByText('头像已更新').waitFor();
    const updatedAvatar = await avatarButton.locator('img').getAttribute('src');
    assert(
      Boolean(
        updatedAvatar &&
        updatedAvatar !== previousAvatar &&
        !updatedAvatar.endsWith('/rail-logo.svg'),
      ),
      '头像上传成功后个人中心仍显示默认头像',
    );
    const headerAvatar = page.locator('header img').last();
    if ((await headerAvatar.count()) > 0) {
      assert(
        (await headerAvatar.getAttribute('src')) === updatedAvatar,
        '头像上传后全局用户入口没有同步刷新',
      );
    }
    const [storedAvatar] = await useDatabase()<{ objectKey: string }[]>`
      SELECT avatar_object_key AS "objectKey" FROM users WHERE id = ${userId}
    `;
    assert(storedAvatar?.objectKey, '裁剪后的头像没有写入对象存储');
    const storedAvatarBytes = await readObject(storedAvatar.objectKey);
    const storedAvatarWidth = storedAvatarBytes.slice(16, 20);
    const storedAvatarHeight = storedAvatarBytes.slice(20, 24);
    assert(
      storedAvatarWidth.every(
        (value, index) => value === storedAvatarHeight[index],
      ),
      '裁剪后上传的头像不是正方形 PNG',
    );

    await page.goto(`${webUrl}/workspace/overview`);
    await page.waitForURL((url) => url.pathname === '/projects');
    await page.locator('.projects-overview-page').waitFor();
    await page.waitForFunction(
      ([primaryId, secondaryId]) =>
        Boolean(
          document.querySelector(`[data-project-id="${primaryId}"]`) &&
          document.querySelector(`[data-project-id="${secondaryId}"]`),
        ),
      [projectId, secondaryProjectId],
    );
    assert(
      (await page.locator('.project-dashboard').count()) >= 2,
      '项目空间没有一次性纵向展示当前账号可访问的全部项目',
    );
    assert(
      (await page.locator('.rail-project-switcher').count()) === 0,
      '项目空间仍显示“当前项目”选择器，保留了重复的信息层级',
    );
    assert(
      (await page.getByText('平台概览', { exact: true }).count()) === 0,
      '侧栏仍保留重复的“平台概览”入口',
    );
    assert(
      (await page.getByText('应用调试中心', { exact: true }).count()) === 0,
      '侧栏仍保留“应用调试中心”入口',
    );
    assert(
      (await page.getByRole('button', { name: '查看资产' }).count()) === 0,
      '项目卡片“开始设计”旁仍保留重复的“查看资产”入口',
    );
    assert(
      (await page.locator('.project-dashboard__rail').count()) === 0,
      '项目卡片仍显示与主操作重复的三段设计流程',
    );
    const projectHeroBackground = await page
      .locator('.project-dashboard__hero')
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    assert(
      projectHeroBackground === 'rgb(255, 255, 255)',
      `项目卡片仍使用暗色背景：${projectHeroBackground}`,
    );
    assert(
      (await page.getByPlaceholder('搜索项目').count()) === 1,
      '项目搜索框没有使用精简占位文案',
    );
    const firstProjectCard = page.locator('.project-dashboard').first();
    assert(
      (await firstProjectCard.getAttribute('role')) === 'link' &&
        (await firstProjectCard.getAttribute('tabindex')) === '0',
      '项目卡片主体没有提供可点击、可键盘访问的项目入口',
    );
    const projectVisualHierarchy = await firstProjectCard.evaluate((card) => {
      const code = card.querySelector('.project-dashboard__eyebrow code');
      const metric = card.querySelector('.project-dashboard__metrics strong');
      const helper = card.querySelector('.project-dashboard__metrics small');
      return {
        codeColor: code ? getComputedStyle(code).color : '',
        helperColor: helper ? getComputedStyle(helper).color : '',
        metricFontSize: metric
          ? Number.parseFloat(getComputedStyle(metric).fontSize)
          : 0,
        metricFontWeight: metric
          ? Number.parseInt(getComputedStyle(metric).fontWeight, 10)
          : 0,
      };
    });
    assert(
      projectVisualHierarchy.codeColor !== 'rgb(197, 28, 55)' &&
        projectVisualHierarchy.metricFontSize >= 30 &&
        projectVisualHierarchy.metricFontWeight >= 700 &&
        projectVisualHierarchy.helperColor !== projectVisualHierarchy.codeColor,
      `项目卡片文字层级或编号色未按规范收敛：${JSON.stringify(projectVisualHierarchy)}`,
    );
    await page.mouse.move(4, 4);
    await page.waitForTimeout(220);
    const cardTransformBeforeHover = await firstProjectCard.evaluate(
      (card) => getComputedStyle(card).transform,
    );
    await firstProjectCard.hover();
    await page.waitForTimeout(220);
    const cardTransformAfterHover = await firstProjectCard.evaluate(
      (card) => getComputedStyle(card).transform,
    );
    assert(
      cardTransformAfterHover !== cardTransformBeforeHover &&
        cardTransformAfterHover !== 'none',
      '项目卡片没有整体 hover 反馈',
    );
    assert(
      (await page
        .locator('.project-dashboard__metrics strong.active')
        .count()) > 0,
      '运行任务大于 0 的项目没有使用强调色',
    );
    const updateLabels = await page
      .locator('.project-dashboard__copy small')
      .allTextContents();
    assert(
      updateLabels.every((label) => /\d{4}-\d{2}-\d{2}/.test(label)),
      `项目更新时间格式不统一：${JSON.stringify(updateLabels)}`,
    );
    const projectSort = page.getByLabel('项目排序');
    const selectProjectSort = async (label: string) => {
      await projectSort.click();
      await page
        .locator('.ant-select-dropdown:visible')
        .getByText(label, { exact: true })
        .click();
    };
    await Promise.all([
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname.endsWith('/api/v1/projects') &&
          url.searchParams.get('sortBy') === 'name' &&
          url.searchParams.get('sortOrder') === 'asc'
        );
      }),
      selectProjectSort('名称：A–Z'),
    ]);
    const ascendingProjectIds = await page
      .locator('.project-dashboard')
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).dataset.projectId),
      );
    await Promise.all([
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname.endsWith('/api/v1/projects') &&
          url.searchParams.get('sortBy') === 'name' &&
          url.searchParams.get('sortOrder') === 'desc'
        );
      }),
      selectProjectSort('名称：Z–A'),
    ]);
    const descendingProjectIds = await page
      .locator('.project-dashboard')
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).dataset.projectId),
      );
    const ascendingProjectOrder =
      ascendingProjectIds.indexOf(projectId) -
      ascendingProjectIds.indexOf(secondaryProjectId);
    const descendingProjectOrder =
      descendingProjectIds.indexOf(projectId) -
      descendingProjectIds.indexOf(secondaryProjectId);
    assert(
      ascendingProjectOrder !== 0 &&
        descendingProjectOrder !== 0 &&
        Math.sign(ascendingProjectOrder) !== Math.sign(descendingProjectOrder),
      '项目名称正反序没有改变卡片排列顺序',
    );
    const secondaryProjectCard = page.locator(
      `[data-project-id="${secondaryProjectId}"]`,
    );
    await secondaryProjectCard.waitFor();
    assert(
      (await secondaryProjectCard
        .getByRole('button', { name: '开始设计' })
        .count()) === 1,
      '项目卡片存在重复的“开始设计”入口',
    );
    await secondaryProjectCard
      .getByRole('button', { name: '置顶项目' })
      .click();
    await page.getByText('项目已置顶').waitFor();
    await secondaryProjectCard
      .getByRole('button', { name: '修改项目信息' })
      .click();
    const editProjectDialog = page.getByRole('dialog', {
      name: '修改项目信息',
    });
    const renamedSecondaryProject = `${secondaryProjectName}（已重命名）`;
    const updatedSecondaryDescription = `浏览器验收项目说明 ${runId}`;
    await editProjectDialog.locator('input').fill(renamedSecondaryProject);
    await editProjectDialog
      .locator('textarea')
      .fill(updatedSecondaryDescription);
    const projectDescriptionCount = editProjectDialog.locator(
      '.project-description-count',
    );
    const [descriptionCountBox, editProjectFooterBox] = await Promise.all([
      projectDescriptionCount.boundingBox(),
      editProjectDialog.locator('.ant-modal-footer').boundingBox(),
    ]);
    assert(
      Boolean(
        descriptionCountBox &&
        editProjectFooterBox &&
        descriptionCountBox.y + descriptionCountBox.height <=
          editProjectFooterBox.y,
      ),
      '项目说明字符计数仍与弹窗操作按钮区域重叠',
    );
    await editProjectDialog
      .locator('.ant-modal-footer .ant-btn-primary')
      .click();
    await page.getByText('项目信息已更新').waitFor();
    await secondaryProjectCard.getByText(updatedSecondaryDescription).waitFor();
    await secondaryProjectCard
      .locator('.project-dashboard__metrics button')
      .nth(3)
      .click();
    const memberDialog = page.getByRole('dialog', {
      name: new RegExp(`${renamedSecondaryProject}.*项目成员`),
    });
    await memberDialog.getByText(invitedMemberPublicId).waitFor();
    const invitedMemberRow = memberDialog.locator(
      `[data-member-id="${invitedMemberPublicId}"]`,
    );
    const ownerRemoveButton = memberDialog.locator('.member-remove:disabled');
    const invitedRemoveButton = invitedMemberRow.getByRole('button', {
      name: /移除/,
    });
    assert(
      await ownerRemoveButton.isDisabled(),
      '项目创建者的移除操作没有置灰禁用',
    );
    assert(
      !(await invitedRemoveButton.isDisabled()),
      '可移除成员的移除操作被错误禁用',
    );
    assert(
      (await memberDialog.locator('.member-remove svg').count()) === 0,
      '成员移除操作仍显示图标',
    );
    const [roleFontSize, removeFontSize] = await Promise.all([
      invitedMemberRow
        .locator('.member-role')
        .evaluate((element) => getComputedStyle(element).fontSize),
      invitedRemoveButton.evaluate(
        (element) => getComputedStyle(element).fontSize,
      ),
    ]);
    assert(
      roleFontSize === removeFontSize,
      `成员角色与移除操作字号不一致：${roleFontSize} / ${removeFontSize}`,
    );
    await invitedRemoveButton.click();
    const removeMemberDialog = page.locator('.ant-modal-confirm', {
      hasText: '待移除验收成员',
    });
    await removeMemberDialog
      .getByText(/资产、任务、设计会话和审计记录仍会完整保留/)
      .waitFor();
    await removeMemberDialog.getByRole('button', { name: '移除成员' }).click();
    await page.getByText('已将“待移除验收成员”移出项目').waitFor();
    await memberDialog
      .getByText(invitedMemberPublicId)
      .waitFor({ state: 'detached' });
    assert(
      (await memberDialog.locator('.member-remove:not(:disabled)').count()) ===
        0,
      '成员移除后列表仍保留可执行的移除操作或成员数据',
    );
    const removedMemberProjects = await apiRequest<{
      items: Array<{ id: string }>;
    }>('/projects', { token: invitedMemberToken });
    assert(
      !removedMemberProjects.items.some(
        (project) => project.id === secondaryProjectId,
      ),
      '成员从界面移除后仍可访问原项目',
    );
    await memberDialog.locator('.ant-modal-close').click();
    const projectSearch = page.getByPlaceholder('搜索项目');
    await projectSearch.fill(renamedSecondaryProject);
    assert(
      (await page.locator('.project-dashboard').count()) === 1 &&
        (await page
          .locator(`[data-project-id="${secondaryProjectId}"]`)
          .count()) === 1,
      '项目搜索没有按名称筛选项目列表',
    );
    await projectSearch.clear();
    await firstProjectCard
      .getByRole('button', { name: '修改项目信息' })
      .hover();
    await page.getByRole('tooltip', { name: '修改项目名称与说明' }).waitFor();
    await projectSearch.fill(`不存在的项目-${runId}`);
    await page.getByRole('heading', { name: '没有匹配的项目' }).waitFor();
    assert(
      (await page.getByText('请调整搜索关键词。').count()) === 1,
      '项目搜索无结果时没有显示明确空状态',
    );
    await projectSearch.clear();
    await page.getByRole('button', { name: '新建项目' }).click();
    const createProjectDialog = page.getByRole('dialog', { name: '新建项目' });
    assert(
      await createProjectDialog
        .getByRole('button', { name: '创建项目' })
        .isDisabled(),
      '项目名称为空时创建按钮没有使用禁用态',
    );
    await createProjectDialog
      .locator('.ant-modal-footer .ant-btn-default')
      .click();
    await page.screenshot({
      fullPage: true,
      path: projectSpaceScreenshotPath,
    });
    await secondaryProjectCard
      .getByRole('button', { name: '删除项目' })
      .click();
    const deleteProjectDialog = page.locator('.ant-modal-confirm', {
      hasText: renamedSecondaryProject,
    });
    await deleteProjectDialog.waitFor();
    await deleteProjectDialog
      .getByText(/资产、任务、设计会话和审计记录会完整保留/)
      .waitFor();
    await deleteProjectDialog.getByRole('button', { name: '删除项目' }).click();
    await page.getByText(`项目“${renamedSecondaryProject}”已删除`).waitFor();
    await secondaryProjectCard.waitFor({ state: 'detached' });
    const primaryProjectCard = page.locator(`[data-project-id="${projectId}"]`);
    await primaryProjectCard
      .locator('.project-dashboard__metrics button')
      .nth(0)
      .click();
    await page.waitForURL((url) => url.pathname === '/assets');
    await page.locator('.assets-page').waitFor();
    assert(
      (await page.getByLabel('按项目成员筛选资产').count()) === 1,
      '资产中心没有提供项目成员筛选',
    );
    await page.goto(`${webUrl}/jobs?status=active`);
    await page.locator('.jobs-page').waitFor();
    assert(
      (await page.locator('.job-member-filter').count()) === 1 &&
        (await page.locator('.job-sort-filter').count()) === 1,
      '任务中心没有提供成员筛选和排序',
    );
    await page
      .getByText(/^TSK-\d{8}$/)
      .first()
      .waitFor();
    const activeJobRow = page.locator('.job-row', {
      hasText: '浏览器活跃任务',
    });
    await activeJobRow.getByText('无外部执行，可取消后删除').waitFor();
    await activeJobRow.getByRole('button', { name: '取消任务' }).waitFor();
    await activeJobRow.locator('input[type="checkbox"]').click();
    await page.getByRole('button', { name: '取消选择' }).click();
    await page.locator('.job-batch-bar').waitFor({ state: 'detached' });
    await activeJobRow.getByRole('button', { name: '取消任务' }).click();
    await page.getByText('任务已取消，现在可以删除').waitFor();
    await activeJobRow.getByRole('button', { name: '删除任务' }).waitFor();
    const [cancelledAcceptanceJob] = await acceptanceSql<
      Array<{ status: string }>
    >`
      SELECT status FROM jobs WHERE id = ${jobId}
    `;
    assert(
      cancelledAcceptanceJob?.status === 'cancelled',
      '没有 Worker 执行记录的遗留活动任务不能通过任务中心取消',
    );
    // 后续会话页面仍复用这条验收夹具验证“停止生成”，因此恢复夹具状态；
    // finally 会连同验收项目统一清理，不会留下活动任务。
    await acceptanceSql`
      UPDATE jobs
      SET status = 'running', progress = 32, stage = '真实页面验收中',
          completed_at = null, updated_at = now()
      WHERE id = ${jobId}
    `;
    await page.goto(`${webUrl}/jobs`);
    const failedJobRow = page.locator('.job-row', {
      hasText: '浏览器失败日志越界验收',
    });
    await failedJobRow.waitFor();
    const failedRowLayout = await failedJobRow.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    assert(
      failedRowLayout.scrollWidth <= failedRowLayout.clientWidth + 1,
      `失败任务日志撑出了任务列表：${JSON.stringify(failedRowLayout)}`,
    );
    await failedJobRow.getByText('工作流参数与当前服务版本不一致').click();
    const errorDialog = page.locator('.ant-modal-confirm', {
      hasText: '任务错误详情',
    });
    await errorDialog.getByText(/invalid_union/).waitFor();
    await errorDialog
      .locator('.ant-modal-confirm-btns .ant-btn-primary')
      .click();
    await page.screenshot({ fullPage: true, path: jobsScreenshotPath });

    await page.goto(`${webUrl}/administration/access`);
    const currentUserRow = page.locator('.user-row', {
      hasText: username,
    });
    await currentUserRow.waitFor();
    for (const label of ['姓名', '用户 ID', '用户名', '邮箱']) {
      assert(
        (await currentUserRow.getByText(label, { exact: true }).count()) === 1,
        `用户列表缺少字段名称：${label}`,
      );
    }
    await page.getByRole('tab', { name: '角色权限' }).click();
    const roleCard = page.locator('.role-card').first();
    const roleLayout = await roleCard.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    assert(
      roleLayout.scrollWidth <= roleLayout.clientWidth + 1,
      `角色卡片文字超出边框：${JSON.stringify(roleLayout)}`,
    );

    await page.goto(`${webUrl}/design?conversationId=${designConversationId}`);
    await page.locator('.design-page').waitFor();
    await page.waitForFunction(() => {
      const loading = document.querySelector('#__app-loading__');
      if (!loading) return true;
      return Number.parseFloat(getComputedStyle(loading).opacity) < 0.01;
    });
    await page
      .getByText('浏览器验收 · 多应用设计会话', { exact: true })
      .first()
      .waitFor();
    const designUserAvatar = page.getByTestId('design-user-avatar');
    await designUserAvatar.waitFor();
    const designUserAvatarSource = await designUserAvatar.getAttribute('src');
    const uploadedAvatarPath = updatedAvatar
      ? new URL(updatedAvatar, webUrl).pathname
      : '';
    const designAvatarPath = designUserAvatarSource
      ? new URL(designUserAvatarSource, webUrl).pathname
      : '';
    assert(
      Boolean(
        designAvatarPath &&
        designAvatarPath === uploadedAvatarPath &&
        (await designUserAvatar.evaluate(
          (element) => (element as HTMLImageElement).naturalWidth,
        )) > 0,
      ),
      '个人头像更新后会话侧栏仍显示姓名首字或旧头像',
    );
    const returnToProjectsButton = page.getByRole('button', {
      name: '返回项目空间',
    });
    await returnToProjectsButton.waitFor();
    assert(
      (await returnToProjectsButton.getAttribute('title')) === '返回项目空间',
      '设计会话侧栏仍显示已下线的“返回平台概览”提示',
    );
    for (const selector of [
      '[data-testid="design-new-conversation"] svg',
      '.conversation-search svg',
      '.conversation-item__icon svg',
      '.composer-toolbar svg',
    ]) {
      const icon = page.locator(selector).first();
      await icon.waitFor();
      assert(
        (await icon
          .locator('path, circle, line, polyline, polygon, rect')
          .count()) > 0,
        `本地图标没有渲染可见矢量内容：${selector}`,
      );
    }
    assert(
      (await page.locator('.thread-timeline .workflow-round').count()) === 7,
      '统一设计会话没有按时间线恢复多个应用的历史轮次',
    );
    await page.waitForTimeout(350);
    const initialThreadScroll = await page
      .locator('.thread-scroll')
      .evaluate((element) => ({
        bottomGap:
          element.scrollHeight - element.clientHeight - element.scrollTop,
        scrollHeight: element.scrollHeight,
      }));
    assert(
      initialThreadScroll.bottomGap <= 3,
      `进入会话后没有自动定位到最新一轮：${JSON.stringify(initialThreadScroll)}`,
    );
    const modelRound = page.locator(`[data-job-id="${modelJobId}"]`);
    await modelRound.waitFor();
    await page.waitForTimeout(1200);
    const modelViewerCount = await modelRound
      .locator('.model3d-viewer')
      .count();
    const modelPreviewDiagnostic =
      modelViewerCount === 0
        ? await page.evaluate(async (assetId) => {
            const response = await fetch(`/api/v1/assets/${assetId}/preview`);
            return { body: await response.text(), status: response.status };
          }, modelAssetId)
        : undefined;
    assert(
      modelViewerCount === 1,
      `三维任务结果没有挂载查看器：${JSON.stringify(modelPreviewDiagnostic)}`,
    );
    const modelViewer = modelRound.locator('.model3d-viewer');
    await page.waitForFunction(
      (jobId) =>
        document.querySelector<HTMLElement>(
          `[data-job-id="${jobId}"] .model3d-viewer`,
        )?.dataset.modelStatus !== 'loading',
      modelJobId,
      { timeout: 20_000 },
    );
    const modelStatus = await modelViewer.getAttribute('data-model-status');
    assert(
      modelStatus === 'ready' &&
        (await modelViewer.locator('canvas').count()) === 1 &&
        (await modelViewer.locator('.model3d-toolbar button').count()) === 6,
      `设计会话没有加载真实 3D 画布和完整查看工具：${modelStatus} / ${await modelViewer.textContent()}`,
    );
    await modelRound.evaluate((element) =>
      element.scrollIntoView({ block: 'center' }),
    );
    await page.waitForTimeout(200);
    await modelViewer
      .getByRole('button', { name: '模型' })
      .evaluate((button) => (button as HTMLButtonElement).click());
    await modelViewer.getByText(/1 个网格 · 3 个顶点/).waitFor();
    await modelRound.screenshot({ path: model3dScreenshotPath });
    await page.getByText('第一轮：阳光下的现代轨道客室设计').first().waitFor();
    await page.getByText('保持结构，调整材质和照明').first().waitFor();
    const markdownRound = page.locator(`[data-job-id="${markdownJobId}"]`);
    await markdownRound.getByTestId('markdown-output').waitFor();
    await markdownRound
      .getByRole('heading', { name: '轨道客室方案' })
      .waitFor();
    await markdownRound.getByText('browser-output.md').waitFor();
    assert(
      (await markdownRound.getByText(/browser-output\.txt/).count()) === 0,
      'Markdown 文本任务仍显示为 txt 文件',
    );
    assert(
      (await markdownRound.getByText('查看本轮完整输入').count()) === 0,
      '本轮完整输入仍以突兀的常驻栏显示',
    );
    const markdownInputActions = markdownRound.getByTestId(
      'round-input-actions',
    );
    const inputActionsBeforeHover = await markdownInputActions.evaluate(
      (element) => getComputedStyle(element).opacity,
    );
    assert(
      inputActionsBeforeHover === '0',
      `输入操作没有默认收起：${inputActionsBeforeHover}`,
    );
    await markdownRound.locator('.round-input__cluster').hover();
    await page.waitForTimeout(200);
    assert(
      (await markdownInputActions.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).opacity),
      )) > 0.9,
      '悬浮用户输入后没有显示轻量操作图标',
    );
    await markdownRound.screenshot({ path: designInputHoverScreenshotPath });
    await markdownRound.getByRole('button', { name: '查看本轮参数' }).click();
    const inputDetailsDialog = page.getByRole('dialog', {
      name: '本轮完整输入',
    });
    await inputDetailsDialog.getByText('整理一份轨道客室方案说明').waitFor();
    await inputDetailsDialog.locator('.ant-modal-close').click();
    await markdownRound.getByRole('button', { name: '复制 Markdown' }).click();
    await page.getByText('Markdown 已复制').waitFor();
    const copiedMarkdown = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    assert(
      copiedMarkdown.startsWith('# 轨道客室方案'),
      '复制图标没有复制完整 Markdown 原文',
    );
    const markdownActions = markdownRound.locator('.round-output-actions');
    assert(
      (await markdownActions.locator('button').count()) === 5 &&
        (await markdownActions.getByText('下载/查看').count()) === 0,
      '生成结果操作仍使用文字按钮或图标数量不完整',
    );
    assert(
      (await markdownActions
        .locator('button svg path, button svg circle, button svg polyline')
        .count()) >= 5,
      '生成结果操作按钮存在，但本地图标内容没有显示',
    );
    await markdownRound.getByRole('button', { name: '下载或查看结果' }).hover();
    await page.getByRole('tooltip').getByText('下载或查看结果').waitFor();
    await markdownRound.screenshot({ path: designMarkdownScreenshotPath });
    const markdownVisual = await markdownRound
      .locator('.round-output-visual.output-text')
      .boundingBox();
    const markdownRoundBox = await markdownRound.boundingBox();
    const markdownInputBubble = await markdownRound
      .locator('.round-input__bubble')
      .boundingBox();
    assert(
      Boolean(
        markdownVisual &&
        markdownRoundBox &&
        markdownInputBubble &&
        Math.abs(
          markdownVisual.x -
            markdownRoundBox.x -
            (markdownRoundBox.x +
              markdownRoundBox.width -
              (markdownInputBubble.x + markdownInputBubble.width)),
        ) < 4,
      ),
      '文本输出左侧留白没有与用户输入右侧留白保持一致',
    );
    const stopButton = page.getByRole('button', { name: '停止生成' });
    await stopButton.waitFor();
    assert(
      (await stopButton.locator('.composer-stop-mark').count()) === 1,
      '运行中的设计会话没有显示停止图标',
    );
    const designRunningRound = page.locator(`[data-job-id="${jobId}"]`);
    assert(
      (await designRunningRound.locator('.round-running__icon i').count()) ===
        3 &&
        (await designRunningRound
          .getByText('生成中', { exact: true })
          .count()) === 0 &&
        (await designRunningRound
          .getByText(/Prompt ID|ComfyUI 正在执行/)
          .count()) === 0,
      '运行状态没有收敛为仅显示动态三点的轻量提示',
    );
    const visibleInputImage = page.locator(
      `[data-job-id="${comparisonJobId}"] [data-testid="round-visible-input-assets"] img`,
    );
    await visibleInputImage.waitFor();
    assert(
      await visibleInputImage.evaluate(
        (image) =>
          (image as HTMLImageElement).complete &&
          (image as HTMLImageElement).naturalWidth > 0,
      ),
      '发送后的用户消息没有直接显示本轮输入图片',
    );
    const regionComparisonRound = page.locator(
      `[data-job-id="${regionComparisonJobId}"]`,
    );
    const regionVisibleInputs = regionComparisonRound.locator(
      '[data-testid="round-visible-input-assets"] img',
    );
    await regionVisibleInputs.first().waitFor();
    assert(
      (await regionVisibleInputs.count()) === 2 &&
        (await regionComparisonRound.getByText('标记前原图').count()) >= 1 &&
        (await regionComparisonRound.getByText('分区标记图').count()) >= 1,
      '分区任务历史没有同时显示标记前原图和分区标记图',
    );
    await regionComparisonRound
      .getByRole('button', { name: /查看分区标记图/ })
      .click();
    await page.getByRole('dialog', { name: '浏览器遮罩输入' }).waitFor();
    await page
      .getByRole('dialog', { name: '浏览器遮罩输入' })
      .locator('.ant-modal-close')
      .click();
    await regionComparisonRound.locator('[data-image-comparison]').waitFor();
    const regionBeforeUrl = await regionComparisonRound
      .getByRole('img', { name: '标记前原图' })
      .getAttribute('src');
    assert(
      regionBeforeUrl?.includes(comparisonOriginalAssetId),
      '分区输出对比左图没有使用标记前原图',
    );
    assert(
      Boolean(
        await regionComparisonRound
          .getByRole('img', { name: '分区生成结果' })
          .getAttribute('src'),
      ),
      '分区输出对比右图没有使用生成结果',
    );
    const inputEditButton = page
      .locator(`[data-job-id="${comparisonJobId}"]`)
      .getByRole('button', {
        name: /查看并编辑输入图片/,
      });
    await inputEditButton.click();
    await page.getByText('遮罩编辑器', { exact: true }).waitFor();
    await page.getByRole('button', { name: '关闭遮罩编辑器' }).click();
    await page.locator('.comfy-mask-editor-modal').waitFor({ state: 'hidden' });
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.ant-spin-spinning, .ant-spin-blur')
          .length === 0,
    );
    await designRunningRound.scrollIntoViewIfNeeded();
    await page.screenshot({
      fullPage: false,
      path: designRunningScreenshotPath,
    });
    await stopButton.click();
    await page.getByText('本轮生成已停止').waitFor();
    await page.getByRole('button', { exact: true, name: '发送' }).waitFor();
    await page.reload();
    await page.locator(`[data-job-id="${comparisonJobId}"]`).waitFor();
    await page.getByRole('button', { exact: true, name: '发送' }).waitFor();
    const historicalComparisonRound = page.locator(
      `[data-job-id="${comparisonJobId}"]`,
    );
    await historicalComparisonRound.locator('.round-input__cluster').hover();
    await historicalComparisonRound
      .getByRole('button', { name: '修改并重新发送本轮输入' })
      .click();
    const historicalEdit = historicalComparisonRound.locator(
      '.round-input__editor',
    );
    const historicalPrompt = '保留原遮罩与全部参数，将座椅材质调整为耐磨织物';
    await historicalEdit.getByRole('textbox').fill(historicalPrompt);
    const historicalRerunRequestPromise = page
      .waitForRequest(
        (request) =>
          request.url().includes('/api/v1/jobs') &&
          !request.url().includes('/cancel') &&
          request.method() === 'POST',
        { timeout: 12_000 },
      )
      .catch(() => undefined);
    await historicalEdit.locator('.ant-btn-primary').click();
    const capturedHistoricalRerunRequest = await historicalRerunRequestPromise;
    if (!capturedHistoricalRerunRequest) {
      const diagnostics = await page.evaluate(() => ({
        composerApp: (
          document.querySelector(
            '[data-testid="design-composer"]',
          ) as HTMLElement | null
        )?.dataset.effectiveAppKey,
        messages: [...document.querySelectorAll('.ant-message-notice-content')]
          .map((element) => element.textContent?.trim())
          .filter(Boolean),
        visibleEditor: Boolean(
          document.querySelector('.round-input__editor textarea'),
        ),
      }));
      throw new Error(
        `历史轮次修改后没有创建新任务：${JSON.stringify(diagnostics)}`,
      );
    }
    const completedHistoricalRerun =
      await capturedHistoricalRerunRequest.response();
    assert(completedHistoricalRerun, '历史轮次重发请求没有返回响应');
    assert(completedHistoricalRerun.ok(), '历史轮次修改后重新发送失败');
    const historicalRerunRequest =
      capturedHistoricalRerunRequest.postDataJSON() as {
        appKey: string;
        designConversationId: string;
        inputAssetIds: string[];
        parameters: Record<string, unknown>;
      };
    assert(
      historicalRerunRequest.appKey === 'inpaint-single' &&
        historicalRerunRequest.designConversationId === designConversationId &&
        JSON.stringify(historicalRerunRequest.inputAssetIds) ===
          JSON.stringify([comparisonMaskAssetId]) &&
        historicalRerunRequest.parameters.prompt === historicalPrompt,
      `历史轮次没有携带原应用、会话、顺序资产和修改后的文本创建新一轮：${JSON.stringify(historicalRerunRequest)}`,
    );
    const historicalRerunEnvelope =
      (await completedHistoricalRerun.json()) as ApiEnvelope<{ id: string }>;
    const [immutableHistoricalRound] = await acceptanceSql<
      Array<{ prompt: string }>
    >`
      SELECT parameters ->> 'prompt' AS prompt
      FROM jobs
      WHERE id = ${comparisonJobId}
    `;
    assert(
      immutableHistoricalRound?.prompt === '保持结构，调整材质和照明',
      '修改重发覆盖了原历史轮次，违反历史不可变约束',
    );
    await acceptanceSql`
      UPDATE jobs
      SET status = 'cancelled', progress = 0, stage = '浏览器验收已结束',
          completed_at = now(), updated_at = now()
      WHERE id = ${historicalRerunEnvelope.data.id}
    `;
    await acceptanceSql`
      UPDATE jobs
      SET status = 'running', progress = 32, stage = '真实页面验收中',
          completed_at = NULL, updated_at = now()
      WHERE id = ${jobId}
    `;
    await page.reload();
    await page.getByRole('button', { name: '停止生成' }).waitFor();
    const applicationCount = Number(
      await page
        .locator('.composer-application-shortcuts')
        .getAttribute('data-application-count'),
    );
    assert(
      applicationCount === 15,
      `客室效果模式没有完整接入目录中的 15 项能力：${applicationCount}`,
    );
    assert(
      (await page.locator('.composer-application-shortcuts button').count()) <=
        8,
      '未选择应用时没有按快捷应用加“更多”的形式收起能力列表',
    );
    await page.getByTestId('more-design-applications').waitFor();
    const quickToolLabels = await page
      .locator('.composer-application-shortcuts button[data-app-key]')
      .allTextContents();
    assert(
      JSON.stringify(quickToolLabels.map((item) => item.trim())) ===
        JSON.stringify([
          '文本',
          '文生图',
          '理解',
          '重绘',
          '扩图',
          '多图',
          '放大',
        ]),
      `设计快捷工具没有按 0820 文档排序：${JSON.stringify(quickToolLabels)}`,
    );
    assert(
      (await page.locator('.rail-ai-float-button').count()) === 0,
      '开始设计页面仍重复显示全局 AI 助手',
    );
    const designPageBox = await page.locator('.design-page').boundingBox();
    assert(
      Boolean(
        designPageBox &&
        designPageBox.x === 0 &&
        designPageBox.y === 0 &&
        designPageBox.width === 1600 &&
        designPageBox.height === 1000,
      ),
      '开始设计没有脱离后台壳层形成全屏沉浸式工作台',
    );
    await page.getByTestId('conversation-sidebar-toggle').click();
    await page.waitForTimeout(250);
    const collapsedThreadBox = await page
      .locator('.design-thread')
      .boundingBox();
    assert(
      Boolean(collapsedThreadBox && collapsedThreadBox.x === 0),
      '任务栏收起后没有释放完整工作区宽度',
    );
    await page.getByTestId('conversation-sidebar-toggle').click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /报告生成/ }).click();
    await page.getByTestId('report-layout').waitFor();
    assert(
      (await page.getByText(/不能提交生成/).count()) === 1,
      '报告布局没有明确标识执行服务尚未接入',
    );
    await page.getByRole('button', { name: 'Close' }).click();
    const composerBox = await page.getByTestId('design-composer').boundingBox();
    assert(
      Boolean(
        composerBox &&
        composerBox.y > 0 &&
        composerBox.y + composerBox.height <= 1000,
      ),
      '设计输入器没有固定显示在当前视口底部',
    );
    const composerPanelBox = await page.locator('.composer-box').boundingBox();
    const timelinePanelBox = await page
      .locator('.workflow-round')
      .first()
      .boundingBox();
    assert(
      Boolean(
        composerPanelBox &&
        timelinePanelBox &&
        Math.abs(composerPanelBox.x - timelinePanelBox.x) < 2 &&
        Math.abs(composerPanelBox.width - timelinePanelBox.width) < 2,
      ),
      '输入框宽度没有与会话显示框保持一致',
    );
    const activeRunningConversation = page.locator('.conversation-item.active');
    await activeRunningConversation.hover();
    const activeTitleBox = await activeRunningConversation
      .locator('.conversation-item__body')
      .boundingBox();
    const activeActionsBox = await activeRunningConversation
      .locator('.conversation-actions')
      .boundingBox();
    assert(
      Boolean(
        activeTitleBox &&
        activeActionsBox &&
        activeActionsBox.y < activeTitleBox.y + activeTitleBox.height,
      ),
      '运行中会话的重命名和删除按钮仍然换到下一行',
    );
    assert(
      (await page.locator('.conversation-item').count()) === 1,
      '旧应用实例仍占用普通设计会话历史栏',
    );
    assert(
      (await page.getByText(/旧版?应用记录.*任务中心/).count()) === 0,
      '设计会话侧栏仍显示旧应用记录提示条',
    );

    await page.getByTestId('design-new-conversation').click();
    await page.waitForFunction(
      (previousId) =>
        new URL(window.location.href).searchParams.get('conversationId') !==
        previousId,
      designConversationId,
    );
    assert(
      (await page.getByTestId('active-design-application').count()) === 0,
      '新会话不应在用户未选择时显示已选应用标签',
    );
    assert(
      (await page
        .locator('.composer-box')
        .getAttribute('data-effective-app-key')) === 'text-chat',
      '未选择应用时没有在后台默认使用文生文能力',
    );
    await page.locator('.composer-application-shortcuts').waitFor();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.ant-spin-spinning, .ant-spin-blur')
          .length === 0,
    );
    await page.waitForTimeout(2000);
    const composerStyle = await page.evaluate(() => {
      const box = document.querySelector('.composer-box');
      const send = document.querySelector('.composer-submit');
      const shortcut = document.querySelector(
        '.composer-application-shortcuts button',
      );
      const textarea = document.querySelector('.composer-box textarea');
      const sendIcon = document.querySelector('.composer-submit svg');
      return {
        border: box ? getComputedStyle(box).borderColor : '',
        send: send ? getComputedStyle(send).backgroundColor : '',
        sendIconSize: sendIcon
          ? Number.parseFloat(getComputedStyle(sendIcon).width)
          : 0,
        sendIconStroke: sendIcon ? getComputedStyle(sendIcon).strokeWidth : '',
        shortcutFont: shortcut
          ? Number.parseFloat(getComputedStyle(shortcut).fontSize)
          : 0,
        shortcutWeight: shortcut
          ? Number.parseFloat(getComputedStyle(shortcut).fontWeight)
          : 0,
        textareaFont: textarea
          ? Number.parseFloat(getComputedStyle(textarea).fontSize)
          : 0,
        textareaWeight: textarea
          ? Number.parseFloat(getComputedStyle(textarea).fontWeight)
          : 0,
      };
    });
    assert(
      composerStyle.border === 'rgb(223, 142, 157)' &&
        composerStyle.send === 'rgb(197, 31, 58)',
      `设计输入器没有使用平台红色主题：${JSON.stringify(composerStyle)}`,
    );
    assert(
      composerStyle.shortcutFont >= 15 &&
        composerStyle.shortcutWeight >= 600 &&
        composerStyle.textareaFont >= 17 &&
        composerStyle.textareaWeight >= 500 &&
        composerStyle.sendIconSize >= 22 &&
        Number.parseFloat(composerStyle.sendIconStroke) >= 3,
      `设计输入器字号仍然偏小：${JSON.stringify(composerStyle)}`,
    );
    const longDesignInput = Array.from(
      { length: 28 },
      (_, index) =>
        `${index + 1}. 轨道客室长文本输入验收：空间布局、材料、照明、人机工程与维护要求需要保持一致。`,
    ).join('\n');
    const longInputTextarea = page.getByTestId('design-prompt-input');
    await longInputTextarea.fill(longDesignInput);
    const longInputLayout = await page.evaluate(() => {
      const textarea = document.querySelector(
        '[data-testid="design-prompt-input"]',
      ) as HTMLTextAreaElement | null;
      const composer = document.querySelector(
        '[data-testid="design-composer"]',
      ) as HTMLElement | null;
      const toolbar = document.querySelector(
        '.composer-bottom',
      ) as HTMLElement | null;
      if (!textarea || !composer || !toolbar) return null;
      const textareaBox = textarea.getBoundingClientRect();
      const composerBox = composer.getBoundingClientRect();
      const toolbarBox = toolbar.getBoundingClientRect();
      return {
        composerHeight: composerBox.height,
        overflowY: getComputedStyle(textarea).overflowY,
        scrollHeight: textarea.scrollHeight,
        textareaHeight: textareaBox.height,
        toolbarBottom: toolbarBox.bottom,
        toolbarTop: toolbarBox.top,
        viewportHeight: window.innerHeight,
      };
    });
    assert(
      Boolean(
        longInputLayout &&
        longInputLayout.textareaHeight <= 221 &&
        longInputLayout.scrollHeight > longInputLayout.textareaHeight &&
        ['auto', 'scroll'].includes(longInputLayout.overflowY) &&
        longInputLayout.composerHeight < longInputLayout.viewportHeight * 0.4 &&
        longInputLayout.toolbarTop > 0 &&
        longInputLayout.toolbarBottom <= longInputLayout.viewportHeight,
      ),
      `长文本仍将输入器或页面撑满：${JSON.stringify(longInputLayout)}`,
    );
    await page.screenshot({
      fullPage: true,
      path: designLongInputScreenshotPath,
    });
    await longInputTextarea.fill('');
    await page.screenshot({
      fullPage: true,
      path: designDefaultScreenshotPath,
    });

    await page.getByTestId('composer-add-material').click();
    await page.getByTestId('open-markdown-asset-picker').click();
    const markdownPicker = page.getByRole('dialog', {
      name: '从当前项目资产选择',
    });
    assert(
      (await markdownPicker.getByLabel('资产文件夹路径').count()) === 1 &&
        (await markdownPicker.locator('.asset-picker-sort').count()) === 1 &&
        (await markdownPicker.locator('.asset-picker-filter').count()) === 1,
      '应用资产选择器没有提供文件夹导航、类型筛选和排序',
    );
    await markdownPicker.getByText('设计输入素材').click();
    await markdownPicker.getByText('浏览器验收输入.md').click();
    await markdownPicker.getByRole('button', { name: '使用所选资产' }).click();
    await page.getByText('Markdown 文本已加载到输入框').waitFor();
    const designTextarea = page.locator('.composer-box textarea');
    await designTextarea.waitFor();
    const importedMarkdownText = await designTextarea.inputValue();
    assert(
      importedMarkdownText.includes('浏览器 Markdown 输入') &&
        !importedMarkdownText.includes('https://example.test'),
      `Markdown 资产没有只提取文字加载到输入框：${JSON.stringify(importedMarkdownText)}`,
    );
    const firstPrompt =
      '设计现代轨道客室空间并优化照明与耐用材质并提升乘客体验';
    await designTextarea.fill(firstPrompt);
    const createDesignJobResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/jobs') &&
        response.request().method() === 'POST',
      { timeout: 12_000 },
    );
    await page.getByRole('button', { exact: true, name: '发送' }).click();
    const createDesignJobResponse = await createDesignJobResponsePromise;
    assert(
      createDesignJobResponse.ok(),
      `设计任务接口返回失败：${createDesignJobResponse.status()} ${await createDesignJobResponse.text()}`,
    );
    const submittedNotice = page
      .getByText('任务已提交，可以切换到其他设计会话继续工作')
      .first();
    await submittedNotice.waitFor({ timeout: 12_000 }).catch(async () => {
      const diagnostics = await page.evaluate(() => ({
        activeConversation: document.querySelector('.conversation-item.active')
          ?.dataset.conversationId,
        effectiveAppKey: document.querySelector(
          '[data-testid="design-composer"] .composer-box',
        )?.dataset.effectiveAppKey,
        messages: [...document.querySelectorAll('.ant-message-notice-content')]
          .map((element) => element.textContent?.trim())
          .filter(Boolean),
        prompt: (
          document.querySelector(
            '[data-testid="design-prompt-input"]',
          ) as HTMLTextAreaElement | null
        )?.value,
        submitLabel: document
          .querySelector('.composer-submit')
          ?.getAttribute('aria-label'),
      }));
      throw new Error(`设计任务提交失败：${JSON.stringify(diagnostics)}`);
    });
    assert(
      (await designTextarea.inputValue()) === '',
      '任务成功提交后输入框仍保留上一次文本',
    );
    await page
      .getByText('设计现代轨道客室空间并优化照明与耐用材…', { exact: true })
      .first()
      .waitFor();

    const activeConversationItem = page.locator('.conversation-item.active');
    await activeConversationItem.hover();
    await activeConversationItem
      .locator('button[aria-label="重命名当前会话"]')
      .click();
    const renameDialog = page.getByRole('dialog', {
      name: '重命名设计会话',
    });
    await renameDialog.getByRole('textbox').fill('浏览器验收 · 重命名会话');
    await page
      .locator('.ant-modal:visible .ant-modal-footer .ant-btn-primary')
      .click();
    await page
      .getByText('浏览器验收 · 重命名会话', { exact: true })
      .first()
      .waitFor();

    await page.locator('[data-app-key="text-chat"]').click();
    const parameterDrawer = page.locator('.design-parameter-drawer');
    await page.getByTestId('open-design-parameters').click();
    await parameterDrawer.waitFor();
    await parameterDrawer
      .getByText(/文本生成|文生文/)
      .first()
      .waitFor();
    await page.locator('.ant-drawer:visible .ant-drawer-extra button').click();
    await page.getByRole('button', { name: '取消选择当前应用' }).click();
    await page.locator('.composer-application-shortcuts').waitFor();
    await page.locator('[data-app-key="text-to-image"]').click();
    await page.getByTestId('active-design-application').waitFor();
    assert(
      (await page.locator('.composer-application-shortcuts').count()) === 0,
      '选择应用后其他应用入口没有隐藏',
    );
    await page.getByRole('button', { name: '取消选择当前应用' }).waitFor();
    const moreParameterButton = page.getByTestId('open-design-parameters');
    const parameterBarBox = await page
      .locator('.parameter-chips')
      .boundingBox();
    const moreParameterBox = await moreParameterButton.boundingBox();
    assert(
      Boolean(
        parameterBarBox &&
        moreParameterBox &&
        moreParameterBox.x + moreParameterBox.width <=
          parameterBarBox.x + parameterBarBox.width + 1,
      ),
      '参数较多时“更多”按钮仍被裁切到用户可见区域外',
    );
    const quickParameter = page.locator('[data-param-key]').first();
    await quickParameter.click();
    const quickPanel = page.locator('.design-quick-popover:visible');
    await quickPanel.waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ fullPage: true, path: designQuickScreenshotPath });
    const quickNumberInput = quickPanel.locator('.ant-input-number-input');
    if (await quickNumberInput.count()) {
      await quickNumberInput.fill('1536');
      await quickNumberInput.press('Enter');
    }
    await page.keyboard.press('Escape');
    await page.getByTestId('open-design-parameters').click();
    await parameterDrawer
      .getByText(/文生图/)
      .first()
      .waitFor();
    await page.locator('.ant-drawer:visible .ant-drawer-extra button').click();
    await page.waitForTimeout(500);
    await page.screenshot({ fullPage: true, path: designScreenshotPath });
    await page.getByRole('button', { name: '取消选择当前应用' }).click();
    await page.locator('.composer-application-shortcuts').waitFor();
    await page.locator('[data-app-key="text-to-image"]').click();

    await page.getByRole('button', { name: '新建会话' }).click();
    await page.waitForFunction(
      (conversationId) =>
        new URL(window.location.href).searchParams.get('conversationId') !==
        conversationId,
      designConversationId,
    );
    const temporaryConversationItem = page.locator('.conversation-item.active');
    await temporaryConversationItem.hover();
    await temporaryConversationItem
      .locator('button[aria-label="删除当前会话"]')
      .evaluate((button) => (button as HTMLButtonElement).click());
    const archiveDialog = page.getByRole('dialog');
    await archiveDialog.getByText(/项目资产、任务台账和审计记录/).waitFor();
    await archiveDialog.getByRole('button', { name: '删除会话' }).click();
    await page
      .getByText('浏览器验收 · 重命名会话', { exact: true })
      .first()
      .waitFor();
    await page
      .locator(`[data-conversation-id="${designConversationId}"]`)
      .click();
    await page.waitForFunction(
      (conversationId) =>
        new URL(window.location.href).searchParams.get('conversationId') ===
        conversationId,
      designConversationId,
    );

    const firstCompletedRound = page.locator(`[data-job-id="${historyJobId}"]`);
    await firstCompletedRound.getByRole('button', { name: '继续设计' }).click();
    const continueDialog = page.getByRole('dialog', {
      name: '在本会话中继续设计',
    });
    await continueDialog
      .getByText(/不需要选择其他应用会话，也不需要重复上传/)
      .waitFor();
    const continueSelects = continueDialog.locator('.ant-select');
    await continueSelects.nth(1).click();
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option')
      .first()
      .click();
    await continueDialog
      .getByRole('button', { name: '加入资产并继续' })
      .click();
    const composerInputAssets = page.getByTestId('composer-input-assets');
    await composerInputAssets.waitFor();
    const composerInputImage = composerInputAssets.locator('img').first();
    await composerInputImage.waitFor();
    assert(
      await composerInputImage.evaluate(
        (image) =>
          (image as HTMLImageElement).complete &&
          (image as HTMLImageElement).naturalWidth > 0,
      ),
      '发送前输入框没有直接显示已选择的图片素材',
    );
    await continueDialog.waitFor({ state: 'hidden' });
    await page.waitForTimeout(300);
    await page.screenshot({
      fullPage: true,
      path: designInputScreenshotPath,
    });

    await page.goto(`${webUrl}/assets`);
    const imageCard = page.locator('.asset-card', {
      hasText: '浏览器验收图片',
    });
    await imageCard.waitFor();
    const image = imageCard.locator('img');
    await image.waitFor();
    await image.evaluate(
      (element) =>
        new Promise<void>((resolve, reject) => {
          if (element.complete && element.naturalWidth > 0) return resolve();
          element.addEventListener('load', () => resolve(), { once: true });
          element.addEventListener(
            'error',
            () => reject(new Error('资产缩略图加载失败')),
            { once: true },
          );
        }),
    );
    assert(
      await image.evaluate(
        (element) => element.complete && element.naturalWidth > 0,
      ),
      '资产中心图片缩略图没有真实加载',
    );
    await image.click();
    const imageLightbox = page.locator('.platform-image-lightbox');
    await imageLightbox.waitFor();
    const lightboxViewport = imageLightbox.locator('.lightbox-viewport');
    assert(
      (await imageLightbox.getByLabel('拖拽查看图片').count()) === 1,
      '图片放大查看器没有显示拖拽查看提示',
    );
    await imageLightbox.locator('img').evaluate((element) => {
      element.style.width = '1000px';
      element.style.maxWidth = 'none';
    });
    await imageLightbox.getByRole('button', { name: '放大图片' }).click();
    await imageLightbox.getByRole('button', { name: '放大图片' }).click();
    assert(
      (await lightboxViewport.evaluate(
        (element) => getComputedStyle(element).cursor,
      )) === 'grab' &&
        (await lightboxViewport.evaluate(
          (element) => getComputedStyle(element).overflow,
        )) === 'hidden',
      '图片放大后没有进入抓手拖拽模式，仍依赖滚动条查看',
    );
    const lightboxImage = imageLightbox.locator('img');
    const transformBeforeDrag = await lightboxImage.evaluate(
      (element) => element.style.transform,
    );
    const viewportBox = await lightboxViewport.boundingBox();
    assert(viewportBox, '无法读取图片拖拽视口边界');
    await page.mouse.move(
      viewportBox.x + viewportBox.width / 2,
      viewportBox.y + viewportBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      viewportBox.x + viewportBox.width / 2 + 90,
      viewportBox.y + viewportBox.height / 2 + 50,
    );
    await page.mouse.up();
    const transformAfterDrag = await lightboxImage.evaluate(
      (element) => element.style.transform,
    );
    assert(
      transformBeforeDrag !== transformAfterDrag &&
        !transformAfterDrag.startsWith('translate(0px, 0px)'),
      '按住图片拖拽后没有改变查看位置',
    );
    await imageLightbox.locator('.ant-modal-close').click();

    const textCard = page.locator('.asset-card', {
      hasText: '浏览器验收文本',
    });
    const textAssetId = await textCard.getAttribute('data-asset-id');
    assert(textAssetId, '浏览器验收文本缺少资产 ID');
    const textPreviewResponsePromise = page.waitForResponse((response) =>
      response.url().includes(`/api/v1/assets/${textAssetId}/preview`),
    );
    await textCard.click();
    const textDetailDrawer = page.locator('.ant-drawer:visible');
    await textDetailDrawer.waitFor();
    const textPreviewResponse = await textPreviewResponsePromise;
    assert(textPreviewResponse.ok(), '资产文本预览接口请求失败');
    const textPreviewPayload = await textPreviewResponse.json();
    await page.waitForTimeout(500);
    const textPreviewState = await textDetailDrawer.evaluate((drawer) => ({
      body: drawer.textContent ?? '',
      preview: drawer.querySelector('.asset-detail-preview')?.innerHTML ?? '',
    }));
    assert(
      textPreviewState.body.includes(
        '这是用于验收资产中心阅读能力的真实文本。',
      ),
      `资产文本预览正文没有渲染：${JSON.stringify({ textPreviewPayload, textPreviewState })}`,
    );
    await page.locator('.ant-drawer-close').click();

    const modelCard = page
      .locator(`.asset-card:visible[data-asset-id="${modelAssetId}"]`)
      .first();
    await modelCard.click();
    const assetModelViewer = page.locator(
      '.ant-drawer .model3d-viewer[data-model-status="ready"]',
    );
    await assetModelViewer.waitFor({ timeout: 20_000 });
    assert(
      (await assetModelViewer.getByRole('button', { name: '场景' }).count()) ===
        1 &&
        (await assetModelViewer
          .getByRole('button', { name: '导出' })
          .count()) === 1,
      '资产详情 3D 查看器缺少 ComfyUI 对应的场景或导出操作',
    );
    await assetModelViewer.getByRole('button', { name: '模型' }).click();
    await assetModelViewer.getByText('模型设置', { exact: true }).waitFor();
    const renamedModel = '浏览器验收三维模型（已重命名）';
    await page.locator('#asset-detail-name').fill(renamedModel);
    await page.getByRole('button', { name: '保存名称' }).click();
    await page.getByText('资产名称已更新').waitFor();
    await page.goto(`${webUrl}/assets`);
    await page
      .locator(`.asset-card[data-asset-id="${modelAssetId}"]`, {
        hasText: renamedModel,
      })
      .first()
      .waitFor();

    const nameSortResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/assets?') &&
        response.url().includes('sortBy=name') &&
        response.url().includes('sortOrder=asc'),
    );
    await page.locator('.asset-sort-filter').click();
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option', {
        hasText: '名称：A–Z',
      })
      .click();
    const completedNameSortResponse = await nameSortResponse;
    assert(completedNameSortResponse.ok(), '资产名称排序请求失败');
    const typeSortResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/assets?') &&
        response.url().includes('sortBy=type') &&
        response.url().includes('sortOrder=asc'),
    );
    await page.locator('.asset-sort-filter').click();
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option', {
        hasText: '类型：正序',
      })
      .click();
    const completedTypeSortResponse = await typeSortResponse;
    assert(completedTypeSortResponse.ok(), '资产类型排序请求失败');

    const rootFolderName = `验收素材 ${runId.slice(-6)}`;
    const childFolderName = '方案备选';
    const renamedChildFolderName = '方案归档';
    await page.getByRole('button', { name: '新建文件夹' }).click();
    const createRootFolderDialog = page.getByRole('dialog', {
      name: '新建文件夹',
    });
    await createRootFolderDialog.getByRole('textbox').fill(rootFolderName);
    await createRootFolderDialog
      .locator('.ant-modal-footer .ant-btn-primary')
      .click();
    await page.getByText('文件夹已创建').waitFor();
    const rootFolderCard = page.locator('.asset-folder-card', {
      hasText: rootFolderName,
    });
    await rootFolderCard.waitFor();
    const rootFolderId = await rootFolderCard.getAttribute('data-folder-id');
    assert(rootFolderId, '新建的持久化资产文件夹缺少稳定编号');
    await rootFolderCard.click();
    await page
      .getByRole('navigation', { name: '资产文件夹路径' })
      .getByRole('button', { name: rootFolderName })
      .waitFor();
    await page.getByRole('button', { name: '新建文件夹' }).click();
    const createChildFolderDialog = page.getByRole('dialog', {
      name: '新建文件夹',
    });
    await createChildFolderDialog.getByRole('textbox').fill(childFolderName);
    await createChildFolderDialog
      .locator('.ant-modal-footer .ant-btn-primary')
      .click();
    await page.getByText('文件夹已创建').waitFor();
    const childFolderCard = page.locator('.asset-folder-card', {
      hasText: childFolderName,
    });
    await childFolderCard
      .getByRole('button', { name: `重命名文件夹${childFolderName}` })
      .click();
    const renameFolderDialog = page.getByRole('dialog', {
      name: '重命名文件夹',
    });
    await renameFolderDialog.getByRole('textbox').fill(renamedChildFolderName);
    await renameFolderDialog
      .locator('.ant-modal-footer .ant-btn-primary')
      .click();
    await page.getByText('文件夹名称已更新').waitFor();
    await page
      .getByRole('navigation', { name: '资产文件夹路径' })
      .getByRole('button', { name: '全部资产' })
      .click();
    await page.getByRole('button', { name: '列表视图' }).click();
    assert(
      (await page.locator('.asset-list').count()) === 1,
      '资产中心没有切换为列表视图',
    );
    await imageCard
      .locator('input[type="checkbox"]')
      .evaluate((input) => (input as HTMLInputElement).click());
    await page.getByText('已选择 1 项').waitFor();
    await page.getByRole('button', { name: '取消选择' }).click();
    await page.locator('.asset-batch-bar').waitFor({ state: 'detached' });
    await imageCard
      .locator('input[type="checkbox"]')
      .evaluate((input) => (input as HTMLInputElement).click());
    await page.getByText('已选择 1 项').waitFor();
    await page.getByRole('button', { name: '复制到' }).click();
    const copyAssetsDialog = page.getByRole('dialog', {
      name: '复制所选资产',
    });
    await copyAssetsDialog.locator('.ant-select').click();
    await page
      .locator('.ant-select-dropdown:visible')
      .getByTitle(rootFolderName, { exact: true })
      .click();
    await copyAssetsDialog
      .locator('.ant-modal-footer .ant-btn-primary')
      .click();
    await page.getByText('资产已复制').waitFor();
    await rootFolderCard.click();
    const copiedImageCard = page.locator('.asset-card', {
      hasText: '浏览器验收图片 - 副本',
    });
    await copiedImageCard.waitFor();
    await copiedImageCard
      .locator('input[type="checkbox"]')
      .evaluate((input) => (input as HTMLInputElement).click());
    await page.getByText('已选择 1 项').waitFor();
    await page.getByRole('button', { name: '移动到' }).click();
    const moveAssetsDialog = page.getByRole('dialog', {
      name: '移动所选资产',
    });
    await moveAssetsDialog.locator('.ant-select').click();
    await page
      .locator('.ant-select-dropdown:visible')
      .getByTitle(`${rootFolderName} / ${renamedChildFolderName}`, {
        exact: true,
      })
      .click();
    await moveAssetsDialog
      .locator('.ant-modal-footer .ant-btn-primary')
      .click();
    await page.getByText('资产已移动').waitFor();
    const renamedChildFolderCard = page.locator('.asset-folder-card', {
      hasText: renamedChildFolderName,
    });
    await renamedChildFolderCard.click();
    await page
      .locator('.asset-card', { hasText: '浏览器验收图片 - 副本' })
      .waitFor();
    await page.screenshot({
      fullPage: true,
      path: assetFoldersScreenshotPath,
    });
    await page
      .getByRole('navigation', { name: '资产文件夹路径' })
      .getByRole('button', { name: '全部资产' })
      .click();
    const persistedRootFolder = page.locator(
      `[data-folder-id="${rootFolderId}"]`,
    );
    await persistedRootFolder
      .getByRole('button', { name: `删除文件夹${rootFolderName}` })
      .click();
    const deleteFolderDialog = page.getByRole('dialog');
    await deleteFolderDialog
      .getByText(/所有子文件夹及其中资产会从资产中心软删除/)
      .waitFor();
    await deleteFolderDialog.getByRole('button', { name: '递归删除' }).click();
    await page.getByText(/已删除 2 个文件夹和 1 项资产/).waitFor();
    assert(
      (await page.locator('.asset-card__format').count()) === 0,
      '资产列表视图仍残留与多选位置重叠的格式角标',
    );
    await page.getByRole('button', { name: '网格视图' }).click();
    await page.locator('.asset-grid').waitFor();
    const favoriteCandidateCard = page.locator('.asset-card', {
      hasText: '浏览器验收图片',
    });
    await favoriteCandidateCard.waitFor();
    const favoriteButton = favoriteCandidateCard.getByRole('button', {
      name: '收藏资产',
    });
    const selectAssetControl = favoriteCandidateCard.locator(
      '.asset-card__select',
    );
    assert(
      Number.parseFloat(
        await favoriteButton.evaluate(
          (element) => getComputedStyle(element).opacity,
        ),
      ) === 0 &&
        Number.parseFloat(
          await selectAssetControl.evaluate(
            (element) => getComputedStyle(element).opacity,
          ),
        ) === 0 &&
        (await favoriteCandidateCard.locator('.asset-card__format').count()) ===
          0,
      '未悬浮资产仍显示收藏、多选或与多选位置重叠的格式角标',
    );
    await favoriteCandidateCard.hover();
    await page.waitForTimeout(200);
    const [favoriteButtonBox, selectAssetBox] = await Promise.all([
      favoriteButton.boundingBox(),
      selectAssetControl.boundingBox(),
    ]);
    assert(
      Boolean(
        favoriteButtonBox &&
        selectAssetBox &&
        Math.abs(favoriteButtonBox.width - selectAssetBox.width) <= 1 &&
        Math.abs(favoriteButtonBox.height - selectAssetBox.height) <= 1 &&
        Number.parseFloat(
          await favoriteButton.evaluate(
            (element) => getComputedStyle(element).opacity,
          ),
        ) === 1,
      ),
      '收藏星标悬浮可见性或尺寸没有与选择控件保持一致',
    );
    const selectCircle = selectAssetControl.locator('.ant-checkbox-inner');
    const [selectControlBox, selectCircleBox] = await Promise.all([
      selectAssetControl.boundingBox(),
      selectCircle.boundingBox(),
    ]);
    const selectCircleStyle = await selectCircle.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
      };
    });
    assert(
      Boolean(
        selectControlBox &&
        selectCircleBox &&
        Math.abs(
          selectCircleBox.x +
            selectCircleBox.width / 2 -
            (selectControlBox.x + selectControlBox.width / 2),
        ) <= 1 &&
        Math.abs(
          selectCircleBox.y +
            selectCircleBox.height / 2 -
            (selectControlBox.y + selectControlBox.height / 2),
        ) <= 1 &&
        selectCircleStyle.borderRadius === '50%' &&
        selectCircleStyle.borderColor === 'rgb(32, 38, 44)',
      ),
      `多选圆圈没有使用黑色边缘或未在角标中居中：${JSON.stringify(selectCircleStyle)}`,
    );
    await favoriteButton.click();
    await page.getByText('已添加到“收藏”文件夹').waitFor();
    await favoriteCandidateCard.waitFor();
    await favoriteCandidateCard
      .getByRole('button', { name: '取消收藏' })
      .waitFor();
    const favoriteFolderCard = page.locator('.asset-folder-card', {
      hasText: '收藏',
    });
    await favoriteFolderCard.waitFor();
    assert(
      (await favoriteFolderCard.getByRole('button').count()) === 0,
      '系统收藏文件夹仍显示重命名或删除操作',
    );
    await favoriteFolderCard.click();
    const favoritedAssetCard = page.locator('.asset-card', {
      hasText: '浏览器验收图片',
    });
    await favoritedAssetCard.waitFor();
    const unfavoriteButton = favoritedAssetCard.getByRole('button', {
      name: '取消收藏',
    });
    assert(
      Number.parseFloat(
        await unfavoriteButton.evaluate(
          (element) => getComputedStyle(element).opacity,
        ),
      ) === 1 && (await unfavoriteButton.locator('svg').count()) === 1,
      '已收藏资产没有常驻显示统一的选中星标',
    );
    await unfavoriteButton.click();
    await page.getByText('已取消收藏').waitFor();
    await favoritedAssetCard.waitFor({ state: 'detached' });
    await page
      .getByRole('navigation', { name: '资产文件夹路径' })
      .getByRole('button', { name: '全部资产' })
      .click();
    await page.locator('.asset-card', { hasText: '浏览器验收图片' }).waitFor();

    await page.goto(`${webUrl}/workspace/screen-capture-edit`);
    await waitForWorkspaceTransition(true);
    await page
      .getByRole('heading', { level: 1, name: '实时画面编辑' })
      .waitFor();
    await page.getByText('捕获间隔（毫秒）').first().waitFor();
    await page.getByText('降噪强度').first().waitFor();
    assert(
      !(await page
        .locator('.advanced-deck')
        .evaluate((element) => (element as HTMLDetailsElement).open)),
      '高级参数首次进入时没有保持折叠',
    );
    assert(
      (await page.locator('.capability-line.running').count()) === 0,
      '无活跃任务时执行链路仍显示运行动效',
    );
    await page.getByRole('button', { name: '共享屏幕' }).click();
    await page.getByRole('button', { name: 'Live On' }).waitFor();
    await page.waitForTimeout(1000);
    const captureState = await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>(
        '.capture-preview-frame video',
      );
      return {
        hasSource: Boolean(video?.srcObject),
        readyState: video?.readyState ?? -1,
        videoHeight: video?.videoHeight ?? 0,
        videoWidth: video?.videoWidth ?? 0,
      };
    });
    assert(
      captureState.videoWidth > 0,
      `实时捕获视频未就绪：${JSON.stringify(captureState)}`,
    );
    await page.getByRole('button', { name: 'Set Area' }).click();
    const areaDialog = page
      .locator('.ant-modal-wrap:visible')
      .filter({ hasText: '设置捕获区域' })
      .last();
    const areaCanvas = areaDialog.locator('canvas');
    const bounds = await areaCanvas.boundingBox();
    assert(bounds, '捕获区域画布未渲染');
    await areaCanvas.hover({
      position: { x: bounds.width * 0.15, y: bounds.height * 0.2 },
    });
    await page.mouse.down();
    await areaCanvas.hover({
      position: { x: bounds.width * 0.75, y: bounds.height * 0.8 },
    });
    await page.mouse.up();
    await areaDialog
      .getByRole('button', { name: '使用所选区域' })
      .evaluate((button) => (button as HTMLButtonElement).click());
    await page.waitForTimeout(300);
    const storedCrop = await page.evaluate(() =>
      localStorage.getItem('rail-workflow-screen-area-capturedFrame'),
    );
    assert(storedCrop, '捕获区域没有在用户确认后保存');
    await page.screenshot({ fullPage: true, path: captureScreenshotPath });
    await page.getByRole('button', { name: 'Live On' }).click();
    await page.getByRole('button', { name: '停止 Live' }).waitFor();
    await page.locator('.capability-line.running').waitFor();
    await page.getByRole('button', { name: '停止 Live' }).click();
    await page.getByRole('button', { name: 'Live On' }).waitFor();
    const stopCaptureButton = page.getByRole('button', {
      exact: true,
      name: '停止',
    });
    if ((await stopCaptureButton.count()) > 0) await stopCaptureButton.click();

    await page.goto(`${webUrl}/workspace/camera-control-single`);
    await waitForWorkspaceTransition(true);
    await page.locator('.camera-control').waitFor();
    await page.getByText('镜头角度控制').waitFor();
    const cameraField = page.locator('.media-field', { hasText: '原始视图' });
    await cameraField.getByRole('button', { name: '从项目资产选择' }).click();
    const cameraAssetDialog = page.getByRole('dialog', {
      name: '从当前项目资产选择',
    });
    await cameraAssetDialog.getByText('浏览器验收图片').click();
    await cameraAssetDialog
      .getByRole('button', { name: '使用所选资产' })
      .click();
    await cameraField.getByText('浏览器验收图片').waitFor();
    const cameraControl = page.locator('.camera-control');
    const cameraSubjectPreview = cameraControl
      .locator('.camera-subject-preview')
      .first();
    await cameraSubjectPreview.waitFor();
    assert(
      await cameraSubjectPreview.evaluate(
        (image) =>
          (image as HTMLImageElement).complete &&
          (image as HTMLImageElement).naturalWidth > 0,
      ),
      '镜头控制器没有显示已选输入图片',
    );
    const presetSelectBoxes = await Promise.all(
      ['azimuth', 'elevation', 'distance'].map((className) =>
        cameraControl
          .locator(`.camera-presets .${className} select`)
          .first()
          .boundingBox(),
      ),
    );
    const presetValueBoxes = await Promise.all(
      ['azimuth', 'elevation', 'distance'].map((className) =>
        cameraControl
          .locator(`.camera-presets .${className} strong`)
          .first()
          .boundingBox(),
      ),
    );
    assert(
      presetSelectBoxes.every(
        (box) =>
          box &&
          presetSelectBoxes[0] &&
          Math.abs(box.y - presetSelectBoxes[0].y) <= 1,
      ) &&
        presetValueBoxes.every(
          (box) =>
            box &&
            presetValueBoxes[0] &&
            Math.abs(box.y - presetValueBoxes[0].y) <= 1,
        ),
      '镜头水平、垂直和距离预设没有保持在同一水平线',
    );
    const cameraOrbit = cameraControl.locator('.camera-visual svg').first();
    const cameraHorizontalValue = cameraControl
      .locator('.camera-presets .azimuth strong')
      .first();
    const initialHorizontalText = await cameraHorizontalValue.textContent();
    const initialHorizontalAngle = Number(
      initialHorizontalText?.replace('°', ''),
    );
    const cameraOrbitBox = await cameraOrbit.boundingBox();
    assert(cameraOrbitBox, '镜头控制器没有可交互的轨道画布');
    // 前序图片平移验收可能让 Playwright 鼠标保持按下状态，先归一化。
    await page.mouse.up();
    const orbitStart = {
      x: cameraOrbitBox.x + cameraOrbitBox.width * 0.5,
      y: cameraOrbitBox.y + cameraOrbitBox.height * 0.5,
    };
    await cameraControl
      .locator('.camera-visual')
      .first()
      .dispatchEvent('mousedown', {
        button: 0,
        buttons: 1,
        clientX: orbitStart.x,
        clientY: orbitStart.y,
      });
    await page.mouse.move(
      cameraOrbitBox.x + cameraOrbitBox.width * 0.68,
      cameraOrbitBox.y + cameraOrbitBox.height * 0.42,
      { steps: 6 },
    );
    await page.mouse.up();
    await page.waitForTimeout(150);
    const draggedHorizontalText = await cameraHorizontalValue.textContent();
    assert(
      Number(draggedHorizontalText?.replace('°', '')) !==
        initialHorizontalAngle,
      '拖拽镜头轨道后水平角度没有变化',
    );
    await cameraControl
      .locator('.camera-presets .azimuth select')
      .first()
      .selectOption('225');
    await cameraControl
      .locator('.camera-presets .elevation select')
      .first()
      .selectOption('30');
    await cameraControl
      .locator('.camera-presets .distance select')
      .first()
      .selectOption('4');
    await page.waitForTimeout(700);
    await page.reload();
    await page.locator('.camera-control').waitFor();
    const restoredCameraField = page.locator('.media-field', {
      hasText: '原始视图',
    });
    await restoredCameraField.getByText('浏览器验收图片').waitFor();
    await restoredCameraField.locator('.media-preview img').waitFor();
    assert(
      await restoredCameraField
        .locator('.media-preview img')
        .evaluate((image) => (image as HTMLImageElement).naturalWidth > 0),
      '重新进入角度工作流后图片预览没有恢复',
    );
    assert(
      Number(
        await page
          .locator('.camera-presets .azimuth select')
          .first()
          .inputValue(),
      ) === 225,
      '重新进入角度工作流后没有恢复镜头参数',
    );
    assert(
      Number(
        await page
          .locator('.camera-presets .elevation select')
          .first()
          .inputValue(),
      ) === 30 &&
        Number(
          await page
            .locator('.camera-presets .distance select')
            .first()
            .inputValue(),
        ) === 4,
      '镜头垂直角度或距离预设没有恢复',
    );
    await page.screenshot({ fullPage: true, path: cameraScreenshotPath });

    await page.goto(`${webUrl}/workspace/region-marker-edit`);
    await waitForWorkspaceTransition(true);
    const regionField = page.locator('.media-field', {
      hasText: '颜色与编号分区',
    });
    await regionField.getByRole('button', { name: '从项目资产选择' }).click();
    const regionAssetDialog = page.getByRole('dialog', {
      name: '从当前项目资产选择',
    });
    await regionAssetDialog.getByText('浏览器验收图片').click();
    await regionAssetDialog
      .getByRole('button', { name: '使用所选资产' })
      .click();
    await regionField.getByText('浏览器验收图片').waitFor();
    await regionField.locator('.media-preview').click();
    const regionEditor = page.getByRole('dialog', { name: '分区重绘编辑器' });
    await regionEditor.getByRole('button', { name: '画笔' }).waitFor();
    await regionEditor.getByRole('button', { name: '方框' }).waitFor();
    await regionEditor.getByRole('button', { name: '色块' }).waitFor();
    await regionEditor.getByRole('button', { name: '2', exact: true }).click();
    for (const marker of ['1', '2', '3', '4', '5', '6']) {
      const markerButton = regionEditor.getByRole('button', {
        name: marker,
        exact: true,
      });
      const markerText = await markerButton.textContent();
      assert(
        markerText?.trim() === marker,
        `选中分区编号后编号 ${marker} 消失`,
      );
    }
    assert(
      await regionEditor
        .getByRole('button', { name: '2', exact: true })
        .evaluate((button) => {
          const style = getComputedStyle(button);
          return (
            style.color !== style.backgroundColor &&
            style.backgroundColor !== 'rgba(0, 0, 0, 0)'
          );
        }),
      '当前选中的分区编号与背景同色，视觉上不可见',
    );
    const regionCanvas = regionEditor.locator('canvas');
    const regionBounds = await regionCanvas.boundingBox();
    assert(regionBounds, '分区打标画布未渲染');
    await regionCanvas.hover({
      position: { x: regionBounds.width * 0.2, y: regionBounds.height * 0.2 },
    });
    await page.mouse.down();
    await regionCanvas.hover({
      position: { x: regionBounds.width * 0.65, y: regionBounds.height * 0.65 },
    });
    await page.mouse.up();
    await page.screenshot({ fullPage: true, path: regionScreenshotPath });
    await regionEditor.getByRole('button', { name: '应用分区' }).click();
    await page.waitForTimeout(700);
    const sqlForDraft = useDatabase();
    const [regionDraft] = await sqlForDraft<{ marks: null | string }[]>`
      SELECT parameter_values ->> 'regionMarks' AS marks
      FROM workflow_workspace_drafts
      WHERE user_id = ${userId}
        AND project_id = ${projectId}
        AND app_key = 'region-marker-edit'
    `;
    assert(
      regionDraft?.marks?.includes('brush:square') &&
        regionDraft.marks.includes(':2:'),
      '颜色与编号分区没有按 EasyMark 协议保存到工作区草稿',
    );

    await page.goto(`${webUrl}/workspace/inpaint-single`);
    await waitForWorkspaceTransition(true);
    const maskField = page.locator('.media-field', { hasText: '底图与遮罩' });
    await maskField.getByRole('button', { name: '从项目资产选择' }).click();
    const maskAssetDialog = page.getByRole('dialog', {
      name: '从当前项目资产选择',
    });
    await maskAssetDialog.getByText('浏览器验收图片').click();
    await maskAssetDialog.getByRole('button', { name: '使用所选资产' }).click();
    await maskField.getByText('浏览器验收图片').waitFor();
    await maskField.locator('.media-preview').click();
    const inputMaskEditor = page.locator('.comfy-mask-editor-shell');
    await inputMaskEditor.getByText('遮罩编辑器', { exact: true }).waitFor();
    await inputMaskEditor.getByText('笔刷设置', { exact: true }).waitFor();
    await inputMaskEditor.getByText('图层', { exact: true }).waitFor();
    await inputMaskEditor.getByRole('button', { name: '取消' }).click();
    await inputMaskEditor.waitFor({ state: 'hidden' });

    await page.goto(
      `${webUrl}/workspace/text-to-image?instanceId=${textWorkspaceInstanceId}`,
    );
    await waitForWorkspaceTransition();
    await page.locator('.capability-line.running').waitFor();
    assert(
      (await page.locator('.workflow-round').count()) === 2,
      '同一应用没有恢复历史轮次和当前运行轮次',
    );
    await page
      .locator('.round-input__bubble')
      .getByText('第一轮：阳光下的现代轨道客室设计')
      .waitFor();
    await page
      .locator('.round-input__bubble')
      .getByText('第二轮：夜景氛围的轨道客室设计')
      .waitFor();
    const typeScale = await page.evaluate(() => {
      const body = document.querySelector('.round-input__bubble p');
      const caption = document.querySelector('.round-heading');
      const fieldLabel = document.querySelector('.studio-field > span');
      const panelTitle = document.querySelector('.deck-heading h2');
      return {
        body: body ? Number.parseFloat(getComputedStyle(body).fontSize) : 0,
        caption: caption
          ? Number.parseFloat(getComputedStyle(caption).fontSize)
          : 0,
        fieldLabel: fieldLabel
          ? Number.parseFloat(getComputedStyle(fieldLabel).fontSize)
          : 0,
        panelTitle: panelTitle
          ? Number.parseFloat(getComputedStyle(panelTitle).fontSize)
          : 0,
      };
    });
    assert(
      typeScale.caption === 12 &&
        typeScale.fieldLabel === 13 &&
        typeScale.body === 14 &&
        typeScale.panelTitle === 17,
      `工作区字号层级不符合 12/13/14/17 统一规范：${JSON.stringify(typeScale)}`,
    );
    const runningRound = page.locator(`[data-job-id="${jobId}"]`);
    assert(
      (await runningRound.locator('.round-running__icon i').count()) === 3 &&
        (await runningRound.getByText('生成中', { exact: true }).count()) ===
          0 &&
        (await runningRound.getByText(/Prompt ID|真实页面验收中/).count()) ===
          0,
      '应用工作区仍展示突兀的外部执行技术状态',
    );
    assert(
      (await page.getByRole('button', { name: '开始运行' }).count()) === 0,
      '应用已有任务运行时仍允许提交第二个任务',
    );
    const advancedDeck = page.locator('.advanced-deck');
    await advancedDeck.locator('summary').click();
    const advancedLayout = await advancedDeck
      .locator('.advanced-fields')
      .evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
    assert(
      advancedLayout.clientHeight <= 522 &&
        advancedLayout.scrollHeight > advancedLayout.clientHeight,
      `高级参数没有形成固定高度内部滚动区：${JSON.stringify(advancedLayout)}`,
    );
    const runningAnimation = await page
      .locator('.capability-line.running em')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName);
    assert(
      runningAnimation !== 'none',
      `活跃任务时执行链路没有显示运行动效：${runningAnimation}`,
    );
    const sql = useDatabase();
    await sql`
      UPDATE jobs
      SET status = 'succeeded', progress = 100, stage = '执行完成',
          completed_at = now(), updated_at = now()
      WHERE id = ${jobId}
    `;
    await runningRound.getByText('浏览器暂存结果').waitFor({
      timeout: 10_000,
    });
    const outputImage = runningRound.locator(
      '.round-output-visual.output-image img',
    );
    await outputImage.waitFor();
    assert(
      await outputImage.evaluate(
        (image) =>
          (image as HTMLImageElement).complete &&
          (image as HTMLImageElement).naturalWidth > 0,
      ),
      '工作流结果图片没有真实加载',
    );
    const outputFit = await runningRound
      .locator('.round-output-visual.output-image')
      .evaluate((visual) => {
        const image = visual.querySelector('img');
        const visualBounds = visual.getBoundingClientRect();
        const imageBounds = image?.getBoundingClientRect();
        return {
          background: getComputedStyle(visual).backgroundColor,
          heightDifference: imageBounds
            ? Math.abs(visualBounds.height - imageBounds.height)
            : Number.POSITIVE_INFINITY,
          widthDifference: imageBounds
            ? Math.abs(visualBounds.width - imageBounds.width)
            : Number.POSITIVE_INFINITY,
        };
      });
    assert(
      outputFit.background === 'rgba(0, 0, 0, 0)' &&
        outputFit.heightDifference < 2 &&
        outputFit.widthDifference < 2,
      `结果图片外围仍存在填充区域：${JSON.stringify(outputFit)}`,
    );
    assert(
      (await page.locator('.capability-line.running').count()) === 0,
      '任务完成后执行链路没有恢复静态',
    );
    await runningRound.getByRole('button', { name: '打开遮罩编辑器' }).click();
    const outputMaskEditor = page.locator('.comfy-mask-editor-shell');
    await outputMaskEditor.getByText('遮罩编辑器', { exact: true }).waitFor();
    await outputMaskEditor.locator('.mask-canvas-stack').waitFor();
    await outputMaskEditor.getByTitle('向右旋转').click();
    await outputMaskEditor.getByTitle('撤销').click();
    await outputMaskEditor.getByTitle('遮罩画笔').waitFor();
    await outputMaskEditor.getByTitle('绘画画笔').waitFor();
    await outputMaskEditor.getByTitle('橡皮').click();
    const editorLayers = outputMaskEditor.locator('.layer-card');
    await editorLayers.nth(1).getByRole('button', { name: '激活层' }).click();
    const paintLayerClass = await editorLayers.nth(1).getAttribute('class');
    assert(paintLayerClass?.includes('active'), '橡皮工具不能切换到绘画层');
    await editorLayers.nth(0).getByRole('button', { name: '激活层' }).click();
    const maskLayerClass = await editorLayers.nth(0).getAttribute('class');
    assert(maskLayerClass?.includes('active'), '橡皮工具不能切换回遮罩层');
    await outputMaskEditor.getByTitle('填充').click();
    await outputMaskEditor.getByText('填充设置', { exact: true }).waitFor();
    await outputMaskEditor.getByText('填充不透明度', { exact: true }).waitFor();
    await outputMaskEditor.getByTitle('颜色选取').click();
    await outputMaskEditor.getByText('色彩选取设置', { exact: true }).waitFor();
    await outputMaskEditor.getByText('应用到图像整体').waitFor();
    await outputMaskEditor.getByText('遇到遮罩时停止').waitFor();
    await outputMaskEditor.getByTitle('遮罩画笔').click();
    await outputMaskEditor.getByText('笔刷设置', { exact: true }).waitFor();
    const maskCanvas = outputMaskEditor
      .locator('.mask-canvas-stack canvas')
      .last();
    const maskBounds = await maskCanvas.boundingBox();
    assert(maskBounds, '输出结果遮罩画布未渲染');
    await page.mouse.move(
      maskBounds.x + maskBounds.width * 0.3,
      maskBounds.y + maskBounds.height * 0.3,
    );
    await page.mouse.down();
    await page.mouse.move(
      maskBounds.x + maskBounds.width * 0.7,
      maskBounds.y + maskBounds.height * 0.7,
    );
    await page.mouse.up();
    await page.screenshot({ fullPage: true, path: maskScreenshotPath });
    await outputMaskEditor.getByRole('button', { name: '保存' }).click();
    await page.getByText('遮罩编辑结果已保存到当前项目资产中心').waitFor();
    await outputMaskEditor.waitFor({ state: 'hidden' });
    const [savedMask] = await sql<{ id: string }[]>`
      SELECT asset.id
      FROM assets asset
      JOIN asset_tags tag ON tag.asset_id = asset.id
      WHERE asset.project_id = ${projectId}
        AND asset.owner_id = ${userId}
        AND asset.saved_at IS NOT NULL
        AND tag.tag = '遮罩'
      ORDER BY asset.created_at DESC
      LIMIT 1
    `;
    assert(savedMask?.id, '遮罩编辑结果没有登记为当前项目资产');
    await page.reload();
    await page.locator(`[data-job-id="${jobId}"]`).waitFor();
    await runningRound.getByRole('button', { name: '流转到工作流' }).click();
    const flowDialog = page.getByRole('dialog', { name: '流转到兼容工作流' });
    const applicationSelect = flowDialog.locator('.ant-select').nth(0);
    const selectedApplicationText = await applicationSelect
      .locator('.ant-select-selection-item')
      .textContent();
    const selectedApplication = selectedApplicationText?.trim();
    if (!selectedApplication?.includes('多图融合编辑')) {
      const applicationInput = applicationSelect.locator(
        '.ant-select-selection-search-input',
      );
      await applicationSelect.locator('.ant-select-selector').click();
      await page.waitForFunction(
        (input) => input?.getAttribute('aria-expanded') === 'true',
        await applicationInput.elementHandle(),
      );
      const applicationOptions = page
        .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
        .locator('.ant-select-item-option');
      const multiImageOption = applicationOptions
        .filter({ hasText: '多图融合编辑' })
        .first();
      if ((await multiImageOption.count()) === 0) {
        throw new Error(
          `流转目标应用缺少“多图融合编辑”；当前选中=${selectedApplication || '空'}；候选项=${JSON.stringify(await applicationOptions.allTextContents())}`,
        );
      }
      await multiImageOption.click();
    }
    await flowDialog.locator('.ant-select').nth(1).click();
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('多图融合编辑 · 已有目标会话', { exact: true })
      .click();
    assert(
      await flowDialog
        .getByRole('button', { name: '加入资产并流转' })
        .isDisabled(),
      '未选择具体输入位时流转按钮没有禁用',
    );
    await flowDialog.locator('.ant-select').nth(2).click();
    const targetDropdown = page.locator('.ant-select-dropdown:visible');
    await targetDropdown.getByText(/基础空间/).waitFor();
    await targetDropdown.getByText(/样式参考/).waitFor();
    await targetDropdown.getByText(/材质参考/).click();
    await flowDialog.getByRole('button', { name: '加入资产并流转' }).click();
    await page.waitForURL(
      new RegExp(
        `/workspace/multi-image-edit\\?instanceId=${multiWorkspaceInstanceId}`,
      ),
    );
    const materialField = page.locator('.media-field', { hasText: '材质参考' });
    await materialField.getByText('浏览器暂存结果').waitFor();
    await page.reload();
    await materialField.getByText('浏览器暂存结果').waitFor();
    const activeTab = page.locator('[data-tab-item="true"].is-active');
    await activeTab.getByText(/多图融合编辑/).waitFor();

    await page.goto(
      `${webUrl}/workspace/text-to-image?instanceId=${textWorkspaceInstanceId}&source=history-check`,
    );
    await waitForWorkspaceTransition();
    await page
      .locator('.capability-studio:visible')
      .getByText('浏览器暂存结果')
      .first()
      .waitFor();
    const restoredJobIds = await page
      .locator('.capability-studio:visible .workflow-round')
      .evaluateAll((elements) =>
        elements.map((element) =>
          (element as HTMLElement).dataset.jobId?.trim(),
        ),
      );
    assert(
      restoredJobIds.includes(historyJobId) && restoredJobIds.includes(jobId),
      `重新进入应用标签后没有恢复两轮历史任务：${JSON.stringify(restoredJobIds)}`,
    );
    await page.goto(`${webUrl}/workspace/text-to-image`);
    await waitForWorkspaceTransition(true);
    await page.getByRole('button', { name: '开始运行' }).first().waitFor();
    assert(
      (await page
        .locator('.capability-studio:visible .workflow-round')
        .count()) === 0,
      '同一应用的新会话错误复用了其他会话的历史轮次',
    );
    const textToImageTabs = page
      .locator('[data-tab-item="true"]')
      .filter({ hasText: /文生图/ });
    const openTabTitles = await page
      .locator('[data-tab-item="true"]')
      .allTextContents();
    assert(
      (await textToImageTabs.count()) === 2,
      `同一应用没有保留两个独立的会话标签：${JSON.stringify(openTabTitles)}`,
    );
    await page.goto(
      `${webUrl}/workspace/text-to-image?instanceId=${textWorkspaceInstanceId}`,
    );
    await waitForWorkspaceTransition();
    const historicalRound = page
      .locator('.capability-studio:visible .workflow-round')
      .first();
    await historicalRound.locator('.round-input__cluster').hover();
    await historicalRound.getByRole('button', { name: '查看本轮参数' }).click();
    const historicalInputDialog = page.getByRole('dialog', {
      name: '本轮完整输入',
    });
    await historicalInputDialog.locator('dt').getByText('画面描述').waitFor();
    await page.screenshot({
      fullPage: true,
      path: conversationScreenshotPath,
    });
    await historicalInputDialog.locator('.ant-modal-close').click();

    await page.goto(
      `${webUrl}/workspace/inpaint-single?instanceId=${comparisonWorkspaceInstanceId}`,
    );
    await waitForWorkspaceTransition();
    const comparisonRound = page.locator(`[data-job-id="${comparisonJobId}"]`);
    await comparisonRound.locator('[data-image-comparison]').waitFor();
    const comparisonBefore = comparisonRound.getByRole('img', {
      name: '遮罩前原图',
    });
    const comparisonAfter = comparisonRound.getByRole('img', {
      name: '遮罩生成结果',
    });
    const comparisonBeforeUrl = await comparisonBefore.getAttribute('src');
    assert(
      Boolean(
        comparisonBeforeUrl?.includes(comparisonOriginalAssetId) &&
        !comparisonBeforeUrl.includes(comparisonMaskAssetId),
      ),
      '图像对比左图没有使用遮罩前原始底图',
    );
    assert(
      Boolean(await comparisonAfter.getAttribute('src')),
      '图像对比右图没有使用本轮生成结果',
    );
    const comparisonRange = comparisonRound.getByRole('slider', {
      name: '拖动查看图片修改前后对比',
    });
    await comparisonRange.fill('28');
    assert(
      (await comparisonRange.inputValue()) === '28',
      '图片对比滑块不能左右拖动',
    );
    assert(
      (await comparisonRound
        .getByRole('button', { name: '打开遮罩编辑器' })
        .count()) === 0,
      '图片对比模式仍显示可点击或不可点击的遮罩入口',
    );
    await comparisonRound
      .getByRole('button', { exact: true, name: '结果' })
      .click();
    await comparisonRound
      .locator('.round-output-visual.output-image')
      .waitFor();
    assert(
      (await comparisonRound
        .getByRole('button', { name: '打开遮罩编辑器' })
        .count()) === 1,
      '切回结果模式后没有恢复原有遮罩编辑入口',
    );
    await comparisonRound.getByRole('button', { name: '对比' }).click();
    await comparisonRound.locator('[data-image-comparison]').waitFor();
    await comparisonRound.locator('.round-input__cluster').hover();
    await comparisonRound.getByRole('button', { name: '查看本轮参数' }).click();
    const comparisonInputDialog = page.getByRole('dialog', {
      name: '本轮完整输入',
    });
    await comparisonInputDialog.getByText('浏览器遮罩输入').waitFor();
    await page.screenshot({ fullPage: true, path: comparisonScreenshotPath });
    await comparisonInputDialog.locator('.ant-modal-close').click();

    await page.screenshot({ fullPage: true, path: screenshotPath });
    assert(
      iconifyNetworkRequests.length === 0,
      `页面仍依赖 Iconify 公网图标接口：${iconifyNetworkRequests.join(', ')}`,
    );
    assert(pageErrors.length === 0, `页面脚本错误：${pageErrors.join(' | ')}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

let failed = false;
try {
  await runBrowserAcceptance();
  console.warn(
    `浏览器验收通过，截图：${[dashboardScreenshotPath, projectSpaceScreenshotPath, assetFoldersScreenshotPath, jobsScreenshotPath, designDefaultScreenshotPath, designLongInputScreenshotPath, designScreenshotPath, designQuickScreenshotPath, designInputScreenshotPath, designInputHoverScreenshotPath, designMarkdownScreenshotPath, designRunningScreenshotPath, model3dScreenshotPath, captureScreenshotPath, cameraScreenshotPath, regionScreenshotPath, maskScreenshotPath, conversationScreenshotPath, comparisonScreenshotPath, screenshotPath].join('、')}`,
  );
} catch (error) {
  failed = true;
  console.error('浏览器验收失败', error);
} finally {
  try {
    await cleanupAcceptanceData();
  } catch (error) {
    failed = true;
    console.error('浏览器验收清理失败', error);
  }
  await closeDatabase();
}

if (failed) process.exitCode = 1;
