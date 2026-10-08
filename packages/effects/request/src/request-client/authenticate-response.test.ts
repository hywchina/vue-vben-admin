import { AxiosError } from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateResponseInterceptor } from './preset-interceptors';
import { RequestClient } from './request-client';

describe('access token renewal', () => {
  let client: RequestClient;
  let mock: MockAdapter;
  const refresh = vi.fn<() => Promise<string>>();
  const reauthenticate = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    vi.clearAllMocks();
    client = new RequestClient();
    mock = new MockAdapter(client.instance);
    client.addResponseInterceptor(
      authenticateResponseInterceptor({
        client,
        doReAuthenticate: reauthenticate,
        doRefreshToken: refresh,
        enableRefreshToken: true,
        formatToken: (token) => `Bearer ${token}`,
      }),
    );
  });

  afterEach(() => mock.restore());

  it('renews once for concurrent expired requests and retries with the new token', async () => {
    let renew!: (token: string) => void;
    refresh.mockImplementation(
      () =>
        new Promise((resolve) => {
          renew = resolve;
        }),
    );
    mock
      .onGet(/\/protected\//)
      .reply((config) =>
        config.headers?.Authorization === 'Bearer renewed'
          ? [200, { ok: true }]
          : [401, { code: 'UNAUTHORIZED' }],
      );
    const requests = [
      client.get('/protected/one'),
      client.get('/protected/two'),
    ];
    await vi.waitFor(() => expect(client.refreshTokenQueue).toHaveLength(1));
    renew('renewed');
    const results = await Promise.all(requests);
    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
    expect(reauthenticate).not.toHaveBeenCalled();
    expect(client.refreshTokenQueue).toHaveLength(0);
  });

  it('rejects all waiting requests and reauthenticates once when the refresh session is invalid', async () => {
    let fail!: (error: unknown) => void;
    refresh.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    mock.onGet(/\/protected\//).reply(401, { code: 'UNAUTHORIZED' });
    const results = Promise.allSettled([
      client.get('/protected/one'),
      client.get('/protected/two'),
    ]);
    await vi.waitFor(() => expect(client.refreshTokenQueue).toHaveLength(1));
    fail(
      Object.assign(new AxiosError('invalid session', 'ERR_BAD_REQUEST'), {
        response: { status: 401 },
      }),
    );
    const settled = await results;
    expect(settled.every((result) => result.status === 'rejected')).toBe(true);
    expect(reauthenticate).toHaveBeenCalledOnce();
    expect(mock.history.get).toHaveLength(2);
    expect(client.isRefreshing).toBe(false);
  });

  it('preserves the session on a temporary refresh network failure and can renew later', async () => {
    refresh.mockRejectedValueOnce(
      new AxiosError('Network Error', 'ERR_NETWORK'),
    );
    mock
      .onGet('/protected')
      .reply((config) =>
        config.headers?.Authorization === 'Bearer renewed'
          ? [200, { ok: true }]
          : [401, { code: 'UNAUTHORIZED' }],
      );
    await expect(client.get('/protected')).rejects.toMatchObject({
      code: 'ERR_NETWORK',
    });
    expect(reauthenticate).not.toHaveBeenCalled();
    refresh.mockResolvedValueOnce('renewed');
    const response = await client.get('/protected');
    expect(response.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('keeps business errors after a successful renewal separate from authentication failure', async () => {
    refresh.mockResolvedValueOnce('renewed');
    mock
      .onGet('/protected')
      .replyOnce(401, {})
      .onGet('/protected')
      .replyOnce(500, { code: 'INTERNAL_ERROR' });
    await expect(client.get('/protected')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
    expect(reauthenticate).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('stops retrying if a renewed access token is still rejected', async () => {
    refresh.mockResolvedValueOnce('renewed');
    mock.onGet('/protected').reply(401, { code: 'UNAUTHORIZED' });
    await expect(client.get('/protected')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(reauthenticate).toHaveBeenCalledOnce();
    expect(mock.history.get).toHaveLength(2);
  });
});
