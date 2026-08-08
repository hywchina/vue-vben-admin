import process from 'node:process';

import { closeDatabase } from '../utils/database';
import { ComfyUiWorker } from '../utils/domain/capabilities/comfyui/worker';

const once = process.argv.includes('--once');
let stopping = false;

process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});

const worker = new ComfyUiWorker();
try {
  if (once) {
    await worker.runOnce();
  } else {
    console.warn('ComfyUI 任务 Worker 已启动');
    await worker.runUntil(() => stopping);
  }
} finally {
  await closeDatabase();
}
