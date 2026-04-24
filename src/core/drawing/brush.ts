import type { RawImage, RGBA } from '../image';

/**
 * Square brush with a flat color. `size` is the side length in pixels,
 * `opacity` (0..1) scales the source alpha when blending.
 *
 * The brush is centered on the cursor pixel: for size=N the stamp covers
 * pixels in `[cx - floor((N-1)/2), cx + floor(N/2)]` along each axis.
 */
export interface Brush {
  /** Side length, integer in [1..8]. */
  size: number;
  color: RGBA;
  /** 0..1, scales source alpha. */
  opacity: number;
}

/**
 * Paints a single brush stamp at (cx, cy). Writes are clipped to the
 * destination bounds. Each pixel is composited source-over with the
 * existing destination.
 */
export function stampDot(dst: RawImage, cx: number, cy: number, brush: Brush): void {
  const half = Math.floor((brush.size - 1) / 2);
  const x0 = cx - half;
  const y0 = cy - half;
  const x1 = x0 + brush.size;
  const y1 = y0 + brush.size;
  const srcA = clamp255(Math.round(brush.color.a * clamp01(brush.opacity)));
  if (srcA === 0) return;
  const sr = brush.color.r;
  const sg = brush.color.g;
  const sb = brush.color.b;
  const xMin = Math.max(0, x0);
  const yMin = Math.max(0, y0);
  const xMax = Math.min(dst.width, x1);
  const yMax = Math.min(dst.height, y1);
  for (let y = yMin; y < yMax; y++) {
    for (let x = xMin; x < xMax; x++) {
      compositePixel(dst, x, y, sr, sg, sb, srcA);
    }
  }
}

/**
 * Bresenham line, brush-stamped at every step. Used for mouse-drag
 * interpolation so fast drags never leave gaps. Endpoints are inclusive;
 * a zero-length line paints a single dot.
 */
export function stampLine(
  dst: RawImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brush: Brush,
): void {
  walkLine(x0, y0, x1, y1, (x, y) => stampDot(dst, x, y, brush));
}

/**
 * Eraser: clears a square region centered on (cx, cy) to fully
 * transparent black. Ignores opacity.
 */
export function stampErase(dst: RawImage, cx: number, cy: number, size: number): void {
  const half = Math.floor((size - 1) / 2);
  const x0 = cx - half;
  const y0 = cy - half;
  const x1 = x0 + size;
  const y1 = y0 + size;
  const xMin = Math.max(0, x0);
  const yMin = Math.max(0, y0);
  const xMax = Math.min(dst.width, x1);
  const yMax = Math.min(dst.height, y1);
  for (let y = yMin; y < yMax; y++) {
    for (let x = xMin; x < xMax; x++) {
      const i = (y * dst.width + x) * 4;
      dst.data[i] = 0;
      dst.data[i + 1] = 0;
      dst.data[i + 2] = 0;
      dst.data[i + 3] = 0;
    }
  }
}

export function stampEraseLine(
  dst: RawImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
): void {
  walkLine(x0, y0, x1, y1, (x, y) => stampErase(dst, x, y, size));
}

/**
 * Internal: source-over composite of (sr,sg,sb,sa) onto dst[x,y].
 * Treats components in 0..255 integer space.
 */
function compositePixel(
  dst: RawImage,
  x: number,
  y: number,
  sr: number,
  sg: number,
  sb: number,
  sa: number,
): void {
  const i = (y * dst.width + x) * 4;
  const dr = dst.data[i]!;
  const dg = dst.data[i + 1]!;
  const db = dst.data[i + 2]!;
  const da = dst.data[i + 3]!;
  // outA = srcA + dstA * (1 - srcA), all normalized to 0..1.
  const sA = sa / 255;
  const dA = da / 255;
  const outA = sA + dA * (1 - sA);
  if (outA <= 0) {
    dst.data[i] = 0;
    dst.data[i + 1] = 0;
    dst.data[i + 2] = 0;
    dst.data[i + 3] = 0;
    return;
  }
  // outRGB = (srcRGB * srcA + dstRGB * dstA * (1 - srcA)) / outA.
  const outR = (sr * sA + dr * dA * (1 - sA)) / outA;
  const outG = (sg * sA + dg * dA * (1 - sA)) / outA;
  const outB = (sb * sA + db * dA * (1 - sA)) / outA;
  dst.data[i] = clamp255(Math.round(outR));
  dst.data[i + 1] = clamp255(Math.round(outG));
  dst.data[i + 2] = clamp255(Math.round(outB));
  dst.data[i + 3] = clamp255(Math.round(outA * 255));
}

/**
 * Bresenham line walk. Calls `onPoint` once per integer pixel including
 * both endpoints. Zero-length lines invoke once.
 */
function walkLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  onPoint: (x: number, y: number) => void,
): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    onPoint(x, y);
    if (x === x1 && y === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function clamp255(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}
