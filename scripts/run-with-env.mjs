import { spawn } from 'node:child_process';
import process from 'node:process';

const separator = process.argv.indexOf('--');
if (separator < 3 || separator === process.argv.length - 1) {
  throw new Error(
    '用法：node scripts/run-with-env.mjs <env-file> -- <command> [...args]',
  );
}

const envFile = process.argv[2];
try {
  process.loadEnvFile(envFile);
} catch (error) {
  if (
    !(error instanceof Error) ||
    !('code' in error) ||
    error.code !== 'ENOENT'
  ) {
    throw error;
  }
}

const [command, ...args] = process.argv.slice(separator + 1);
const child = spawn(command, args, {
  env: process.env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

child.on('error', (error) => {
  console.error(`无法启动命令 ${command}`, error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
