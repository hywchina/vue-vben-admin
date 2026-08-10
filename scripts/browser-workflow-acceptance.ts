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

  const sql = useDatabase();
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
  const outputAssetId = randomUUID();
  const outputObjectKey = `${projectId}/browser-acceptance/${randomUUID()}.png`;
  await storeObject(
    outputObjectKey,
    version.mimeType,
    await readObject(version.objectKey),
  );
  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO jobs (
        id, project_id, app_key, name, parameters, created_by,
        status, progress, stage, started_at
      ) VALUES (
        ${jobId}, ${projectId}, 'text-to-image', '浏览器活跃任务',
        '{}'::jsonb, ${userId}, 'running', 32, '真实页面验收中', now()
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
      INSERT INTO job_outputs (job_id, asset_id, position)
      VALUES (${jobId}, ${outputAssetId}, 0)
    `;
  });
  return { imageAssetId: prepared.asset.id, jobId };
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
  const { jobId } = await setupAcceptanceData();
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

  try {
    await page.goto(`${webUrl}/auth/login`);
    await page.getByText('欢迎回来 👋🏻').waitFor();
    const loginInputs = page.locator('form input:visible');
    await loginInputs.nth(0).fill(username);
    await loginInputs.nth(1).fill(password);
    await page.locator('button').filter({ hasText: '登录' }).last().click();
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'));

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

    await page.goto(`${webUrl}/workspace/text-to-image`);
    await page.locator('.capability-line.running').waitFor();
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
    await page.getByText('浏览器暂存结果').waitFor({ timeout: 10_000 });
    assert(
      (await page.locator('.capability-line.running').count()) === 0,
      '任务完成后执行链路没有恢复静态',
    );
    await page.getByRole('button', { name: '流转到工作流' }).click();
    const flowDialog = page.getByRole('dialog', { name: '流转到兼容工作流' });
    await flowDialog.locator('.ant-select').nth(0).click();
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('多图融合编辑', { exact: true })
      .click();
    assert(
      await flowDialog
        .getByRole('button', { name: '加入资产并流转' })
        .isDisabled(),
      '未选择具体输入位时流转按钮没有禁用',
    );
    await flowDialog.locator('.ant-select').nth(1).click();
    const targetDropdown = page.locator('.ant-select-dropdown:visible');
    await targetDropdown.getByText(/基础空间/).waitFor();
    await targetDropdown.getByText(/样式参考/).waitFor();
    await targetDropdown.getByText(/材质参考/).click();
    await flowDialog.getByRole('button', { name: '加入资产并流转' }).click();
    await page.waitForURL(/\/workspace\/multi-image-edit/);
    const materialField = page.locator('.media-field', { hasText: '材质参考' });
    await materialField.getByText('浏览器暂存结果').waitFor();
    await page.reload();
    await materialField.getByText('浏览器暂存结果').waitFor();
    const activeTab = page.locator('[data-tab-item="true"].is-active');
    await activeTab.getByText('多图融合编辑').waitFor();

    await page.goto(`${webUrl}/workspace/text-to-image`);
    await page.locator('.ready-state').waitFor();
    assert(
      (await page.getByText('浏览器暂存结果').count()) === 0,
      '重新进入工作流时仍显示上次已完成结果',
    );
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
    `浏览器验收通过，截图：${[captureScreenshotPath, cameraScreenshotPath, regionScreenshotPath, screenshotPath].join('、')}`,
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
