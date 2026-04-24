import type { RawImage, RGBA } from '../image';

/**
 * Eyedropper helper. Returns the RGBA tuple at (x, y), or fully
 * transparent black for out-of-bounds samples — the UI treats that as
 * "nothing to pick up".
 */
export function samplePixel(src: RawImage, x: number, y: number): RGBA {
  if (x < 0 || y < 0 || x >= src.width || y >= src.height) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const i = (y * src.width + x) * 4;
  return {
    r: src.data[i]!,
    g: src.data[i + 1]!,
    b: src.data[i + 2]!,
    a: src.data[i + 3]!,
  };
}
