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

describe('Shell — error surfacing', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  function fakeFile(name: string, bytes: Uint8Array): File {
    // jsdom's File doesn't reliably implement arrayBuffer(), so we
    // synthesize a minimal File-shape that does.
    return {
      name,
      size: bytes.byteLength,
      arrayBuffer: () => Promise.resolve(bytes.buffer.slice(0)),
    } as unknown as File;
  }

  it('drop of a non-image file shows the app-error banner (M5)', async () => {
    const { container } = render(<Shell />);
    const shell = container.querySelector('.shell') as HTMLDivElement;
    expect(shell).not.toBeNull();
    expect(container.querySelector('.app-error')).toBeNull();

    // Construct a dataTransfer with a file whose bytes aren't a valid PNG/GIF.
    const garbage = fakeFile('oops.txt', new Uint8Array([1, 2, 3, 4]));
    const dt = {
      items: [{ kind: 'file', getAsFile: () => garbage }],
      files: [garbage],
    } as unknown as DataTransfer;

    await act(async () => {
      shell.dispatchEvent(
        Object.assign(new Event('drop', { bubbles: true, cancelable: true }), {
          dataTransfer: dt,
          preventDefault() {},
        }),
      );
      // Let the async handleDrop body settle.
      await Promise.resolve();
      await Promise.resolve();
    });

    const banner = container.querySelector('.app-error');
    expect(banner).not.toBeNull();
    expect(banner!.textContent ?? '').toMatch(/oops\.txt/);
  });

  it('shows the slicing-error banner when slicer throws (M11)', () => {
    // Use a blank sheet source so Shell mounts a Canvas. Then push a
    // slicing config the grid slicer refuses (cellW=0 throws). The
    // Canvas captures the throw inside its useMemo and reports it via
    // onSliceError → Shell's sliceError state → "Slicing error:" banner.
    const src = useStore.getState().createBlankSource({
      kind: 'sheet',
      name: 'sheet',
      width: 8,
      height: 8,
    });
    useStore.getState().selectSource(src.id);
    const { container } = render(<Shell />);
    expect(container.textContent ?? '').not.toMatch(/Slicing error/);
    act(() => {
      useStore.getState().updateSlicing(src.id, {
        kind: 'grid',
        cellW: 0,
        cellH: 4,
        offsetX: 0,
        offsetY: 0,
        rows: 1,
        cols: 1,
      });
    });
    expect(container.textContent ?? '').toMatch(/Slicing error/);
    expect(container.textContent ?? '').toMatch(/cellW and cellH must be positive/);
  });

  it('clicking the app-error banner dismisses it (M5)', async () => {
    const { container } = render(<Shell />);
    const shell = container.querySelector('.shell') as HTMLDivElement;
    const garbage = fakeFile('bad.bin', new Uint8Array([0]));
    const dt = {
      items: [{ kind: 'file', getAsFile: () => garbage }],
      files: [garbage],
    } as unknown as DataTransfer;
    await act(async () => {
      shell.dispatchEvent(
        Object.assign(new Event('drop', { bubbles: true, cancelable: true }), {
          dataTransfer: dt,
          preventDefault() {},
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    const banner = container.querySelector('.app-error') as HTMLElement;
    expect(banner).not.toBeNull();
    act(() => {
      banner.click();
    });
    expect(container.querySelector('.app-error')).toBeNull();
  });
});

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

    // Middle-button pointerdown starts the pan and captures the pointer.
    // With pointer capture, subsequent pointermove/up route to the
    // captured viewport regardless of cursor location — eliminating the
    // lost-mouseup bug class for pan.
    act(() => {
      vp.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 1,
          buttons: 4,
          clientX: 200,
          clientY: 100,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(vp.classList.contains('panning')).toBe(true);

    // Pointer-capture-routed pointermove: 30px right, 10px down — the
    // viewport should scroll 30 left and 10 up.
    act(() => {
      vp.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 230,
          clientY: 110,
          bubbles: true,
        }),
      );
    });
    expect(vp.scrollLeft).toBe(20);
    expect(vp.scrollTop).toBe(10);

    // Pointerup clears the pan state.
    act(() => {
      vp.dispatchEvent(
        new PointerEvent('pointerup', { button: 1, bubbles: true }),
      );
    });
    expect(vp.classList.contains('panning')).toBe(false);
  });

  it('left-button pointerdown does NOT start a pan', () => {
    const { container } = mountWithBlankSource();
    const vp = container.querySelector('.canvas-viewport') as HTMLDivElement;
    vp.scrollLeft = 50;
    act(() => {
      vp.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 0,
          buttons: 1,
          clientX: 200,
          clientY: 100,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(vp.classList.contains('panning')).toBe(false);
    act(() => {
      vp.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 230,
          clientY: 100,
          buttons: 1,
          bubbles: true,
        }),
      );
    });
    // scrollLeft unchanged.
    expect(vp.scrollLeft).toBe(50);
  });
});
