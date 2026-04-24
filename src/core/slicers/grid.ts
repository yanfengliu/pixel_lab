import type { RawImage } from '../image';
import { isCellFullyTransparent } from '../image';
import type { GridSlicing, Rect } from '../types';

/**
 * Produce rects by walking a uniform grid. Cells whose pixels are all
 * fully transparent are skipped so half-empty sheets don't yield phantom
 * frames. Cells that would run off the image edge are also skipped.
 */
export function sliceGrid(img: RawImage, cfg: GridSlicing): Rect[] {
  if (cfg.cellW <= 0 || cfg.cellH <= 0) {
    throw new Error('sliceGrid: cellW and cellH must be positive');
  }
  if (cfg.rows < 0 || cfg.cols < 0) {
    throw new Error('sliceGrid: rows and cols must be non-negative');
  }
  const rects: Rect[] = [];
  for (let row = 0; row < cfg.rows; row++) {
    for (let col = 0; col < cfg.cols; col++) {
      const rect: Rect = {
        x: cfg.offsetX + col * cfg.cellW,
        y: cfg.offsetY + row * cfg.cellH,
        w: cfg.cellW,
        h: cfg.cellH,
      };
      if (rect.x + rect.w > img.width || rect.y + rect.h > img.height) continue;
      if (isCellFullyTransparent(img, rect)) continue;
      rects.push(rect);
    }
  }
  return rects;
}
