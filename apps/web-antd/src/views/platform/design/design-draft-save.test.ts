import type { DesignDraftPayload } from '#/modules/platform/design-draft-save';

import { describe, expect, it, vi } from 'vitest';

import { DesignDraftSaver } from '#/modules/platform/design-draft-save';

const scope = {
  projectId: 'project',
  conversationId: 'conversation',
  appKey: 'local-image-edit',
  designMode: 'cabin' as const,
};
const payload = (prompt: string): DesignDraftPayload => ({
  ...scope,
  inputAssetIds: {},
  parameterValues: { prompt },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('acknowledged design drafts', () => {
  it('keeps the latest snapshot dirty until its own response, ignoring late failures', async () => {
    const old = deferred<unknown>();
    const latest = deferred<unknown>();
    const send = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    const saver = new DesignDraftSaver(send, vi.fn(), 'writer');
    saver.restore(scope, {
      inputAssetIds: {},
      parameterValues: {},
      revision: 4,
    });
    const a = saver.save(payload('old'));
    const b = saver.save(payload('latest'));
    latest.resolve({ revision: 6 });
    await b;
    old.reject(new Error('old timeout'));
    await a;
    expect(saver.status).toMatchObject({ dirty: false, error: undefined });
    expect(send.mock.calls.map(([value]) => value.writeToken.sequence)).toEqual(
      [1, 2],
    );
    expect(send.mock.calls[1]?.[0].writeToken.baseRevision).toBe(4);
  });
  it('retains failed drafts across context restoration and retries the same idempotent token', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ revision: 1 });
    const saver = new DesignDraftSaver(send, vi.fn(), 'writer');
    saver.restore(scope, {
      inputAssetIds: {},
      parameterValues: {},
      revision: 0,
    });
    await saver.save(payload('keep me'));
    expect(saver.status.error).toBe('network unavailable');
    expect(
      saver.restore(scope, {
        inputAssetIds: {},
        parameterValues: {},
        revision: 0,
      }).parameterValues.prompt,
    ).toBe('keep me');
    await saver.flush();
    expect(saver.status.dirty).toBe(false);
    expect(send.mock.calls[0]?.[0].writeToken).toEqual(
      send.mock.calls[1]?.[0].writeToken,
    );
  });
  it('captures the current snapshot immediately and uses keepalive without waiting for a slow ordinary request', async () => {
    const old = deferred<unknown>();
    const send = vi.fn().mockReturnValue(old.promise);
    const keepalive = vi.fn().mockResolvedValue({ revision: 2 });
    const saver = new DesignDraftSaver(send, vi.fn(), 'writer');
    void saver.save(payload('old'));
    saver.stage(payload('last keystroke'));
    saver.flushForUnload(keepalive);
    expect(keepalive.mock.calls[0]?.[0].parameterValues.prompt).toBe(
      'last keystroke',
    );
    expect(keepalive.mock.calls[0]?.[0].writeToken.sequence).toBe(2);
    await Promise.resolve();
    old.reject(new Error('cancelled on reload'));
    await Promise.resolve();
    expect(saver.status.dirty).toBe(false);
  });
  it('does not exceed browser keepalive body limits or lose large region drafts', () => {
    const saver = new DesignDraftSaver(vi.fn(), vi.fn(), 'writer');
    const keepalive = vi.fn();
    saver.stage(payload('区'.repeat(30_000)));
    saver.flushForUnload(keepalive);
    expect(keepalive).not.toHaveBeenCalled();
    expect(saver.status.dirty).toBe(true);
  });
  it('does not block a later navigation behind an earlier identical slow write', async () => {
    const first = deferred<unknown>();
    const send = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ revision: 2 });
    const saver = new DesignDraftSaver(send, vi.fn(), 'writer');
    const old = saver.save(payload('same'));
    await saver.save(payload('same'), true);
    expect(saver.status.dirty).toBe(false);
    first.resolve({ revision: 1 });
    await old;
    expect(send.mock.calls.map(([value]) => value.writeToken.sequence)).toEqual(
      [1, 2],
    );
  });
  it('compares JSON content independently of PostgreSQL object key order', () => {
    const saver = new DesignDraftSaver(vi.fn(), vi.fn(), 'writer');
    saver.restore(scope, {
      inputAssetIds: {},
      parameterValues: { b: 2, a: 1 },
      revision: 1,
    });
    saver.stage({
      ...scope,
      inputAssetIds: {},
      parameterValues: { a: 1, b: 2 },
    });
    expect(saver.status.dirty).toBe(false);
  });
});
