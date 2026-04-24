import type { RawImage } from './image';
import { createImage, blit } from './image';

export interface PackInput {
  /** Caller-supplied identifier; returned verbatim in the placement. */
  id: string;
  image: RawImage;
}

export interface Placement {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PackOptions {
  /** Transparent border around every placed frame. Default 1. */
  padding?: number;
  /** Hard upper bound on atlas size (square). Default 4096. */
  maxSize?: number;
}

export interface PackResult {
  atlas: RawImage;
  placements: Placement[];
}

/**
 * MaxRects packer with best-short-side-fit heuristic. Deterministic:
 * inputs are sorted by descending max(w,h) then descending w then by id,
 * so the same inputs always pack identically.
 */
export function packFrames(
  inputs: ReadonlyArray<PackInput>,
  opts: PackOptions = {},
): PackResult {
  const padding = opts.padding ?? 1;
  const maxSize = opts.maxSize ?? 4096;

  if (inputs.length === 0) {
    return { atlas: createImage(1, 1), placements: [] };
  }

  // Deterministic ordering.
  const ordered = [...inputs].sort((a, b) => {
    const ma = Math.max(a.image.width, a.image.height);
    const mb = Math.max(b.image.width, b.image.height);
    if (ma !== mb) return mb - ma;
    if (a.image.width !== b.image.width) return b.image.width - a.image.width;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // Start size: smallest square that could fit total area with padding.
  const totalArea = ordered.reduce(
    (sum, f) =>
      sum + (f.image.width + padding * 2) * (f.image.height + padding * 2),
    0,
  );
  let size = nextPow2(Math.ceil(Math.sqrt(totalArea * 1.1)));
  // Ensure the largest single frame fits.
  for (const f of ordered) {
    const needed = Math.max(
      f.image.width + padding * 2,
      f.image.height + padding * 2,
    );
    if (size < needed) size = nextPow2(needed);
  }

  while (size <= maxSize) {
    const placed = tryPack(ordered, size, padding);
    if (placed) {
      const atlas = createImage(size, size);
      const byOrderedId = new Map(ordered.map((o) => [o.id, o]));
      for (const p of placed) {
        const f = byOrderedId.get(p.id)!;
        blit(atlas, f.image, p.x, p.y);
      }
      // Return placements in input order, not packing order.
      const byId = new Map(placed.map((p) => [p.id, p]));
      const placements = inputs.map((i) => byId.get(i.id)!);
      return { atlas, placements };
    }
    size *= 2;
  }
  throw new Error(
    `packFrames: unable to pack within ${maxSize}x${maxSize} atlas`,
  );
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function tryPack(
  items: ReadonlyArray<PackInput>,
  size: number,
  padding: number,
): Placement[] | null {
  const free: FreeRect[] = [{ x: 0, y: 0, w: size, h: size }];
  const out: Placement[] = [];

  for (const item of items) {
    const w = item.image.width + padding * 2;
    const h = item.image.height + padding * 2;
    const best = chooseRect(free, w, h);
    if (!best) return null;
    const placedX = best.x;
    const placedY = best.y;
    out.push({
      id: item.id,
      x: placedX + padding,
      y: placedY + padding,
      w: item.image.width,
      h: item.image.height,
    });
    splitFreeRects(free, { x: placedX, y: placedY, w, h });
    pruneFreeRects(free);
  }
  return out;
}

function chooseRect(free: ReadonlyArray<FreeRect>, w: number, h: number): FreeRect | null {
  let best: FreeRect | null = null;
  let bestShort = Infinity;
  let bestLong = Infinity;
  for (const r of free) {
    if (r.w < w || r.h < h) continue;
    const leftover = Math.min(r.w - w, r.h - h);
    const leftoverLong = Math.max(r.w - w, r.h - h);
    if (leftover < bestShort || (leftover === bestShort && leftoverLong < bestLong)) {
      bestShort = leftover;
      bestLong = leftoverLong;
      best = r;
    }
  }
  return best;
}

function splitFreeRects(free: FreeRect[], used: FreeRect): void {
  for (let i = free.length - 1; i >= 0; i--) {
    const r = free[i]!;
    if (
      used.x >= r.x + r.w ||
      used.x + used.w <= r.x ||
      used.y >= r.y + r.h ||
      used.y + used.h <= r.y
    ) {
      continue; // no overlap
    }
    // Split r into up to 4 new rects.
    if (used.y > r.y) {
      free.push({ x: r.x, y: r.y, w: r.w, h: used.y - r.y });
    }
    if (used.y + used.h < r.y + r.h) {
      free.push({
        x: r.x,
        y: used.y + used.h,
        w: r.w,
        h: r.y + r.h - (used.y + used.h),
      });
    }
    if (used.x > r.x) {
      free.push({ x: r.x, y: r.y, w: used.x - r.x, h: r.h });
    }
    if (used.x + used.w < r.x + r.w) {
      free.push({
        x: used.x + used.w,
        y: r.y,
        w: r.x + r.w - (used.x + used.w),
        h: r.h,
      });
    }
    free.splice(i, 1);
  }
}

function pruneFreeRects(free: FreeRect[]): void {
  for (let i = free.length - 1; i >= 0; i--) {
    for (let j = free.length - 1; j >= 0; j--) {
      if (i === j) continue;
      if (i >= free.length || j >= free.length) continue;
      if (contains(free[j]!, free[i]!)) {
        free.splice(i, 1);
        break;
      }
    }
  }
}

function contains(outer: FreeRect, inner: FreeRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}
