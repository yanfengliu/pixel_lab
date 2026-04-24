import { describe, it, expect } from 'vitest';
import {
  createImage,
  setPixel,
  crop,
  blit,
  isCellFullyTransparent,
  imagesEqual,
} from '../../src/core/image';

describe('image', () => {
  it('creates a blank image of the given size', () => {
    const img = createImage(3, 2);
    expect(img.width).toBe(3);
    expect(img.height).toBe(2);
    expect(img.data.length).toBe(3 * 2 * 4);
    expect(img.data.every((b) => b === 0)).toBe(true);
  });

  it('setPixel round-trips via getAlpha', () => {
    const img = createImage(2, 2);
    setPixel(img, 1, 1, 10, 20, 30, 255);
    expect(img.data[(1 * 2 + 1) * 4 + 3]).toBe(255);
  });

  it('crops preserving pixel contents', () => {
    const src = createImage(4, 4);
    setPixel(src, 2, 1, 1, 2, 3, 4);
    const out = crop(src, { x: 1, y: 1, w: 2, h: 2 });
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
    expect(out.data[(0 * 2 + 1) * 4]).toBe(1);
    expect(out.data[(0 * 2 + 1) * 4 + 3]).toBe(4);
  });

  it('crop rejects out-of-bounds rects', () => {
    const src = createImage(2, 2);
    expect(() => crop(src, { x: 1, y: 1, w: 2, h: 2 })).toThrow();
  });

  it('blit places src pixels into dst at offset', () => {
    const dst = createImage(3, 3);
    const src = createImage(2, 1);
    setPixel(src, 0, 0, 9, 8, 7, 255);
    setPixel(src, 1, 0, 1, 2, 3, 255);
    blit(dst, src, 1, 1);
    expect(dst.data[(1 * 3 + 1) * 4]).toBe(9);
    expect(dst.data[(1 * 3 + 2) * 4]).toBe(1);
    expect(dst.data[(0 * 3 + 0) * 4 + 3]).toBe(0);
  });

  it('isCellFullyTransparent true when alpha all zero', () => {
    const img = createImage(4, 4);
    expect(isCellFullyTransparent(img, { x: 0, y: 0, w: 4, h: 4 })).toBe(true);
    setPixel(img, 3, 3, 0, 0, 0, 1);
    expect(isCellFullyTransparent(img, { x: 0, y: 0, w: 4, h: 4 })).toBe(false);
    expect(isCellFullyTransparent(img, { x: 0, y: 0, w: 3, h: 3 })).toBe(true);
  });

  it('imagesEqual compares bytes', () => {
    const a = createImage(2, 2);
    const b = createImage(2, 2);
    expect(imagesEqual(a, b)).toBe(true);
    setPixel(a, 0, 0, 1, 0, 0, 1);
    expect(imagesEqual(a, b)).toBe(false);
  });
});
