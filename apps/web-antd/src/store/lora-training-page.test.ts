import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LORA_FIELDS, LORA_GROUPS } from '#/modules/platform/lora-training';
import Training from '#/views/platform/model-training/index.vue';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  status: vi.fn(),
  refresh: vi.fn(),
  preview: vi.fn(),
  assets: [] as Array<{
    id: string;
    name: string;
    publicId: string;
    status: string;
    type: string;
  }>,
  upload: vi.fn(),
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@vben/icons', () => ({
  IconifyIcon: defineComponent({ setup: () => () => h('i') }),
}));
vi.mock('#/components/platform/page-heading.vue', () => ({
  default: defineComponent({ setup: () => () => h('h1', 'LoRA 模型训练') }),
}));
vi.mock('#/components/platform/status-pill.vue', () => ({
  default: defineComponent({ setup: () => () => h('span') }),
}));
vi.mock('#/store', () => ({
  usePlatformStore: () => ({
    currentProjectId: '11111111-1111-4111-8111-111111111111',
    currentProject: { name: '测试项目' },
    currentAssets: mocks.assets,
    currentJobs: [],
    refreshCurrentProjectJobs: mocks.refresh,
    uploadAsset: mocks.upload,
  }),
}));
vi.mock('#/api', () => ({
  createLoraTrainingApi: mocks.create,
  getLoraStatusApi: mocks.status,
  getAssetPreviewApi: mocks.preview,
  getLoraTrainingLogsApi: vi.fn(),
  getLoraTrainingMetricsApi: vi.fn(),
  requestLoraCheckpointApi: vi.fn(),
}));
vi.mock('ant-design-vue', () => {
  const pass = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  const field = (tag: string, numeric = false) =>
    defineComponent({
      props: ['value', 'options'],
      emits: ['update:value'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            tag,
            {
              value: props.value,
              onInput: (event: Event) =>
                emit(
                  'update:value',
                  numeric
                    ? Number((event.target as HTMLInputElement).value)
                    : (event.target as HTMLInputElement).value,
                ),
            },
            props.options?.map((option: { label: string; value: string }) =>
              h('option', { value: option.value }, option.label),
            ),
          ),
    });
  return {
    Button: defineComponent({
      props: ['disabled'],
      setup:
        (props, { slots }) =>
        () =>
          h('button', { disabled: props.disabled }, slots.default?.()),
    }),
    Drawer: defineComponent({ setup: () => () => null }),
    Empty: pass,
    Input: field('input'),
    InputNumber: field('input', true),
    Select: field('select', true),
    Switch: pass,
    Textarea: field('textarea'),
    Modal: defineComponent({
      props: ['open'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('section', { role: 'dialog' }, slots.default?.())
            : null,
    }),
    Progress: pass,
    Spin: pass,
    Tag: pass,
    Tooltip: pass,
    message: { success: vi.fn(), warning: vi.fn() },
  };
});
function required<T>(value: null | T | undefined): T {
  if (value === undefined || value === null)
    throw new Error('Missing test element');
  return value;
}

const disposers: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.assets = [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: '测试图片',
      publicId: 'AST-TEST',
      type: 'image',
      status: 'available',
    },
  ];
  mocks.refresh.mockResolvedValue(undefined);
  mocks.preview.mockResolvedValue({ url: 'https://example.invalid/image.png' });
  mocks.create.mockResolvedValue({});
  mocks.status.mockResolvedValue({
    configured: true,
    reachable: true,
    model: 'flux2-klein-9b',
    models: [{ key: 'flux2-klein-9b', label: 'Flux2 Klein 9B' }],
  });
});
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()));
async function settle() {
  for (let index = 0; index < 5; index++) await Promise.resolve();
  await nextTick();
}
async function render() {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(Training);
  app.mount(root);
  disposers.push(() => {
    app.unmount();
    root.remove();
  });
  await settle();
  return root;
}
function button(root: Element, text: string) {
  return required(
    [...root.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === text,
    ),
  );
}
async function fill(root: Element, selector: string, value: string) {
  const input = required(root.querySelector<HTMLInputElement>(selector));
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle();
}

describe('loRA training page contract', () => {
  it('selects more than 100 images, displays the real count and still requires every caption', async () => {
    mocks.assets = Array.from({ length: 101 }, (_, index) => ({
      id: `asset-${index}`,
      name: `图片${index}`,
      publicId: `AST-${index}`,
      type: 'image',
      status: 'available',
    }));
    const root = await render();
    root
      .querySelectorAll<HTMLButtonElement>('.asset-card')
      .forEach((card) => card.click());
    await settle();
    expect(root.textContent).toContain('已选 101 张');
    expect(root.textContent).not.toContain('/100');
    expect(root.querySelectorAll('.caption-card')).toHaveLength(101);
    expect(button(root, '开始训练').disabled).toBe(true);
    for (const field of root.querySelectorAll<HTMLTextAreaElement>(
      '.caption-card textarea',
    )) {
      field.value = '客室设计';
      field.dispatchEvent(new Event('input'));
    }
    await settle();
    expect(button(root, '开始训练').disabled).toBe(false);
    button(root, '开始训练').click();
    await settle();
    expect(mocks.create.mock.calls[0]?.[0].items).toHaveLength(101);
  });

  it('does not truncate a local upload selection to 100 files', async () => {
    mocks.upload.mockImplementation(async ({ name }) => ({ id: name }));
    const root = await render();
    const input = required(
      root.querySelector<HTMLInputElement>('input[type="file"]'),
    );
    Object.defineProperty(input, 'files', {
      value: Array.from(
        { length: 101 },
        (_, index) =>
          new File(['image'], `image-${index}.png`, { type: 'image/png' }),
      ),
    });
    input.dispatchEvent(new Event('change'));
    for (let index = 0; index < 120; index++) await settle();
    expect(mocks.upload).toHaveBeenCalledTimes(101);
    expect(root.textContent).toContain('已选 101 张');
  });
  it('only places common fields in the main panel and all other demo fields in professional settings', async () => {
    const root = await render();
    const seen = [...root.querySelectorAll('[data-lora-path]')].map((item) =>
      required((item as HTMLElement).dataset.loraPath),
    );
    expect(seen).toEqual(
      LORA_FIELDS.filter((field) => field.main).map((field) => field.path),
    );
    expect(root.textContent).not.toContain('Epoch');
    button(root, '专业设置').click();
    await settle();
    for (const group of LORA_GROUPS) {
      button(root, group.label).click();
      await settle();
      const fields = [
        ...root.querySelectorAll('[role="dialog"] [data-lora-path]'),
      ].map((item) => required((item as HTMLElement).dataset.loraPath));
      expect(fields).toEqual(
        LORA_FIELDS.filter(
          (field) => !field.main && field.group === group.key,
        ).map((field) => field.path),
      );
      seen.push(...fields);
    }
    expect(seen.toSorted()).toEqual(
      LORA_FIELDS.map((field) => field.path).toSorted(),
    );
  });
  it('submits direct steps and Repeat with captions, and never sends Epoch or readonly paths', async () => {
    const root = await render();
    expect(button(root, '开始训练').disabled).toBe(true);
    required(root.querySelector<HTMLButtonElement>('.asset-card')).click();
    await settle();
    expect(button(root, '开始训练').disabled).toBe(true);
    await fill(root, '.caption-card textarea', '现代客室，暖色木饰面');
    await fill(root, 'input[aria-label="训练步数"]', '800');
    await fill(root, 'input[aria-label="单张图片重复次数（Repeat）"]', '3');
    expect(button(root, '开始训练').disabled).toBe(false);
    button(root, '开始训练').click();
    await settle();
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(required(mocks.create.mock.calls[0])[0]).toEqual({
      items: [
        {
          assetId: '22222222-2222-4222-8222-222222222222',
          caption: '现代客室，暖色木饰面',
        },
      ],
      name: '测试项目 · LoRA 训练',
      projectId: '11111111-1111-4111-8111-111111111111',
      parameters: {
        baseModel: 'flux2-klein-9b',
        steps: 800,
        repeats: 3,
        rank: 16,
        resolution: 512,
        learningRate: 0.0001,
        triggerWord: 'interiorstyle',
        previewPrompt: '[trigger], modern style interior design',
        disableSampling: true,
      },
    });
  });
  it('blocks invalid steps and unavailable external service without creating a job', async () => {
    const root = await render();
    required(root.querySelector<HTMLButtonElement>('.asset-card')).click();
    await settle();
    await fill(root, '.caption-card textarea', '客室');
    await fill(root, 'input[aria-label="训练步数"]', '0');
    expect(button(root, '开始训练').disabled).toBe(true);
    await fill(root, 'input[aria-label="训练步数"]', '1500');
    expect(button(root, '开始训练').disabled).toBe(false);
    mocks.status.mockResolvedValue({
      configured: true,
      reachable: false,
      models: [{ key: 'flux2-klein-9b' }],
    });
    button(root, '重新检查').click();
    await settle();
    expect(button(root, '开始训练').disabled).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
