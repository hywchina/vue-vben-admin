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
let projectId = '';
let userId = '';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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
  await sql`
    UPDATE user_roles
    SET role_id = (SELECT id FROM roles WHERE code = 'admin')
    WHERE user_id = ${userId}
  `;
  const login = await apiRequest<{ accessToken: string }>('/auth/login', {
    body: { password, username },
  });
  const token = login.accessToken;
  const project = await apiRequest<{ id: string }>('/projects', {
    body: {
      description: `browser-acceptance-${runId}`,
      name: `浏览器验收 ${runId.slice(-6)}`,
      stage: 'concept',
    },
    token,
  });
  projectId = project.id;
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
  const designConversationId = randomUUID();
  const textWorkspaceInstanceId = randomUUID();
  const comparisonWorkspaceInstanceId = randomUUID();
  const multiWorkspaceInstanceId = randomUUID();
  const outputAssetId = randomUUID();
  const historyOutputAssetId = randomUUID();
  const comparisonOutputAssetId = randomUUID();
  const comparisonMaskAssetId = randomUUID();
  const outputObjectKey = `${projectId}/browser-acceptance/${randomUUID()}.png`;
  const historyOutputObjectKey = `${projectId}/browser-acceptance/${randomUUID()}.png`;
  const comparisonOutputObjectKey = `${projectId}/browser-acceptance/${randomUUID()}.png`;
  const comparisonMaskObjectKey = `${projectId}/browser-acceptance/${randomUUID()}.png`;
  const sourceBytes = await readObject(version.objectKey);
  await storeObject(outputObjectKey, version.mimeType, sourceBytes);
  await storeObject(historyOutputObjectKey, version.mimeType, sourceBytes);
  await storeObject(comparisonOutputObjectKey, version.mimeType, sourceBytes);
  await storeObject(comparisonMaskObjectKey, version.mimeType, sourceBytes);
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
        status, progress, stage, started_at, workspace_instance_id,
        design_conversation_id
      ) VALUES (
        ${jobId}, ${projectId}, 'text-to-image', '浏览器活跃任务',
        ${transaction.json({ prompt: '第二轮：夜景氛围的轨道客室设计' })},
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
      INSERT INTO job_outputs (job_id, asset_id, position)
      VALUES (${comparisonJobId}, ${comparisonOutputAssetId}, 0)
    `;
  });
  return {
    comparisonJobId,
    comparisonMaskAssetId,
    comparisonOriginalAssetId: prepared.asset.id,
    comparisonWorkspaceInstanceId,
    designConversationId,
    historyJobId,
    imageAssetId: prepared.asset.id,
    jobId,
    multiWorkspaceInstanceId,
    textWorkspaceInstanceId,
  };
}

async function cleanupAcceptanceData() {
  const sql = useDatabase();
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
  if (userId) {
    await sql`DELETE FROM audit_events WHERE actor_id = ${userId}`;
    await sql`DELETE FROM users WHERE id = ${userId}`;
  }
}

async function runBrowserAcceptance() {
  const {
    comparisonJobId,
    comparisonMaskAssetId,
    comparisonOriginalAssetId,
    comparisonWorkspaceInstanceId,
    designConversationId,
    historyJobId,
    jobId,
    multiWorkspaceInstanceId,
    textWorkspaceInstanceId,
  } = await setupAcceptanceData();
  const browserExecutable = process.env.RAIL_BROWSER_EXECUTABLE;
  const browser = await chromium.launch({
    ...(browserExecutable ? { executablePath: browserExecutable } : {}),
    args: [
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
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'));

    await page.goto(`${webUrl}/design?conversationId=${designConversationId}`);
    await page.locator('.design-page').waitFor();
    await page
      .getByText('浏览器验收 · 多应用设计会话', { exact: true })
      .first()
      .waitFor();
    assert(
      (await page.locator('.thread-timeline .workflow-round').count()) === 3,
      '统一设计会话没有按时间线恢复多个应用的历史轮次',
    );
    await page.getByText('第一轮：阳光下的现代轨道客室设计').first().waitFor();
    await page.getByText('保持结构，调整材质和照明').first().waitFor();
    const applicationCount = Number(
      await page
        .locator('.composer-application-shortcuts')
        .getAttribute('data-application-count'),
    );
    assert(applicationCount >= 18, '统一设计会话没有接入全部应用能力');
    assert(
      (await page.locator('.composer-application-shortcuts button').count()) <=
        8,
      '未选择应用时没有按快捷应用加“更多”的形式收起能力列表',
    );
    await page.getByTestId('more-design-applications').waitFor();
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
    const composerBox = await page.getByTestId('design-composer').boundingBox();
    assert(
      Boolean(
        composerBox &&
        composerBox.y > 0 &&
        composerBox.y + composerBox.height <= 1000,
      ),
      '设计输入器没有固定显示在当前视口底部',
    );
    assert(
      (await page.locator('.conversation-item').count()) === 1,
      '旧应用实例仍占用普通设计会话历史栏',
    );
    await page.getByText(/3 条旧版应用记录已移至任务中心/).waitFor();

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
    await page.waitForTimeout(500);
    await page.screenshot({
      fullPage: true,
      path: designDefaultScreenshotPath,
    });

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

    await page.getByTestId('composer-add-material').click();
    const parameterDrawer = page.locator('.design-parameter-drawer');
    await parameterDrawer.waitFor();
    await parameterDrawer
      .getByText(/文本生成|文生文/)
      .first()
      .waitFor();
    await page.locator('.ant-drawer:visible .ant-drawer-extra button').click();
    await page.locator('[data-app-key="text-to-image"]').click();
    await page.getByTestId('active-design-application').waitFor();
    assert(
      (await page.locator('.composer-application-shortcuts').count()) === 0,
      '选择应用后其他应用入口没有隐藏',
    );
    await page.getByRole('button', { name: '取消选择当前应用' }).waitFor();
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

    await activeConversationItem.hover();
    await activeConversationItem
      .locator('button[aria-label="删除当前会话"]')
      .click();
    const archiveDialog = page.getByRole('dialog');
    await archiveDialog.getByText(/项目资产、任务台账和审计记录/).waitFor();
    await archiveDialog.getByRole('button', { name: '删除会话' }).click();
    await page
      .getByText('浏览器验收 · 多应用设计会话', { exact: true })
      .first()
      .waitFor();

    const firstCompletedRound = page.locator('.workflow-round').first();
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
    await parameterDrawer.waitFor();
    await parameterDrawer.getByText('输入内容').waitFor();

    await page.goto(`${webUrl}/assets`);
    const imageCard = page.locator('.asset-card', {
      hasText: '浏览器验收图片',
    });
    await imageCard.waitFor();
    const image = imageCard.locator('img');
    await image.waitFor();
    assert(
      await image.evaluate(
        (element) => element.complete && element.naturalWidth > 0,
      ),
      '资产中心图片缩略图没有真实加载',
    );
    await image.click();
    await page.locator('.platform-image-lightbox').waitFor();
    await page.locator('.platform-image-lightbox .ant-modal-close').click();

    const textCard = page.locator('.asset-card', {
      hasText: '浏览器验收文本',
    });
    await textCard.click();
    await page
      .locator('.asset-detail-preview__text')
      .getByText('这是用于验收资产中心阅读能力的真实文本。')
      .waitFor();
    await page.locator('.ant-drawer-close').click();

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
    const horizontalSlider = page
      .locator('.camera-slider')
      .filter({ hasText: '水平角度' })
      .locator('input[type="range"]');
    await horizontalSlider.fill('225');
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
      Number(await horizontalSlider.inputValue()) === 225,
      '重新进入角度工作流后没有恢复镜头参数',
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
    await runningRound.getByText('真实页面验收中').waitFor();
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
    await runningRound.getByRole('button', { name: '流转到工作流' }).click();
    const flowDialog = page.getByRole('dialog', { name: '流转到兼容工作流' });
    await flowDialog.locator('.ant-select').nth(0).click();
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('多图融合编辑', { exact: true })
      .click();
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
    await historicalRound.locator('.round-input-details summary').click();
    await historicalRound.locator('dt').getByText('画面描述').waitFor();
    await page.screenshot({
      fullPage: true,
      path: conversationScreenshotPath,
    });

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
        .count()) === 1,
      '图片对比模式没有保留遮罩编辑入口',
    );
    await comparisonRound.getByRole('button', { name: '结果' }).click();
    await comparisonRound
      .locator('.round-output-visual.output-image')
      .waitFor();
    await comparisonRound.getByRole('button', { name: '对比' }).click();
    await comparisonRound.locator('[data-image-comparison]').waitFor();
    await comparisonRound.locator('.round-input-details summary').click();
    await comparisonRound.getByText('浏览器遮罩输入').waitFor();
    await page.screenshot({ fullPage: true, path: comparisonScreenshotPath });

    await page.screenshot({ fullPage: true, path: screenshotPath });
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
    `浏览器验收通过，截图：${[designDefaultScreenshotPath, designScreenshotPath, captureScreenshotPath, cameraScreenshotPath, regionScreenshotPath, maskScreenshotPath, conversationScreenshotPath, comparisonScreenshotPath, screenshotPath].join('、')}`,
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
