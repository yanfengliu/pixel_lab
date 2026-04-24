import { describe, it, expect } from 'vitest';
import { encodePng, decodePng } from '../../src/core/png';
import { createImage, setPixel, imagesEqual } from '../../src/core/image';

describe('PNG encode/decode', () => {
  it('round-trips pixel data exactly', () => {
    const src = createImage(4, 3);
    setPixel(src, 0, 0, 10, 20, 30, 255);
    setPixel(src, 3, 2, 40, 50, 60, 128);
    setPixel(src, 1, 1, 70, 80, 90, 99);
    const bytes = encodePng(src);
    const decoded = decodePng(bytes);
    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(3);
    expect(imagesEqual(src, decoded)).toBe(true);
  });

  it('produces a valid PNG signature', () => {
    const img = createImage(1, 1);
    setPixel(img, 0, 0, 0, 0, 0, 255);
    const bytes = encodePng(img);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
    expect(bytes[4]).toBe(0x0d);
    expect(bytes[5]).toBe(0x0a);
    expect(bytes[6]).toBe(0x1a);
    expect(bytes[7]).toBe(0x0a);
  });
});
