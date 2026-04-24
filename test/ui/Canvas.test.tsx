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
    fireEvent.mouseDown(overlay, { button: 0, clientX: 3.5, clientY: 2.5 });
    fireEvent.mouseUp(window);
    expect(bmp.data[(2 * bmp.width + 3) * 4]).toBe(200);
    expect(bmp.data[(2 * bmp.width + 3) * 4 + 3]).toBe(255);
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(1);
  });

  it('undo after paint reverts the pixel', () => {
    useStore.getState().setActiveTool('pencil');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { src, bmp, container } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.mouseDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.mouseUp(window);
    expect(bmp.data[(1 * bmp.width + 1) * 4 + 3]).toBe(255);
    useStore.getState().undo(src.id);
    const post = useStore.getState().sheetBitmaps[src.id]!;
    expect(post.data[(1 * post.width + 1) * 4 + 3]).toBe(0);
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
    fireEvent.mouseDown(overlay, { button: 0, clientX: 2.5, clientY: 1.5 });
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
    fireEvent.mouseDown(overlay, { button: 0, clientX: 0.5, clientY: 0.5 });
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
    fireEvent.mouseDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.mouseMove(window, { clientX: 4.5, clientY: 4.5 });
    fireEvent.mouseUp(window, { clientX: 4.5, clientY: 4.5 });
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

  it('rectOutline without shift paints only the perimeter', () => {
    useStore.getState().setActiveTool('rectOutline');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const { bmp, container } = mountForSheet();
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.mouseDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.mouseMove(window, { clientX: 4.5, clientY: 4.5 });
    fireEvent.mouseUp(window, { clientX: 4.5, clientY: 4.5 });
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
    fireEvent.mouseDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.mouseMove(window, { clientX: 4.5, clientY: 4.5 });
    // Shift held on mouseup.
    fireEvent.mouseUp(window, { clientX: 4.5, clientY: 4.5, shiftKey: true });
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
    fireEvent.mouseDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.mouseMove(window, { clientX: 3.5, clientY: 3.5 });
    fireEvent.mouseUp(window, { clientX: 3.5, clientY: 3.5 });
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
    fireEvent.mouseDown(overlay1, { button: 0, clientX: 2.5, clientY: 2.5 });
    fireEvent.mouseUp(window, { clientX: 2.5, clientY: 2.5 });
    expect(bmp.data[(2 * bmp.width + 2) * 4]).toBe(123);

    // Marquee select a 1x1 region around the painted pixel.
    act(() => {
      useStore.getState().setActiveTool('marquee');
    });
    fireEvent.mouseDown(overlay1, { button: 0, clientX: 2.5, clientY: 2.5 });
    fireEvent.mouseUp(window, { clientX: 2.5, clientY: 2.5 });
    const sel = useStore.getState().selection!;
    expect(sel.sel.rect).toEqual({ x: 2, y: 2, w: 1, h: 1 });

    // Move selection from (2,2) to (5,5).
    act(() => {
      useStore.getState().setActiveTool('move');
    });
    fireEvent.mouseDown(overlay1, { button: 0, clientX: 2.5, clientY: 2.5 });
    fireEvent.mouseMove(window, { clientX: 5.5, clientY: 5.5 });
    fireEvent.mouseUp(window, { clientX: 5.5, clientY: 5.5 });

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
    fireEvent.mouseDown(overlay, { button: 0, clientX: 1.5, clientY: 2.5 });
    fireEvent.mouseMove(window, { clientX: 5.5, clientY: 6.5 });
    fireEvent.mouseUp(window, { clientX: 5.5, clientY: 6.5 });
    const slicing = useStore
      .getState()
      .project.sources.find((x) => x.id === src.id)!.slicing;
    expect(slicing.kind).toBe('manual');
    if (slicing.kind !== 'manual') throw new Error();
    expect(slicing.rects).toHaveLength(1);
    expect(slicing.rects[0]).toEqual({ x: 1, y: 2, w: 5, h: 5 });
  });
});
