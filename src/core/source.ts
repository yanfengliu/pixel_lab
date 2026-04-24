import type { PreparedSource, Source } from './types';
import type { RawImage } from './image';
import { crop } from './image';
import { slice } from './slicers';

/**
 * Turns a `Source` + its decoded bitmap(s) into a uniform array of
 * ImageData frames that downstream preview/export can treat identically
 * across sheet and sequence sources.
 *
 * If `source.editedFrames[0]` is present, use it as the bitmap before
 * slicing. The original `imageBytes`-decoded `sheet` is ignored in that
 * case so paint edits become authoritative.
 */
export function prepareSheet(source: Source, sheet: RawImage): PreparedSource {
  if (source.kind !== 'sheet') {
    throw new Error('prepareSheet: source is not a sheet');
  }
  const bitmap = source.editedFrames?.[0] ?? sheet;
  const rects = slice(bitmap, source.slicing);
  return {
    sourceId: source.id,
    frames: rects.map((r) => crop(bitmap, r)),
  };
}

/**
 * Sequence variant. When `source.editedFrames` is present it is the
 * authoritative pixel data and `decoded` is ignored.
 */
export function prepareSequence(
  source: Source,
  decoded: ReadonlyArray<RawImage>,
): PreparedSource {
  if (source.kind !== 'sequence') {
    throw new Error('prepareSequence: source is not a sequence');
  }
  const frames = source.editedFrames ?? decoded;
  return {
    sourceId: source.id,
    frames: frames.map((img) => ({
      width: img.width,
      height: img.height,
      data: new Uint8ClampedArray(img.data),
    })),
  };
}
