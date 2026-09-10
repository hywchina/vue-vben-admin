import { createApp, h, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it } from 'vitest';

import ImageResultGallery from '#/components/platform/image-result-gallery.vue';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

function renderGallery(count: number) {
  const root = document.createElement('div');
  document.body.append(root);
  const selected = ref('image-0');
  const opened: string[] = [];
  const app = createApp({
    setup: () => () =>
      h(ImageResultGallery, {
        activeId: selected.value,
        completedAt: '2026-09-10T08:41:00Z',
        images: Array.from({ length: count }, (_, index) => ({
          id: `image-${index}`,
          name: `图片 ${index + 1}`,
          url: `/gallery-${index}.png`,
        })),
        onSelect: (id: string) => {
          selected.value = id;
        },
        onOpen: (id: string) => opened.push(id),
      }),
  });
  app.mount(root);
  cleanup.push(() => {
    app.unmount();
    root.remove();
  });
  return { root, opened };
}
function loadImage(image: HTMLImageElement, width: number, height: number) {
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height },
  });
  image.dispatchEvent(new Event('load'));
}

describe('image result gallery', () => {
  it.each([2, 3, 5, 8])(
    'renders exactly %i thumbnails and opens the selected output',
    async (count) => {
      const { root, opened } = renderGallery(count);
      const buttons = root.querySelectorAll<HTMLButtonElement>(
        '.gallery-thumbnails button',
      );
      expect(buttons).toHaveLength(count);
      buttons[count - 1]?.click();
      await nextTick();
      expect(root.querySelector('.gallery-counter')?.textContent).toBe(
        `${count} / ${count}`,
      );
      expect(root.querySelector('.gallery-main img')?.getAttribute('src')).toBe(
        `/gallery-${count - 1}.png`,
      );
      root.querySelector<HTMLButtonElement>('.gallery-main')?.click();
      expect(opened).toEqual([`image-${count - 1}`]);
      expect(root.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
      expect(root.querySelector('time')?.dateTime).toBe('2026-09-10T08:41:00Z');
    },
  );
  it.each<[number, number, number]>([
    [1024, 1024, 1],
    [2048, 1072, 2048 / 1072],
    [768, 1344, 768 / 1344],
  ])(
    'preserves %ix%i geometry when selecting a differently shaped image',
    async (width, height, ratio) => {
      const { root } = renderGallery(3);
      const images = root.querySelectorAll<HTMLImageElement>(
        '.gallery-thumbnails img',
      );
      loadImage(required(images[0]), width, height);
      await nextTick();
      const gallery = required(
        root.querySelector<HTMLElement>('.image-result-gallery'),
      );
      expect(
        Number(gallery.style.getPropertyValue('--gallery-ratio')),
      ).toBeCloseTo(ratio);
      const initialStyle = gallery.getAttribute('style');
      loadImage(required(images[1]), 400, 1600);
      root
        .querySelectorAll<HTMLButtonElement>('.gallery-thumbnails button')[1]
        ?.click();
      await nextTick();
      expect(gallery.getAttribute('style')).toBe(initialStyle);
    },
  );
});

function required<T>(value: null | T | undefined): T {
  if (value === undefined || value === null)
    throw new Error('Missing gallery element');
  return value;
}
