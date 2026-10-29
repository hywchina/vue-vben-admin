import process from 'node:process';

import { closeDatabase } from '../utils/database';
import { ComfyUiWorker } from '../utils/domain/capabilities/comfyui/worker';
import { LoraTrainingWorker } from '../utils/domain/capabilities/lora/worker';
import { ReportGenerationWorker } from '../utils/domain/capabilities/report/worker';
import { ManagedModelWorker } from '../utils/domain/models/repository';

const once = process.argv.includes('--once');
let stopping = false;

process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});

const worker = new ComfyUiWorker();
const loraWorker = new LoraTrainingWorker();
const reportWorker = new ReportGenerationWorker();
const modelWorker = new ManagedModelWorker();
try {
  if (once) {
    await Promise.all([
      worker.runOnce(),
      loraWorker.runOnce(),
      reportWorker.runOnce(),
      modelWorker.runOnce(),
    ]);
  } else {
    console.warn(
      '能力任务 Worker 已启动（ComfyUI / AI Toolkit LoRA / 报告生成）',
    );
    await Promise.all([
      worker.runUntil(() => stopping),
      loraWorker.runUntil(() => stopping),
      reportWorker.runUntil(() => stopping),
      modelWorker.runUntil(() => stopping),
    ]);
  }
} finally {
  await closeDatabase();
}
