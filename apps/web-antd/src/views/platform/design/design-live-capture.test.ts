import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Design from './index.vue';

const mocks = vi.hoisted(() => ({
  capability: vi.fn(),
  draft: vi.fn(),
  conversations: vi.fn(),
  save: vi.fn(),
  initialize: vi.fn(),
  upload: vi.fn(),
  submit: vi.fn(),
  refresh: vi.fn(),
  cancel: vi.fn(),
  capture: undefined as any,
  store: undefined as any,
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: { conversationId: 'conversation', appKey: 'screen-capture-edit' },
  }),
  useRouter: () => ({
    replace: vi.fn().mockResolvedValue(undefined),
    push: vi.fn(),
  }),
}));
vi.mock('@vben/icons', () => ({
  IconifyIcon: defineComponent({ setup: () => () => h('i') }),
}));
vi.mock('#/store', () => ({ usePlatformStore: () => mocks.store }));
vi.mock('#/api', () => ({
  getCapabilityApi: mocks.capability,
  getDesignConversationDraftApi: mocks.draft,
  getDesignConversationsApi: mocks.conversations,
  saveDesignConversationDraftApi: mocks.save,
  archiveDesignConversationApi: vi.fn(),
  createDesignConversationApi: vi.fn(),
  getAssetApi: vi.fn(),
  getAssetDownloadApi: vi.fn(),
  getAssetPreviewApi: vi.fn(),
  getJobsApi: vi.fn(),
  renameDesignConversationApi: vi.fn(),
  saveWorkflowOutputApi: vi.fn(),
}));
vi.mock('ant-design-vue', () => {
  const container = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  const modal = defineComponent({
    props: ['open'],
    setup:
      (props, { slots }) =>
      () =>
        props.open ? h('aside', slots.default?.()) : null,
  });
  const button = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('button', slots.default?.()),
  });
  const input = defineComponent({
    props: ['value'],
    setup: (props) => () => h('textarea', { value: props.value }),
  });
  return {
    Button: button,
    Drawer: modal,
    Modal: modal,
    Popover: modal,
    Spin: container,
    Input: input,
    Textarea: input,
    InputNumber: input,
    Select: input,
    Switch: input,
    message: {
      warning: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});
vi.mock('../workspace/capability-media-field.vue', () => ({
  default: defineComponent({
    props: ['liveCapture', 'stopLiveCapture', 'selectedAssetId'],
    setup: (props) => {
      mocks.capture = props;
      return () => h('div', { 'data-testid': 'capture-instance' });
    },
  }),
}));
vi.mock('../workspace/asset-picker-modal.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('../workspace/camera-angle-control.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('#/components/platform/comfy-mask-editor.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('#/components/platform/workflow-run-card.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('./design-image-size.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('./design-prompt-template-popover.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('./design-quick-field.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));

const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = reactive({
    applications: [
      {
        key: 'screen-capture-edit',
        name: '实时画面编辑',
        shortName: '实时编辑',
        capabilityCode: 'capture',
        visible: true,
      },
    ],
    projects: [{ id: 'project', name: '项目' }],
    currentProjectId: 'project',
    currentAssets: [],
    currentJobs: [],
    assetFolders: [],
    initialize: mocks.initialize,
    uploadAsset: mocks.upload,
    runApplication: mocks.submit,
    refreshCurrentProjectData: mocks.refresh,
    cancelJob: mocks.cancel,
  });
  mocks.initialize.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue(undefined);
  mocks.conversations.mockResolvedValue([
    { id: 'conversation', projectId: 'project', title: '设计', legacy: false },
  ]);
  const base = {
    acceptedKinds: [],
    advanced: false,
    integer: false,
    options: [],
    required: true,
    uiControl: 'default',
  };
  mocks.capability.mockResolvedValue({
    fields: [
      {
        ...base,
        key: 'capture',
        label: '捕获画面',
        type: 'capture',
        assetIndex: 0,
        acceptedKinds: ['image'],
      },
      {
        ...base,
        key: 'prompt',
        label: '编辑指令',
        type: 'textarea',
        defaultValue: '默认指令',
      },
    ],
    presentation: { quickFieldKeys: [] },
  });
  mocks.draft.mockResolvedValue({
    updatedAt: '2026-10-09',
    parameterValues: { prompt: '保留这条编辑指令' },
    inputAssetIds: {},
  });
  mocks.upload.mockResolvedValue({ id: 'frame' });
  mocks.submit.mockResolvedValue({ id: 'live-job', status: 'queued' });
  mocks.refresh.mockImplementation(async () => {
    mocks.store.currentJobs = [{ id: 'live-job', status: 'succeeded' }];
  });
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

async function render() {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(Design);
  app.mount(root);
  cleanup.push(() => {
    app.unmount();
    root.remove();
  });
  for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();
  await nextTick();
  return root;
}

describe('design inline live editing integration', () => {
  it('requires an editing instruction before registering a live frame', async () => {
    mocks.draft.mockResolvedValue({
      updatedAt: '2026-10-09',
      parameterValues: { prompt: '   ' },
      inputAssetIds: {},
    });
    await render();
    expect(
      await mocks.capture.liveCapture(new File(['image'], 'frame.png'), {
        isCurrent: () => true,
      }),
    ).toBe(false);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('does not upload or cancel an existing manual task', async () => {
    mocks.store.currentJobs = [
      {
        id: 'manual-job',
        designConversationId: 'conversation',
        projectId: 'project',
        ownedByCurrentUser: true,
        status: 'running',
        appKey: 'screen-capture-edit',
      },
    ];
    await render();
    const session = { isCurrent: () => true };
    expect(
      await mocks.capture.liveCapture(
        new File(['image'], 'frame.png'),
        session,
      ),
    ).toBe(false);
    await mocks.capture.stopLiveCapture(session);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it('keeps instructions and captured input through successive live frames; More does not mount another capture', async () => {
    const root = await render();
    const textarea = root.querySelector(
      '.composer-box textarea',
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('保留这条编辑指令');
    const session = { isCurrent: () => true };
    const file = new File(['image'], 'capture.png', { type: 'image/png' });
    expect(await mocks.capture.liveCapture(file, session)).toBe(true);
    expect(await mocks.capture.liveCapture(file, session)).toBe(true);
    await nextTick();
    expect(mocks.submit).toHaveBeenCalledTimes(2);
    expect(mocks.submit.mock.calls[1]?.[3]).toEqual({
      prompt: '保留这条编辑指令',
    });
    expect(textarea.value).toBe('保留这条编辑指令');
    expect(mocks.capture.selectedAssetId).toBe('frame');
    const more = [...root.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '更多',
    );
    if (!more) throw new Error('More button not found');
    more.click();
    await nextTick();
    expect(
      root.querySelectorAll('[data-testid="capture-instance"]'),
    ).toHaveLength(1);
    expect(root.textContent).toContain(
      '实时画面预览、共享与捕获操作已移至主输入框',
    );
    await mocks.capture.stopLiveCapture(session);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});
