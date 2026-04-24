import type { RawImage } from '../image';
import { stampDot, type Brush } from './brush';

/**
 * Bresenham line stamped with the given brush at each integer step. Brush
 * size and opacity propagate via `stampDot`. Zero-length inputs paint a
 * single dot at (x0, y0).
 */
export function drawLine(
  dst: RawImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brush: Brush,
): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    stampDot(dst, x, y, brush);
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

/**
 * Axis-aligned rectangle outline at brush thickness. The endpoints mark
 * opposite corners; either order is accepted. A degenerate (zero-width
 * or zero-height) rect collapses to a single brush-stamped line.
 */
export function drawRectOutline(
  dst: RawImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brush: Brush,
): void {
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1);
  const yMin = Math.min(y0, y1);
  const yMax = Math.max(y0, y1);
  // Four edges via drawLine so brush size/opacity propagate naturally.
  drawLine(dst, xMin, yMin, xMax, yMin, brush); // top
  drawLine(dst, xMin, yMax, xMax, yMax, brush); // bottom
  drawLine(dst, xMin, yMin, xMin, yMax, brush); // left
  drawLine(dst, xMax, yMin, xMax, yMax, brush); // right
}

/**
 * Axis-aligned rectangle filled with the brush color. Opacity is
 * applied pixel-by-pixel via `stampDot` with size=1; brush thickness
 * does not inflate a filled rect (the shape itself already covers).
 */
export function drawRectFilled(
  dst: RawImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brush: Brush,
): void {
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1);
  const yMin = Math.min(y0, y1);
  const yMax = Math.max(y0, y1);
  const pointBrush: Brush = { ...brush, size: 1 };
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      stampDot(dst, x, y, pointBrush);
    }
  }
}

/**
 * Midpoint ellipse inscribed in the axis-aligned bbox defined by
 * (x0,y0)–(x1,y1). Outline uses `stampDot` so brush size propagates.
 *
 * For odd-width/height bboxes (even "diameter" in pixel units) we paint
 * the four octant mirrors centered on the integer bbox midpoint; for
 * even-width/height bboxes the center sits between pixels and we mirror
 * about the two center columns/rows simultaneously.
 */
export function drawEllipseOutline(
  dst: RawImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brush: Brush,
): void {
  plotEllipse(x0, y0, x1, y1, (x, y) => stampDot(dst, x, y, brush));
}

/**
 * Filled ellipse: for each scanline inside the bbox, paint every pixel
 * between the leftmost and rightmost outline points. Opacity is honored
 * via `stampDot` with size=1.
 */
export function drawEllipseFilled(
  dst: RawImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brush: Brush,
): void {
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1);
  const yMin = Math.min(y0, y1);
  const yMax = Math.max(y0, y1);
  // Collect per-row extents from the outline plotter, then fill them.
  const rowMin: number[] = new Array(yMax - yMin + 1).fill(Number.POSITIVE_INFINITY);
  const rowMax: number[] = new Array(yMax - yMin + 1).fill(Number.NEGATIVE_INFINITY);
  plotEllipse(x0, y0, x1, y1, (x, y) => {
    const i = y - yMin;
    if (i < 0 || i >= rowMin.length) return;
    if (x < rowMin[i]!) rowMin[i] = x;
    if (x > rowMax[i]!) rowMax[i] = x;
  });
  const pointBrush: Brush = { ...brush, size: 1 };
  for (let i = 0; i < rowMin.length; i++) {
    const lo = rowMin[i]!;
    const hi = rowMax[i]!;
    if (lo > hi) continue;
    const y = yMin + i;
    const clampedLo = Math.max(xMin, lo);
    const clampedHi = Math.min(xMax, hi);
    for (let x = clampedLo; x <= clampedHi; x++) {
      stampDot(dst, x, y, pointBrush);
    }
  }
}

/**
 * Midpoint-ellipse rasterizer. Emits one onPoint call per outline pixel.
 * Supports arbitrary integer bboxes including odd/even diameters and
 * reversed endpoints.
 *
 * Implementation: we work in a "half-integer" coordinate system centered
 * on the bbox midpoint so even-diameter ellipses mirror cleanly across
 * two center pixels.
 */
function plotEllipse(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  onPoint: (x: number, y: number) => void,
): void {
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1);
  const yMin = Math.min(y0, y1);
  const yMax = Math.max(y0, y1);
  const w = xMax - xMin;
  const h = yMax - yMin;
  if (w === 0 && h === 0) {
    onPoint(xMin, yMin);
    return;
  }
  // Zingl's rasterAlgorithms "plotEllipseRect" — handles both
  // even- and odd-diameter boxes naturally by operating on the two
  // extreme pixel positions and stepping inward.
  let a = w;
  let b = h;
  let b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  let xL = xMin;
  let xR = xMax;
  let yT = yMin + ((h + 1) >> 1);
  let yB = yT - b1;
  const a2 = 8 * a * a;
  const b2 = 8 * b * b;
  do {
    onPoint(xR, yT);
    onPoint(xL, yT);
    onPoint(xL, yB);
    onPoint(xR, yB);
    const e2 = 2 * err;
    if (e2 <= dy) {
      yT++;
      yB--;
      err += dy += a2;
    }
    if (e2 >= dx || 2 * err > dy) {
      xL++;
      xR--;
      err += dx += b2;
    }
  } while (xL <= xR);
  // Ends: close the top/bottom caps for very flat ellipses where the
  // loop terminated before reaching them.
  while (yT - yB < b) {
    onPoint(xL - 1, yT);
    onPoint(xR + 1, yT);
    yT++;
    onPoint(xL - 1, yB);
    onPoint(xR + 1, yB);
    yB--;
  }
}
