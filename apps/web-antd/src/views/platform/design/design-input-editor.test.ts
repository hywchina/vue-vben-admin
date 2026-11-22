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
    Popover: defineComponent({
      props: ['open'],
      emits: ['update:open'],
      setup:
        (props, { slots, emit }) =>
        () =>
          h('div', [
            h(
              'div',
              { onClick: () => emit('update:open', !props.open) },
              slots.default?.(),
            ),
            props.open ? h('aside', slots.content?.()) : null,
          ]),
    }),
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
    emits: ['update:open'],
    setup:
      (props, { emit }) =>
      () =>
        props.open
          ? h(
              'div',
              { 'data-testid': 'mask-editor', 'data-source': props.src },
              [
                h(
                  'button',
                  { onClick: () => emit('update:open', false) },
                  '关闭编辑器',
                ),
              ],
            )
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
  default: defineComponent({
    props: ['job'],
    emits: ['rerun'],
    setup:
      (props, { emit }) =>
      () =>
        h(
          'button',
          {
            'data-testid': 'rerun-history',
            onClick: () => emit('rerun', props.job),
          },
          '重用历史任务',
        ),
  }),
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
const cases = Object.entries(schemas)
  .filter(([appKey]) => appKey !== 'image-edit-base')
  .flatMap(([appKey, definitions]) =>
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
async function configure(appKey: string, filled = true) {
  mocks.appKey = appKey;
  mocks.store.applications[0].key = appKey;
  mocks.store.applications[0].designModes = {
    cabin: { order: 0, defaultImage: true },
  };
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
    inputAssetIds: filled
      ? Object.fromEntries(
          media.map((field) => [field.assetIndex, `asset-${field.assetIndex}`]),
        )
      : {},
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

describe('role-specific image slots and automatic editors', () => {
  it('shows all three named inputs before any image is selected', async () => {
    const root = await configure('multi-image-edit', false);
    const slots = [
      ...root.querySelectorAll<HTMLButtonElement>('.composer-input-slot'),
    ];
    expect(slots.map((slot) => slot.getAttribute('aria-label'))).toEqual([
      '添加图片1：基础空间',
      '添加图片2：样式参考',
      '添加图片3：材质参考',
    ]);
    expect(root.querySelectorAll('.composer-live-entry')).toHaveLength(0);
    expect(slots.map((slot) => slot.textContent?.trim())).toEqual([
      '添加图片1',
      '添加图片2',
      '添加图片3',
    ]);
  });
  it.each([
    'inpaint-single',
    'region-marker-edit',
    'region-edit',
    'image-understanding',
  ])(
    'uploads to a specific %s slot and opens only a required editor',
    async (appKey) => {
      const root = await configure(appKey, false);
      const slot = root.querySelector<HTMLButtonElement>(
        '.composer-input-slot',
      );
      if (!slot) throw new Error('Missing empty slot');
      slot.click();
      await settle();
      const local = [
        ...root.querySelectorAll<HTMLButtonElement>('button'),
      ].find(
        (button) => button.querySelector('strong')?.textContent === '本地上传',
      );
      if (!local) throw new Error('Missing upload source');
      local.click();
      await settle();
      mocks.upload.mockResolvedValue(mocks.store.currentAssets[0]);
      const input = root.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input) throw new Error('Missing file input');
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File(['fixture'], 'new.png', { type: 'image/png' })],
      });
      input.dispatchEvent(new Event('change'));
      await settle();
      expect(mocks.upload).toHaveBeenCalledOnce();
      expect(Boolean(root.querySelector('[data-testid="mask-editor"]'))).toBe(
        appKey === 'inpaint-single',
      );
      expect(root.textContent?.includes('应用分区')).toBe(
        appKey.startsWith('region-'),
      );
      expect(root.querySelector('[data-testid="image-lightbox"]')).toBeNull();
      expect(mocks.submit).not.toHaveBeenCalled();
      root
        .querySelector<HTMLButtonElement>('[data-testid="mask-editor"] button')
        ?.click();
      [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.trim() === '应用分区')
        ?.click();
      await settle();
      expect(root.querySelector('.media-picker-fields')).toBeNull();
    },
  );
});

describe('direct editor return path', () => {
  it('returns straight to the composer after a thumbnail editor is closed', async () => {
    const root = await configure('inpaint-single');
    root
      .querySelector<HTMLButtonElement>('.composer-input-asset__preview')
      ?.click();
    await settle();
    const close = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent?.trim() === '关闭编辑器',
    );
    if (!close) throw new Error('Missing mask close');
    close.click();
    await settle();
    expect(root.querySelector('[data-testid="mask-editor"]')).toBeNull();
    expect(root.querySelector('.media-picker-fields')).toBeNull();
  });
});

describe('disabled workflow replay', () => {
  it.each([
    ['用单图继续编辑', 'single-image-edit', { 0: 'old-base' }],
    ['用双图继续编辑', 'image-edit-kv', { 0: 'old-base', 1: 'old-reference' }],
  ])(
    'prefills the retired Base job with %s without submitting',
    async (label, target, inputs) => {
      const root = await configure('inpaint-single');
      mocks.store.applications.push({
        key: target,
        name: label,
        shortName: label,
        capabilityCode: target,
        visible: true,
        designModes: { cmf: { order: 0, defaultImage: true } },
      });
      mocks.capability.mockResolvedValue({ fields: schemas[target] });
      mocks.draft.mockResolvedValue({
        inputAssetIds: {},
        parameterValues: {},
      });
      for (const id of ['old-base', 'old-reference'])
        mocks.store.currentAssets.push({
          id,
          name: id,
          type: 'image',
          status: 'available',
          version: 1,
        });
      mocks.store.currentJobs = [
        {
          id: 'old-base-job',
          appKey: 'image-edit-base',
          designMode: 'cmf',
          designConversationId: 'conversation',
          projectId: 'project',
          ownedByCurrentUser: true,
          status: 'succeeded',
          createdAt: '2026-10-22T00:00:00Z',
          inputs: [
            { assetId: 'old-base', kind: 'image', position: 0 },
            { assetId: 'old-reference', kind: 'image', position: 1 },
          ],
          outputs: [],
          parameters: { prompt: '保留客室构图', steps: 20 },
        },
      ];
      await settle();
      root
        .querySelector<HTMLButtonElement>('[data-testid="rerun-history"]')
        ?.click();
      await settle();
      const choice = [...root.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === label,
      );
      expect(choice).toBeDefined();
      choice?.click();
      await settle();
      expect(mocks.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          appKey: target,
          designMode: 'cmf',
          inputAssetIds: inputs,
          parameterValues: expect.objectContaining({
            prompt: '保留客室构图',
            steps: 4,
          }),
        }),
      );
      expect(mocks.submit).not.toHaveBeenCalled();
    },
  );

  it('resubmits the original numbered input snapshot without touching the current draft', async () => {
    const root = await configure('inpaint-single');
    const priorInputs = [
      {
        assetId: 'original',
        annotationAssetId: 'numbered',
        kind: 'image',
        position: 0,
      },
    ];
    mocks.store.applications.push({
      key: 'region-marker-edit',
      name: '编号分区',
      shortName: '编号分区',
      capabilityCode: 'region-marker-edit',
      visible: true,
      designModes: { cmf: { order: 0, defaultImage: true } },
    });
    for (const id of ['original', 'numbered'])
      mocks.store.currentAssets.push({
        id,
        name: id,
        projectId: 'project',
        type: 'image',
        status: 'available',
      });
    mocks.submit.mockResolvedValue({ status: 'queued' });
    const parameters = {
      prompt: '修改 1 号区域',
      regionMarks: 'brush:square:4:1:255,0,0:1:0,0;10,10',
    };
    mocks.store.currentJobs = [
      {
        appKey: 'region-marker-edit',
        createdAt: '2026-10-22T00:00:00Z',
        designConversationId: 'conversation',
        designMode: 'cmf',
        id: 'prior-number-job',
        inputs: priorInputs,
        outputs: [],
        ownedByCurrentUser: true,
        parameters,
        projectId: 'project',
        status: 'succeeded',
      },
    ];
    await settle();
    root
      .querySelector<HTMLButtonElement>('[data-testid="rerun-history"]')
      ?.click();
    await settle();
    expect(mocks.submit).toHaveBeenCalledWith(
      'region-marker-edit',
      { designConversationId: 'conversation', designMode: 'cmf' },
      ['original'],
      parameters,
      [],
      [{ assetId: 'numbered', position: 0 }],
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(
      root.querySelector<HTMLTextAreaElement>(
        '[data-testid="design-prompt-input"]',
      )?.value,
    ).toBe('保留编辑指令');
  });

  it('does not overwrite the current draft or run another workflow for a hidden historical function', async () => {
    const root = await configure('inpaint-single');
    mocks.store.currentJobs = [
      {
        id: 'old-job',
        appKey: 'image-upscale',
        designMode: 'cabin',
        designConversationId: 'conversation',
        projectId: 'project',
        ownedByCurrentUser: true,
        status: 'succeeded',
        createdAt: '2026-10-22T00:00:00Z',
        inputs: [],
        outputs: [],
        parameters: { prompt: '不可覆盖当前输入' },
      },
    ];
    await settle();
    const replay = root.querySelector<HTMLButtonElement>(
      '[data-testid="rerun-history"]',
    );
    if (!replay) throw new Error('Missing historical action');
    replay.click();
    await settle();
    expect(
      root.querySelector<HTMLTextAreaElement>(
        '.composer-box textarea[placeholder]',
      )?.value,
    ).toBe('保留编辑指令');
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});

describe('unified reference image editing', () => {
  it('reveals one next slot and preserves the prompt as the workflow changes', async () => {
    const family = ['single-image-edit', 'image-edit-kv', 'multi-image-edit'];
    const alias = 'reference-image-edit';
    mocks.appKey = alias;
    mocks.store.applications = [alias, ...family].map((key) => ({
      key,
      name: key === alias ? '参考图编辑' : key,
      shortName: key,
      capabilityCode: key,
      visible: true,
      designModes:
        key === alias ? { cabin: { order: 0, defaultImage: true } } : {},
    }));
    const assets = ['base-image', 'style-image', 'material-image'].map(
      (id) => ({
        id,
        name: id,
        projectId: 'project',
        type: 'image',
        status: 'available',
      }),
    );
    mocks.store.currentAssets = assets;
    mocks.capability.mockImplementation(async (key: string) => ({
      appKey: key,
      fields: schemas[key],
    }));
    mocks.draft.mockResolvedValue({
      updatedAt: '2026-11-22',
      inputAssetIds: {},
      parameterValues: { prompt: '调整座椅设计' },
    });
    mocks.submit.mockResolvedValue(undefined);
    const root = await render();
    const input = root.querySelector<HTMLInputElement>('input[type="file"]');
    const send = root.querySelector<HTMLButtonElement>('.composer-submit');
    const prompt = root.querySelector<HTMLTextAreaElement>(
      '[data-testid="design-prompt-input"]',
    );
    expect(prompt?.value).toBe('调整座椅设计');
    const slotLabels = () =>
      [...root.querySelectorAll('.composer-input-slot')].map((button) =>
        button.textContent?.trim(),
      );
    expect(slotLabels()).toEqual(['添加图片1']);
    const imageIds: string[] = [];
    for (const [index, asset] of assets.entries()) {
      mocks.upload.mockResolvedValueOnce(asset);
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File(['fixture'], 'image.png', { type: 'image/png' })],
      });
      input?.dispatchEvent(new Event('change'));
      await settle();
      imageIds.push(asset.id);
      expect(slotLabels()).toEqual(index < 2 ? [`添加图片${index + 2}`] : []);
      expect(prompt?.value).toBe('调整座椅设计');
      send?.click();
      await settle();
      const last = mocks.submit.mock.lastCall;
      expect(last?.[0]).toBe(alias);
      expect(last?.[2]).toEqual(imageIds);
      expect(last?.[3]).toMatchObject({
        prompt: '调整座椅设计',
        steps: expect.any(Number),
      });
    }
    root
      .querySelector<HTMLButtonElement>('[aria-label="移除style-image"]')
      ?.click();
    await settle();
    expect(slotLabels()).toEqual(['添加图片3']);
    send?.click();
    await settle();
    expect(mocks.submit.mock.lastCall?.[2]).toEqual([
      'base-image',
      'material-image',
    ]);
    expect(mocks.save.mock.lastCall?.[0]).toMatchObject({
      appKey: alias,
      inputAssetIds: { 0: 'base-image', 1: 'material-image' },
    });
  });
});
