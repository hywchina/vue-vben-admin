import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Report from '#/views/platform/report-generation/index.vue';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  upload: vi.fn(),
  create: vi.fn(),
  warning: vi.fn(),
  ids: [] as string[],
}));
vi.mock('@vben/icons', () => ({ IconifyIcon: { render: () => null } }));
vi.mock('#/components/platform/page-heading.vue', () => ({
  default: { render: () => null },
}));
vi.mock(
  '#/views/platform/report-generation/report-template-picker.vue',
  () => ({
    default: defineComponent({
      emits: ['update:modelValue'],
      setup:
        (_, { emit }) =>
        () =>
          h(
            'button',
            {
              onClick: () =>
                emit('update:modelValue', {
                  id: '11111111-1111-4111-8111-111111111111',
                  revision: 3,
                  format: 'docx',
                  configuration: {
                    repeatSections: true,
                    bindings: [
                      {
                        id: 'field',
                        role: 'value',
                        fieldName: '甲方',
                        sectionIndex: 0,
                      },
                    ],
                  },
                }),
            },
            '选择已确认模板',
          ),
    }),
  }),
);
vi.mock('#/store', () => ({
  usePlatformStore: () => ({
    currentProjectId: 'project-test',
    currentProject: { name: '项目' },
    currentJobs: [],
    currentAssets: [],
    projects: [],
    refreshCurrentProjectJobs: vi.fn(),
    uploadAsset: mocks.upload,
  }),
}));
vi.mock('#/api', () => ({
  getReportStatusApi: async () => ({
    configured: true,
    limits: { imagesPerSection: 20, sections: 8, totalImages: 160 },
    supportedImageMimeTypes: ['image/png'],
    formats: [],
    reportTypes: [],
    generationModes: [{ key: 'template', configured: true }],
  }),
  getAssetApi: mocks.get,
  getAssetPreviewApi: async () => ({
    mode: 'url',
    url: 'https://example.invalid/test.png',
  }),
  createReportApi: mocks.create,
  getAssetDownloadApi: vi.fn(),
}));
vi.mock('#/views/platform/workspace/asset-picker-modal.vue', () => ({
  default: defineComponent({
    props: ['open'],
    emits: ['select-multiple'],
    setup:
      (props, { emit }) =>
      () =>
        props.open
          ? h(
              'button',
              {
                onClick: () => emit('select-multiple', mocks.ids),
              },
              '使用所选图片',
            )
          : null,
  }),
}));
vi.mock('ant-design-vue', () => {
  const pass = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', [slots.default?.(), slots.overlay?.()]),
  });
  const field = (tag: string) =>
    defineComponent({
      props: ['value'],
      emits: ['update:value'],
      setup:
        (props, { emit }) =>
        () =>
          h(tag, {
            value: props.value,
            onInput: (event: Event) =>
              emit('update:value', (event.target as HTMLInputElement).value),
          }),
    });
  return {
    Alert: pass,
    Button: defineComponent({
      setup:
        (_, { attrs, slots }) =>
        () =>
          h('button', attrs, slots.default?.()),
    }),
    Dropdown: pass,
    Empty: pass,
    Input: field('input'),
    Textarea: field('textarea'),
    Select: pass,
    Progress: pass,
    Spin: pass,
    Tag: pass,
    Tooltip: pass,
    message: { warning: mocks.warning, error: vi.fn(), success: vi.fn() },
  };
});
const dispose: (() => void)[] = [];
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await nextTick();
}
async function render() {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(Report);
  app.mount(root);
  dispose.push(() => {
    app.unmount();
    root.remove();
  });
  await settle();
  return root;
}
function button(root: Element, label: string) {
  const el = [...root.querySelectorAll('button')].find(
    (b) =>
      b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  );
  if (!el) throw new Error(`Missing ${label}`);
  return el;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ids = [];
  mocks.get.mockImplementation(async (id) => ({
    id,
    name: id,
    mimeType: 'image/png',
  }));
});
afterEach(() => dispose.splice(0).forEach((fn) => fn()));
it('accepts twenty selections, rejects the twenty-first and reports the shared limit', async () => {
  const root = await render();
  button(root, '从项目资产选择').click();
  await settle();
  mocks.ids = Array.from({ length: 21 }, (_, i) => `image-${i}`);
  button(root, '使用所选图片').click();
  for (let i = 0; i < 25; i++) await settle();
  expect(root.querySelectorAll('.report-image')).toHaveLength(20);
  expect(mocks.get).toHaveBeenCalledTimes(20);
  expect(mocks.warning).toHaveBeenCalledWith(
    '已达到当前章节或报告的图片数量上限',
  );
  expect(root.textContent).toContain('/160');
});
it('keeps an in-flight asset selection in its original chapter when another picker opens', async () => {
  let finish: (value: unknown) => void = () => {};
  mocks.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const root = await render();
  button(root, '添加章节').click();
  await settle();
  let sections = root.querySelectorAll('.report-section');
  button(required(sections[0]), '从项目资产选择').click();
  await settle();
  mocks.ids = ['image-1'];
  button(root, '使用所选图片').click();
  await settle();
  button(required(sections[1]), '从项目资产选择').click();
  await settle();
  finish({ id: 'image-1', name: '第一章图片', mimeType: 'image/png' });
  await settle();
  sections = root.querySelectorAll('.report-section');
  expect(required(sections[0]).querySelectorAll('.report-image')).toHaveLength(
    1,
  );
  expect(required(sections[1]).querySelectorAll('.report-image')).toHaveLength(
    0,
  );
});

function required<T>(value: null | T | undefined): T {
  if (value === undefined || value === null)
    throw new Error('Missing test element');
  return value;
}

it('submits the confirmed template revision and literal custom fields with user content', async () => {
  mocks.create.mockResolvedValue({ id: 'report-job' });
  const root = await render();
  button(root, '选择已确认模板').click();
  await settle();
  const custom = [...root.querySelectorAll('label')]
    .find((label) => label.textContent?.includes('甲方'))
    ?.querySelector('input');
  expect(custom).toBeTruthy();
  if (!custom) throw new Error('Missing custom template field');
  custom.value = '项目甲方 <原样填写>';
  custom.dispatchEvent(new Event('input', { bubbles: true }));
  const body = root.querySelector<HTMLTextAreaElement>(
    '.report-section textarea',
  );
  if (!body) throw new Error('Missing report chapter body');
  body.value = '暂定 800 mm，仍待验证。';
  body.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  button(root, '生成 DOCX 报告').click();
  await settle();
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      reportTemplateId: '11111111-1111-4111-8111-111111111111',
      reportTemplateRevision: 3,
      templateValues: { 甲方: '项目甲方 <原样填写>' },
      sections: [expect.objectContaining({ body: '暂定 800 mm，仍待验证。' })],
    }),
  );
});
