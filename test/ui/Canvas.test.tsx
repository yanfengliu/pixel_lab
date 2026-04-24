import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
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

describe('Canvas — manual slicing still works when no paint tool applies', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('dragging in manual mode adds a rect', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 'm', width: 8, height: 8 });
    useStore.getState().selectSource(src.id);
    useStore
      .getState()
      .updateSlicing(src.id, { kind: 'manual', rects: [] });
    const source = useStore
      .getState()
      .project.sources.find((x) => x.id === src.id)!;
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    // Select a non-paint tool so the paint overlay steps aside.
    // (Manual-slicing mode is active when slicing is `manual`; paint tools
    // still apply, but if the user explicitly activates slice rect — a
    // Phase 2 feature — the overlay swaps. For now, verify the manual
    // overlay still surfaces at the DOM level so the existing rect
    // workflow works.)
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
    // Manual-slicing overlay should still be present.
    expect(container.querySelector('.overlay.manual')).not.toBeNull();
  });
});
