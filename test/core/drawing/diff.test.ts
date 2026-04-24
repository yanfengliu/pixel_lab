import { describe, it, expect } from 'vitest';
import { createImage, setPixel, imagesEqual } from '../../../src/core/image';
import {
  computeDelta,
  redoDelta,
  undoDelta,
} from '../../../src/core/drawing/diff';

describe('computeDelta', () => {
  it('returns null for identical frames', () => {
    const a = createImage(4, 4);
    const b = createImage(4, 4);
    expect(computeDelta('s1', 0, a, b)).toBeNull();
  });

  it('produces a minimal bounding rect around changed pixels', () => {
    const before = createImage(8, 8);
    const after = createImage(8, 8);
    // Change a single pixel at (5, 3).
    setPixel(after, 5, 3, 1, 2, 3, 255);
    const delta = computeDelta('s1', 0, before, after)!;
    expect(delta).not.toBeNull();
    expect(delta.rect).toEqual({ x: 5, y: 3, w: 1, h: 1 });
    expect(delta.sourceId).toBe('s1');
    expect(delta.frameIndex).toBe(0);
    expect(delta.before.length).toBe(4);
    expect(delta.after.length).toBe(4);
  });

  it('rejects mismatched dimensions', () => {
    const a = createImage(4, 4);
    const b = createImage(4, 5);
    expect(() => computeDelta('s1', 0, a, b)).toThrow();
  });

  it('captures multiple-pixel changes in a single rect', () => {
    const before = createImage(8, 8);
    const after = createImage(8, 8);
    setPixel(after, 1, 1, 10, 20, 30, 255);
    setPixel(after, 4, 5, 40, 50, 60, 255);
    const delta = computeDelta('s1', 0, before, after)!;
    // Bounding rect spans (1,1)..(4,5) inclusive.
    expect(delta.rect).toEqual({ x: 1, y: 1, w: 4, h: 5 });
  });
});

describe('redoDelta / undoDelta round-trip', () => {
  it('redo then undo restores original', () => {
    const before = createImage(8, 8);
    const after = createImage(8, 8);
    setPixel(after, 2, 3, 100, 150, 200, 255);
    setPixel(after, 6, 7, 1, 2, 3, 255);
    const delta = computeDelta('s1', 0, before, after)!;
    // Start from `before`, apply redo to get to `after`, then undo.
    const target = createImage(8, 8);
    redoDelta(target, delta);
    expect(imagesEqual(target, after)).toBe(true);
    undoDelta(target, delta);
    expect(imagesEqual(target, before)).toBe(true);
  });

  it('undo independent of redo ordering (reusing same delta)', () => {
    const before = createImage(4, 4);
    const after = createImage(4, 4);
    setPixel(after, 0, 0, 10, 20, 30, 255);
    const delta = computeDelta('s1', 0, before, after)!;
    const target = createImage(4, 4);
    redoDelta(target, delta);
    redoDelta(target, delta);
    redoDelta(target, delta);
    expect(imagesEqual(target, after)).toBe(true);
    undoDelta(target, delta);
    expect(imagesEqual(target, before)).toBe(true);
  });
});
