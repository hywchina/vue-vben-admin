import { getConfig } from '../../../config';
import { useDatabase } from '../../../database';
import { ApiError } from '../../../response';
import { AiToolkitClient } from './client';

export function createAiToolkitClient() {
  const config = getConfig();
  if (!config.loraApiUrl) {
    throw new ApiError(
      503,
      'ADAPTER_NOT_CONFIGURED',
      'LoRA 训练适配器尚未配置',
    );
  }
  return new AiToolkitClient({
    apiUrl: config.loraApiUrl,
    timeoutMs: config.loraTimeoutMs,
    token: config.loraApiToken,
  });
}

export async function getLoraExecution(jobId: string) {
  const sql = useDatabase();
  const [execution] = await sql<
    {
      datasetName: string;
      externalJobId: null | string;
      gpuIds: string;
      jobId: string;
      projectId: string;
      status: string;
    }[]
  >`
    SELECT
      execution.job_id AS "jobId",
      job.project_id AS "projectId",
      execution.status,
      execution.external_job_id AS "externalJobId",
      execution.dataset_name AS "datasetName",
      execution.gpu_ids AS "gpuIds"
    FROM lora_training_executions execution
    JOIN jobs job ON job.id = execution.job_id
    WHERE execution.job_id = ${jobId}
  `;
  if (!execution) {
    throw new ApiError(404, 'LORA_TRAINING_NOT_FOUND', 'LoRA 训练任务不存在');
  }
  return execution;
}
