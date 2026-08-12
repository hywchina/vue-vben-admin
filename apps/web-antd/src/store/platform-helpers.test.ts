import type { PlatformJob } from '#/modules/platform/types';

import { describe, expect, it } from 'vitest';

import {
  isActivePlatformJob,
  normalizePlatformJobs,
  selectDesignConversationJobs,
  selectWorkspaceJobs,
} from './platform/helpers';

function createJob(overrides: Partial<PlatformJob> = {}): PlatformJob {
  return {
    appKey: 'render',
    createdAt: '2026-08-08T00:00:00.000Z',
    createdBy: 'user-1',
    id: 'job-1',
    inputAssetIds: [],
    inputs: [],
    name: '测试任务',
    ownedByCurrentUser: true,
    owner: '测试用户',
    ownerPublicId: 'USR-000001',
    outputs: [],
    parameters: {},
    progress: 0,
    projectId: 'project-1',
    publicId: 'TSK-00000001',
    stage: '等待执行',
    status: 'queued',
    workspaceInstanceId: 'instance-1',
    workspaceInstanceTitle: '测试会话 1',
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

  it('keeps one application instance conversation scoped and orders rounds', () => {
    const jobs = [
      createJob({
        createdAt: '2026-08-08T00:02:00.000Z',
        id: 'round-2',
      }),
      createJob({
        createdAt: '2026-08-08T00:01:00.000Z',
        id: 'round-1',
      }),
      createJob({ id: 'other-user', ownedByCurrentUser: false }),
      createJob({ id: 'other-instance', workspaceInstanceId: 'instance-2' }),
      createJob({ id: 'other-project', projectId: 'project-2' }),
    ];

    expect(
      selectWorkspaceJobs(jobs, 'instance-1', 'project-1').map((job) => job.id),
    ).toEqual(['round-1', 'round-2']);
  });

  it('combines different applications inside one project design conversation', () => {
    const jobs = [
      createJob({
        appKey: 'text-chat',
        createdAt: '2026-08-08T00:01:00.000Z',
        designConversationId: 'conversation-1',
        id: 'text-round',
      }),
      createJob({
        appKey: 'text-to-image',
        createdAt: '2026-08-08T00:02:00.000Z',
        designConversationId: 'conversation-1',
        id: 'image-round',
      }),
      createJob({
        designConversationId: 'conversation-2',
        id: 'other-conversation',
      }),
      createJob({
        designConversationId: 'conversation-1',
        id: 'other-user',
        ownedByCurrentUser: false,
      }),
    ];

    expect(
      selectDesignConversationJobs(jobs, 'conversation-1', 'project-1').map(
        (job) => job.id,
      ),
    ).toEqual(['text-round', 'image-round']);
  });
});
