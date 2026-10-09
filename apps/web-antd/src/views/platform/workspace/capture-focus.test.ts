import { afterEach, describe, expect, it, vi } from 'vitest';

import { createScreenCaptureOptions } from './capture-focus';

afterEach(() => vi.unstubAllGlobals());

describe('screen sharing focus policy', () => {
  it('requests no focus change when the browser supports it', () => {
    const focus = vi.fn();
    class Controller {
      setFocusBehavior = focus;
    }
    Controller.prototype.setFocusBehavior = focus;
    vi.stubGlobal('CaptureController', Controller);
    const options = createScreenCaptureOptions();
    expect(options.video).toBe(true);
    expect(options.controller).toBeInstanceOf(Controller);
    expect(focus).toHaveBeenCalledExactlyOnceWith('no-focus-change');
  });

  it('creates a fresh controller for every share request', () => {
    class Controller {
      setFocusBehavior() {}
    }
    vi.stubGlobal('CaptureController', Controller);
    const first = createScreenCaptureOptions();
    const second = createScreenCaptureOptions();
    expect(first.controller).toBeInstanceOf(Controller);
    expect(second.controller).toBeInstanceOf(Controller);
    expect(first.controller).not.toBe(second.controller);
  });

  it.each([
    undefined,
    {},
    class Controller {
      stop() {}
    },
  ])('falls back without a supported controller (%s)', (Controller) => {
    vi.stubGlobal('CaptureController', Controller);
    expect(createScreenCaptureOptions()).toEqual({ video: true });
  });

  it('falls back when constructing a controller fails', () => {
    class Controller {
      constructor() {
        throw new Error('Controller unavailable');
      }

      setFocusBehavior() {}
    }
    vi.stubGlobal('CaptureController', Controller);
    expect(createScreenCaptureOptions()).toEqual({ video: true });
  });

  it('falls back when the focus policy is rejected', () => {
    class Controller {
      setFocusBehavior() {
        throw new DOMException('Unsupported policy', 'NotSupportedError');
      }
    }
    vi.stubGlobal('CaptureController', Controller);
    expect(createScreenCaptureOptions()).toEqual({ video: true });
  });
});
