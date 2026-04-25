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
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
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
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    // Move the mouse way past the right edge (off-canvas). Before I9
    // fix, eventToPixel returned null here and the preview/mouseup
    // froze the endpoint at (1,1). After the fix the line should reach
    // the right-hand edge.
    fireEvent.pointerMove(overlay, { clientX: 500, clientY: 1.5 , buttons: 1});
    fireEvent.pointerUp(overlay, { clientX: 500, clientY: 1.5 });
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
    fireEvent.pointerDown(overlay, { button: 0, clientX: 3.5, clientY: 3.5 });
    fireEvent.pointerUp(overlay, { clientX: 3.5, clientY: 3.5 });
    const sel = useStore.getState().selection!;
    expect(sel.sourceId).toBe(src.id);
    expect(sel.sel.rect).toEqual({ x: 3, y: 3, w: 1, h: 1 });
    expect(sel.sel.mask).toHaveLength(1);
    expect(sel.sel.mask[0]).toBe(1);
  });
});

describe('Canvas — R2-B2: abandoned move drag must not lose lifted pixels', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  // Helper: paint a pixel, marquee it, switch to move, and mousedown on it
  // so the move tool has cut the pixels into `dragRef.pixels` but the drag
  // hasn't completed yet. Returns the source id, bitmap, and overlay.
  function setupLiftedMove() {
    // Paint a pixel at (2,2).
    useStore.getState().setActiveTool('pencil');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { src, bmp, container } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.pointerDown(overlay, { button: 0, clientX: 2.5, clientY: 2.5 });
    fireEvent.pointerUp(overlay, { clientX: 2.5, clientY: 2.5 });
    expect(bmp.data[(2 * bmp.width + 2) * 4 + 3]).toBe(255);

    // Marquee select the 1x1 around the painted pixel.
    act(() => {
      useStore.getState().setActiveTool('marquee');
    });
    fireEvent.pointerDown(overlay, { button: 0, clientX: 2.5, clientY: 2.5 });
    fireEvent.pointerUp(overlay, { clientX: 2.5, clientY: 2.5 });
    expect(useStore.getState().selection).not.toBeNull();

    // Switch to move and mousedown — cut happens.
    act(() => {
      useStore.getState().setActiveTool('move');
    });
    fireEvent.pointerDown(overlay, { button: 0, clientX: 2.5, clientY: 2.5 });
    // After mousedown on move, the pixel must be CUT from the bitmap.
    expect(bmp.data[(2 * bmp.width + 2) * 4 + 3]).toBe(0);
    return { src, bmp, overlay };
  }

  it('mid-move brushSize change does not tear down the drag (narrower deps)', () => {
    // The paint-overlay effect deliberately does NOT depend on brushSize,
    // primary, or opacity — they are read via refs during mousemove/up.
    // Changing brushSize mid-move must leave the drag intact so mouseup
    // can paste the lifted pixels at the drop location.
    const { src, bmp, overlay } = setupLiftedMove();
    act(() => {
      useStore.getState().setBrushSize(2);
    });
    // The cut state remains (drag still in progress); no half-baked commit.
    expect(bmp.data[(2 * bmp.width + 2) * 4 + 3]).toBe(0);
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(1); // only the pencil stroke
    // Mouseup at a different pixel completes the move: original cell
    // stays cleared, new cell is painted.
    fireEvent.pointerMove(overlay, { clientX: 5.5, clientY: 5.5 , buttons: 1});
    fireEvent.pointerUp(overlay, { clientX: 5.5, clientY: 5.5 });
    expect(bmp.data[(2 * bmp.width + 2) * 4 + 3]).toBe(0);
    expect(bmp.data[(5 * bmp.width + 5) * 4]).toBe(200);
    expect(bmp.data[(5 * bmp.width + 5) * 4 + 3]).toBe(255);
    // Move tool added a second delta (the paste).
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(2);
  });

  it('mid-move color change does not tear down the drag (narrower deps)', () => {
    const { src, bmp, overlay } = setupLiftedMove();
    act(() => {
      useStore.getState().setPrimaryColor({ r: 0, g: 255, b: 0, a: 255 });
    });
    // Cut state persists, no cut-only commit pushed.
    expect(bmp.data[(2 * bmp.width + 2) * 4 + 3]).toBe(0);
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(1);
    // Mouseup completes the move.
    fireEvent.pointerUp(overlay, { clientX: 2.5, clientY: 2.5 });
    // Pixel is pasted back with its original color (not the new primary).
    expect(bmp.data[(2 * bmp.width + 2) * 4]).toBe(200);
    expect(bmp.data[(2 * bmp.width + 2) * 4 + 3]).toBe(255);
  });

  it('mid-move opacity change does not tear down the drag (narrower deps)', () => {
    const { src, bmp, overlay } = setupLiftedMove();
    act(() => {
      useStore.getState().setOpacity(0.5);
    });
    expect(bmp.data[(2 * bmp.width + 2) * 4 + 3]).toBe(0);
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(1);
    fireEvent.pointerUp(overlay, { clientX: 2.5, clientY: 2.5 });
    expect(bmp.data[(2 * bmp.width + 2) * 4]).toBe(200);
  });

  it('mid-move selection-clear (ESC) reverts the lifted pixels', () => {
    const { src, bmp } = setupLiftedMove();
    // ESC clears the selection; the cleanup runs because `selection` is in
    // the paint-overlay effect deps. The move must revert, not commit.
    act(() => {
      useStore.getState().clearSelection();
    });
    expect(bmp.data[(2 * bmp.width + 2) * 4]).toBe(200);
    expect(bmp.data[(2 * bmp.width + 2) * 4 + 3]).toBe(255);
    // Only the original pencil stroke, no move-abandonment delta.
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(1);
  });

  it('mid-move tool switch reverts the lifted pixels rather than committing a cut', () => {
    const { src, bmp } = setupLiftedMove();
    // Tool switch tears down the move drag.
    act(() => {
      useStore.getState().setActiveTool('pencil');
    });
    expect(bmp.data[(2 * bmp.width + 2) * 4]).toBe(200);
    expect(bmp.data[(2 * bmp.width + 2) * 4 + 3]).toBe(255);
    // Only the original pencil stroke remains in undo.
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(1);
  });

  it('unmount mid-move reverts the lifted pixels rather than committing a cut', () => {
    // Paint, marquee, and start move drag (cut happens).
    useStore.getState().setActiveTool('pencil');
    useStore.getState().setPrimaryColor({ r: 123, g: 45, b: 67, a: 255 });
    const { src, bmp, container, unmount } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.pointerDown(overlay, { button: 0, clientX: 3.5, clientY: 3.5 });
    fireEvent.pointerUp(overlay, { clientX: 3.5, clientY: 3.5 });

    act(() => useStore.getState().setActiveTool('marquee'));
    fireEvent.pointerDown(overlay, { button: 0, clientX: 3.5, clientY: 3.5 });
    fireEvent.pointerUp(overlay, { clientX: 3.5, clientY: 3.5 });

    act(() => useStore.getState().setActiveTool('move'));
    fireEvent.pointerDown(overlay, { button: 0, clientX: 3.5, clientY: 3.5 });
    expect(bmp.data[(3 * bmp.width + 3) * 4 + 3]).toBe(0); // cut happened
    // Unmount mid-drag: cleanup must revert, not commit the cut.
    unmount();
    // The paint (original stroke) is still in undo; the abandoned move
    // must NOT have pushed a cut-only delta on top.
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(1);
    // Pixel is back (revert pasted the lifted pixels).
    expect(bmp.data[(3 * bmp.width + 3) * 4]).toBe(123);
    expect(bmp.data[(3 * bmp.width + 3) * 4 + 3]).toBe(255);
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
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.pointerMove(overlay, { clientX: 4.5, clientY: 4.5 , buttons: 1});
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
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.pointerMove(overlay, { clientX: 4.5, clientY: 4.5 , buttons: 1});
    // Switch tools; cleanup clears dragRef.
    act(() => {
      useStore.getState().setActiveTool('pencil');
    });
    fireEvent.pointerUp(overlay, { clientX: 4.5, clientY: 4.5 });
    // Bitmap must stay transparent — no rect pixels were written.
    for (let i = 0; i < bmp.data.length; i += 4) {
      expect(bmp.data[i + 3]).toBe(0);
    }
  });
});
