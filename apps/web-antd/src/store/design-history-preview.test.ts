import { createApp, h, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import DesignHistoryPreview from '#/components/platform/design-history-preview.vue';

vi.mock('@vben/icons', () => ({
  IconifyIcon: {
    props: ['icon'],
    setup: (props: { icon: string }) => () =>
      h('svg', { 'data-icon': props.icon }),
  },
}));

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

function renderPreview(initialSrc?: string) {
  const root = document.createElement('div');
  document.body.append(root);
  const src = ref(initialSrc);
  const app = createApp({
    setup: () => () =>
      h(DesignHistoryPreview, { alt: '我的设计 设计资产预览', src: src.value }),
  });
  app.mount(root);
  cleanup.push(() => {
    app.unmount();
    root.remove();
  });
  return { root, src };
}

describe('design history image placeholder', () => {
  it.each([undefined, ''])(
    'shows a centered design icon instead of a broken image for %j',
    (source) => {
      const { root } = renderPreview(source);
      expect(root.querySelector('img')).toBeNull();
      expect(
        root
          .querySelector('.design-history-preview--placeholder')
          ?.getAttribute('aria-label'),
      ).toBe('暂无生成图片');
      expect(root.querySelector('svg')?.dataset.icon).toBe(
        'lucide:wand-sparkles',
      );
      expect(root.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
        'true',
      );
    },
  );

  it('keeps a real image and its accessible description', () => {
    const { root } = renderPreview('/preview.png');
    expect(root.querySelector('img')?.getAttribute('src')).toBe('/preview.png');
    expect(root.querySelector('img')?.alt).toBe('我的设计 设计资产预览');
    expect(
      root.querySelector('.design-history-preview--placeholder'),
    ).toBeNull();
    expect(root.querySelector('svg')).toBeNull();
  });

  it('falls back when an image fails to load', async () => {
    const { root } = renderPreview('/unavailable.png');
    root.querySelector('img')?.dispatchEvent(new Event('error'));
    await nextTick();
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      '图片预览暂不可用',
    );
    expect(root.querySelector('svg')).not.toBeNull();
  });

  it('tries a new source after failure and returns to placeholder when cleared', async () => {
    const { root, src } = renderPreview('/unavailable.png');
    root.querySelector('img')?.dispatchEvent(new Event('error'));
    await nextTick();
    src.value = '/fresh-preview.png';
    await nextTick();
    expect(root.querySelector('img')?.getAttribute('src')).toBe(
      '/fresh-preview.png',
    );
    src.value = undefined;
    await nextTick();
    expect(root.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      '暂无生成图片',
    );
  });
});
