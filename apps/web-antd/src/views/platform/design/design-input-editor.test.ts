import type { CapabilityField } from '#/modules/platform/types';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import generatedSchemas from '../../../../../platform-api/workflows/comfyui/parameter-schemas.generated.json';
import CapabilityMediaField from '../workspace/capability-media-field.vue';
import Design from './index.vue';

const mocks = vi.hoisted(() => ({
  appKey: 'region-edit',
  preview: vi.fn(),
  capability: vi.fn(),
  draft: vi.fn(),
  conversations: vi.fn(),
  save: vi.fn(),
  initialize: vi.fn(),
  upload: vi.fn(),
  submit: vi.fn(),
  refresh: vi.fn(),
  cancel: vi.fn(),
  store: undefined as any,
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: { conversationId: 'conversation', appKey: mocks.appKey },
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
  getDesignConversationInputAssetApi: (
    _conversation: string,
    _project: string,
    id: string,
  ) =>
    Promise.resolve(
      mocks.store.currentAssets.find(
        (asset: { id: string }) => asset.id === id,
      ),
    ),
  getDesignConversationsApi: mocks.conversations,
  saveDesignConversationDraftApi: mocks.save,
  archiveDesignConversationApi: vi.fn(),
  createDesignConversationApi: vi.fn(),
  getAssetApi: vi.fn(),
  getAssetDownloadApi: vi.fn(),
  getAssetPreviewApi: mocks.preview,
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
vi.mock('../workspace/asset-picker-modal.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('../workspace/camera-angle-control.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('#/components/platform/comfy-mask-editor.vue', () => ({
  default: defineComponent({
    props: ['open', 'src'],
    setup: (props) => () =>
      props.open
        ? h('div', {
            'data-testid': 'mask-editor',
            'data-source': props.src,
          })
        : null,
  }),
}));
vi.mock('#/components/platform/image-lightbox.vue', () => ({
  default: defineComponent({
    props: ['open', 'url'],
    setup: (props) => () =>
      props.open
        ? h('div', {
            'data-testid': 'image-lightbox',
            'data-source': props.url,
          })
        : null,
  }),
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
  mocks.appKey = 'region-edit';
  mocks.preview.mockImplementation(async (id: string) => ({
    mode: 'url',
    url: `/fixture-${id}.png`,
  }));
  mocks.store = reactive({
    applications: [
      {
        key: mocks.appKey,
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

const schemas = generatedSchemas as unknown as Record<
  string,
  CapabilityField[]
>;
const cases = Object.entries(schemas).flatMap(([appKey, definitions]) =>
  definitions
    .filter(
      (field) =>
        ['asset', 'mask', 'region'].includes(field.type) &&
        field.acceptedKinds?.includes('image'),
    )
    .map((field) => ({
      appKey,
      key: field.key,
      type: field.type,
      index: field.assetIndex,
    })),
);
async function configure(appKey: string) {
  mocks.appKey = appKey;
  mocks.store.applications[0].key = appKey;
  const fields = schemas[appKey];
  if (!fields) throw new Error(`Missing schema: ${appKey}`);
  const media = fields.filter((field) =>
    ['asset', 'mask', 'region'].includes(field.type),
  );
  mocks.store.currentAssets = media.map((field) => ({
    id: `asset-${field.assetIndex}`,
    name: `素材${field.assetIndex}`,
    projectId: 'project',
    type: 'image',
    status: 'available',
    version: 1,
  }));
  mocks.capability.mockResolvedValue({
    fields,
    presentation: { quickFieldKeys: [] },
  });
  mocks.draft.mockResolvedValue({
    updatedAt: '2026-10-22',
    parameterValues: {
      prompt: '保留编辑指令',
      regionMarks: 'brush:box:4:1:255,0,0:0,0;10,10',
    },
    inputAssetIds: Object.fromEntries(
      media.map((field) => [field.assetIndex, `asset-${field.assetIndex}`]),
    ),
  });
  return await render();
}
async function settle() {
  for (let turn = 0; turn < 50; turn++) await Promise.resolve();
  await nextTick();
}
describe('workflow input editor routing', () => {
  it.each(cases)(
    '$appKey / $key opens the $type editor from the thumbnail',
    async ({ appKey, index, type }) => {
      const root = await configure(appKey);
      const preview = root.querySelector<HTMLButtonElement>(
        `.composer-input-asset__preview[aria-label$="素材${index}"]`,
      );
      if (!preview) throw new Error('Missing composer input thumbnail');
      preview.click();
      await settle();
      expect(Boolean(root.querySelector('[data-testid="mask-editor"]'))).toBe(
        type === 'mask',
      );
      expect(
        Boolean(root.querySelector('[data-testid="image-lightbox"]')),
      ).toBe(type === 'asset');
      expect(root.textContent?.includes('应用分区')).toBe(type === 'region');
      const openedImage = root.querySelector<HTMLElement>(
        '[data-testid="image-lightbox"], [data-testid="mask-editor"]',
      );
      expect(openedImage?.dataset.source).toBe(
        type === 'region' ? undefined : `/fixture-asset-${index}.png`,
      );
      expect(root.textContent?.includes('画笔')).toBe(type === 'region');
      expect(root.textContent?.includes('色块')).toBe(type === 'region');
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.submit).not.toHaveBeenCalled();
    },
  );
  it.each([
    'region-edit',
    'region-marker-edit',
    'inpaint-single',
    'image-understanding',
  ])('%s edit button uses the same editor as the thumbnail', async (appKey) => {
    const root = await configure(appKey);
    root.querySelector<HTMLButtonElement>('[aria-label="编辑素材0"]')?.click();
    await settle();
    expect(Boolean(root.querySelector('[data-testid="mask-editor"]'))).toBe(
      appKey === 'inpaint-single',
    );
    expect(Boolean(root.querySelector('[data-testid="image-lightbox"]'))).toBe(
      appKey === 'image-understanding',
    );
    expect(root.textContent?.includes('应用分区')).toBe(
      appKey.startsWith('region-'),
    );
  });
});

async function renderMedia(type: 'asset' | 'mask' | 'region' = 'asset') {
  const maskField = schemas['inpaint-single']?.find(
    (item) => item.type === 'mask',
  );
  if (!maskField) throw new Error('Missing mask schema');
  const props = reactive({
    accent: '#c51f3a',
    assets: [],
    field: {
      ...maskField,
      type,
    },
    selectedAssetId: 'first',
    openEditorRequest: 0,
    saveMask: mocks.upload,
  });
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp({ render: () => h(CapabilityMediaField, props) });
  app.mount(root);
  cleanup.push(() => {
    app.unmount();
    root.remove();
  });
  await settle();
  return { props, root };
}

describe('shared image editor lifecycle', () => {
  it('ignores a delayed preview for the previous selected asset', async () => {
    let resolveFirst!: (value: unknown) => void;
    mocks.preview.mockImplementation((id: string) =>
      id === 'first'
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve({ mode: 'url', url: '/second.png' }),
    );
    const { props, root } = await renderMedia();
    props.selectedAssetId = 'second';
    await settle();
    resolveFirst({ mode: 'url', url: '/first.png' });
    await settle();
    props.openEditorRequest++;
    await settle();
    expect(
      root.querySelector<HTMLElement>('[data-testid="image-lightbox"]')?.dataset
        .source,
    ).toBe('/second.png');
  });
  it('opens after the requested preview finishes loading', async () => {
    let resolve!: (value: unknown) => void;
    const preview = new Promise((done) => {
      resolve = done;
    });
    mocks.preview.mockReturnValue(preview);
    const { props, root } = await renderMedia('mask');
    props.openEditorRequest++;
    await settle();
    expect(root.querySelector('[data-testid="mask-editor"]')).toBeNull();
    resolve({ mode: 'url', url: '/ready.png' });
    await settle();
    expect(
      root.querySelector<HTMLElement>('[data-testid="mask-editor"]')?.dataset
        .source,
    ).toBe('/ready.png');
  });
  it('cancels a pending editor request when the asset is cleared', async () => {
    let resolve!: (value: unknown) => void;
    mocks.preview.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { props, root } = await renderMedia('region');
    props.openEditorRequest++;
    await settle();
    props.selectedAssetId = '';
    await settle();
    resolve({ mode: 'url', url: '/stale.png' });
    await settle();
    expect(root.textContent).not.toContain('应用分区');
    expect(root.querySelector('img')).toBeNull();
  });
  it('closes an open editor when replacing the selected asset', async () => {
    const { props, root } = await renderMedia('mask');
    props.openEditorRequest++;
    await settle();
    expect(root.querySelector('[data-testid="mask-editor"]')).not.toBeNull();
    props.selectedAssetId = 'second';
    await settle();
    expect(root.querySelector('[data-testid="mask-editor"]')).toBeNull();
  });
});
