import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, resetStore } from '../../src/ui/store';
import { createImage, setPixel } from '../../src/core/image';
import { encodePng } from '../../src/core/png';
import { decodeImport } from '../../src/io/file';
import { projectToJson, projectFromJson } from '../../src/core/serialize/project';

/**
 * Regression tests for B1: two strokes followed by save/reload must keep
 * both strokes. Before the fix, `editedFrames` was materialized on the
 * first commit and never updated, so stroke #2 was dropped on save.
 *
 * Covers all four source kinds: imported PNG sheet, imported GIF
 * sequence, blank sheet, blank sequence.
 */
describe('save/reload after multiple strokes — B1 regression', () => {
  beforeEach(() => resetStore());

  /** Apply a single-pixel paint at (x,y) with the given color. */
  function paintPixel(
    sourceId: string,
    frameIndex: number,
    target: 'sheet' | 'sequence',
    x: number,
    y: number,
    color: { r: number; g: number; b: number; a: number },
  ) {
    const commit = useStore.getState().beginStroke(sourceId, frameIndex);
    const state = useStore.getState();
    const bmp =
      target === 'sheet'
        ? state.sheetBitmaps[sourceId]!
        : state.prepared[sourceId]!.frames[frameIndex]!;
    setPixel(bmp, x, y, color.r, color.g, color.b, color.a);
    commit();
  }

  it('imported PNG sheet: two strokes round-trip through JSON', () => {
    // Build an 8x8 PNG sheet.
    const img = createImage(8, 8);
    const pngBytes = encodePng(img);
    const imported = decodeImport(pngBytes);
    const src = useStore.getState().addSource('walk.png', imported);

    paintPixel(src.id, 0, 'sheet', 1, 1, { r: 200, g: 0, b: 0, a: 255 });
    paintPixel(src.id, 0, 'sheet', 2, 2, { r: 0, g: 200, b: 0, a: 255 });

    const json = projectToJson(useStore.getState().project);
    const reloaded = projectFromJson(json);
    const reloadedSrc = reloaded.sources.find((s) => s.id === src.id)!;
    const frame0 = reloadedSrc.editedFrames![0]!;
    // Stroke 1 pixel.
    expect(frame0.data[(1 * 8 + 1) * 4]).toBe(200);
    expect(frame0.data[(1 * 8 + 1) * 4 + 3]).toBe(255);
    // Stroke 2 pixel — this is the B1 regression.
    expect(frame0.data[(2 * 8 + 2) * 4 + 1]).toBe(200);
    expect(frame0.data[(2 * 8 + 2) * 4 + 3]).toBe(255);
  });

  it('blank sheet: two strokes round-trip through JSON', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 'blank', width: 8, height: 8 });
    paintPixel(src.id, 0, 'sheet', 1, 1, { r: 200, g: 0, b: 0, a: 255 });
    paintPixel(src.id, 0, 'sheet', 2, 2, { r: 0, g: 200, b: 0, a: 255 });

    const json = projectToJson(useStore.getState().project);
    const reloaded = projectFromJson(json);
    const reloadedSrc = reloaded.sources.find((s) => s.id === src.id)!;
    const frame0 = reloadedSrc.editedFrames![0]!;
    expect(frame0.data[(1 * 8 + 1) * 4]).toBe(200);
    expect(frame0.data[(2 * 8 + 2) * 4 + 1]).toBe(200);
  });

  it('blank sequence: two strokes on different frames round-trip', () => {
    const src = useStore.getState().createBlankSource({
      kind: 'sequence',
      name: 'anim',
      width: 4,
      height: 4,
      frameCount: 3,
    });
    paintPixel(src.id, 0, 'sequence', 0, 0, { r: 111, g: 0, b: 0, a: 255 });
    paintPixel(src.id, 2, 'sequence', 3, 3, { r: 0, g: 222, b: 0, a: 255 });

    const json = projectToJson(useStore.getState().project);
    const reloaded = projectFromJson(json);
    const reloadedSrc = reloaded.sources.find((s) => s.id === src.id)!;
    expect(reloadedSrc.editedFrames).toHaveLength(3);
    const f0 = reloadedSrc.editedFrames![0]!;
    const f2 = reloadedSrc.editedFrames![2]!;
    expect(f0.data[(0 * 4 + 0) * 4]).toBe(111);
    expect(f2.data[(3 * 4 + 3) * 4 + 1]).toBe(222);
    // Frame 1 untouched.
    const f1 = reloadedSrc.editedFrames![1]!;
    for (const b of f1.data) expect(b).toBe(0);
  });

  it('imported GIF sequence: two strokes on one frame round-trip', () => {
    // Use an addSource shortcut: simulate GIF decoder output.
    const a = createImage(4, 4);
    const b = createImage(4, 4);
    const imported = {
      kind: 'sequence' as const,
      format: 'gif' as const,
      frames: [a, b],
      delaysMs: [80, 80],
      bytes: new Uint8Array(),
    };
    const src = useStore.getState().addSource('anim.gif', imported);

    paintPixel(src.id, 1, 'sequence', 1, 1, { r: 200, g: 0, b: 0, a: 255 });
    paintPixel(src.id, 1, 'sequence', 2, 2, { r: 0, g: 200, b: 0, a: 255 });

    const json = projectToJson(useStore.getState().project);
    // imported GIF bytes are empty (mock) — the project loader will try
    // to decodeGif(imageBytes) if editedFrames is missing; with
    // editedFrames present, it bypasses that path. We test JSON only.
    const parsed = JSON.parse(json);
    const srcJson = parsed.sources.find(
      (s: { id: string }) => s.id === src.id,
    );
    expect(srcJson.editedFrames).toHaveLength(2);

    const reloaded = projectFromJson(json);
    const reloadedSrc = reloaded.sources.find((s) => s.id === src.id)!;
    const frame1 = reloadedSrc.editedFrames![1]!;
    expect(frame1.data[(1 * 4 + 1) * 4]).toBe(200);
    expect(frame1.data[(2 * 4 + 2) * 4 + 1]).toBe(200);
  });

  it('undo after second stroke also keeps editedFrames in sync', () => {
    // Regression for the undo half of B1: after fix, undo must write the
    // pre-stroke snapshot back into editedFrames so save/reload reflects
    // the undone state rather than the pre-undo state.
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 'u', width: 4, height: 4 });
    paintPixel(src.id, 0, 'sheet', 0, 0, { r: 200, g: 0, b: 0, a: 255 });
    paintPixel(src.id, 0, 'sheet', 1, 1, { r: 0, g: 200, b: 0, a: 255 });
    useStore.getState().undo(src.id);

    const json = projectToJson(useStore.getState().project);
    const reloaded = projectFromJson(json);
    const reloadedSrc = reloaded.sources.find((s) => s.id === src.id)!;
    const frame0 = reloadedSrc.editedFrames![0]!;
    // Stroke 1 still present.
    expect(frame0.data[(0 * 4 + 0) * 4]).toBe(200);
    // Stroke 2 was undone — pixel must be transparent.
    expect(frame0.data[(1 * 4 + 1) * 4 + 3]).toBe(0);
  });
});
