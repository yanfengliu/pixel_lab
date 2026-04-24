import { describe, it, expect } from 'vitest';
import { createImage, setPixel } from '../../src/core/image';
import { sliceGrid } from '../../src/core/slicers/grid';

function fillCell(img: ReturnType<typeof createImage>, x: number, y: number, w: number, h: number) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      setPixel(img, xx, yy, 255, 255, 255, 255);
    }
  }
}

describe('sliceGrid', () => {
  it('produces rows*cols rects for a fully-opaque sheet', () => {
    const img = createImage(64, 32);
    fillCell(img, 0, 0, 64, 32);
    const rects = sliceGrid(img, {
      kind: 'grid',
      cellW: 16,
      cellH: 16,
      offsetX: 0,
      offsetY: 0,
      rows: 2,
      cols: 4,
    });
    expect(rects).toHaveLength(8);
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 16, h: 16 });
    expect(rects[4]).toEqual({ x: 0, y: 16, w: 16, h: 16 });
  });

  it('respects offsets', () => {
    const img = createImage(40, 16);
    fillCell(img, 0, 0, 40, 16);
    const rects = sliceGrid(img, {
      kind: 'grid',
      cellW: 16,
      cellH: 16,
      offsetX: 8,
      offsetY: 0,
      rows: 1,
      cols: 2,
    });
    expect(rects).toEqual([
      { x: 8, y: 0, w: 16, h: 16 },
      { x: 24, y: 0, w: 16, h: 16 },
    ]);
  });

  it('skips fully-transparent cells', () => {
    const img = createImage(32, 16);
    fillCell(img, 0, 0, 16, 16);
    const rects = sliceGrid(img, {
      kind: 'grid',
      cellW: 16,
      cellH: 16,
      offsetX: 0,
      offsetY: 0,
      rows: 1,
      cols: 2,
    });
    expect(rects).toEqual([{ x: 0, y: 0, w: 16, h: 16 }]);
  });

  it('skips cells that would overflow the image', () => {
    const img = createImage(20, 16);
    fillCell(img, 0, 0, 20, 16);
    const rects = sliceGrid(img, {
      kind: 'grid',
      cellW: 16,
      cellH: 16,
      offsetX: 0,
      offsetY: 0,
      rows: 1,
      cols: 2,
    });
    expect(rects).toHaveLength(1);
  });

  it('rejects non-positive cell sizes', () => {
    const img = createImage(16, 16);
    expect(() =>
      sliceGrid(img, {
        kind: 'grid',
        cellW: 0,
        cellH: 16,
        offsetX: 0,
        offsetY: 0,
        rows: 1,
        cols: 1,
      }),
    ).toThrow();
  });
});
