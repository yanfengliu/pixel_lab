import type { ManualSlicing, Rect } from '../types';

/**
 * Manual slicer returns the user's rects verbatim (minus labels, which
 * are consumed by animation naming rather than by pixel extraction).
 */
export function sliceManual(cfg: ManualSlicing): Rect[] {
  return cfg.rects.map(({ x, y, w, h }) => ({ x, y, w, h }));
}
