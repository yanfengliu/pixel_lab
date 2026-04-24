import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, resetStore } from '../../src/ui/store';
import type { DecodedImport } from '../../src/io/file';
import { createImage, setPixel } from '../../src/core/image';

function mockSheetImport(): DecodedImport {
  const img = createImage(16, 16);
  setPixel(img, 0, 0, 255, 0, 0, 255);
  return {
    kind: 'sheet',
    format: 'png',
    frames: [img],
    delaysMs: [],
    bytes: new Uint8Array(),
  };
}

function mockGifImport(): DecodedImport {
  const a = createImage(4, 4);
  const b = createImage(4, 4);
  setPixel(a, 0, 0, 1, 0, 0, 255);
  setPixel(b, 0, 0, 0, 1, 0, 255);
  return {
    kind: 'sequence',
    format: 'gif',
    frames: [a, b],
    delaysMs: [100, 80],
    bytes: new Uint8Array(),
  };
}

describe('store', () => {
  beforeEach(() => resetStore());

  it('addSource for a sheet creates a 1x1 grid slicing by default', () => {
    const source = useStore.getState().addSource('walk.png', mockSheetImport());
    const state = useStore.getState();
    expect(state.project.sources).toHaveLength(1);
    expect(source.slicing.kind).toBe('grid');
    expect(state.selectedSourceId).toBe(source.id);
    expect(state.prepared[source.id]?.frames).toHaveLength(1);
  });

  it('addSource for a sequence stores per-frame delays and prepared frames', () => {
    const src = useStore.getState().addSource('walk.gif', mockGifImport());
    const state = useStore.getState();
    expect(src.kind).toBe('sequence');
    expect(src.slicing.kind).toBe('sequence');
    expect(src.importedFrom).toBe('gif');
    expect(src.gifFrames).toEqual([
      { index: 0, delayMs: 100 },
      { index: 1, delayMs: 80 },
    ]);
    expect(state.prepared[src.id]?.frames).toHaveLength(2);
  });

  it('addSource for a PNG sets importedFrom: "png"', () => {
    const src = useStore.getState().addSource('walk.png', mockSheetImport());
    expect(src.importedFrom).toBe('png');
  });

  it('updateSlicing for a sheet regenerates prepared frames', () => {
    const src = useStore.getState().addSource('walk.png', mockSheetImport());
    useStore.getState().updateSlicing(src.id, {
      kind: 'grid',
      cellW: 4,
      cellH: 4,
      offsetX: 0,
      offsetY: 0,
      rows: 1,
      cols: 4,
    });
    // Only cell (0,0) has a red pixel; other 3 cells are fully transparent
    // so the grid slicer drops them. Prepared frames should be 1.
    const prepared = useStore.getState().prepared[src.id]!;
    expect(prepared.frames).toHaveLength(1);
    expect(prepared.frames[0]!.width).toBe(4);
  });

  it('removeSource strips frames from animations that referenced it', () => {
    const s = useStore.getState();
    const src = s.addSource('walk.png', mockSheetImport());
    const anim = s.addAnimation('walk');
    s.appendFrames(anim.id, [{ sourceId: src.id, rectIndex: 0 }]);
    s.removeSource(src.id);
    const st = useStore.getState();
    expect(st.project.animations[0]!.frames).toEqual([]);
    expect(st.prepared[src.id]).toBeUndefined();
  });

  it('appendFrames / removeFrameAt / reorderFrame mutate in order', () => {
    const s = useStore.getState();
    const anim = s.addAnimation('walk');
    s.appendFrames(anim.id, [
      { sourceId: 'x', rectIndex: 0 },
      { sourceId: 'x', rectIndex: 1 },
      { sourceId: 'x', rectIndex: 2 },
    ]);
    s.reorderFrame(anim.id, 0, 2);
    expect(useStore.getState().project.animations[0]!.frames.map((f) => f.rectIndex))
      .toEqual([1, 2, 0]);
    s.removeFrameAt(anim.id, 1);
    expect(useStore.getState().project.animations[0]!.frames.map((f) => f.rectIndex))
      .toEqual([1, 0]);
  });

  it('setAnimationFps and setAnimationLoop mutate the animation only', () => {
    const s = useStore.getState();
    const a = s.addAnimation('a');
    s.setAnimationFps(a.id, 24);
    s.setAnimationLoop(a.id, false);
    const out = useStore.getState().project.animations[0]!;
    expect(out.fps).toBe(24);
    expect(out.loop).toBe(false);
  });
});

describe('store: tools, colors, opacity, brushSize', () => {
  beforeEach(() => resetStore());

  it('starts with sensible defaults', () => {
    const s = useStore.getState();
    expect(s.activeTool).toBe('pencil');
    expect(s.primaryColor).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    expect(s.secondaryColor).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(s.opacity).toBe(1);
    expect(s.brushSize).toBe(1);
  });

  it('setActiveTool updates the active tool', () => {
    useStore.getState().setActiveTool('bucket');
    expect(useStore.getState().activeTool).toBe('bucket');
  });

  it('swapColors exchanges primary and secondary', () => {
    useStore.getState().setPrimaryColor({ r: 1, g: 2, b: 3, a: 255 });
    useStore.getState().setSecondaryColor({ r: 10, g: 20, b: 30, a: 255 });
    useStore.getState().swapColors();
    const s = useStore.getState();
    expect(s.primaryColor).toEqual({ r: 10, g: 20, b: 30, a: 255 });
    expect(s.secondaryColor).toEqual({ r: 1, g: 2, b: 3, a: 255 });
  });

  it('setOpacity clamps to [0..1]', () => {
    useStore.getState().setOpacity(2);
    expect(useStore.getState().opacity).toBe(1);
    useStore.getState().setOpacity(-1);
    expect(useStore.getState().opacity).toBe(0);
    useStore.getState().setOpacity(0.5);
    expect(useStore.getState().opacity).toBe(0.5);
  });

  it('setBrushSize clamps to [1..8] integer', () => {
    useStore.getState().setBrushSize(0);
    expect(useStore.getState().brushSize).toBe(1);
    useStore.getState().setBrushSize(99);
    expect(useStore.getState().brushSize).toBe(8);
    useStore.getState().setBrushSize(3.7);
    expect(useStore.getState().brushSize).toBe(3);
  });
});

describe('store: swatches', () => {
  beforeEach(() => resetStore());

  it('addSwatch ignores duplicates (case-insensitive)', () => {
    const s = useStore.getState();
    s.addSwatch('#ff0000');
    s.addSwatch('#FF0000');
    expect(useStore.getState().project.swatches).toEqual(['#ff0000']);
  });

  it('removeSwatch removes by hex value', () => {
    const s = useStore.getState();
    s.addSwatch('#ff0000');
    s.addSwatch('#00ff00');
    s.removeSwatch('#ff0000');
    expect(useStore.getState().project.swatches).toEqual(['#00ff00']);
  });

  it('moveSwatch reorders correctly', () => {
    const s = useStore.getState();
    s.addSwatch('#aa0000');
    s.addSwatch('#bb0000');
    s.addSwatch('#cc0000');
    s.moveSwatch(0, 2);
    expect(useStore.getState().project.swatches).toEqual([
      '#bb0000',
      '#cc0000',
      '#aa0000',
    ]);
  });
});

describe('store: createBlankSource', () => {
  beforeEach(() => resetStore());

  it('creates a sheet with a transparent edited bitmap', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 'blank-sheet', width: 32, height: 32 });
    expect(src.kind).toBe('sheet');
    expect(src.importedFrom).toBe('blank');
    expect(src.editedFrames).toBeDefined();
    expect(src.editedFrames!).toHaveLength(1);
    expect(src.editedFrames![0]!.width).toBe(32);
    expect(src.editedFrames![0]!.height).toBe(32);
    // Fully transparent: every byte is 0.
    for (const b of src.editedFrames![0]!.data) expect(b).toBe(0);
    // sheetBitmap is registered so painting works.
    expect(useStore.getState().sheetBitmaps[src.id]).toBeDefined();
    // Slicer produces zero rects on a fully-transparent sheet (drop-empty
    // is the existing grid-slicer behavior); paint a pixel to materialize.
    expect(useStore.getState().prepared[src.id]?.frames).toHaveLength(0);
  });

  it('creates a sequence with N transparent frames', () => {
    const src = useStore.getState().createBlankSource({
      kind: 'sequence',
      name: 'blank-anim',
      width: 16,
      height: 16,
      frameCount: 4,
    });
    expect(src.kind).toBe('sequence');
    expect(src.slicing.kind).toBe('sequence');
    expect(src.editedFrames).toHaveLength(4);
    // Sequences render every frame even if transparent.
    expect(useStore.getState().prepared[src.id]?.frames).toHaveLength(4);
  });

  it('defaults sequence frameCount to 1', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sequence', name: 'a', width: 8, height: 8 });
    expect(src.editedFrames).toHaveLength(1);
  });
});

describe('store: undo/redo', () => {
  beforeEach(() => resetStore());

  it('beginStroke + commit + undo round-trips on a blank sheet', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 8, height: 8 });
    const commit = useStore.getState().beginStroke(src.id, 0);
    // Mutate the sheet bitmap (sheets paint on the full bitmap, not the
    // sliced sub-frames).
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    setPixel(bmp, 1, 1, 200, 100, 50, 255);
    commit();
    // After commit, undo restores the pixel.
    expect(useStore.getState().undoStacks[src.id]).toHaveLength(1);
    useStore.getState().undo(src.id);
    const after = useStore.getState().sheetBitmaps[src.id]!;
    expect(after.data[(1 * 8 + 1) * 4 + 3]).toBe(0); // alpha back to 0
  });

  it('redo after undo restores post-stroke state', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 8, height: 8 });
    const commit = useStore.getState().beginStroke(src.id, 0);
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    setPixel(bmp, 0, 0, 1, 2, 3, 255);
    commit();
    useStore.getState().undo(src.id);
    useStore.getState().redo(src.id);
    const f = useStore.getState().sheetBitmaps[src.id]!;
    expect(f.data[0]).toBe(1);
    expect(f.data[3]).toBe(255);
  });

  it('a new stroke after undo clears the redo stack', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 4, height: 4 });
    const commit1 = useStore.getState().beginStroke(src.id, 0);
    setPixel(useStore.getState().sheetBitmaps[src.id]!, 0, 0, 10, 0, 0, 255);
    commit1();
    useStore.getState().undo(src.id);
    expect(useStore.getState().redoStacks[src.id]).toHaveLength(1);
    const commit2 = useStore.getState().beginStroke(src.id, 0);
    setPixel(useStore.getState().sheetBitmaps[src.id]!, 1, 1, 0, 10, 0, 255);
    commit2();
    expect(useStore.getState().redoStacks[src.id] ?? []).toHaveLength(0);
  });

  it('commit is a no-op when no pixels changed', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 4, height: 4 });
    const commit = useStore.getState().beginStroke(src.id, 0);
    commit();
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(0);
  });

  it('materializes editedFrames on first commit if a source had none', () => {
    // Use mockSheetImport so the source starts without editedFrames.
    const src = useStore.getState().addSource('walk.png', mockSheetImport());
    expect(src.editedFrames).toBeUndefined();
    const commit = useStore.getState().beginStroke(src.id, 0);
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    setPixel(bmp, 0, 0, 200, 0, 0, 255);
    commit();
    const post = useStore
      .getState()
      .project.sources.find((x) => x.id === src.id)!;
    expect(post.editedFrames).toBeDefined();
    expect(post.editedFrames!).toHaveLength(1);
  });

  it('caps the undo stack so long sessions do not leak memory (I5)', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 4, height: 4 });
    // Paint 210 strokes; the cap (200) should kick in and drop the
    // oldest entries.
    for (let i = 0; i < 210; i++) {
      const commit = useStore.getState().beginStroke(src.id, 0);
      const bmp = useStore.getState().sheetBitmaps[src.id]!;
      // Each stroke writes a distinct pixel so computeDelta returns a
      // non-null delta.
      setPixel(bmp, i % 4, Math.floor(i / 4) % 4, i & 255, 0, 0, 255);
      commit();
    }
    const stack = useStore.getState().undoStacks[src.id]!;
    expect(stack.length).toBe(200);
  });

  it('caps the redo stack symmetrically with the undo stack (N4)', () => {
    // The redo stack grows during undo; ensure it is capped to the same
    // limit as the undo stack so future refactors can't accidentally
    // uncap memory. 210 strokes → 200 in undo → undo all → 200 in redo.
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 4, height: 4 });
    for (let i = 0; i < 210; i++) {
      const commit = useStore.getState().beginStroke(src.id, 0);
      const bmp = useStore.getState().sheetBitmaps[src.id]!;
      setPixel(bmp, i % 4, Math.floor(i / 4) % 4, i & 255, 0, 0, 255);
      commit();
    }
    // Undo everything; redo grows as undo shrinks.
    while ((useStore.getState().undoStacks[src.id] ?? []).length > 0) {
      useStore.getState().undo(src.id);
    }
    const redo = useStore.getState().redoStacks[src.id]!;
    expect(redo.length).toBeLessThanOrEqual(200);
    expect(redo.length).toBe(200);
  });

  it('beginStroke + commit + undo on a sequence frame', () => {
    const src = useStore.getState().createBlankSource({
      kind: 'sequence',
      name: 'a',
      width: 4,
      height: 4,
      frameCount: 3,
    });
    const commit = useStore.getState().beginStroke(src.id, 1);
    // Paint frame 1.
    const f = useStore.getState().prepared[src.id]!.frames[1]!;
    setPixel(f, 2, 2, 100, 50, 25, 255);
    commit();
    expect(useStore.getState().undoStacks[src.id]).toHaveLength(1);
    useStore.getState().undo(src.id);
    const reverted = useStore.getState().prepared[src.id]!.frames[1]!;
    expect(reverted.data[(2 * 4 + 2) * 4 + 3]).toBe(0);
  });
});

describe('store: setSelectedFrameIndex', () => {
  beforeEach(() => resetStore());

  it('records the selected frame per source', () => {
    const s = useStore.getState();
    s.setSelectedFrameIndex('src-a', 2);
    s.setSelectedFrameIndex('src-b', 5);
    expect(useStore.getState().selectedFrameIndex['src-a']).toBe(2);
    expect(useStore.getState().selectedFrameIndex['src-b']).toBe(5);
  });

  it('clears the active selection when the frame changes', () => {
    const src = useStore
      .getState()
      .createBlankSource({
        kind: 'sequence',
        name: 'anim',
        width: 8,
        height: 8,
        frameCount: 3,
      });
    useStore.getState().setSelection({
      sourceId: src.id,
      frameIndex: 0,
      sel: { rect: { x: 1, y: 1, w: 4, h: 4 }, mask: new Uint8Array(16).fill(1) },
    });
    expect(useStore.getState().selection).not.toBeNull();
    useStore.getState().setSelectedFrameIndex(src.id, 1);
    expect(useStore.getState().selection).toBeNull();
  });

  it('keeps the selection on a no-op same-index setSelectedFrameIndex', () => {
    const src = useStore.getState().createBlankSource({
      kind: 'sequence',
      name: 'anim',
      width: 8,
      height: 8,
      frameCount: 3,
    });
    useStore.getState().setSelectedFrameIndex(src.id, 1);
    useStore.getState().setSelection({
      sourceId: src.id,
      frameIndex: 1,
      sel: { rect: { x: 0, y: 0, w: 2, h: 2 }, mask: new Uint8Array(4).fill(1) },
    });
    // Same-index "select" should not nuke the selection.
    useStore.getState().setSelectedFrameIndex(src.id, 1);
    expect(useStore.getState().selection).not.toBeNull();
  });
});

describe('store: selection', () => {
  beforeEach(() => resetStore());

  it('setSelection stores the selection', () => {
    const sel = {
      sourceId: 'src-a',
      frameIndex: 0,
      sel: { rect: { x: 0, y: 0, w: 2, h: 2 }, mask: new Uint8Array(4).fill(1) },
    };
    useStore.getState().setSelection(sel);
    expect(useStore.getState().selection).toEqual(sel);
  });

  it('clearSelection wipes the selection', () => {
    useStore.getState().setSelection({
      sourceId: 'src-a',
      frameIndex: 0,
      sel: { rect: { x: 0, y: 0, w: 2, h: 2 }, mask: new Uint8Array(4).fill(1) },
    });
    useStore.getState().clearSelection();
    expect(useStore.getState().selection).toBeNull();
  });
});
