import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '#/views/platform/dashboard/index.vue';

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  push: vi.fn(),
  switchProject: vi.fn(),
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@vben/icons', () => ({
  IconifyIcon: defineComponent({ setup: () => () => h('i') }),
}));
vi.mock('#/store', () => ({
  usePlatformStore: () => ({
    currentProjectId: 'cached-project',
    projects: [],
    switchProject: mocks.switchProject,
  }),
}));
vi.mock('#/api', () => ({
  getDashboardApi: mocks.dashboard,
  getLoraStatusApi: vi.fn().mockResolvedValue({
    configured: false,
    reachable: false,
    models: [],
    model: 'flux2-klein-9b',
  }),
  getDesignConversationsApi: vi.fn(),
  getAssetPreviewApi: vi.fn(),
}));
vi.mock('ant-design-vue', () => {
  const field = defineComponent({ setup: () => () => h('div') });
  return {
    Button: field,
    Input: field,
    Modal: field,
    Select: field,
    Textarea: field,
    message: { warning: vi.fn(), success: vi.fn() },
  };
});

const disposers: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.switchProject.mockResolvedValue(undefined);
});
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()));

async function renderHome(hasProject = true) {
  mocks.dashboard.mockResolvedValue({
    currentProject: hasProject
      ? { id: 'api-project', name: '测试当前项目' }
      : null,
    summary: { projectCount: 4 },
    flow: { assetCount: 56, conversationCount: 12, applicationCount: 18 },
  });
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(Home);
  app.mount(root);
  disposers.push(() => {
    app.unmount();
    root.remove();
  });
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
  await nextTick();
  return root;
}

describe('home without the bottom data note', () => {
  it.each([true, false])(
    'removes the note with current project present: %s',
    async (hasProject) => {
      const root = await renderHome(hasProject);
      expect(root.querySelector('.home-data-note')).toBeNull();
      expect(root.textContent).not.toContain('以上数据按当前账号权限实时汇总');
      expect(root.textContent).not.toContain('当前项目：');
      expect(root.textContent).not.toContain('尚未选择项目');
      expect(root.querySelectorAll('.home-entry-grid button')).toHaveLength(6);
      expect(root.querySelector('.home-hero__metrics')?.textContent).toContain(
        '56',
      );
      expect(mocks.dashboard).toHaveBeenCalledOnce();
    },
  );

  it('keeps the existing project context when navigating from a quick entry', async () => {
    const root = await renderHome();
    const training = root.querySelector<HTMLButtonElement>(
      'button[data-action="training"]',
    );
    if (!training) throw new Error('Missing training entry');
    training.click();
    await Promise.resolve();
    await nextTick();
    expect(mocks.switchProject).toHaveBeenCalledWith('api-project');
    expect(mocks.push).toHaveBeenCalledWith({
      path: '/model-training',
      query: undefined,
    });
  });
});
