import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, resetStore } from '../../src/app/store';
import { createImage, setPixel } from '../../src/core/image';
import { encodePng } from '../../src/core/png';
import { decodeImport } from '../../src/io/file';
import { buildExport } from '../../src/core/export';
import { buildZip, parseZip } from '../../src/io/zip';
import { decodePng } from '../../src/core/png';

/**
 * End-to-end: synthesize a 2-frame PNG sheet, import through the real
 * decodeImport path, configure slicing via the store, add an animation,
 * export, zip, unzip, and assert manifest + atlas round-trip.
 */
describe('round-trip: import -> slice -> animate -> export -> zip', () => {
  beforeEach(() => resetStore());

  it('produces a valid ZIP with manifest and atlas that include all frames', () => {
    // Build a 16x8 sheet with two colored 8x8 cells.
    const sheet = createImage(16, 8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        setPixel(sheet, x, y, 255, 0, 0, 255);
        setPixel(sheet, x + 8, y, 0, 0, 255, 255);
      }
    }
    const pngBytes = encodePng(sheet);

    // Import through the real io pipeline.
    const imported = decodeImport(pngBytes);
    expect(imported.kind).toBe('sheet');

    const store = useStore.getState();
    const source = store.addSource('walk.png', imported);
    store.updateSlicing(source.id, {
      kind: 'grid',
      cellW: 8,
      cellH: 8,
      offsetX: 0,
      offsetY: 0,
      rows: 1,
      cols: 2,
    });
    const anim = store.addAnimation('walk');
    store.appendFrames(anim.id, [
      { sourceId: source.id, rectIndex: 0 },
      { sourceId: source.id, rectIndex: 1 },
    ]);

    const state = useStore.getState();
    const bundle = buildExport(state.project, Object.values(state.prepared), {
      emitPerFrame: true,
    });
    const zip = buildZip(bundle.files);
    const entries = parseZip(zip);

    // Manifest survives round-trip and lists both frames.
    const manifestJson = new TextDecoder().decode(entries['manifest.json']!);
    const manifest = JSON.parse(manifestJson);
    expect(manifest.animations.walk.frames).toEqual(['walk_0', 'walk_1']);
    expect(Object.keys(manifest.frames).sort()).toEqual(['walk_0', 'walk_1']);
    expect(manifest.atlas.width).toBeGreaterThan(0);

    // Atlas PNG decodes and is at least as large as the frames.
    const atlas = decodePng(entries['atlas.png']!);
    expect(atlas.width).toBeGreaterThanOrEqual(8);
    expect(atlas.height).toBeGreaterThanOrEqual(8);

    // Per-frame PNGs present.
    expect(entries['frames/walk_0.png']).toBeInstanceOf(Uint8Array);
    expect(entries['frames/walk_1.png']).toBeInstanceOf(Uint8Array);

    // The atlas should contain both the red and blue frame colors.
    const manifestFrame0 = manifest.frames.walk_0;
    const px0 =
      (manifestFrame0.y * atlas.width + manifestFrame0.x) * 4;
    const manifestFrame1 = manifest.frames.walk_1;
    const px1 =
      (manifestFrame1.y * atlas.width + manifestFrame1.x) * 4;
    const redFound = atlas.data[px0] === 255 || atlas.data[px1] === 255;
    const blueFound = atlas.data[px0 + 2] === 255 || atlas.data[px1 + 2] === 255;
    expect(redFound).toBe(true);
    expect(blueFound).toBe(true);
  });
});
