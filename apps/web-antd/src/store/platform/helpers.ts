import type { PlatformJob } from '#/modules/platform/types';

export function isActivePlatformJob(job: PlatformJob) {
  return (
    job.status === 'queued' ||
    job.status === 'running' ||
    job.status === 'cancelling'
  );
}

export function normalizePlatformJobs(jobs: PlatformJob[]) {
  return jobs.map((job) => {
    const duration = (job as PlatformJob & { duration?: unknown }).duration;
    return {
      ...job,
      duration: typeof duration === 'number' ? `${duration} 秒` : job.duration,
    };
  });
}
