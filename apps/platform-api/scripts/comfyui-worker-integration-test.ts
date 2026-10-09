import type { AddressInfo } from 'node:net';

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import process from 'node:process';

const pixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function main() {
  let historyRequests = 0;
  const promptId = `mock-${randomUUID()}`;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    response.setHeader('content-type', 'application/json');
    if (request.method === 'POST' && url.pathname === '/prompt') {
      for await (const _chunk of request) {
        // Drain the request body so the mock behaves like a real HTTP server.
      }
      response.end(JSON.stringify({ number: 1, prompt_id: promptId }));
      return;
    }
    if (request.method === 'GET' && url.pathname === `/history/${promptId}`) {
      historyRequests += 1;
      response.end(
        JSON.stringify(
          historyRequests === 1
            ? {}
            : {
                [promptId]: {
                  outputs: {
                    '356': {
                      images: [
                        {
                          filename: 'worker-integration.png',
                          subfolder: '',
                          type: 'output',
                        },
                      ],
                    },
                  },
                  status: { completed: true, status_str: 'success' },
                },
              },
        ),
      );
      return;
    }
    if (request.method === 'GET' && url.pathname === '/queue') {
      response.end(
        JSON.stringify({
          queue_pending: [[1, promptId, {}, {}, []]],
          queue_running: [],
        }),
      );
      return;
    }
    if (request.method === 'GET' && url.pathname === '/view') {
      response.setHeader('content-type', 'image/png');
      response.end(pixelPng);
      return;
    }
    response.statusCode = 404;
    response.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  process.env.COMFYUI_API_URL = `http://127.0.0.1:${address.port}`;
  process.env.COMFYUI_POLL_INTERVAL_MS = '250';

  const [
    { closeDatabase, useDatabase },
    { createDownloadUrl, deleteObject },
    { ComfyUiClient },
    { ComfyUiWorker },
  ] = await Promise.all([
    import('../utils/infrastructure/database'),
    import('../utils/infrastructure/storage'),
    import('../utils/domain/capabilities/comfyui/client'),
    import('../utils/domain/capabilities/comfyui/worker'),
  ]);
  const sql = useDatabase();
  const testMarker = randomUUID();
  const projectId = randomUUID();
  const workerId = `integration-${testMarker}`;
  let assetId: null | string = null;
  let jobId: null | string = null;
  let objectKey: null | string = null;
  const workspaceInstanceId = randomUUID();
  const designConversationId = randomUUID();
  const testUserId = randomUUID();
  const unrelatedJobId = randomUUID();
  try {
    const [scope] = await sql<{ userId: string; workflowVersionId: string }[]>`
      SELECT
        ${testUserId}::uuid AS "userId",
        cw.workflow_version_id AS "workflowVersionId"
      FROM capability_workflows cw
      WHERE cw.capability_code = 'text-to-image' AND cw.active = true
      LIMIT 1
    `;
    if (!scope?.userId || !scope.workflowVersionId) {
      throw new Error('模拟 Worker 集成测试需要已完成迁移和种子初始化');
    }
    const { hashPassword } = await import('../utils/identity/password');
    await sql`
      INSERT INTO users (id, username, password_hash, real_name)
      VALUES (${testUserId}, ${`worker_it_${testMarker.replaceAll('-', '')}`},
        ${await hashPassword(randomUUID())}, 'Worker 临时验收用户')
    `;
    await sql`
      INSERT INTO projects (id, code, name, owner_id)
      VALUES (
        ${projectId}, ${`IT-${testMarker.slice(0, 16)}`},
        ${`Worker 集成项目 ${testMarker}`}, ${scope.userId}
      )
    `;
    await sql`
      INSERT INTO workflow_workspace_instances (
        id, user_id, project_id, app_key, title
      ) VALUES (
        ${workspaceInstanceId}, ${scope.userId}, ${projectId},
        'text-to-image', ${`Worker 集成会话 ${testMarker}`}
      )
    `;
    await sql`
      INSERT INTO design_conversations (id, user_id, project_id)
      VALUES (${designConversationId}, ${scope.userId}, ${projectId})
    `;
    const [job] = await sql<{ id: string }[]>`
      INSERT INTO jobs (
        project_id, app_key, name, parameters, created_by, status, stage,
        workflow_version_id, workspace_instance_id, design_conversation_id
      ) VALUES (
        ${projectId},
        'text-to-image',
        ${`ComfyUI Worker 集成验收 ${testMarker}`},
        ${sql.json({
          batchSize: 1,
          height: 1024,
          prompt: '轨道客室文生图模拟验收',
          seed: 42,
          steps: 4,
          width: 1024,
        })},
        ${scope.userId},
        'queued',
        '等待 ComfyUI Worker 接收',
        ${scope.workflowVersionId},
        ${workspaceInstanceId}, ${designConversationId}
      )
      RETURNING id
    `;
    if (!job) throw new Error('无法创建模拟 Worker 集成任务');
    jobId = job.id;
    await sql`
      INSERT INTO jobs (id, project_id, app_key, name, parameters, created_by, status,
        workflow_version_id, workspace_instance_id, design_conversation_id)
      SELECT ${unrelatedJobId}, project_id, app_key, 'Worker 隔离哨兵', parameters, created_by, 'queued',
        workflow_version_id, workspace_instance_id, design_conversation_id
      FROM jobs WHERE id = ${jobId}
    `;
    await sql`
      INSERT INTO job_executions (job_id, provider, workflow_version_id, status,
        lease_owner, lease_expires_at, created_at)
      VALUES (${unrelatedJobId}, 'comfyui', ${scope.workflowVersionId}, 'pending',
        ${workerId}, now() + interval '10 minutes', now() - interval '1 day')
    `;
    await sql`
      INSERT INTO job_executions (
        job_id, provider, workflow_version_id, status, lease_owner, lease_expires_at
      ) VALUES (
        ${jobId}, 'comfyui', ${scope.workflowVersionId}, 'pending',
        ${workerId}, now() + interval '10 minutes'
      )
    `;

    const client = new ComfyUiClient({
      apiUrl: process.env.COMFYUI_API_URL,
      timeoutMs: 2000,
    });
    const worker = new ComfyUiWorker({
      client,
      instanceId: workerId,
      jobIds: [jobId],
    });
    if (
      await new ComfyUiWorker({
        client,
        instanceId: workerId,
        jobIds: [],
      }).runOnce()
    )
      throw new Error('空任务范围不能领取任何任务');
    const runPhase = async (label: string) => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await sql`
          UPDATE job_executions
          SET next_poll_at = now(), lease_owner = ${workerId},
              lease_expires_at = now() + interval '10 minutes'
          WHERE job_id = ${jobId}
        `;
        if (await worker.runOnce()) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const [state] = await sql<{ status: string }[]>`
        SELECT status FROM job_executions WHERE job_id = ${jobId}
      `;
      throw new Error(`${label}，当前执行状态：${state?.status ?? 'missing'}`);
    };
    await runPhase('Worker 未领取模拟任务');
    await runPhase('Worker 未执行排队轮询');
    await runPhase('Worker 未执行完成轮询');
    const [unrelated] = await sql<{ status: string }[]>`
      SELECT status FROM job_executions WHERE job_id = ${unrelatedJobId}
    `;
    if (unrelated?.status !== 'pending')
      throw new Error('模拟 Worker 领取了范围外任务');

    const [result] = await sql<
      {
        assetId: string;
        assetName: string;
        executionStatus: string;
        jobStatus: string;
        objectKey: string;
        originalFilename: string;
        receiptStatus: string;
        savedAt: Date | null;
      }[]
    >`
      SELECT
        j.status AS "jobStatus",
        je.status AS "executionStatus",
        jor.status AS "receiptStatus",
        jor.asset_id AS "assetId",
        a.name AS "assetName",
        av.object_key AS "objectKey",
        av.original_filename AS "originalFilename",
        a.saved_at AS "savedAt"
      FROM jobs j
      JOIN job_executions je ON je.job_id = j.id
      JOIN job_output_receipts jor ON jor.job_id = j.id
      JOIN assets a ON a.id = jor.asset_id
      JOIN asset_versions av ON av.asset_id = jor.asset_id
      WHERE j.id = ${jobId}
      ORDER BY av.version DESC
      LIMIT 1
    `;
    if (
      result?.jobStatus !== 'succeeded' ||
      result.executionStatus !== 'succeeded' ||
      result.receiptStatus !== 'available' ||
      !result.assetId ||
      !result.objectKey ||
      result.savedAt !== null
    ) {
      throw new Error('Worker 未完成任务、输出回执或结果未保持暂存状态');
    }
    assetId = result.assetId;
    objectKey = result.objectKey;
    const [conversation] = await sql<{ publicId: string }[]>`
      SELECT public_id AS "publicId" FROM design_conversations WHERE id = ${designConversationId}
    `;
    if (
      !conversation ||
      !result.assetName.startsWith(`${conversation.publicId}-`) ||
      !/\d{8}-001\.png$/.test(result.assetName) ||
      result.assetName !== result.originalFilename
    )
      throw new Error('生成资产标题和下载名称未按统一规则登记');
    const downloadUrl = await createDownloadUrl(
      objectKey,
      result.originalFilename,
    );
    const downloaded = await fetch(downloadUrl);
    if (
      !downloaded.ok ||
      !downloaded.headers
        .get('content-disposition')
        ?.includes(encodeURIComponent(result.originalFilename)) ||
      !Buffer.from(await downloaded.arrayBuffer()).equals(pixelPng)
    )
      throw new Error('统一命名的真实下载文件名或内容不正确');
    console.warn(
      'ComfyUI Worker 端到端验收通过：提交、轮询、MinIO 与结果暂存。',
    );
  } finally {
    try {
      if (objectKey) await deleteObject(objectKey).catch(() => undefined);
      await sql`DELETE FROM jobs WHERE id = ${unrelatedJobId}`;
      if (jobId) {
        await sql`DELETE FROM audit_events WHERE target_id = ${jobId}`;
        await sql`DELETE FROM jobs WHERE id = ${jobId}`;
      }
      if (assetId) await sql`DELETE FROM assets WHERE id = ${assetId}`;
      await sql`
      DELETE FROM workflow_workspace_instances
      WHERE id = ${workspaceInstanceId}
    `;
      await sql`DELETE FROM generated_asset_name_counters WHERE context_id IN (${workspaceInstanceId}, ${designConversationId})`;
      await sql`DELETE FROM worker_heartbeats WHERE instance_id = ${workerId}`;
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM users WHERE id = ${testUserId}`;
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await closeDatabase();
    }
  }
}

main().catch((error) => {
  console.error('ComfyUI Worker 端到端验收失败', error);
  process.exitCode = 1;
});
