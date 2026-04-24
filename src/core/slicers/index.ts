import type { RawImage } from '../image';
import type { Rect, Slicing } from '../types';
import { sliceGrid } from './grid';
import { sliceAuto } from './auto';
import { sliceManual } from './manual';

/**
 * Dispatcher. GIF sources declare `{kind:'gif'}` and do not use this;
 * their rects are derived from the decoded GIF frame list in `source.ts`.
 */
export function slice(img: RawImage, cfg: Slicing): Rect[] {
  switch (cfg.kind) {
    case 'grid':
      return sliceGrid(img, cfg);
    case 'auto':
      return sliceAuto(img, cfg);
    case 'manual':
      return sliceManual(cfg);
    case 'gif':
      throw new Error(
        "slice: GIF sources derive rects via prepareGif, not the slicer dispatch",
      );
  }
}

export { sliceGrid, sliceAuto, sliceManual };
