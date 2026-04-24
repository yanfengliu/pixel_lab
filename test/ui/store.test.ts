import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, resetStore } from '../../src/ui/store';
import type { DecodedImport } from '../../src/io/file';
import { createImage, setPixel } from '../../src/core/image';

function mockSheetImport(): DecodedImport {
  const img = createImage(16, 16);
  setPixel(img, 0, 0, 255, 0, 0, 255);
  return { kind: 'sheet', frames: [img], delaysMs: [], bytes: new Uint8Array() };
}

function mockGifImport(): DecodedImport {
  const a = createImage(4, 4);
  const b = createImage(4, 4);
  setPixel(a, 0, 0, 1, 0, 0, 255);
  setPixel(b, 0, 0, 0, 1, 0, 255);
  return {
    kind: 'gif',
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

  it('addSource for a gif stores per-frame delays and prepared frames', () => {
    const src = useStore.getState().addSource('walk.gif', mockGifImport());
    const state = useStore.getState();
    expect(src.slicing.kind).toBe('gif');
    expect(src.gifFrames).toEqual([
      { index: 0, delayMs: 100 },
      { index: 1, delayMs: 80 },
    ]);
    expect(state.prepared[src.id]?.frames).toHaveLength(2);
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
