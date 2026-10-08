import type { TransactionSql } from 'postgres';

const mimeExtensions: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'text/markdown': '.md',
  'text/plain': '.txt',
};

export function formatGeneratedAssetName(input: {
  contextPublicId: string;
  dateStamp: string;
  filename: string;
  mimeType: string;
  sequence: number;
}) {
  if (
    !/^(?:DSC|INS|TSK)-\d{8,}$/.test(input.contextPublicId) ||
    !/^\d{8}$/.test(input.dateStamp) ||
    !Number.isSafeInteger(input.sequence) ||
    input.sequence < 1
  ) {
    throw new Error('生成资产命名上下文无效');
  }
  const extension =
    /\.[\da-z]{1,16}$/i.exec(input.filename)?.[0].toLowerCase() ??
    mimeExtensions[input.mimeType] ??
    '.bin';
  return `${input.contextPublicId}-${input.dateStamp}-${String(input.sequence).padStart(3, '0')}${extension}`;
}

/** Allocate inside the registration transaction: rollback must also undo the number. */
export async function allocateGeneratedAssetName(
  transaction: TransactionSql,
  input: { filename: string; jobId: string; mimeType: string },
) {
  const [job] = await transaction<
    { contextId: string; contextPublicId: string }[]
  >`
    SELECT COALESCE(job.design_conversation_id, job.workspace_instance_id, job.id) AS "contextId",
      CASE
        WHEN job.design_conversation_id IS NOT NULL THEN conversation.public_id
        WHEN job.workspace_instance_id IS NOT NULL THEN instance.public_id
        ELSE job.public_id
      END AS "contextPublicId"
    FROM jobs job
    LEFT JOIN design_conversations conversation ON conversation.id = job.design_conversation_id
    LEFT JOIN workflow_workspace_instances instance ON instance.id = job.workspace_instance_id
    WHERE job.id = ${input.jobId}
  `;
  if (!job) throw new Error('生成资产对应任务不存在');
  const [counter] = await transaction<
    { dateStamp: string; sequence: number }[]
  >`
    INSERT INTO generated_asset_name_counters (context_id, generated_on, last_sequence)
    VALUES (${job.contextId}, (statement_timestamp() AT TIME ZONE 'Asia/Shanghai')::date, 1)
    ON CONFLICT (context_id, generated_on) DO UPDATE
    SET last_sequence = generated_asset_name_counters.last_sequence + 1
    RETURNING to_char(generated_on, 'YYYYMMDD') AS "dateStamp", last_sequence AS sequence
  `;
  if (!counter) throw new Error('生成资产序号分配失败');
  return {
    contextId: job.contextId,
    contextPublicId: job.contextPublicId,
    dateStamp: counter.dateStamp,
    filename: formatGeneratedAssetName({ ...input, ...job, ...counter }),
    sequence: counter.sequence,
  };
}
