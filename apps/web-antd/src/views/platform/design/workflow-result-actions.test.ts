import type {
  CapabilityField,
  PlatformJob,
  PlatformJobOutput,
} from '#/modules/platform/types';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import WorkflowRunCard from '#/components/platform/workflow-run-card.vue';

vi.mock('@vben/icons', () => ({
  IconifyIcon: defineComponent({ setup: () => () => h('i') }),
}));
vi.mock('ant-design-vue', () => ({
  Tooltip: defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('span', slots.default?.()),
  }),
  Modal: defineComponent({ setup: () => () => null }),
  Button: defineComponent({ setup: () => () => h('button') }),
  Textarea: defineComponent({ setup: () => () => h('textarea') }),
  message: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('#/api', () => ({
  getAssetPreviewApi: vi.fn().mockImplementation(async (assetId: string) => ({
    mode: 'url',
    url: `/preview/${assetId}`,
  })),
  getAssetDownloadApi: vi
    .fn()
    .mockResolvedValue({ mode: 'inline', content: 'Result' }),
}));
vi.mock('#/components/platform/model3d-viewer.vue', () => ({
  default: defineComponent({
    setup: () => () => h('div', { 'data-testid': 'model-viewer' }),
  }),
}));
vi.mock('#/components/platform/image-lightbox.vue', () => ({
  default: defineComponent({
    props: { open: Boolean },
    setup:
      (props, { slots }) =>
      () =>
        h(
          'div',
          { 'data-testid': 'result-lightbox', 'data-open': String(props.open) },
          slots.actions?.(),
        ),
  }),
}));

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

function output(
  kind: PlatformJobOutput['kind'],
  saved = false,
): PlatformJobOutput {
  return {
    assetId: `${kind}-asset`,
    kind,
    mimeType: kind === 'model3d' ? 'model/gltf-binary' : `${kind}/test`,
    name: `result.${kind === 'model3d' ? 'glb' : 'png'}`,
    position: 0,
    saved,
  };
}

async function renderResult(
  outputs: PlatformJobOutput[],
  conversationLayout = true,
  options: {
    comparison?: boolean;
    fields?: CapabilityField[];
    job?: Partial<PlatformJob>;
  } = {},
) {
  const job: PlatformJob = {
    appKey: 'multiview-to-3d',
    completedAt: '2026-09-24T10:36:00Z',
    createdAt: '2026-09-24T10:30:00Z',
    createdBy: 'user-id',
    externalExecution: true,
    id: 'job-id',
    inputAssetIds: [],
    inputs: [],
    name: '三维生成',
    ownedByCurrentUser: true,
    outputs,
    owner: '测试用户',
    ownerPublicId: 'USR-00000001',
    parameters: {},
    progress: 100,
    projectId: 'project-id',
    publicId: 'TSK-00000001',
    stage: '已完成',
    status: 'succeeded',
    ...options.job,
  };
  const events = {
    download: vi.fn(),
    save: vi.fn(),
    rerun: vi.fn(),
    flow: vi.fn(),
    mask: vi.fn(),
  };
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(WorkflowRunCard, {
    accent: '#b91c32',
    conversationLayout,
    fields: options.fields ?? [],
    flowLabel: '深化设计',
    job,
    round: 1,
    supportsImageComparison: options.comparison ?? false,
    onDownload: events.download,
    onSave: events.save,
    onRerun: events.rerun,
    onFlow: events.flow,
    onMask: events.mask,
  });
  app.mount(root);
  cleanup.push(() => {
    app.unmount();
    root.remove();
  });
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
  await nextTick();
  return { root, job, events };
}

describe('workflow result actions', () => {
  it('closes the image lightbox before opening the separate continue or save dialog', async () => {
    const result = output('image');
    const { root, events } = await renderResult([
      result,
      { ...result, assetId: 'second-image' },
    ]);
    for (const label of ['深化设计', '加入资产', '局部重绘']) {
      root.querySelector<HTMLButtonElement>('.gallery-main')?.click();
      await nextTick();
      expect(
        [
          ...root.querySelectorAll<HTMLElement>(
            '[data-testid="result-lightbox"]',
          ),
        ].at(-1)?.dataset.open,
      ).toBe('true');
      root.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
      await nextTick();
      expect(
        [
          ...root.querySelectorAll<HTMLElement>(
            '[data-testid="result-lightbox"]',
          ),
        ].at(-1)?.dataset.open,
      ).toBe('false');
    }
    expect(events.flow).toHaveBeenCalledExactlyOnceWith(result);
    expect(events.save).toHaveBeenCalledExactlyOnceWith(result);
    expect(events.mask).toHaveBeenCalledExactlyOnceWith(
      result,
      '/preview/image-asset',
    );
    expect(result.saved).toBe(false);
  });
  it.each([true, false])(
    'hides model3d flow in conversation layout: %s while keeping real actions',
    async (conversationLayout) => {
      const model = output('model3d');
      const { root, job, events } = await renderResult(
        [model],
        conversationLayout,
      );
      expect(root.querySelector('[aria-label="深化设计"]')).toBeNull();
      expect(root.querySelector('[data-testid="model-viewer"]')).not.toBeNull();
      for (const label of ['下载或查看结果', '加入资产', '复用本轮再运行']) {
        const button = root.querySelector<HTMLButtonElement>(
          `button[aria-label="${label}"]`,
        );
        expect(button?.disabled).toBe(false);
        button?.click();
      }
      expect(events.download).toHaveBeenCalledExactlyOnceWith(model);
      expect(events.save).toHaveBeenCalledExactlyOnceWith(model);
      expect(events.rerun).toHaveBeenCalledExactlyOnceWith(job);
      expect(events.flow).not.toHaveBeenCalled();
    },
  );

  it('keeps saved model actions without a flow entry', async () => {
    const { root } = await renderResult([output('model3d', true)]);
    expect(root.querySelector('[aria-label="深化设计"]')).toBeNull();
    expect(
      root.querySelector<HTMLButtonElement>('[aria-label="已加入资产"]')
        ?.disabled,
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>('[aria-label="下载或查看结果"]')
        ?.disabled,
    ).toBe(false);
    expect(
      root.querySelector<HTMLButtonElement>('[aria-label="复用本轮再运行"]')
        ?.disabled,
    ).toBe(false);
  });

  it.each(['image', 'text'] as const)(
    'preserves existing %s result flow',
    async (kind) => {
      const result = output(kind);
      const { root, events } = await renderResult([result]);
      const button = root.querySelector<HTMLButtonElement>(
        '[aria-label="深化设计"]',
      );
      expect(button).not.toBeNull();
      button?.click();
      expect(events.flow).toHaveBeenCalledExactlyOnceWith(result);
    },
  );

  it('uses the selected asset type for mixed output gallery actions', async () => {
    const image = output('image');
    const { root, events } = await renderResult([
      output('model3d'),
      image,
      { ...output('image'), assetId: 'second-image' },
    ]);
    expect(root.querySelector('[aria-label="深化设计"]')).toBeNull();
    root
      .querySelector<HTMLButtonElement>(
        '.round-output-selector button:nth-child(2)',
      )
      ?.click();
    await nextTick();
    const button = root.querySelector<HTMLButtonElement>(
      '[aria-label="深化设计"]',
    );
    expect(button).not.toBeNull();
    button?.click();
    expect(events.flow).toHaveBeenCalledExactlyOnceWith(image);
  });
});

const sourceImage = {
  assetId: 'source-image',
  kind: 'image' as const,
  mimeType: 'image/png',
  name: 'source.png',
  position: 0,
};
const batchOutputs = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    ...output('image'),
    assetId: `image-${index}`,
    position: index,
  }));
function switchView(root: HTMLElement, label: string) {
  const button = [
    ...root.querySelectorAll<HTMLButtonElement>('.round-view-switch button'),
  ].find((item) => item.textContent?.trim() === label);
  expect(button).toBeDefined();
  required(button).click();
}

describe('result view selection', () => {
  it.each([1, 2, 8])(
    'compares %i outputs and keeps thumbnail selection and actions',
    async (count) => {
      const outputs = batchOutputs(count);
      const { root, events } = await renderResult(outputs, true, {
        comparison: true,
        job: {
          appKey: 'single-image-edit',
          inputs: [sourceImage],
          inputAssetIds: [sourceImage.assetId],
        },
      });
      const comparison = () => root.querySelector('[data-image-comparison]');
      expect(comparison()).not.toBeNull();
      expect(
        comparison()?.querySelector('img[alt="原始输入"]')?.getAttribute('src'),
      ).toBe('/preview/source-image');
      expect(
        comparison()?.querySelector('img[alt="生成结果"]')?.getAttribute('src'),
      ).toBe('/preview/image-0');
      const range = required(
        required(comparison()).querySelector<HTMLInputElement>(
          'input[type="range"]',
        ),
      );
      range.value = '25';
      range.dispatchEvent(new Event('input'));
      await nextTick();
      expect(
        comparison()?.querySelector<HTMLElement>('.image-comparison__before')
          ?.style.clipPath,
      ).toBe('inset(0 75% 0 0)');
      const thumbnails = root.querySelectorAll<HTMLButtonElement>(
        '.gallery-thumbnails button',
      );
      expect(thumbnails).toHaveLength(count > 1 ? count : 0);
      if (count > 1) required(thumbnails.item(count - 1)).click();
      await nextTick();
      expect(
        comparison()?.querySelector('img[alt="生成结果"]')?.getAttribute('src'),
      ).toBe(`/preview/image-${count - 1}`);
      expect(root.querySelector('.gallery-counter')?.textContent).toBe(
        count > 1 ? `${count} / ${count}` : undefined,
      );
      required(
        root.querySelector<HTMLButtonElement>(
          '.round-output__footer [aria-label="加入资产"]',
        ),
      ).click();
      expect(events.save).toHaveBeenCalledExactlyOnceWith(outputs[count - 1]);
      switchView(root, '结果');
      await nextTick();
      expect(comparison()).toBeNull();
      const resultImage = root.querySelector(
        count > 1 ? '.gallery-main img' : '.round-output-image-open img',
      );
      expect(resultImage?.getAttribute('src')).toBe(
        `/preview/image-${count - 1}`,
      );
      switchView(root, '对比');
      await nextTick();
      expect(comparison()).not.toBeNull();
    },
  );

  it.each([true, false])(
    'keeps mixed image/text/model results reachable (conversation=%s)',
    async (conversation) => {
      const { root, events } = await renderResult(
        [output('model3d'), ...batchOutputs(2), output('text')],
        conversation,
      );
      expect(root.querySelector('[data-testid="model-viewer"]')).not.toBeNull();
      expect(root.querySelector('.image-result-gallery')).toBeNull();
      const selectors = root.querySelectorAll<HTMLButtonElement>(
        '.round-output-selector button',
      );
      expect(selectors).toHaveLength(4);
      required(selectors.item(1)).click();
      await nextTick();
      expect(
        root.querySelector(
          conversation ? '.image-result-gallery' : '.round-output-gallery',
        ),
      ).not.toBeNull();
      required(selectors.item(3)).click();
      await nextTick();
      expect(root.querySelector('.output-text')?.textContent).toContain(
        'Result',
      );
      expect(root.querySelector('.image-result-gallery')).toBeNull();
      expect(root.querySelector('.round-output-gallery')).toBeNull();
      required(
        root.querySelector<HTMLButtonElement>(
          '.round-output__footer [aria-label="下载或查看结果"]',
        ),
      ).click();
      expect(events.download).toHaveBeenCalledExactlyOnceWith(output('text'));
      required(selectors.item(0)).click();
      await nextTick();
      expect(root.querySelector('[data-testid="model-viewer"]')).not.toBeNull();
    },
  );

  it.each(['mask', 'region'] as const)(
    'uses the original source for a batch %s comparison',
    async (kind) => {
      const input =
        kind === 'mask'
          ? {
              ...sourceImage,
              assetId: 'mask-image',
              derivedFromAssetId: 'original-image',
            }
          : { ...sourceImage, annotationAssetId: 'annotation-image' };
      const { root } = await renderResult(batchOutputs(2), true, {
        comparison: kind === 'mask',
        job: { inputs: [input] },
      });
      const label = kind === 'mask' ? '遮罩前原图' : '带标记输入图';
      expect(
        root
          .querySelector(`[data-image-comparison] img[alt="${label}"]`)
          ?.getAttribute('src'),
      ).toBe(
        `/preview/${kind === 'mask' ? 'original-image' : 'annotation-image'}`,
      );
    },
  );
});

describe('comparison fallbacks', () => {
  it('keeps ordinary workspace batch comparison and result switching', async () => {
    const { root } = await renderResult(batchOutputs(2), false, {
      comparison: true,
      job: { inputs: [sourceImage] },
    });
    expect(root.querySelector('[data-image-comparison]')).not.toBeNull();
    switchView(root, '结果');
    await nextTick();
    expect(root.querySelector('[data-image-comparison]')).toBeNull();
    expect(root.querySelector('.round-output-gallery')).not.toBeNull();
    switchView(root, '对比');
    await nextTick();
    expect(root.querySelector('[data-image-comparison]')).not.toBeNull();
  });
  it('keeps a historical mask without original lineage out of comparison', async () => {
    const { root } = await renderResult(batchOutputs(2), true, {
      comparison: true,
      job: { inputs: [{ ...sourceImage, assetId: 'mask-image' }] },
      fields: [
        {
          acceptedKinds: ['image'],
          advanced: false,
          assetIndex: 0,
          integer: false,
          key: 'mask',
          label: '遮罩',
          options: [],
          required: true,
          type: 'mask',
          uiControl: 'default',
        },
      ],
    });
    expect(root.querySelector('[data-image-comparison]')).toBeNull();
    expect(
      root.querySelector('.round-comparison-unavailable')?.textContent,
    ).toContain('未记录遮罩前原图');
    expect(root.querySelectorAll('.gallery-thumbnails button')).toHaveLength(2);
  });
});

function required<T>(value: null | T | undefined): T {
  if (value === undefined || value === null)
    throw new Error('Missing result view element');
  return value;
}
