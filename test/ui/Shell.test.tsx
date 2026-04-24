import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Shell } from '../../src/ui/Shell';
import { useStore, resetStore } from '../../src/ui/store';

/**
 * Shell integration tests covering the viewport-level interactions that
 * don't fit neatly into the Canvas tests: wheel-to-zoom and
 * middle-button-to-pan. The wheel listener is attached via native
 * `addEventListener({ passive: false })` so preventDefault actually
 * suppresses the viewport scroll, which means these tests dispatch
 * events on the DOM node directly (React's synthetic wheel is passive
 * and wouldn't exercise the same code path).
 */

function mountWithBlankSource(width = 32, height = 32) {
  useStore.getState().createBlankSource({
    kind: 'sequence',
    name: 'anim',
    width,
    height,
    frameCount: 4,
  });
  return render(<Shell />);
}

function stubRect(
  el: Element,
  rect: { left: number; top: number; width: number; height: number },
) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON() {
        return this;
      },
    }),
  });
}

describe('Shell — wheel zoom', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('wheel up (deltaY<0) increments zoom', () => {
    const { container } = mountWithBlankSource();
    const vp = container.querySelector('.canvas-viewport') as HTMLDivElement;
    stubRect(vp, { left: 0, top: 0, width: 400, height: 400 });
    // Canvas starts at zoom 4. A single wheel step up should make it 5.
    // The inner canvas is the nearest observable readout: dom width/height
    // are tied to paintTarget.width * zoom.
    const imgCanvas = () =>
      container.querySelector('canvas.canvas-image') as HTMLCanvasElement;
    expect(parseInt(imgCanvas().style.width, 10)).toBe(32 * 4);

    act(() => {
      vp.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -100,
          clientX: 200,
          clientY: 200,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(parseInt(imgCanvas().style.width, 10)).toBe(32 * 5);
  });

  it('wheel down (deltaY>0) decrements zoom', () => {
    const { container } = mountWithBlankSource();
    const vp = container.querySelector('.canvas-viewport') as HTMLDivElement;
    stubRect(vp, { left: 0, top: 0, width: 400, height: 400 });
    const imgCanvas = () =>
      container.querySelector('canvas.canvas-image') as HTMLCanvasElement;

    act(() => {
      vp.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 100,
          clientX: 100,
          clientY: 100,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(parseInt(imgCanvas().style.width, 10)).toBe(32 * 3);
  });

  it('zoom clamps at the min bound', () => {
    const { container } = mountWithBlankSource();
    const vp = container.querySelector('.canvas-viewport') as HTMLDivElement;
    stubRect(vp, { left: 0, top: 0, width: 400, height: 400 });
    const imgCanvas = () =>
      container.querySelector('canvas.canvas-image') as HTMLCanvasElement;
    // From zoom=4, spin down six times. Min is 1, so zoom should pin at 1.
    for (let i = 0; i < 6; i++) {
      act(() => {
        vp.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: 100,
            clientX: 10,
            clientY: 10,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
    }
    expect(parseInt(imgCanvas().style.width, 10)).toBe(32 * 1);
  });

  it('zoom clamps at the max bound', () => {
    const { container } = mountWithBlankSource();
    const vp = container.querySelector('.canvas-viewport') as HTMLDivElement;
    stubRect(vp, { left: 0, top: 0, width: 400, height: 400 });
    const imgCanvas = () =>
      container.querySelector('canvas.canvas-image') as HTMLCanvasElement;
    // From zoom=4, spin up 20 times — max is 16.
    for (let i = 0; i < 20; i++) {
      act(() => {
        vp.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: -100,
            clientX: 10,
            clientY: 10,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
    }
    expect(parseInt(imgCanvas().style.width, 10)).toBe(32 * 16);
  });

  it('wheel preventDefaults so the viewport does not also scroll', () => {
    const { container } = mountWithBlankSource();
    const vp = container.querySelector('.canvas-viewport') as HTMLDivElement;
    stubRect(vp, { left: 0, top: 0, width: 400, height: 400 });
    const ev = new WheelEvent('wheel', {
      deltaY: -100,
      clientX: 100,
      clientY: 100,
      bubbles: true,
      cancelable: true,
    });
    act(() => void vp.dispatchEvent(ev));
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe('Shell — middle-button pan', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('middle-button drag updates the viewport scroll position', () => {
    const { container } = mountWithBlankSource();
    const vp = container.querySelector('.canvas-viewport') as HTMLDivElement;
    // Seed a scrollable viewport by making the inner bigger than the
    // viewport and setting an initial scroll.
    vp.scrollLeft = 50;
    vp.scrollTop = 20;

    // React's onMouseDown handler: middle button starts the pan.
    act(() => {
      vp.dispatchEvent(
        new MouseEvent('mousedown', {
          button: 1,
          clientX: 200,
          clientY: 100,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(vp.classList.contains('panning')).toBe(true);

    // Window-level mousemove: 30px right, 10px down — the viewport
    // should scroll 30 left and 10 up to keep the content under cursor.
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 230,
          clientY: 110,
          bubbles: true,
        }),
      );
    });
    expect(vp.scrollLeft).toBe(20);
    expect(vp.scrollTop).toBe(10);

    // Window-level mouseup clears the pan state.
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mouseup', { button: 1, bubbles: true }),
      );
    });
    expect(vp.classList.contains('panning')).toBe(false);
  });

  it('left-button mousedown does NOT start a pan', () => {
    const { container } = mountWithBlankSource();
    const vp = container.querySelector('.canvas-viewport') as HTMLDivElement;
    vp.scrollLeft = 50;
    act(() => {
      vp.dispatchEvent(
        new MouseEvent('mousedown', {
          button: 0,
          clientX: 200,
          clientY: 100,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(vp.classList.contains('panning')).toBe(false);
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 230,
          clientY: 100,
          bubbles: true,
        }),
      );
    });
    // scrollLeft unchanged.
    expect(vp.scrollLeft).toBe(50);
  });
});
