import type { CapabilityField } from '#/modules/platform/types';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CapabilityMediaField from './capability-media-field.vue';

vi.mock('@vben/icons', () => ({
  IconifyIcon: defineComponent({ setup: () => () => h('i') }),
}));
vi.mock('ant-design-vue', () => ({
  Button: defineComponent({
    props: ['disabled'],
    setup:
      (props, { slots }) =>
      () =>
        h('button', { disabled: props.disabled }, slots.default?.()),
  }),
  Modal: defineComponent({ setup: () => () => null }),
  message: { error: vi.fn(), warning: vi.fn() },
}));
vi.mock('#/api', () => ({
  getAssetApi: vi.fn(),
  getAssetPreviewApi: vi
    .fn()
    .mockResolvedValue({ mode: 'url', url: '/frame.png' }),
}));
vi.mock('./asset-picker-modal.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('#/components/platform/comfy-mask-editor.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('#/components/platform/image-lightbox.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));

const field: CapabilityField = {
  acceptedKinds: ['image'],
  advanced: false,
  assetIndex: 0,
  integer: false,
  key: 'capture',
  label: '捕获画面',
  options: [],
  required: true,
  type: 'capture',
  uiControl: 'default',
};
const cleanup: (() => void)[] = [];
async function settle() {
  for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
  await nextTick();
}
function stream() {
  const track = new EventTarget() as EventTarget & {
    stop: ReturnType<typeof vi.fn>;
  };
  track.stop = vi.fn();
  return {
    track,
    value: {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream,
  };
}
const display = vi.fn();
const camera = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getDisplayMedia: display, getUserMedia: camera },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray(48 * 48 * 4) }),
      }) as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback) => callback(new Blob(['frame'], { type: 'image/png' })),
  );
});
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(props: Record<string, unknown> = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(CapabilityMediaField, {
    accent: '#cf123b',
    assets: [],
    field,
    composer: true,
    ...props,
  });
  app.mount(root);
  let unmounted = false;
  const unmount = () => {
    if (!unmounted) app.unmount();
    unmounted = true;
    root.remove();
  };
  cleanup.push(unmount);
  const video = root.querySelector('video');
  if (!video) throw new Error('Capture video was not mounted');
  Object.defineProperties(video, {
    srcObject: { value: null, writable: true },
    videoWidth: { value: 640 },
    videoHeight: { value: 360 },
  });
  await settle();
  const button = (label: string) => {
    const match = [...root.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === label,
    );
    if (!match) throw new Error(`Button not found: ${label}`);
    return match;
  };
  return { root, video, unmount, button };
}

describe('inline capture controls and cleanup', () => {
  it('sets focus policy before opening the screen picker, not after video playback', async () => {
    const order: string[] = [];
    class Controller {
      setFocusBehavior(behavior: string) {
        order.push(behavior);
      }
    }
    vi.stubGlobal('CaptureController', Controller);
    const source = stream();
    display.mockImplementation((options) => {
      order.push('picker');
      expect(options.controller).toBeInstanceOf(Controller);
      return Promise.resolve(source.value);
    });
    const { button, video } = await render();
    button('共享屏幕').click();
    await settle();
    expect(order).toEqual(['no-focus-change', 'picker']);
    expect(display).toHaveBeenCalledOnce();
    expect(video.srcObject).toBe(source.value);
  });

  it('shares normally when focus configuration fails', async () => {
    class Controller {
      setFocusBehavior() {
        throw new Error('Focus policy unavailable');
      }
    }
    vi.stubGlobal('CaptureController', Controller);
    const source = stream();
    display.mockResolvedValue(source.value);
    const { button, video } = await render();
    button('共享屏幕').click();
    await settle();
    expect(display).toHaveBeenCalledExactlyOnceWith({ video: true });
    expect(video.srcObject).toBe(source.value);
  });

  it('does not reopen the picker when the user refuses sharing', async () => {
    vi.stubGlobal('CaptureController', undefined);
    display.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    const { button, video } = await render();
    button('共享屏幕').click();
    await settle();
    expect(display).toHaveBeenCalledExactlyOnceWith({ video: true });
    expect(video.srcObject).toBeNull();
    expect(button('共享屏幕').disabled).toBe(false);
  });

  it('does not use screen focus control for the camera', async () => {
    const construct = vi.fn();
    class Controller {
      constructor() {
        construct();
      }

      setFocusBehavior() {}
    }
    vi.stubGlobal('CaptureController', Controller);
    const source = stream();
    camera.mockResolvedValue(source.value);
    const { button, video } = await render();
    button('摄像头').click();
    await settle();
    expect(camera).toHaveBeenCalledExactlyOnceWith({ video: true });
    expect(construct).not.toHaveBeenCalled();
    expect(display).not.toHaveBeenCalled();
    expect(video.srcObject).toBe(source.value);
  });

  it('renders preview and all sources without a drawer, disabling operations until connected', async () => {
    const { root, button } = await render();
    expect(root.querySelector('.media-field--composer video')).not.toBeNull();
    for (const label of ['共享屏幕', '摄像头', '项目资产', '导入'])
      expect(button(label).disabled).toBe(false);
    for (const label of ['选择区域', '开始实时', '捕获当前帧'])
      expect(button(label).disabled).toBe(true);
  });

  it('captures a frame and stops screen tracks without cancelling a manual task', async () => {
    const source = stream();
    display.mockResolvedValue(source.value);
    const upload = vi.fn();
    const stop = vi.fn();
    const { button, video } = await render({
      onUpload: upload,
      stopLiveCapture: stop,
    });
    button('共享屏幕').click();
    await settle();
    expect(video.srcObject).toBe(source.value);
    button('捕获当前帧').click();
    await settle();
    expect(upload.mock.calls[0]?.[0]).toBeInstanceOf(File);
    button('停止共享').click();
    await settle();
    expect(source.track.stop).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });

  it.each(['stop', 'unmount'])(
    'releases a late permission result after %s',
    async (action) => {
      const source = stream();
      let resolve!: (value: MediaStream) => void;
      display.mockReturnValue(
        new Promise<MediaStream>((done) => {
          resolve = done;
        }),
      );
      const { button, unmount } = await render();
      button('共享屏幕').click();
      await settle();
      if (action === 'stop') button('停止共享').click();
      else unmount();
      resolve(source.value);
      await settle();
      expect(source.track.stop).toHaveBeenCalledOnce();
    },
  );

  it('switches source and ignores the previous screen ended event', async () => {
    const screen = stream();
    const webcam = stream();
    display.mockResolvedValue(screen.value);
    camera.mockResolvedValue(webcam.value);
    const { button, video } = await render();
    button('共享屏幕').click();
    await settle();
    button('摄像头').click();
    await settle();
    screen.track.dispatchEvent(new Event('ended'));
    await settle();
    expect(video.srcObject).toBe(webcam.value);
    expect(webcam.track.stop).not.toHaveBeenCalled();
    webcam.track.dispatchEvent(new Event('ended'));
    await settle();
    expect(webcam.track.stop).toHaveBeenCalledOnce();
  });

  it('invalidates exactly the live session on stop, keeping the preview connected', async () => {
    const source = stream();
    display.mockResolvedValue(source.value);
    const live = vi.fn().mockReturnValue(new Promise(() => {}));
    const stop = vi.fn().mockResolvedValue(undefined);
    const { button, video } = await render({
      liveCapture: live,
      stopLiveCapture: stop,
    });
    button('共享屏幕').click();
    await settle();
    button('开始实时').click();
    await settle();
    const session = live.mock.calls[0]?.[1];
    expect(session.isCurrent()).toBe(true);
    expect(button('选择区域').disabled).toBe(true);
    button('停止实时').click();
    await settle();
    expect(session.isCurrent()).toBe(false);
    expect(stop).toHaveBeenCalledExactlyOnceWith(session);
    expect(video.srcObject).toBe(source.value);
    expect(source.track.stop).not.toHaveBeenCalled();
  });

  it('shows a saved frame inside the composer without screen access', async () => {
    const { root } = await render({
      selectedAssetId: 'asset',
      assets: [{ id: 'asset', name: '截帧', type: 'image' }],
    });
    expect(
      root.querySelector('.capture-preview-frame img')?.getAttribute('src'),
    ).toBe('/frame.png');
    expect(display).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'only hides help and asset metadata in the composer (composer=%s)',
    async (composer) => {
      const { root } = await render({
        composer,
        field: { ...field, help: '可捕获屏幕，也可直接选择项目图像。' },
        selectedAssetId: 'asset',
        assets: [{ id: 'asset', name: '截帧名称', type: 'image', version: 1 }],
      });
      expect(root.querySelector('.media-help') === null).toBe(composer);
      expect(root.querySelector('footer') === null).toBe(composer);
      expect(root.querySelector('.capture-preview-frame img')).not.toBeNull();
      expect(
        root.querySelector('footer')?.textContent?.includes('截帧名称'),
      ).toBe(composer ? undefined : true);
      expect(root.querySelector('footer')?.textContent?.includes('V1')).toBe(
        composer ? undefined : true,
      );
    },
  );
});
