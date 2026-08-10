import type { PlatformJob } from '#/modules/platform/types';

import { describe, expect, it } from 'vitest';

import { isActivePlatformJob, normalizePlatformJobs } from './platform/helpers';

function createJob(overrides: Partial<PlatformJob> = {}): PlatformJob {
  return {
    appKey: 'render',
    createdAt: '2026-08-08T00:00:00.000Z',
    id: 'job-1',
    inputAssetIds: [],
    name: '测试任务',
    owner: '测试用户',
    outputs: [],
    progress: 0,
    projectId: 'project-1',
    stage: '等待执行',
    status: 'queued',
    ...overrides,
  };
}

describe('platform store helpers', () => {
  it('recognizes queued, running and cancelling jobs as active', () => {
    expect(isActivePlatformJob(createJob({ status: 'queued' }))).toBe(true);
    expect(isActivePlatformJob(createJob({ status: 'running' }))).toBe(true);
    expect(isActivePlatformJob(createJob({ status: 'cancelling' }))).toBe(true);
    expect(isActivePlatformJob(createJob({ status: 'failed' }))).toBe(false);
    expect(isActivePlatformJob(createJob({ status: 'succeeded' }))).toBe(false);
  });

  it('preserves formatted durations and formats numeric API durations', () => {
    const numericDuration = {
      ...createJob(),
      duration: 12,
    } as unknown as PlatformJob;

    expect(normalizePlatformJobs([numericDuration])[0]?.duration).toBe('12 秒');
    expect(
      normalizePlatformJobs([createJob({ duration: '3 分钟' })])[0]?.duration,
    ).toBe('3 分钟');
  });
});
