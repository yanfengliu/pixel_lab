import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { Canvas } from '../../src/ui/Canvas';
import { useStore, resetStore } from '../../src/ui/store';

function mountForSheet(opts: { w?: number; h?: number } = {}) {
  const w = opts.w ?? 8;
  const h = opts.h ?? 8;
  const src = useStore
    .getState()
    .createBlankSource({ kind: 'sheet', name: 't', width: w, height: h });
  useStore.getState().selectSource(src.id);
  const bmp = useStore.getState().sheetBitmaps[src.id]!;
  const source = useStore
    .getState()
    .project.sources.find((x) => x.id === src.id)!;
  const utils = render(
    <Canvas
      source={source}
      bitmap={bmp}
      zoom={1}
      onSlicingChange={() => {}}
    />,
  );
  return { src, bmp, ...utils };
}

function stubRect(overlay: Element) {
  Object.defineProperty(overlay, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  });
}

describe('Canvas — I6: drag abandoned on unmount commits the stroke', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('unmounting mid-drag commits a delta (pencil drag-in-progress)', () => {
    useStore.getState().setActiveTool('pencil');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { src, container, unmount } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    // Start a drag (mousedown paints a pixel and starts a brush drag).
    fireEvent.mouseDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    // No mouseup — component unmounts mid-drag (e.g. source switched).
    unmount();
    // The delta must have been committed to undo so the user can undo
    // the stroke after remounting / doing anything else.
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(1);
  });
});

describe('Canvas — I9: dragging outside canvas bounds does not freeze', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('line drag past the edge still reaches pixels near the far corner', () => {
    useStore.getState().setActiveTool('line');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { bmp, container } = mountForSheet({ w: 8, h: 8 });
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.mouseDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    // Move the mouse way past the right edge (off-canvas). Before I9
    // fix, eventToPixel returned null here and the preview/mouseup
    // froze the endpoint at (1,1). After the fix the line should reach
    // the right-hand edge.
    fireEvent.mouseMove(window, { clientX: 500, clientY: 1.5 });
    fireEvent.mouseUp(window, { clientX: 500, clientY: 1.5 });
    // The rightmost pixel on row 1 should be opaque.
    expect(bmp.data[(1 * bmp.width + (bmp.width - 1)) * 4 + 3]).toBe(255);
  });
});

describe('Canvas — I11: marquee rect math uses full w,h', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('marquee with a 1x1 rect creates a 1-pixel selection (not 0x0)', () => {
    useStore.getState().setActiveTool('marquee');
    const { src, container } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    // Click and release at the same pixel → 1x1 marquee.
    fireEvent.mouseDown(overlay, { button: 0, clientX: 3.5, clientY: 3.5 });
    fireEvent.mouseUp(window, { clientX: 3.5, clientY: 3.5 });
    const sel = useStore.getState().selection!;
    expect(sel.sourceId).toBe(src.id);
    expect(sel.sel.rect).toEqual({ x: 3, y: 3, w: 1, h: 1 });
    expect(sel.sel.mask).toHaveLength(1);
    expect(sel.sel.mask[0]).toBe(1);
  });
});

describe('Canvas — R2-I12: shape preview cleared on tool switch mid-drag', () => {
  // Stub HTMLCanvasElement.prototype.getContext so we can observe calls
  // to `clearRect` on the preview canvas. jsdom has no real 2D context,
  // so Canvas.tsx's drawPreview/clearPreview currently noop silently under
  // tests. By returning a spyable fake context we can verify that the
  // preview-clear path actually ran after a tool switch.
  const clearRectCalls: { count: number } = { count: 0 };
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    resetStore();
    cleanup();
    clearRectCalls.count = 0;
    // Minimal 2D-context stub sufficient for drawPreview's code paths.
    const fakeCtx = {
      clearRect: () => {
        clearRectCalls.count += 1;
      },
      save: () => {},
      restore: () => {},
      setLineDash: () => {},
      strokeRect: () => {},
      fillRect: () => {},
      putImageData: () => {},
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
        colorSpace: 'srgb' as PredefinedColorSpace,
      }),
      drawImage: () => {},
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLCanvasElement.prototype as any).getContext = function (kind: string) {
      if (kind === '2d') return fakeCtx;
      return null;
    };
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('switching activeTool mid-shape-drag invokes preview clearRect', () => {
    useStore.getState().setActiveTool('rectOutline');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { container } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    // Start a shape drag.
    fireEvent.mouseDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.mouseMove(window, { clientX: 4.5, clientY: 4.5 });
    // Reset the counter so we only count clears triggered by the switch.
    clearRectCalls.count = 0;
    // Switch tools mid-drag (simulates B/E/I/G/etc. keyboard shortcuts).
    act(() => {
      useStore.getState().setActiveTool('pencil');
    });
    // The tool switch must trigger a preview clear — otherwise a ghost
    // shape lingers on the overlay until the next mousemove.
    expect(clearRectCalls.count).toBeGreaterThan(0);
  });

  it('switching activeTool mid-shape-drag does not rasterize the abandoned shape', () => {
    useStore.getState().setActiveTool('rectOutline');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { bmp, container } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.mouseDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.mouseMove(window, { clientX: 4.5, clientY: 4.5 });
    // Switch tools; cleanup clears dragRef.
    act(() => {
      useStore.getState().setActiveTool('pencil');
    });
    fireEvent.mouseUp(window, { clientX: 4.5, clientY: 4.5 });
    // Bitmap must stay transparent — no rect pixels were written.
    for (let i = 0; i < bmp.data.length; i += 4) {
      expect(bmp.data[i + 3]).toBe(0);
    }
  });
});
