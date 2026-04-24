import { createImage, type RawImage } from '../image';
import type { Rect } from '../types';

/**
 * A per-frame selection: a bounding rectangle plus a binary mask of the
 * same dimensions indicating which pixels inside the rect are selected.
 * A marquee-select always produces a solid-rect mask, but leaving the
 * interface mask-based keeps the door open for future lasso / wand
 * selection shapes without an API break.
 */
export interface Selection {
  /** Bounding box of the selection within the frame. */
  rect: Rect;
  /** `rect.w * rect.h` entries, row-major. 1 = selected, 0 = not. */
  mask: Uint8Array;
}

/**
 * Copy the selected pixels out of `frame` and return both:
 *
 * - `pixels`: a RawImage of size `rect` containing only the selected
 *   pixels (unselected positions are left transparent).
 * - `cleared`: a clone of `frame` with every selected pixel zeroed
 *   (RGBA = 0,0,0,0). This is the "cut" side of a move operation; the
 *   UI treats it as the new frame state once the move begins.
 *
 * Neither the source frame nor the selection is mutated.
 */
export function extractSelection(
  frame: RawImage,
  sel: Selection,
): { pixels: RawImage; cleared: RawImage } {
  const { rect, mask } = sel;
  const pixels = createImage(rect.w, rect.h);
  const cleared: RawImage = {
    width: frame.width,
    height: frame.height,
    data: new Uint8ClampedArray(frame.data),
  };
  for (let ry = 0; ry < rect.h; ry++) {
    for (let rx = 0; rx < rect.w; rx++) {
      if (!mask[ry * rect.w + rx]) continue;
      const fx = rect.x + rx;
      const fy = rect.y + ry;
      if (fx < 0 || fy < 0 || fx >= frame.width || fy >= frame.height) continue;
      const src = (fy * frame.width + fx) * 4;
      const dst = (ry * rect.w + rx) * 4;
      pixels.data[dst] = frame.data[src]!;
      pixels.data[dst + 1] = frame.data[src + 1]!;
      pixels.data[dst + 2] = frame.data[src + 2]!;
      pixels.data[dst + 3] = frame.data[src + 3]!;
      // Zero that pixel in the cleared clone.
      cleared.data[src] = 0;
      cleared.data[src + 1] = 0;
      cleared.data[src + 2] = 0;
      cleared.data[src + 3] = 0;
    }
  }
  return { pixels, cleared };
}

/**
 * Paste `pixels` into a clone of `frame` at offset `(dx, dy)`, writing
 * only positions where `mask` is 1. Returns the new frame; the input is
 * not mutated. Any part of the paste that lies outside the destination
 * bounds is silently clipped, so a fully out-of-bounds paste is a no-op.
 */
export function pasteSelection(
  frame: RawImage,
  dx: number,
  dy: number,
  pixels: RawImage,
  mask: Uint8Array,
): RawImage {
  const out: RawImage = {
    width: frame.width,
    height: frame.height,
    data: new Uint8ClampedArray(frame.data),
  };
  for (let py = 0; py < pixels.height; py++) {
    for (let px = 0; px < pixels.width; px++) {
      if (!mask[py * pixels.width + px]) continue;
      const tx = dx + px;
      const ty = dy + py;
      if (tx < 0 || ty < 0 || tx >= frame.width || ty >= frame.height) continue;
      const src = (py * pixels.width + px) * 4;
      const dst = (ty * frame.width + tx) * 4;
      out.data[dst] = pixels.data[src]!;
      out.data[dst + 1] = pixels.data[src + 1]!;
      out.data[dst + 2] = pixels.data[src + 2]!;
      out.data[dst + 3] = pixels.data[src + 3]!;
    }
  }
  return out;
}
