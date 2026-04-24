import type { RawImage } from '../image';
import type { Rect } from '../types';

/**
 * Stroke-granular delta. A single mouse-down → mouse-up gesture
 * produces one of these. We store only the bounding rect of changed
 * pixels so big canvases with small strokes stay cheap.
 */
export interface StrokeDelta {
  sourceId: string;
  /** 0 for a sheet, 0..N-1 for a sequence. */
  frameIndex: number;
  rect: Rect;
  /** RGBA pixels in `rect` *before* the stroke, row-major. */
  before: Uint8ClampedArray;
  /** RGBA pixels in `rect` *after* the stroke, row-major. */
  after: Uint8ClampedArray;
}

/**
 * Compute a delta between two same-sized frames. Returns `null` if
 * nothing changed (so callers can skip pushing a noop entry into the
 * undo stack). Throws if the two frames have different dimensions —
 * the caller bug should surface loudly rather than silently corrupting
 * the undo history.
 */
export function computeDelta(
  sourceId: string,
  frameIndex: number,
  before: RawImage,
  after: RawImage,
): StrokeDelta | null {
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error('computeDelta: frame dimensions differ');
  }
  const w = before.width;
  const h = before.height;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (
        before.data[i] !== after.data[i] ||
        before.data[i + 1] !== after.data[i + 1] ||
        before.data[i + 2] !== after.data[i + 2] ||
        before.data[i + 3] !== after.data[i + 3]
      ) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // no change
  const rw = maxX - minX + 1;
  const rh = maxY - minY + 1;
  const beforeBuf = new Uint8ClampedArray(rw * rh * 4);
  const afterBuf = new Uint8ClampedArray(rw * rh * 4);
  for (let row = 0; row < rh; row++) {
    const srcStart = ((minY + row) * w + minX) * 4;
    const dstStart = row * rw * 4;
    beforeBuf.set(
      before.data.subarray(srcStart, srcStart + rw * 4),
      dstStart,
    );
    afterBuf.set(after.data.subarray(srcStart, srcStart + rw * 4), dstStart);
  }
  return {
    sourceId,
    frameIndex,
    rect: { x: minX, y: minY, w: rw, h: rh },
    before: beforeBuf,
    after: afterBuf,
  };
}

/** Apply the `after` side of a delta into `frame`. */
export function redoDelta(frame: RawImage, delta: StrokeDelta): void {
  paint(frame, delta.rect, delta.after);
}

/** Apply the `before` side of a delta into `frame`. */
export function undoDelta(frame: RawImage, delta: StrokeDelta): void {
  paint(frame, delta.rect, delta.before);
}

function paint(frame: RawImage, rect: Rect, pixels: Uint8ClampedArray): void {
  for (let row = 0; row < rect.h; row++) {
    const srcStart = row * rect.w * 4;
    const dstStart = ((rect.y + row) * frame.width + rect.x) * 4;
    frame.data.set(pixels.subarray(srcStart, srcStart + rect.w * 4), dstStart);
  }
}
