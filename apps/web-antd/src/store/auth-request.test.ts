import type { RequestClient } from '@vben/request';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loginApi, refreshTokenApi } from '#/api/core/auth';
import { baseRequestClient, requestClient } from '#/api/request';

const mocks = vi.hoisted(() => ({
  access: {
    accessToken: 'expired',
    isAccessChecked: true,
    setAccessToken: vi.fn(),
    setLoginExpired: vi.fn(),
  },
  logout: vi.fn(),
}));

vi.mock('@vben/hooks', () => ({
  useAppConfig: () => ({ apiURL: '/api/v1' }),
}));
vi.mock('@vben/preferences', () => ({
  preferences: {
    app: {
      enableRefreshToken: true,
      locale: 'zh-CN',
      loginExpiredMode: 'page',
    },
  },
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => mocks.access }));
vi.mock('#/store', () => ({ useAuthStore: () => ({ logout: mocks.logout }) }));
vi.mock('ant-design-vue', () => ({ message: { error: vi.fn() } }));

function mockHttp(client: RequestClient) {
  type Config = {
    headers?: Record<string, unknown>;
    withCredentials?: boolean;
  };
  type Reply = ((config: Config) => [number, unknown]) | [number, unknown];
  const routes = new Map<string, Reply>();
  const history: string[] = [];
  const originalAdapter = client.instance.defaults.adapter;
  client.instance.defaults.adapter = async (config) => {
    history.push(config.url ?? '');
    const reply = routes.get(config.url ?? '');
    if (!reply) throw new Error(`Unexpected request: ${config.url}`);
    const [status, data] = typeof reply === 'function' ? reply(config) : reply;
    const response = { config, data, headers: {}, status, statusText: '' };
    if (status >= 400) {
      throw Object.assign(new Error(`HTTP ${status}`), {
        config,
        isAxiosError: true,
        response,
      });
    }
    return response;
  };
  return {
    history,
    reply: (url: string, reply: Reply) => routes.set(url, reply),
    restore: () => {
      client.instance.defaults.adapter = originalAdapter;
    },
  };
}

describe('platform authentication requests', () => {
  let api: ReturnType<typeof mockHttp>;
  let refresh: ReturnType<typeof mockHttp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.accessToken = 'expired';
    mocks.access.setAccessToken.mockImplementation((token) => {
      mocks.access.accessToken = token;
    });
    api = mockHttp(requestClient);
    refresh = mockHttp(baseRequestClient);
  });

  afterEach(() => {
    api.restore();
    refresh.restore();
  });

  it('uses the refresh cookie and unwraps the API token envelope', async () => {
    refresh.reply('/auth/refresh', (config) => {
      expect(config.withCredentials).toBe(true);
      return [200, { code: 0, data: 'renewed', message: 'ok' }];
    });
    expect(await refreshTokenApi()).toBe('renewed');
  });

  it('automatically renews an expired access token and keeps the user logged in', async () => {
    refresh.reply('/auth/refresh', [200, { code: 0, data: 'renewed' }]);
    api.reply('/dashboard', (config) => {
      expect(config.withCredentials).toBe(true);
      return config.headers?.Authorization === 'Bearer renewed'
        ? [200, { code: 0, data: { projectCount: 4 } }]
        : [401, { code: 'UNAUTHORIZED' }];
    });
    expect(await requestClient.get('/dashboard')).toEqual({ projectCount: 4 });
    expect(mocks.access.accessToken).toBe('renewed');
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it('keeps a wrong password as a login form error without refreshing a session', async () => {
    api.reply('/auth/login', [401, { code: 'INVALID_CREDENTIALS' }]);
    await expect(
      loginApi({ password: 'wrong', username: 'test' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(refresh.history).toHaveLength(0);
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it('logs out when the server rejects the refresh session', async () => {
    api.reply('/dashboard', [401, { code: 'UNAUTHORIZED' }]);
    refresh.reply('/auth/refresh', [401, { code: 'REFRESH_TOKEN_INVALID' }]);
    await expect(requestClient.get('/dashboard')).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
    expect(mocks.logout).toHaveBeenCalledOnce();
  });

  it('preserves the login state when the renewal service is temporarily unavailable', async () => {
    api.reply('/dashboard', [401, { code: 'UNAUTHORIZED' }]);
    refresh.reply('/auth/refresh', [503, { code: 'TEMPORARILY_UNAVAILABLE' }]);
    await expect(requestClient.get('/dashboard')).rejects.toMatchObject({
      code: 'TEMPORARILY_UNAVAILABLE',
    });
    expect(mocks.access.accessToken).toBe('expired');
    expect(mocks.logout).not.toHaveBeenCalled();
  });
});
