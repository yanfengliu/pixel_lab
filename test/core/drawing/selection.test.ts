import { describe, it, expect } from 'vitest';
import { createImage, setPixel } from '../../../src/core/image';
import {
  extractSelection,
  pasteSelection,
  type Selection,
} from '../../../src/core/drawing/selection';

function solidMask(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h).fill(1);
}

describe('extractSelection', () => {
  it('returns pixels at rect and a cleared bitmap with those pixels zeroed', () => {
    const frame = createImage(4, 4);
    setPixel(frame, 1, 1, 10, 20, 30, 255);
    setPixel(frame, 2, 2, 40, 50, 60, 255);
    setPixel(frame, 0, 0, 99, 99, 99, 255); // outside the selection
    const sel: Selection = {
      rect: { x: 1, y: 1, w: 2, h: 2 },
      mask: solidMask(2, 2),
    };
    const { pixels, cleared } = extractSelection(frame, sel);
    // Extracted pixels: width/height match the rect.
    expect(pixels.width).toBe(2);
    expect(pixels.height).toBe(2);
    // (1,1) in frame → (0,0) in extracted.
    expect(pixels.data[0]).toBe(10);
    expect(pixels.data[1]).toBe(20);
    expect(pixels.data[2]).toBe(30);
    expect(pixels.data[3]).toBe(255);
    // (2,2) in frame → (1,1) in extracted.
    const last = (1 * 2 + 1) * 4;
    expect(pixels.data[last]).toBe(40);
    expect(pixels.data[last + 3]).toBe(255);
    // Cleared bitmap has selected pixels zeroed.
    expect(cleared.data[(1 * 4 + 1) * 4]).toBe(0);
    expect(cleared.data[(1 * 4 + 1) * 4 + 3]).toBe(0);
    expect(cleared.data[(2 * 4 + 2) * 4]).toBe(0);
    expect(cleared.data[(2 * 4 + 2) * 4 + 3]).toBe(0);
    // Pixel outside the selection rect is preserved.
    expect(cleared.data[0]).toBe(99);
    expect(cleared.data[3]).toBe(255);
  });

  it('does not mutate the source frame', () => {
    const frame = createImage(3, 3);
    setPixel(frame, 1, 1, 10, 20, 30, 255);
    const original = new Uint8ClampedArray(frame.data);
    const sel: Selection = { rect: { x: 1, y: 1, w: 1, h: 1 }, mask: solidMask(1, 1) };
    extractSelection(frame, sel);
    for (let i = 0; i < original.length; i++) {
      expect(frame.data[i]).toBe(original[i]);
    }
  });

  it('respects mask — unselected pixels in rect stay in the cleared frame', () => {
    const frame = createImage(4, 4);
    setPixel(frame, 0, 0, 10, 0, 0, 255);
    setPixel(frame, 1, 0, 20, 0, 0, 255);
    setPixel(frame, 0, 1, 30, 0, 0, 255);
    setPixel(frame, 1, 1, 40, 0, 0, 255);
    // Mask keeps only the top-left pixel of the 2x2 rect.
    const mask = new Uint8Array([1, 0, 0, 0]);
    const sel: Selection = { rect: { x: 0, y: 0, w: 2, h: 2 }, mask };
    const { cleared } = extractSelection(frame, sel);
    // (0,0) cleared, others preserved.
    expect(cleared.data[0]).toBe(0);
    expect(cleared.data[3]).toBe(0);
    expect(cleared.data[4]).toBe(20);
    expect(cleared.data[4 * 4]).toBe(30);
  });
});

describe('pasteSelection', () => {
  it('places pixels at the target offset', () => {
    const frame = createImage(5, 5);
    const pixels = createImage(2, 2);
    setPixel(pixels, 0, 0, 11, 0, 0, 255);
    setPixel(pixels, 1, 0, 22, 0, 0, 255);
    setPixel(pixels, 0, 1, 33, 0, 0, 255);
    setPixel(pixels, 1, 1, 44, 0, 0, 255);
    const mask = solidMask(2, 2);
    const out = pasteSelection(frame, 2, 3, pixels, mask);
    // Paste lands at (2,3)..(3,4).
    expect(out.data[(3 * 5 + 2) * 4]).toBe(11);
    expect(out.data[(3 * 5 + 3) * 4]).toBe(22);
    expect(out.data[(4 * 5 + 2) * 4]).toBe(33);
    expect(out.data[(4 * 5 + 3) * 4]).toBe(44);
  });

  it('respects mask — only mask=1 pixels are copied', () => {
    const frame = createImage(3, 3);
    setPixel(frame, 0, 0, 77, 0, 0, 255);
    const pixels = createImage(2, 2);
    setPixel(pixels, 0, 0, 1, 0, 0, 255);
    setPixel(pixels, 1, 0, 2, 0, 0, 255);
    setPixel(pixels, 0, 1, 3, 0, 0, 255);
    setPixel(pixels, 1, 1, 4, 0, 0, 255);
    const mask = new Uint8Array([0, 1, 1, 0]);
    const out = pasteSelection(frame, 0, 0, pixels, mask);
    // mask=1 positions (1,0) and (0,1) are copied; (0,0) and (1,1) preserved.
    expect(out.data[0]).toBe(77); // unchanged (original pixel)
    expect(out.data[4]).toBe(2); // pasted
    expect(out.data[3 * 4]).toBe(3); // pasted
    expect(out.data[(1 * 3 + 1) * 4 + 3]).toBe(0); // unchanged (transparent)
  });

  it('is a no-op when paste is fully out of bounds', () => {
    const frame = createImage(4, 4);
    setPixel(frame, 0, 0, 50, 0, 0, 255);
    const pixels = createImage(2, 2);
    setPixel(pixels, 0, 0, 1, 2, 3, 255);
    setPixel(pixels, 1, 1, 1, 2, 3, 255);
    const mask = solidMask(2, 2);
    // dy=10 puts the whole paste below the canvas.
    const out = pasteSelection(frame, 0, 10, pixels, mask);
    for (let i = 0; i < frame.data.length; i++) {
      expect(out.data[i]).toBe(frame.data[i]);
    }
  });

  it('clips partial-out-of-bounds paste', () => {
    const frame = createImage(3, 3);
    const pixels = createImage(2, 2);
    setPixel(pixels, 0, 0, 10, 0, 0, 255);
    setPixel(pixels, 1, 0, 20, 0, 0, 255);
    setPixel(pixels, 0, 1, 30, 0, 0, 255);
    setPixel(pixels, 1, 1, 40, 0, 0, 255);
    const mask = solidMask(2, 2);
    // dx=-1: only the right half of the pasted block lands inside.
    const out = pasteSelection(frame, -1, 0, pixels, mask);
    expect(out.data[0]).toBe(20); // pixels[1,0]
    expect(out.data[(1 * 3 + 0) * 4]).toBe(40); // pixels[1,1]
  });

  it('returns a new RawImage without mutating the input frame', () => {
    const frame = createImage(3, 3);
    const pixels = createImage(1, 1);
    setPixel(pixels, 0, 0, 1, 2, 3, 255);
    const original = new Uint8ClampedArray(frame.data);
    pasteSelection(frame, 0, 0, pixels, solidMask(1, 1));
    for (let i = 0; i < original.length; i++) {
      expect(frame.data[i]).toBe(original[i]);
    }
  });
});
