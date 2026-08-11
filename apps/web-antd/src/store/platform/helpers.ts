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

export function selectWorkspaceJobs(
  jobs: PlatformJob[],
  workspaceInstanceId: string | undefined,
  projectId: string,
) {
  if (!workspaceInstanceId || !projectId) return [];
  return jobs
    .filter(
      (job) =>
        job.workspaceInstanceId === workspaceInstanceId &&
        job.projectId === projectId &&
        job.ownedByCurrentUser,
    )
    .toSorted(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}
