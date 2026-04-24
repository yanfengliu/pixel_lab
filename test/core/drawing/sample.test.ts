import { describe, it, expect } from 'vitest';
import { createImage, setPixel } from '../../../src/core/image';
import { samplePixel } from '../../../src/core/drawing/sample';

describe('samplePixel', () => {
  it('returns the RGBA tuple at the given coordinate', () => {
    const img = createImage(3, 3);
    setPixel(img, 1, 1, 50, 100, 150, 200);
    expect(samplePixel(img, 1, 1)).toEqual({ r: 50, g: 100, b: 150, a: 200 });
  });

  it('returns transparent black for out-of-bounds samples', () => {
    const img = createImage(3, 3);
    expect(samplePixel(img, -1, 0)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(samplePixel(img, 0, -1)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(samplePixel(img, 3, 0)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(samplePixel(img, 0, 3)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });
});
