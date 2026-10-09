import { describe, expect, it, vi } from 'vitest';

import { submitCaptureFrame } from './capture-session';

function actions() {
  return {
    cancel: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    submit: vi.fn().mockResolvedValue({ id: 'live-job', status: 'queued' }),
    track: vi.fn(),
    upload: vi.fn().mockResolvedValue({ id: 'captured-asset' }),
    wait: vi.fn().mockResolvedValue(true),
  };
}

describe('live capture submission isolation', () => {
  it('registers/selects the frame and waits for exactly the newly submitted job', async () => {
    const steps = actions();
    expect(await submitCaptureFrame(() => true, steps)).toBe(true);
    expect(steps.select).toHaveBeenCalledWith('captured-asset');
    expect(steps.wait).toHaveBeenCalledWith('live-job');
    expect(steps.track.mock.calls).toEqual([['live-job'], []]);
    expect(steps.cancel).not.toHaveBeenCalled();
  });

  it('does not upload when stopped before the frame starts', async () => {
    const steps = actions();
    expect(await submitCaptureFrame(() => false, steps)).toBe(false);
    expect(steps.upload).not.toHaveBeenCalled();
  });

  it.each(['upload', 'select'] as const)(
    'does not submit after stopping during %s',
    async (stage) => {
      const steps = actions();
      let current = true;
      steps[stage].mockImplementation(async () => {
        current = false;
        return { id: 'captured-asset' };
      });
      expect(await submitCaptureFrame(() => current, steps)).toBe(false);
      expect(steps.submit).not.toHaveBeenCalled();
      expect(steps.cancel).not.toHaveBeenCalled();
    },
  );

  it('cancels only its own late job when stopped while the submit request is in flight', async () => {
    const steps = actions();
    let current = true;
    steps.submit.mockImplementation(async () => {
      current = false;
      return { id: 'late-live-job', status: 'running' };
    });
    expect(await submitCaptureFrame(() => current, steps)).toBe(false);
    expect(steps.cancel).toHaveBeenCalledExactlyOnceWith('late-live-job');
    expect(steps.wait).not.toHaveBeenCalled();
    expect(steps.track).toHaveBeenLastCalledWith();
  });

  it.each([undefined, { id: 'failed-job', status: 'failed' }])(
    'does not fall back to a previous conversation job: %s',
    async (job) => {
      const steps = actions();
      steps.submit.mockResolvedValue(job);
      expect(await submitCaptureFrame(() => true, steps)).toBe(false);
      expect(steps.wait).not.toHaveBeenCalled();
      expect(steps.cancel).not.toHaveBeenCalled();
    },
  );

  it('clears the live task reference even if polling fails', async () => {
    const steps = actions();
    steps.wait.mockRejectedValue(new Error('network error'));
    await expect(submitCaptureFrame(() => true, steps)).rejects.toThrow(
      'network error',
    );
    expect(steps.track).toHaveBeenLastCalledWith();
  });
});
