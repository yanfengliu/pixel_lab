import { describe, it, expect } from 'vitest';
import { createImage, setPixel } from '../../src/core/image';
import { sliceAuto } from '../../src/core/slicers/auto';

function fillRect(
  img: ReturnType<typeof createImage>,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 255,
) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      setPixel(img, xx, yy, 255, 255, 255, alpha);
    }
  }
}

describe('sliceAuto', () => {
  it('returns empty when image is fully transparent', () => {
    const img = createImage(8, 8);
    expect(sliceAuto(img, { kind: 'auto', minGapPx: 0, alphaThreshold: 0 })).toEqual(
      [],
    );
  });

  it('finds a single frame as one bounding box', () => {
    const img = createImage(16, 16);
    fillRect(img, 2, 3, 4, 5);
    const rects = sliceAuto(img, { kind: 'auto', minGapPx: 0, alphaThreshold: 0 });
    expect(rects).toEqual([{ x: 2, y: 3, w: 4, h: 5 }]);
  });

  it('separates frames divided by transparent gaps', () => {
    const img = createImage(16, 8);
    fillRect(img, 0, 0, 4, 8); // left block
    fillRect(img, 8, 0, 4, 8); // right block (gap of 4 pixels between)
    const rects = sliceAuto(img, { kind: 'auto', minGapPx: 0, alphaThreshold: 0 });
    expect(rects).toEqual([
      { x: 0, y: 0, w: 4, h: 8 },
      { x: 8, y: 0, w: 4, h: 8 },
    ]);
  });

  it('merges frames closer than minGapPx', () => {
    const img = createImage(20, 8);
    fillRect(img, 0, 0, 8, 8);
    fillRect(img, 10, 0, 8, 8); // gap of exactly 2 pixels between blocks
    const rects = sliceAuto(img, { kind: 'auto', minGapPx: 2, alphaThreshold: 0 });
    expect(rects).toEqual([{ x: 0, y: 0, w: 18, h: 8 }]);
  });

  it('orders rects top-to-bottom, left-to-right', () => {
    const img = createImage(16, 16);
    fillRect(img, 10, 10, 2, 2); // bottom-right first in insertion
    fillRect(img, 0, 0, 2, 2);
    fillRect(img, 10, 0, 2, 2);
    const rects = sliceAuto(img, { kind: 'auto', minGapPx: 0, alphaThreshold: 0 });
    expect(rects.map((r) => `${r.x},${r.y}`)).toEqual([
      '0,0',
      '10,0',
      '10,10',
    ]);
  });

  it('ignores pixels at or below the alpha threshold', () => {
    const img = createImage(8, 8);
    fillRect(img, 0, 0, 8, 8, 10); // faint alpha=10
    fillRect(img, 2, 2, 4, 4, 200); // strong content
    const rects = sliceAuto(img, { kind: 'auto', minGapPx: 0, alphaThreshold: 32 });
    expect(rects).toEqual([{ x: 2, y: 2, w: 4, h: 4 }]);
  });
});
