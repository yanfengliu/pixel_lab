import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement PointerEvent or the setPointerCapture / releasePointerCapture
// element methods. The Canvas/Shell components use Pointer Events with
// setPointerCapture for drag-handling so move/up are guaranteed regardless
// of cursor location. Polyfill enough for the tests to dispatch events
// via @testing-library's fireEvent.pointerDown/Move/Up and for the
// production code's setPointerCapture try/catch to no-op cleanly.
// Guard on MouseEvent presence: core/* tests run in node env (no DOM
// globals); only the jsdom-env tests need the polyfill.
if (
  typeof globalThis.PointerEvent === 'undefined' &&
  typeof globalThis.MouseEvent !== 'undefined'
) {
  class PointerEventPolyfill extends MouseEvent {
    public pointerId: number;
    public pointerType: string;
    public isPrimary: boolean;
    public width: number;
    public height: number;
    public pressure: number;
    public tangentialPressure: number;
    public tiltX: number;
    public tiltY: number;
    public twist: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
      this.width = init.width ?? 1;
      this.height = init.height ?? 1;
      this.pressure = init.pressure ?? 0;
      this.tangentialPressure = init.tangentialPressure ?? 0;
      this.tiltX = init.tiltX ?? 0;
      this.tiltY = init.tiltY ?? 0;
      this.twist = init.twist ?? 0;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).PointerEvent = PointerEventPolyfill;
}

if (typeof HTMLElement !== 'undefined') {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = function () {};
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = function () {};
  }
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = function () {
      return false;
    };
  }
}
