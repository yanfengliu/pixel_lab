import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { Canvas } from '../../src/ui/Canvas';
import { useStore, resetStore } from '../../src/ui/store';
import { setPixel } from '../../src/core/image';

/**
 * Construct a canvas component + source pair for tests. Returns the
 * source id and the bitmap object the canvas will render.
 */
function mountForSheet(opts: { w?: number; h?: number } = {}) {
  const w = opts.w ?? 8;
  const h = opts.h ?? 8;
  const src = useStore
    .getState()
    .createBlankSource({ kind: 'sheet', name: 't', width: w, height: h });
  useStore.getState().selectSource(src.id);
  const bmp = useStore.getState().sheetBitmaps[src.id]!;
  const updateSlicing = useStore.getState().updateSlicing;
  const source = useStore.getState().project.sources.find((x) => x.id === src.id)!;
  const utils = render(
    <Canvas
      source={source}
      bitmap={bmp}
      zoom={1}
      onSlicingChange={(s) => updateSlicing(source.id, s)}
    />,
  );
  return { src, bmp, ...utils };
}

/**
 * Simulate a pixel-space mousedown/up on the overlay. The Canvas
 * computes pixel coords via `getBoundingClientRect`, which jsdom
 * returns as all-zeros by default. We set it via a spy.
 */
function stubRect(
  overlay: Element,
  originX = 0,
  originY = 0,
) {
  Object.defineProperty(overlay, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        left: originX,
        top: originY,
        width: 100,
        height: 100,
        right: originX + 100,
        bottom: originY + 100,
        x: originX,
        y: originY,
        toJSON: () => ({}),
      }) as DOMRect,
  });
}

describe('Canvas — pencil tool', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('pencil click paints a pixel and commits a delta', () => {
    useStore.getState().setActiveTool('pencil');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { src, bmp, container } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    // Click at pixel (3, 2) with zoom=1.
    fireEvent.pointerDown(overlay, { button: 0, clientX: 3.5, clientY: 2.5 });
    fireEvent.pointerUp(overlay);
    expect(bmp.data[(2 * bmp.width + 3) * 4]).toBe(200);
    expect(bmp.data[(2 * bmp.width + 3) * 4 + 3]).toBe(255);
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(1);
  });

  it('canvas-image does not capture mouse events (lets clicks reach paint-overlay)', () => {
    // Regression for the post-merge BLOCKER: the canvas-image <canvas>
    // had position:relative + zIndex:1 but default pointer-events:auto,
    // so real browser clicks hit the canvas (no handler) instead of the
    // sibling paint-overlay. jsdom's fireEvent targets elements
    // directly, bypassing z-order hit-test, so the original tests missed
    // the bug. Assert pointer-events is 'none' on the visual canvas.
    const { container } = mountForSheet();
    const image = container.querySelector('canvas.canvas-image') as HTMLCanvasElement;
    expect(image).not.toBeNull();
    expect(image.style.pointerEvents).toBe('none');
  });

  it('undo after paint reverts the pixel', () => {
    useStore.getState().setActiveTool('pencil');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { src, bmp, container } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.pointerUp(overlay);
    expect(bmp.data[(1 * bmp.width + 1) * 4 + 3]).toBe(255);
    useStore.getState().undo(src.id);
    const post = useStore.getState().sheetBitmaps[src.id]!;
    expect(post.data[(1 * post.width + 1) * 4 + 3]).toBe(0);
  });

  it('lost mouseup mid-drag: a later button-less mousemove does not stretch the stroke across the canvas', () => {
    // Regression: the browser occasionally drops mouseup (e.g., when the
    // cursor leaves the window mid-drag). Without the ev.buttons === 0
    // guard, subsequent mousemoves with no button held kept calling
    // stampLine from the stroke's lastX/lastY to the cursor, producing
    // phantom lines spanning the canvas. See user report with the
    // character sprite + radiating diagonal lines.
    useStore.getState().setActiveTool('pencil');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { src, bmp, container } = mountForSheet({ w: 16, h: 16 });
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay, 0, 0);

    // Mousedown at (1, 1): stampDot paints the click pixel.
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5, buttons: 1 });
    expect(bmp.data[(1 * bmp.width + 1) * 4]).toBe(200);

    // Now the imagined sequence: the cursor leaves the window with the
    // button still pressed, the user releases the button OUTSIDE the
    // window (mouseup on window is dropped), and then the cursor returns
    // to (12, 12) with NO button pressed. The post-lost-mouseup move
    // should NOT paint a line back to (12, 12).
    fireEvent.pointerMove(overlay, { clientX: 12.5, clientY: 12.5, buttons: 0 });

    // The pencil pixel at (1, 1) is still painted. The pixel at (12, 12)
    // should NOT be, and no intermediate pixel on the line from (1,1) to
    // (12,12) should be either.
    expect(bmp.data[(12 * bmp.width + 12) * 4 + 3]).toBe(0);
    expect(bmp.data[(5 * bmp.width + 5) * 4 + 3]).toBe(0);
    expect(bmp.data[(8 * bmp.width + 8) * 4 + 3]).toBe(0);

    // Drag state cleared, one delta on the undo stack from the implicit
    // commit of the original click.
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(1);

    // A subsequent legitimate click at (12, 12) lands a SINGLE pixel, not
    // a line from (1, 1).
    fireEvent.pointerDown(overlay, { button: 0, clientX: 12.5, clientY: 12.5, buttons: 1 });
    fireEvent.pointerUp(overlay);
    expect(bmp.data[(12 * bmp.width + 12) * 4]).toBe(200);
    // Still no line-interior pixels.
    expect(bmp.data[(5 * bmp.width + 5) * 4 + 3]).toBe(0);
    expect(bmp.data[(8 * bmp.width + 8) * 4 + 3]).toBe(0);
  });
});

describe('Canvas — eyedropper', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('sets primary color to the sampled pixel', () => {
    // Prepare a sheet with a non-trivial pixel.
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 't', width: 4, height: 4 });
    useStore.getState().selectSource(src.id);
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    setPixel(bmp, 2, 1, 111, 222, 33, 255);
    const source = useStore
      .getState()
      .project.sources.find((x) => x.id === src.id)!;
    useStore.getState().setActiveTool('eyedropper');
    const { container } = render(
      <Canvas
        source={source}
        bitmap={bmp}
        zoom={1}
        onSlicingChange={() => {}}
      />,
    );
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.pointerDown(overlay, { button: 0, clientX: 2.5, clientY: 1.5 });
    const c = useStore.getState().primaryColor;
    expect(c.r).toBe(111);
    expect(c.g).toBe(222);
    expect(c.b).toBe(33);
  });
});

describe('Canvas — bucket', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('floods the reachable region from the click point', () => {
    useStore.getState().setActiveTool('bucket');
    useStore.getState().setPrimaryColor({ r: 10, g: 20, b: 30, a: 255 });
    const { src, bmp, container } = mountForSheet({ w: 4, h: 4 });
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.pointerDown(overlay, { button: 0, clientX: 0.5, clientY: 0.5 });
    // All 16 pixels should now be (10, 20, 30, 255).
    for (let p = 0; p < bmp.width * bmp.height; p++) {
      expect(bmp.data[p * 4]).toBe(10);
      expect(bmp.data[p * 4 + 3]).toBe(255);
    }
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(1);
  });
});

describe('Canvas — line tool', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('drag paints a line and commits a single undo entry', () => {
    useStore.getState().setActiveTool('line');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { src, bmp, container } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    // Draw from (1,1) to (4,4).
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.pointerMove(overlay, { clientX: 4.5, clientY: 4.5 , buttons: 1});
    fireEvent.pointerUp(overlay, { clientX: 4.5, clientY: 4.5 });
    // Diagonal pixels should be painted.
    for (let i = 1; i <= 4; i++) {
      expect(bmp.data[(i * bmp.width + i) * 4]).toBe(200);
      expect(bmp.data[(i * bmp.width + i) * 4 + 3]).toBe(255);
    }
    // A pixel off the line stays transparent.
    expect(bmp.data[(0 * bmp.width + 0) * 4 + 3]).toBe(0);
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(1);
  });
});

describe('Canvas — rect tool (with Shift fills)', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('rectOutline across many mousemoves commits only the final rect (I4)', () => {
    // Regression: the preview path preallocates a RawImage + ImageData
    // and only clears the previous bbox between mousemoves instead of
    // allocating per-frame. This test walks through many preview
    // updates and asserts the final state is exactly one rect outline —
    // a ghost-frame leak would show spurious pixels from intermediate
    // bboxes.
    useStore.getState().setActiveTool('rectOutline');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { bmp, container } = mountForSheet({ w: 8, h: 8 });
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    // Walk many intermediate positions.
    for (let i = 0; i < 20; i++) {
      fireEvent.pointerMove(overlay, { clientX: 2.5 + i * 0.1, clientY: 2.5 + i * 0.1 , buttons: 1});
    }
    fireEvent.pointerUp(overlay, { clientX: 4.5, clientY: 4.5 });
    // Perimeter painted; a pixel clearly outside the final rect stays
    // fully transparent.
    expect(bmp.data[(1 * bmp.width + 1) * 4 + 3]).toBe(255);
    expect(bmp.data[(4 * bmp.width + 4) * 4 + 3]).toBe(255);
    expect(bmp.data[(7 * bmp.width + 7) * 4 + 3]).toBe(0);
    expect(bmp.data[(0 * bmp.width + 0) * 4 + 3]).toBe(0);
  });

  it('rectOutline without shift paints only the perimeter', () => {
    useStore.getState().setActiveTool('rectOutline');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { bmp, container } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.pointerMove(overlay, { clientX: 4.5, clientY: 4.5 , buttons: 1});
    fireEvent.pointerUp(overlay, { clientX: 4.5, clientY: 4.5 });
    // Perimeter at (1,1)-(4,4) is painted; interior (2,2) is not.
    expect(bmp.data[(1 * bmp.width + 1) * 4 + 3]).toBe(255);
    expect(bmp.data[(4 * bmp.width + 4) * 4 + 3]).toBe(255);
    expect(bmp.data[(2 * bmp.width + 2) * 4 + 3]).toBe(0);
  });

  it('rectOutline + Shift on mouseup fills the rect', () => {
    useStore.getState().setActiveTool('rectOutline');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { bmp, container } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.pointerMove(overlay, { clientX: 4.5, clientY: 4.5 , buttons: 1});
    // Shift held on mouseup.
    fireEvent.pointerUp(overlay, { clientX: 4.5, clientY: 4.5, shiftKey: true });
    // Interior is now filled.
    expect(bmp.data[(2 * bmp.width + 2) * 4 + 3]).toBe(255);
    expect(bmp.data[(3 * bmp.width + 3) * 4 + 3]).toBe(255);
  });
});

describe('Canvas — marquee + move', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('marquee drag sets the selection in the store', () => {
    useStore.getState().setActiveTool('marquee');
    const { src, container } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.pointerMove(overlay, { clientX: 3.5, clientY: 3.5 , buttons: 1});
    fireEvent.pointerUp(overlay, { clientX: 3.5, clientY: 3.5 });
    const sel = useStore.getState().selection!;
    expect(sel).not.toBeNull();
    expect(sel.sourceId).toBe(src.id);
    expect(sel.sel.rect).toEqual({ x: 1, y: 1, w: 3, h: 3 });
  });

  it('move tool drag after marquee translates the selected pixels', () => {
    // Paint a single pixel with pencil.
    useStore.getState().setActiveTool('pencil');
    useStore.getState().setPrimaryColor({ r: 123, g: 0, b: 0, a: 255 });
    const { src, bmp, container } = mountForSheet();
    const overlay1 = container.querySelector('.paint-overlay')!;
    stubRect(overlay1);
    fireEvent.pointerDown(overlay1, { button: 0, clientX: 2.5, clientY: 2.5 });
    fireEvent.pointerUp(overlay1, { clientX: 2.5, clientY: 2.5 });
    expect(bmp.data[(2 * bmp.width + 2) * 4]).toBe(123);

    // Marquee select a 1x1 region around the painted pixel.
    act(() => {
      useStore.getState().setActiveTool('marquee');
    });
    fireEvent.pointerDown(overlay1, { button: 0, clientX: 2.5, clientY: 2.5 });
    fireEvent.pointerUp(overlay1, { clientX: 2.5, clientY: 2.5 });
    const sel = useStore.getState().selection!;
    expect(sel.sel.rect).toEqual({ x: 2, y: 2, w: 1, h: 1 });

    // Move selection from (2,2) to (5,5).
    act(() => {
      useStore.getState().setActiveTool('move');
    });
    fireEvent.pointerDown(overlay1, { button: 0, clientX: 2.5, clientY: 2.5 });
    fireEvent.pointerMove(overlay1, { clientX: 5.5, clientY: 5.5, buttons: 1 });
    fireEvent.pointerUp(overlay1, { clientX: 5.5, clientY: 5.5 });

    // Original pixel cleared, new pixel at (5,5) painted.
    const post = useStore.getState().sheetBitmaps[src.id]!;
    expect(post.data[(2 * post.width + 2) * 4 + 3]).toBe(0);
    expect(post.data[(5 * post.width + 5) * 4]).toBe(123);
    expect(post.data[(5 * post.width + 5) * 4 + 3]).toBe(255);
  });
});

describe('Canvas — slice-rect tool', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('adds a rect to manual slicing on mouseup', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 'm', width: 8, height: 8 });
    useStore.getState().selectSource(src.id);
    useStore
      .getState()
      .updateSlicing(src.id, { kind: 'manual', rects: [] });
    useStore.getState().setActiveTool('slice');
    const source = useStore
      .getState()
      .project.sources.find((x) => x.id === src.id)!;
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    const { container } = render(
      <Canvas
        source={source}
        bitmap={bmp}
        zoom={1}
        onSlicingChange={(s) =>
          useStore.getState().updateSlicing(src.id, s)
        }
      />,
    );
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 2.5 });
    fireEvent.pointerMove(overlay, { clientX: 5.5, clientY: 6.5 , buttons: 1});
    fireEvent.pointerUp(overlay, { clientX: 5.5, clientY: 6.5 });
    const slicing = useStore
      .getState()
      .project.sources.find((x) => x.id === src.id)!.slicing;
    expect(slicing.kind).toBe('manual');
    if (slicing.kind !== 'manual') throw new Error();
    expect(slicing.rects).toHaveLength(1);
    expect(slicing.rects[0]).toEqual({ x: 1, y: 2, w: 5, h: 5 });
  });

  it('contextmenu suppression only fires when a manual rect is hit (N-G1)', () => {
    // Two manual rects, slice tool active. Right-click inside rect[0]
    // must preventDefault (the slice tool will delete it via mousedown).
    // Right-click on empty space must NOT preventDefault — browsers
    // should still be free to show their context menu / DevTools etc.
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 'm', width: 16, height: 16 });
    useStore.getState().selectSource(src.id);
    useStore.getState().updateSlicing(src.id, {
      kind: 'manual',
      rects: [{ x: 0, y: 0, w: 4, h: 4 }],
    });
    useStore.getState().setActiveTool('slice');
    const source = useStore
      .getState()
      .project.sources.find((x) => x.id === src.id)!;
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    const { container } = render(
      <Canvas
        source={source}
        bitmap={bmp}
        zoom={1}
        onSlicingChange={(s) =>
          useStore.getState().updateSlicing(src.id, s)
        }
      />,
    );
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);

    // Right-click inside the rect — preventDefault must fire.
    const insideEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 2,
      clientY: 2,
    });
    overlay.dispatchEvent(insideEvent);
    expect(insideEvent.defaultPrevented).toBe(true);

    // Right-click outside the rect (empty space) — preventDefault must NOT fire.
    const outsideEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    });
    overlay.dispatchEvent(outsideEvent);
    expect(outsideEvent.defaultPrevented).toBe(false);
  });
});
