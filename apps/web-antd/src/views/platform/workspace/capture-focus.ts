interface ScreenCaptureController {
  setFocusBehavior: (behavior: 'no-focus-change') => void;
}

type ScreenCaptureOptions = DisplayMediaStreamOptions & {
  controller?: ScreenCaptureController;
};

/** Configure focus before requesting permission, without delaying user activation. */
export function createScreenCaptureOptions(): ScreenCaptureOptions {
  try {
    const Controller = (
      window as Window & {
        CaptureController?: new () => ScreenCaptureController;
      }
    ).CaptureController;
    if (
      typeof Controller === 'function' &&
      typeof Controller.prototype?.setFocusBehavior === 'function'
    ) {
      // A controller can only be associated with one getDisplayMedia request.
      const controller = new Controller();
      controller.setFocusBehavior('no-focus-change');
      return { controller, video: true };
    }
  } catch {
    // Optional focus control must never prevent ordinary screen sharing.
  }
  return { video: true };
}
