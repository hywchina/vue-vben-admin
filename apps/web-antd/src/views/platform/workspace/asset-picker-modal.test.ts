import type { PlatformAsset } from '#/modules/platform/types';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAssetFoldersApi, getAssetsApi } from '#/api';

import AssetPickerModal from './asset-picker-modal.vue';

vi.mock('@vben/icons', () => ({
  IconifyIcon: defineComponent({ setup: () => () => h('i') }),
}));
vi.mock('ant-design-vue', () => {
  const box = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', [slots.default?.(), slots.footer?.(), slots.action?.()]),
  });
  return {
    Alert: box,
    Empty: box,
    Spin: box,
    Tag: box,
    Modal: box,
    Button: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('button', slots.default?.()),
    }),
    Input: defineComponent({ setup: () => () => h('input') }),
    Select: defineComponent({
      props: ['modelValue', 'value', 'options'],
      emits: ['update:value', 'change'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'select',
            {
              value: props.value,
              onChange: (event: Event) => {
                const value = (event.target as HTMLSelectElement).value;
                emit('update:value', value);
                emit('change', value);
              },
            },
            props.options?.map((option: { label: string; value: string }) =>
              h('option', { value: option.value }, option.label),
            ),
          ),
    }),
  };
});
vi.mock('#/api', () => ({
  getAssetApi: vi.fn(),
  getAssetsApi: vi.fn(),
  getAssetFoldersApi: vi.fn(),
  getAssetPreviewApi: vi
    .fn()
    .mockResolvedValue({ mode: 'url', url: '/preview.png' }),
}));
const cleanup: (() => void)[] = [];
const image = (id: string, projectId: string, mimeType = 'image/png') =>
  ({
    id,
    projectId,
    name: id,
    mimeType,
    type: 'image',
    tags: [],
    createdAt: '2026-10-21T00:00:00Z',
    folderId: 'nested-folder',
  }) as unknown as PlatformAsset;
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await nextTick();
}
async function render(extra: Record<string, unknown> = {}) {
  const props = reactive({
    acceptedKinds: ['image'],
    assets: [],
    projectId: 'destination',
    open: false,
    ...extra,
  });
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(
    defineComponent({ setup: () => () => h(AssetPickerModal, props as never) }),
  );
  app.mount(root);
  cleanup.push(() => {
    app.unmount();
    root.remove();
  });
  props.open = true;
  await settle();
  return root;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAssetFoldersApi).mockResolvedValue([]);
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

describe('report image picker scope', () => {
  it('loads all accessible projects including nested folders and labels the origin', async () => {
    vi.mocked(getAssetsApi).mockImplementation(async (id) => [
      image(`image-${id}`, id),
      image(`webp-${id}`, id, 'image/webp'),
    ]);
    const root = await render({
      projects: [
        { id: 'a', name: '来源甲' },
        { id: 'b', name: '来源乙' },
      ],
      acceptedMimeTypes: ['image/png', 'image/jpeg'],
    });
    expect(getAssetsApi).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ folderId: undefined, kind: 'image' }),
    );
    expect(getAssetsApi).toHaveBeenCalledWith(
      'b',
      expect.objectContaining({ folderId: undefined }),
    );
    expect(root.textContent).toContain('image-a');
    expect(root.textContent).toContain('image-b');
    expect(root.textContent).not.toContain('webp-a');
    expect(root.textContent).toContain('来源甲');
    const select = root.querySelector('select');
    if (!select) throw new Error('Missing source project selector');
    select.value = 'b';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(getAssetFoldersApi).toHaveBeenCalledWith('b');
    expect(getAssetsApi).toHaveBeenLastCalledWith(
      'b',
      expect.objectContaining({ folderId: 'root' }),
    );
  });
  it('keeps existing workflow and training pickers limited to their current project', async () => {
    vi.mocked(getAssetsApi).mockResolvedValue([
      image('current-image', 'destination'),
    ]);
    await render();
    expect(getAssetFoldersApi).toHaveBeenCalledWith('destination');
    expect(getAssetsApi).toHaveBeenCalledWith(
      'destination',
      expect.objectContaining({ folderId: 'root' }),
    );
    expect(getAssetsApi).toHaveBeenCalledTimes(1);
  });
  it('shows a failed scope query without retaining stale or partial assets', async () => {
    vi.mocked(getAssetsApi).mockRejectedValue(new Error('来源权限已撤销'));
    const root = await render({ projects: [{ id: 'a', name: '来源甲' }] });
    expect(root.querySelector('.asset-picker-grid')).toBeNull();
    expect(root.textContent).toContain('重试');
  });
});
