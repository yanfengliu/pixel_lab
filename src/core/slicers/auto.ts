import type { RawImage } from '../image';
import type { AutoSlicing, Rect } from '../types';

/**
 * Two-pass bounding-box detector: label non-transparent pixels into
 * connected components using union-find over 8-neighborhood, then emit
 * one rect per component. After label collection, merges any two boxes
 * whose distance (on either axis) is <= minGapPx, which absorbs sub-pixel
 * antialias gaps in noisy sheets. Results are sorted top-to-bottom then
 * left-to-right.
 */
export function sliceAuto(img: RawImage, cfg: AutoSlicing): Rect[] {
  const { width, height } = img;
  const alphaMin = cfg.alphaThreshold;
  const parent = new Int32Array(width * height);
  for (let i = 0; i < parent.length; i++) parent[i] = -1;

  const find = (a: number): number => {
    let r = a;
    while (parent[r]! >= 0) r = parent[r]!;
    // path compression
    while (a !== r) {
      const next = parent[a]!;
      parent[a] = r;
      a = next;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const sa = -parent[ra]!;
    const sb = -parent[rb]!;
    if (sa < sb) {
      parent[rb] = -(sa + sb);
      parent[ra] = rb;
    } else {
      parent[ra] = -(sa + sb);
      parent[rb] = ra;
    }
  };

  const isOpaque = (x: number, y: number): boolean =>
    (img.data[(y * width + x) * 4 + 3] ?? 0) > alphaMin;

  // Seed: every opaque pixel is its own component (size 1).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isOpaque(x, y)) parent[y * width + x] = -1;
    }
  }

  // Union 8-neighborhood opaque pixels.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isOpaque(x, y)) continue;
      const idx = y * width + x;
      if (x > 0 && isOpaque(x - 1, y)) union(idx, idx - 1);
      if (y > 0 && isOpaque(x, y - 1)) union(idx, idx - width);
      if (x > 0 && y > 0 && isOpaque(x - 1, y - 1)) union(idx, idx - width - 1);
      if (x + 1 < width && y > 0 && isOpaque(x + 1, y - 1))
        union(idx, idx - width + 1);
    }
  }

  // Bounding box per component.
  interface Box {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }
  const boxes = new Map<number, Box>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!isOpaque(x, y)) continue;
      const root = find(idx);
      const b = boxes.get(root);
      if (!b) {
        boxes.set(root, { minX: x, minY: y, maxX: x, maxY: y });
      } else {
        if (x < b.minX) b.minX = x;
        if (y < b.minY) b.minY = y;
        if (x > b.maxX) b.maxX = x;
        if (y > b.maxY) b.maxY = y;
      }
    }
  }

  let rects = Array.from(boxes.values()).map((b) => ({
    x: b.minX,
    y: b.minY,
    w: b.maxX - b.minX + 1,
    h: b.maxY - b.minY + 1,
  }));

  // Merge boxes within minGapPx until no more merges happen.
  if (cfg.minGapPx > 0) {
    const gap = cfg.minGapPx;
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          if (rectsWithinGap(rects[i]!, rects[j]!, gap)) {
            rects[i] = unionRect(rects[i]!, rects[j]!);
            rects.splice(j, 1);
            changed = true;
            break outer;
          }
        }
      }
    }
  }

  rects.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
  return rects;
}

function rectsWithinGap(a: Rect, b: Rect, gap: number): boolean {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return dx <= gap && dy <= gap;
}

function unionRect(a: Rect, b: Rect): Rect {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
