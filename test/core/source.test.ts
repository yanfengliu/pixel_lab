import { describe, it, expect } from 'vitest';
import { createImage, setPixel } from '../../src/core/image';
import { prepareSheet, prepareGif } from '../../src/core/source';
import type { Source } from '../../src/core/types';

describe('prepareSheet', () => {
  it('produces one ImageData per non-transparent grid cell with the correct pixels', () => {
    const sheet = createImage(32, 16);
    // Cell 0 (0,0) colored red at top-left pixel; cell 1 (16,0) colored green.
    setPixel(sheet, 0, 0, 255, 0, 0, 255);
    setPixel(sheet, 16, 0, 0, 255, 0, 255);
    const source: Source = {
      id: 'src',
      name: 'walk.png',
      kind: 'sheet',
      width: 32,
      height: 16,
      imageBytes: new Uint8Array(),
      slicing: {
        kind: 'grid',
        cellW: 16,
        cellH: 16,
        offsetX: 0,
        offsetY: 0,
        rows: 1,
        cols: 2,
      },
    };
    const prepared = prepareSheet(source, sheet);
    expect(prepared.sourceId).toBe('src');
    expect(prepared.frames).toHaveLength(2);
    expect(prepared.frames[0]!.width).toBe(16);
    expect(prepared.frames[0]!.height).toBe(16);
    expect(prepared.frames[0]!.data[0]).toBe(255); // red in frame 0
    expect(prepared.frames[1]!.data[1]).toBe(255); // green in frame 1
  });

  it('rejects non-sheet sources', () => {
    const sheet = createImage(8, 8);
    const source: Source = {
      id: 'g',
      name: 'g.gif',
      kind: 'gif',
      width: 8,
      height: 8,
      imageBytes: new Uint8Array(),
      slicing: { kind: 'gif' },
    };
    expect(() => prepareSheet(source, sheet)).toThrow();
  });
});

describe('prepareGif', () => {
  it('copies each decoded frame verbatim', () => {
    const f0 = createImage(4, 4);
    setPixel(f0, 0, 0, 1, 2, 3, 255);
    const f1 = createImage(4, 4);
    setPixel(f1, 1, 1, 9, 9, 9, 255);
    const source: Source = {
      id: 'g',
      name: 'g.gif',
      kind: 'gif',
      width: 4,
      height: 4,
      imageBytes: new Uint8Array(),
      slicing: { kind: 'gif' },
    };
    const prepared = prepareGif(source, [f0, f1]);
    expect(prepared.frames).toHaveLength(2);
    expect(prepared.frames[0]!.data[0]).toBe(1);
    expect(prepared.frames[1]!.data[(1 * 4 + 1) * 4]).toBe(9);
  });

  it('rejects non-gif sources', () => {
    const source: Source = {
      id: 's',
      name: 's.png',
      kind: 'sheet',
      width: 4,
      height: 4,
      imageBytes: new Uint8Array(),
      slicing: { kind: 'grid', cellW: 4, cellH: 4, offsetX: 0, offsetY: 0, rows: 1, cols: 1 },
    };
    expect(() => prepareGif(source, [])).toThrow();
  });
});
