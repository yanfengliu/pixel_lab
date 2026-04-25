import { describe, it, expect } from 'vitest';
import { createImage, setPixel, getAlpha } from '../../../src/core/image';
import {
  stampDot,
  stampLine,
  stampLineFrom,
  stampErase,
  stampEraseLine,
  type Brush,
} from '../../../src/core/drawing/brush';

const RED = { r: 255, g: 0, b: 0, a: 255 };
const HALF_RED = { r: 255, g: 0, b: 0, a: 128 };

function pixel(img: ReturnType<typeof createImage>, x: number, y: number) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

describe('stampDot', () => {
  it('size 1 paints a single pixel', () => {
    const img = createImage(4, 4);
    const brush: Brush = { size: 1, color: RED, opacity: 1 };
    stampDot(img, 2, 2, brush);
    expect(pixel(img, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(pixel(img, 1, 2)).toEqual([0, 0, 0, 0]);
    expect(pixel(img, 3, 2)).toEqual([0, 0, 0, 0]);
  });

  it('size 3 paints a 3x3 square centered on the point', () => {
    const img = createImage(8, 8);
    const brush: Brush = { size: 3, color: RED, opacity: 1 };
    stampDot(img, 4, 4, brush);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(pixel(img, 4 + dx, 4 + dy)).toEqual([255, 0, 0, 255]);
      }
    }
    // Outside the 3x3 stays untouched.
    expect(pixel(img, 4, 6)).toEqual([0, 0, 0, 0]);
  });

  it('opacity 0.5 over an opaque background blends halfway', () => {
    const img = createImage(2, 2);
    // White opaque background.
    setPixel(img, 0, 0, 255, 255, 255, 255);
    const brush: Brush = { size: 1, color: RED, opacity: 0.5 };
    stampDot(img, 0, 0, brush);
    const px = pixel(img, 0, 0);
    // Source-over with src.a' = 255*0.5; result alpha 255 (still opaque),
    // RGB ≈ src.RGB * 0.5 + dst.RGB * 0.5 → ~128 each channel.
    expect(px[3]).toBe(255);
    expect(Math.abs(px[0]! - 255)).toBeLessThanOrEqual(2);
    expect(px[1]).toBeGreaterThanOrEqual(126);
    expect(px[1]).toBeLessThanOrEqual(130);
    expect(px[2]).toBeGreaterThanOrEqual(126);
    expect(px[2]).toBeLessThanOrEqual(130);
  });

  it('opacity scales the alpha when stamped on transparent background', () => {
    const img = createImage(2, 2);
    const brush: Brush = { size: 1, color: HALF_RED, opacity: 1 };
    stampDot(img, 0, 0, brush);
    expect(pixel(img, 0, 0)).toEqual([255, 0, 0, 128]);
  });

  it('clips out-of-bounds writes', () => {
    const img = createImage(4, 4);
    const brush: Brush = { size: 3, color: RED, opacity: 1 };
    // Center at (0,0): top-left of stamp lies at (-1,-1). Only (0..1, 0..1)
    // should land inside.
    stampDot(img, 0, 0, brush);
    expect(pixel(img, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(img, 1, 1)).toEqual([255, 0, 0, 255]);
  });
});

describe('stampLine', () => {
  it('horizontal line covers every pixel between x0 and x1', () => {
    const img = createImage(8, 4);
    const brush: Brush = { size: 1, color: RED, opacity: 1 };
    stampLine(img, 0, 0, 5, 0, brush);
    for (let x = 0; x <= 5; x++) {
      expect(getAlpha(img, x, 0)).toBe(255);
    }
    expect(getAlpha(img, 6, 0)).toBe(0);
  });

  it('vertical line covers every pixel between y0 and y1', () => {
    const img = createImage(4, 8);
    const brush: Brush = { size: 1, color: RED, opacity: 1 };
    stampLine(img, 1, 0, 1, 5, brush);
    for (let y = 0; y <= 5; y++) {
      expect(getAlpha(img, 1, y)).toBe(255);
    }
  });

  it('diagonal line is continuous (no skipped pixels)', () => {
    const img = createImage(8, 8);
    const brush: Brush = { size: 1, color: RED, opacity: 1 };
    stampLine(img, 0, 0, 7, 7, brush);
    for (let i = 0; i <= 7; i++) {
      expect(getAlpha(img, i, i)).toBe(255);
    }
  });

  it('zero-length line paints a single dot', () => {
    const img = createImage(4, 4);
    const brush: Brush = { size: 1, color: RED, opacity: 1 };
    stampLine(img, 2, 2, 2, 2, brush);
    expect(getAlpha(img, 2, 2)).toBe(255);
  });
});

describe('stampLineFrom (M7: chained-segment opacity)', () => {
  it('skips the start pixel so chained segments do not double-composite the join', () => {
    // Simulate a mouse-drag over two segments. The drag's first pixel was
    // stamped by stampDot (mousedown). Each subsequent stampLineFrom call
    // walks (lastX, lastY) → (curX, curY) excluding the start, so the join
    // pixel composites exactly once across the whole drag.
    const img = createImage(16, 4);
    const brush: Brush = { size: 1, color: RED, opacity: 0.5 };
    // Mousedown at (0,0): stampDot composites the click pixel once.
    stampDot(img, 0, 0, brush);
    // Mousemove segment 1: (0,0) -> (5,0). Excludes (0,0).
    stampLineFrom(img, 0, 0, 5, 0, brush);
    // Mousemove segment 2: (5,0) -> (10,0). Excludes (5,0) — without that
    // skip, (5,0) would composite twice and look darker than its neighbors.
    stampLineFrom(img, 5, 0, 10, 0, brush);
    const a4 = getAlpha(img, 4, 0);
    const a5 = getAlpha(img, 5, 0);
    const a6 = getAlpha(img, 6, 0);
    expect(a5).toBe(a4);
    expect(a5).toBe(a6);
  });

  it('start-skip still produces a continuous line (no gap)', () => {
    const img = createImage(8, 4);
    const brush: Brush = { size: 1, color: RED, opacity: 1 };
    stampDot(img, 0, 0, brush);
    stampLineFrom(img, 0, 0, 5, 0, brush);
    for (let x = 0; x <= 5; x++) {
      expect(getAlpha(img, x, 0)).toBe(255);
    }
  });

  it('zero-length stampLineFrom is a no-op (start is excluded)', () => {
    const img = createImage(4, 4);
    const brush: Brush = { size: 1, color: RED, opacity: 1 };
    stampLineFrom(img, 1, 1, 1, 1, brush);
    expect(getAlpha(img, 1, 1)).toBe(0);
  });
});

describe('stampErase / stampEraseLine', () => {
  it('stampErase clears alpha to 0 in a square region', () => {
    const img = createImage(4, 4);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) setPixel(img, x, y, 255, 255, 255, 255);
    stampErase(img, 1, 1, 3);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        expect(getAlpha(img, 1 + dx, 1 + dy)).toBe(0);
    // Corner outside the 3x3 still opaque.
    expect(getAlpha(img, 3, 3)).toBe(255);
  });

  it('stampEraseLine clears every pixel along the line', () => {
    const img = createImage(8, 4);
    for (let x = 0; x < 8; x++)
      for (let y = 0; y < 4; y++) setPixel(img, x, y, 1, 2, 3, 255);
    stampEraseLine(img, 0, 1, 5, 1, 1);
    for (let x = 0; x <= 5; x++) expect(getAlpha(img, x, 1)).toBe(0);
    expect(getAlpha(img, 6, 1)).toBe(255);
  });
});
