import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Login from '#/views/_core/authentication/login.vue';
import Register from '#/views/_core/authentication/register.vue';
import BaseSetting from '#/views/_core/profile/base-setting.vue';

const mocks = vi.hoisted(() => ({
  fetchUserInfo: vi.fn(),
  getUserInfo: vi.fn(),
  register: vi.fn(),
  replace: vi.fn(),
  setValues: vi.fn(),
  submit: {} as Record<string, unknown>,
  updateProfile: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('@vben/locales', () => ({ $t: (key: string) => key }));
vi.mock('ant-design-vue', () => ({ message: { success: vi.fn() } }));
vi.mock('#/api', () => ({
  getUserInfoApi: mocks.getUserInfo,
  registerApi: mocks.register,
  updateUserProfileApi: mocks.updateProfile,
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({
    authLogin: vi.fn(),
    fetchUserInfo: mocks.fetchUserInfo,
    loginLoading: false,
  }),
}));
vi.mock('@vben/common-ui', async () => {
  const { z } =
    await vi.importActual<typeof import('@vben/common-ui')>('@vben/common-ui');
  const Form = defineComponent({
    props: ['formSchema', 'showForgetPassword'],
    emits: ['submit'],
    setup(props, { emit, expose }) {
      expose({ getFormApi: () => ({ setValues: mocks.setValues }) });
      return () =>
        h('section', [
          props.showForgetPassword ? h('a', '忘记密码') : null,
          ...props.formSchema.map((field: { fieldName: string }) =>
            h('span', { 'data-field': field.fieldName }, field.fieldName),
          ),
          h(
            'button',
            { onClick: () => emit('submit', mocks.submit) },
            'submit',
          ),
        ]);
    },
  });
  return {
    AuthenticationLogin: Form,
    AuthenticationRegister: Form,
    ProfileBaseSetting: Form,
    z,
  };
});

const disposers: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  const user = {
    department: '设计部门',
    email: 'legacy@rail.local',
    introduction: '',
    publicId: 'USR-00000001',
    realName: '测试姓名',
    roles: ['user'],
    username: 'test-user',
  };
  mocks.getUserInfo.mockResolvedValue(user);
  mocks.fetchUserInfo.mockResolvedValue(user);
  mocks.register.mockResolvedValue({});
  mocks.updateProfile.mockResolvedValue({});
  mocks.submit = {};
});
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()));

function render(
  component: typeof BaseSetting | typeof Login | typeof Register,
) {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(component);
  app.mount(root);
  disposers.push(() => {
    app.unmount();
    root.remove();
  });
  return root;
}

async function settle() {
  for (let count = 0; count < 5; count++) await Promise.resolve();
  await nextTick();
}

describe('account forms without email or forgotten password', () => {
  it('explicitly hides forgotten password on login', () => {
    const root = render(Login);
    expect(root.querySelector('a')).toBeNull();
    expect(root.querySelector('[data-field="username"]')).not.toBeNull();
    expect(root.querySelector('[data-field="password"]')).not.toBeNull();
  });

  it('registers with username and password only, ignoring legacy email input', async () => {
    const root = render(Register);
    expect(root.querySelector('[data-field="email"]')).toBeNull();
    expect(root.querySelector('[data-field="confirmPassword"]')).not.toBeNull();
    mocks.submit = {
      email: 'legacy@rail.local',
      password: 'RailTest123!',
      username: 'test-user',
    };
    root.querySelector('button')?.click();
    await settle();
    expect(mocks.register).toHaveBeenCalledWith({
      password: 'RailTest123!',
      username: 'test-user',
    });
    expect(mocks.replace).toHaveBeenCalledWith('/auth/login');
  });

  it('loads profile fields without putting historical email in the form', async () => {
    const root = render(BaseSetting);
    await settle();
    expect(root.querySelector('[data-field="email"]')).toBeNull();
    expect(mocks.setValues).toHaveBeenCalledWith({
      department: '设计部门',
      introduction: '',
      publicId: 'USR-00000001',
      realName: '测试姓名',
      rolesDisplay: '普通用户',
      username: 'test-user',
    });
  });

  it('saves profile without email or role changes and refreshes user information', async () => {
    const root = render(BaseSetting);
    await settle();
    mocks.submit = {
      department: '新部门',
      email: 'ignored',
      introduction: '简介',
      realName: '新姓名',
      roles: ['admin'],
    };
    root.querySelector('button')?.click();
    await settle();
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      department: '新部门',
      introduction: '简介',
      realName: '新姓名',
    });
    expect(mocks.fetchUserInfo).toHaveBeenCalledOnce();
    expect(mocks.setValues).toHaveBeenCalledTimes(2);
  });
});
