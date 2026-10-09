import type { PlatformJob, PlatformJobOutput } from '#/modules/platform/types';

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
  getAssetPreviewApi: vi
    .fn()
    .mockResolvedValue({ mode: 'url', url: '/result.glb' }),
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
    fields: [],
    flowLabel: '深化设计',
    job,
    round: 1,
    supportsImageComparison: false,
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
    expect(events.mask).toHaveBeenCalledExactlyOnceWith(result, '/result.glb');
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
      .querySelector<HTMLButtonElement>('.gallery-thumbnails button')
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
