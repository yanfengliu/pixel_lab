import type { PreparedSource, Source } from './types';
import type { RawImage } from './image';
import { crop } from './image';
import { slice } from './slicers';

/**
 * Turns a `Source` + its decoded bitmap(s) into a uniform array of
 * ImageData frames that downstream preview/export can treat identically
 * across sheet and gif sources.
 */
export function prepareSheet(source: Source, sheet: RawImage): PreparedSource {
  if (source.kind !== 'sheet') {
    throw new Error('prepareSheet: source is not a sheet');
  }
  const rects = slice(sheet, source.slicing);
  return {
    sourceId: source.id,
    frames: rects.map((r) => crop(sheet, r)),
  };
}

export function prepareGif(
  source: Source,
  decoded: ReadonlyArray<RawImage>,
): PreparedSource {
  if (source.kind !== 'gif') {
    throw new Error('prepareGif: source is not a gif');
  }
  return {
    sourceId: source.id,
    frames: decoded.map((img) => ({
      width: img.width,
      height: img.height,
      data: new Uint8ClampedArray(img.data),
    })),
  };
}
