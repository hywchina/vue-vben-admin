import type { ModelUploadStatus } from '#/api/platform/models';

import { describe, expect, it, vi } from 'vitest';

import { matchResumeFiles, resumeModelUpload } from './upload';

describe('resumable model upload', () => {
  const fixture = () =>
    ({
      id: 'id',
      files: [{ path: 'model.bin', size: 6 }],
      partBytes: 3,
      parts: [
        {
          fileIndex: 0,
          partIndex: 0,
          size: 3,
          sha256:
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        },
      ],
    }) as ModelUploadStatus;
  it('resumes only after hashing existing parts, then uploads missing bytes', async () => {
    const progress = vi.fn();
    const send = vi.fn().mockResolvedValue({});
    await resumeModelUpload({
      status: fixture(),
      files: [new File(['abcdef'], 'model.bin')],
      signal: new AbortController().signal,
      send,
      progress,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.slice(0, 2)).toEqual([0, 1]);
    expect(progress).toHaveBeenLastCalledWith(6);
  });
  it('rejects same-name same-size files with different contents', async () => {
    const send = vi.fn();
    await expect(
      resumeModelUpload({
        status: fixture(),
        files: [new File(['xbcdef'], 'model.bin')],
        signal: new AbortController().signal,
        send,
        progress: () => {},
      }),
    ).rejects.toThrow('内容');
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects missing files and pauses before sending another part', async () => {
    expect(() => matchResumeFiles(fixture().files, [])).toThrow('全部');
    const abort = new AbortController();
    abort.abort();
    const send = vi.fn();
    await expect(
      resumeModelUpload({
        status: fixture(),
        files: [new File(['abcdef'], 'model.bin')],
        signal: abort.signal,
        send,
        progress: () => {},
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(send).not.toHaveBeenCalled();
  });
});
