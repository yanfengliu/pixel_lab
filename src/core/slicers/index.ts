import type { RawImage } from '../image';
import type { Rect, Slicing } from '../types';
import { sliceGrid } from './grid';
import { sliceAuto } from './auto';
import { sliceManual } from './manual';

/**
 * Dispatcher. Sequence sources declare `{kind:'sequence'}` and do not use
 * this dispatcher; their frames come straight from `prepareSequence`.
 */
export function slice(img: RawImage, cfg: Slicing): Rect[] {
  switch (cfg.kind) {
    case 'grid':
      return sliceGrid(img, cfg);
    case 'auto':
      return sliceAuto(img, cfg);
    case 'manual':
      return sliceManual(cfg);
    case 'sequence':
      throw new Error(
        'slice: sequence sources derive frames via prepareSequence, not the slicer dispatch',
      );
  }
}

export { sliceGrid, sliceAuto, sliceManual };
