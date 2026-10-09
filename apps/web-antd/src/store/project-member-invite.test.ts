import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getUserPublicIdInputError,
  normalizeUserPublicId,
  USER_PUBLIC_ID_MAX_LENGTH,
} from '#/modules/platform/user-public-id';
import Overview from '#/views/platform/overview/index.vue';

const mocks = vi.hoisted(() => ({
  extraProjects: [] as Array<Record<string, unknown>>,
  roles: ['admin'],
  getMembers: vi.fn(),
  invite: vi.fn(),
  success: vi.fn(),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/projects', query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userRoles: mocks.roles }),
}));
vi.mock('@vben/icons', () => ({
  IconifyIcon: defineComponent({ setup: () => () => h('i') }),
}));
vi.mock('#/components/platform/page-heading.vue', () => ({
  default: defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('header', slots.extra?.()),
  }),
}));
vi.mock('#/utils/copy-text', () => ({ copyTextToClipboard: vi.fn() }));
vi.mock('#/store', () => ({
  usePlatformStore: () => ({
    projects: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        publicId: 'PRJ-00000001',
        code: 'PRJ-00000001',
        name: '邀请测试项目',
        description: '',
        assetCount: 0,
        activeJobCount: 0,
        jobCount: 0,
        members: 0,
        memberIdentities: [],
        memberPreviews: [],
        updatedAt: '2026-10-09T00:00:00Z',
      },
      ...mocks.extraProjects,
    ],
  }),
}));
vi.mock('#/api', () => ({
  getProjectMembersApi: mocks.getMembers,
  inviteProjectMemberApi: mocks.invite,
  removeProjectMemberApi: vi.fn(),
  transferProjectOwnershipApi: vi.fn(),
  updateProjectMemberRoleApi: vi.fn(),
}));
vi.mock('ant-design-vue', () => {
  const pass = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  const field = (tag: string) =>
    defineComponent({
      props: ['value', 'maxlength', 'status', 'options'],
      emits: ['update:value', 'pressEnter'],
      setup:
        (props, { attrs, emit }) =>
        () =>
          h(
            tag,
            {
              ...attrs,
              value: props.value,
              maxlength: props.maxlength,
              onInput: (event: Event) =>
                emit('update:value', (event.target as HTMLInputElement).value),
              onKeydown: (event: KeyboardEvent) => {
                if (event.key === 'Enter') emit('pressEnter');
              },
            },
            tag === 'select'
              ? props.options?.map((item: { label: string; value: string }) =>
                  h('option', { value: item.value }, item.label),
                )
              : undefined,
          ),
    });
  return {
    Button: defineComponent({
      props: ['loading', 'disabled'],
      setup:
        (props, { attrs, slots }) =>
        () =>
          h(
            'button',
            { ...attrs, disabled: props.disabled || props.loading },
            slots.default?.(),
          ),
    }),
    Input: field('input'),
    Textarea: field('textarea'),
    Select: field('select'),
    Popover: pass,
    Tooltip: pass,
    Modal: Object.assign(
      defineComponent({
        props: ['open'],
        setup:
          (props, { slots }) =>
          () =>
            props.open ? h('section', slots.default?.()) : null,
      }),
      { confirm: vi.fn() },
    ),
    message: { success: mocks.success },
  };
});

const disposers: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.extraProjects = [];
  mocks.roles = ['admin'];
  mocks.getMembers.mockResolvedValue({ canInvite: true, items: [] });
  mocks.invite.mockResolvedValue({});
});
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()));

async function settle() {
  for (let count = 0; count < 8; count++) await Promise.resolve();
  await nextTick();
}

function renderOverview() {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(Overview, { embedded: true });
  app.mount(root);
  disposers.push(() => {
    app.unmount();
    root.remove();
  });
  return root;
}

async function renderInvite() {
  const root = renderOverview();
  const memberButton = [...root.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('项目成员'),
  );
  if (!memberButton) throw new Error('Missing project members button');
  memberButton.click();
  await settle();
  return root;
}

function getInviteInput(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>(
    'input[aria-label="邀请用户 ID"]',
  );
  if (!input) throw new Error('Missing user ID input');
  return input;
}

async function inputValue(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

async function clickInvite(root: HTMLElement) {
  const button = [...root.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === '邀请成员',
  );
  if (!button) throw new Error('Missing invite button');
  button.click();
  await settle();
}

describe('project member user ID input', () => {
  it('allows complete canonical IDs and the API maximum instead of ten characters', async () => {
    const root = await renderInvite();
    const input = getInviteInput(root);
    expect(input.maxLength).toBe(USER_PUBLIC_ID_MAX_LENGTH);
    expect(input.maxLength).toBe(23);
    expect(input.getAttribute('aria-describedby')).toBe(
      'member-invite-id-help',
    );
    expect(root.textContent).toContain('支持完整用户 ID，可直接粘贴。');
    expect(root.textContent).not.toContain('兼容旧版');
  });

  it.each([
    'USR-00000002',
    'USR-100000000',
    'USR-9223372036854775807',
    'USR-000002',
  ])(
    'submits the full %s without truncation and keeps the project UUID',
    async (publicId) => {
      const root = await renderInvite();
      const input = getInviteInput(root);
      await inputValue(input, publicId);
      await clickInvite(root);
      expect(mocks.invite).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        { projectRole: 'editor', userPublicId: publicId },
      );
      expect(input.value).toBe('');
      expect(mocks.getMembers).toHaveBeenCalledTimes(2);
    },
  );

  it('normalizes surrounding whitespace and lowercase pasted IDs on Enter', async () => {
    const root = await renderInvite();
    const input = getInviteInput(root);
    await inputValue(input, '  usr-00000002  ');
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await settle();
    expect(mocks.invite).toHaveBeenCalledWith(expect.any(String), {
      projectRole: 'editor',
      userPublicId: 'USR-00000002',
    });
  });

  it.each([
    '',
    'USR-0000002',
    'USR-2',
    'PRJ-00000002',
    'USR-0000000x',
    'USR-0000 0002',
    `USR-${'1'.repeat(20)}`,
  ])(
    'rejects malformed %s locally without calling the invite API',
    async (value) => {
      const root = await renderInvite();
      const input = getInviteInput(root);
      await inputValue(input, value);
      await clickInvite(root);
      expect(mocks.invite).not.toHaveBeenCalled();
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(root.querySelector('[role="alert"]')?.textContent).toContain(
        value ? 'USR-' : '请输入用户 ID',
      );
      expect(root.querySelector('[role="alert"]')?.textContent).not.toContain(
        '兼容旧版',
      );
    },
  );

  it('clears the format error after editing and permits a valid retry', async () => {
    const root = await renderInvite();
    const input = getInviteInput(root);
    await inputValue(input, 'USR-2');
    await clickInvite(root);
    await inputValue(input, 'USR-00000002');
    expect(root.querySelector('[role="alert"]')).toBeNull();
    await clickInvite(root);
    expect(mocks.invite).toHaveBeenCalledTimes(1);
  });

  it('does not show the invitation input when the API denies invitation permission', async () => {
    mocks.getMembers.mockResolvedValue({ canInvite: false, items: [] });
    const root = await renderInvite();
    expect(root.querySelector('input[aria-label="邀请用户 ID"]')).toBeNull();
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(root.textContent).toContain('只有项目创建者或平台管理员');
  });

  it('preserves leading zeroes and validates normalized IDs without generating aliases', () => {
    expect(normalizeUserPublicId(' usr-00000002 ')).toBe('USR-00000002');
    expect(getUserPublicIdInputError(' usr-000002 ')).toBe('');
    expect(getUserPublicIdInputError('00000002')).not.toBe('');
  });
});

function getMemberFilter(root: HTMLElement) {
  const select = root.querySelector<HTMLSelectElement>(
    'select[aria-label="按项目成员筛选"]',
  );
  if (!select) throw new Error('Missing project member filter');
  return select;
}

describe('project management member filter', () => {
  beforeEach(() => {
    mocks.extraProjects = Array.from({ length: 14 }, (_, index) => ({
      id: `filter-${index}`,
      code: `PRJ-${String(index + 2).padStart(8, '0')}`,
      name: `筛选项目${index}`,
      description: '',
      assetCount: 0,
      activeJobCount: 0,
      jobCount: 0,
      members: 4,
      memberPreviews: [],
      memberIdentities: [
        {
          name: '筛选成员',
          publicId: index === 13 ? 'USR-00000004' : 'USR-00000002',
        },
      ],
      updatedAt: '2026-10-09T00:00:00Z',
    }));
  });

  it('shows the admin scope and searchable canonical member choices', () => {
    const root = renderOverview();
    expect(root.querySelector('.project-list-title')?.textContent).toContain(
      '全部项目',
    );
    const select = root.querySelector('select[aria-label="按项目成员筛选"]');
    expect(select?.getAttribute('show-search')).not.toBeNull();
    expect(select?.getAttribute('option-filter-prop')).toBe('label');
    expect(select?.textContent).toContain('筛选成员 · USR-00000004');
    expect(select?.textContent).not.toContain('@');
  });

  it('resets pagination on member selection and restores all projects on clearing', async () => {
    const root = renderOverview();
    root
      .querySelector<HTMLButtonElement>('button[aria-label="下一页"]')
      ?.click();
    await settle();
    expect(
      root.querySelector('.project-pagination-controls button.active')
        ?.textContent,
    ).toBe('2');
    const select = getMemberFilter(root);
    select.value = 'USR-00000004';
    select.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(root.querySelectorAll('[data-project-id]')).toHaveLength(1);
    expect(
      root.querySelector<HTMLElement>('[data-project-id]')?.dataset.projectId,
    ).toBe('filter-13');
    expect(
      root
        .querySelector('.project-list-title')
        ?.textContent?.replaceAll(/\s/g, ''),
    ).toContain('1/15');
    select.value = '';
    select.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(root.querySelectorAll('[data-project-id]')).toHaveLength(12);
    expect(
      root
        .querySelector('.project-list-title')
        ?.textContent?.replaceAll(/\s/g, ''),
    ).toContain('15/15');
  });

  it('keeps member and search filters intersected with the visible scope', async () => {
    const root = renderOverview();
    const select = getMemberFilter(root);
    select.value = 'USR-00000004';
    select.dispatchEvent(new Event('input', { bubbles: true }));
    const search = root.querySelector<HTMLInputElement>(
      'input[placeholder="搜索项目名称或编号"]',
    );
    if (!search) throw new Error('Missing project search');
    await inputValue(search, '筛选项目0');
    expect(root.querySelectorAll('[data-project-id]')).toHaveLength(0);
    expect(root.textContent).toContain('没有匹配的项目');
    expect(root.textContent).toContain('清除筛选');
    await inputValue(search, '筛选项目13');
    expect(root.querySelectorAll('[data-project-id]')).toHaveLength(1);
  });

  it('labels regular-user projects as mine', () => {
    mocks.roles = ['user'];
    const root = renderOverview();
    expect(root.querySelector('.project-list-title')?.textContent).toContain(
      '我的项目',
    );
    expect(
      root.querySelector('.project-list-title')?.textContent,
    ).not.toContain('全部项目');
  });
});
