import { describe, it, expect } from 'vitest';
import { createImage, setPixel, getAlpha } from '../../../src/core/image';
import { floodFill } from '../../../src/core/drawing/fill';

const RED = { r: 255, g: 0, b: 0, a: 255 };

describe('floodFill', () => {
  it('fills an empty 3x3 canvas — all 9 pixels become target', () => {
    const img = createImage(3, 3);
    floodFill(img, 1, 1, RED, 1);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const i = (y * 3 + x) * 4;
        expect(img.data[i]).toBe(255);
        expect(img.data[i + 3]).toBe(255);
      }
    }
  });

  it('stops at color boundary', () => {
    const img = createImage(5, 5);
    // Vertical wall down the middle (column 2) of opaque blue.
    for (let y = 0; y < 5; y++) setPixel(img, 2, y, 0, 0, 255, 255);
    floodFill(img, 0, 0, RED, 1);
    // Left half (cols 0,1) red.
    for (let y = 0; y < 5; y++) {
      expect(getAlpha(img, 0, y)).toBe(255);
      expect(getAlpha(img, 1, y)).toBe(255);
    }
    // Right half (cols 3,4) untouched (still transparent).
    for (let y = 0; y < 5; y++) {
      expect(getAlpha(img, 3, y)).toBe(0);
      expect(getAlpha(img, 4, y)).toBe(0);
    }
    // The wall itself is unchanged.
    expect(getAlpha(img, 2, 0)).toBe(255);
    const i = (0 * 5 + 2) * 4;
    expect(img.data[i + 2]).toBe(255); // still blue
  });

  it('does not leak through a 1-pixel gap diagonally (4-connected)', () => {
    const img = createImage(3, 3);
    // Wall: opaque blocks at the center cross's arms — only diagonals open.
    setPixel(img, 1, 0, 0, 0, 255, 255);
    setPixel(img, 1, 1, 0, 0, 255, 255);
    setPixel(img, 1, 2, 0, 0, 255, 255);
    setPixel(img, 0, 1, 0, 0, 255, 255);
    setPixel(img, 2, 1, 0, 0, 255, 255);
    floodFill(img, 0, 0, RED, 1);
    // Only (0,0) is reachable in 4-connected from itself; (2,2) and (2,0)
    // and (0,2) are diagonally adjacent only and should NOT be filled.
    expect(getAlpha(img, 0, 0)).toBe(255);
    expect(getAlpha(img, 2, 2)).toBe(0);
    expect(getAlpha(img, 2, 0)).toBe(0);
    expect(getAlpha(img, 0, 2)).toBe(0);
  });

  it('does not stack-overflow on a large canvas', () => {
    const img = createImage(512, 512);
    // Should not throw; iterative impl.
    expect(() => floodFill(img, 0, 0, RED, 1)).not.toThrow();
    // First and last pixels filled.
    expect(getAlpha(img, 0, 0)).toBe(255);
    expect(getAlpha(img, 511, 511)).toBe(255);
  });

  it('is a no-op when seed color equals target color', () => {
    const img = createImage(3, 3);
    setPixel(img, 1, 1, 255, 0, 0, 255);
    const before = new Uint8Array(img.data.buffer.slice(0));
    floodFill(img, 1, 1, RED, 1);
    expect(Array.from(img.data)).toEqual(Array.from(before));
  });

  it('does nothing when seed is out of bounds', () => {
    const img = createImage(3, 3);
    expect(() => floodFill(img, -1, -1, RED, 1)).not.toThrow();
    expect(() => floodFill(img, 3, 3, RED, 1)).not.toThrow();
    for (let i = 0; i < img.data.length; i++) expect(img.data[i]).toBe(0);
  });

  it('respects opacity when blending the fill', () => {
    const img = createImage(2, 2);
    // Opaque white background.
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) setPixel(img, x, y, 255, 255, 255, 255);
    floodFill(img, 0, 0, RED, 0.5);
    // Each pixel ~half-blended toward red.
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const i = (y * 2 + x) * 4;
        expect(img.data[i + 3]).toBe(255);
        expect(Math.abs(img.data[i]! - 255)).toBeLessThanOrEqual(2);
        expect(img.data[i + 1]).toBeGreaterThanOrEqual(126);
        expect(img.data[i + 1]).toBeLessThanOrEqual(130);
      }
    }
  });
});
