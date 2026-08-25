import { useAccessStore } from '@vben/stores';

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from './auth';

const mocks = vi.hoisted(() => ({
  getAccessCodesApi: vi.fn(),
  getUserInfoApi: vi.fn(),
  loginApi: vi.fn(),
  logoutApi: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('#/api', () => mocks);
vi.mock('ant-design-vue', () => ({
  notification: { success: vi.fn() },
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: { value: { fullPath: '/projects' } },
    replace: mocks.replace,
  }),
}));

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.loginApi.mockResolvedValue({ accessToken: 'access-token' });
    mocks.getAccessCodesApi.mockResolvedValue(['platform:access']);
    mocks.getUserInfoApi.mockResolvedValue({
      avatar: '',
      homePath: '/projects',
      id: 'user-id',
      realName: '',
      roles: ['user'],
      username: 'designer',
    });
  });

  it('always enters home after a successful login', async () => {
    await useAuthStore().authLogin({
      password: 'password',
      username: 'designer',
    });

    expect(mocks.replace).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith('/home');
  });

  it('enters home after re-authenticating an expired session', async () => {
    const accessStore = useAccessStore();
    accessStore.setLoginExpired(true);

    await useAuthStore().authLogin({
      password: 'password',
      username: 'designer',
    });

    expect(accessStore.loginExpired).toBe(false);
    expect(mocks.replace).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith('/home');
  });
});
