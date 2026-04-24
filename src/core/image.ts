import type { Rect } from './types';

/**
 * ImageData shim: the DOM `ImageData` class is not present under Node/vitest.
 * We accept any object with the same structural contract throughout `core/`.
 */
export interface RawImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function createImage(width: number, height: number): RawImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function setPixel(
  img: RawImage,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const i = (y * img.width + x) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = a;
}

export function getAlpha(img: RawImage, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3] ?? 0;
}

export function crop(src: RawImage, rect: Rect): RawImage {
  const { x, y, w, h } = rect;
  if (x < 0 || y < 0 || x + w > src.width || y + h > src.height) {
    throw new Error(
      `crop: rect ${JSON.stringify(rect)} outside ${src.width}x${src.height}`,
    );
  }
  const out = createImage(w, h);
  for (let row = 0; row < h; row++) {
    const srcStart = ((y + row) * src.width + x) * 4;
    const dstStart = row * w * 4;
    out.data.set(src.data.subarray(srcStart, srcStart + w * 4), dstStart);
  }
  return out;
}

export function blit(
  dst: RawImage,
  src: RawImage,
  dx: number,
  dy: number,
): void {
  if (
    dx < 0 ||
    dy < 0 ||
    dx + src.width > dst.width ||
    dy + src.height > dst.height
  ) {
    throw new Error('blit: src does not fit into dst');
  }
  for (let row = 0; row < src.height; row++) {
    const srcStart = row * src.width * 4;
    const dstStart = ((dy + row) * dst.width + dx) * 4;
    dst.data.set(src.data.subarray(srcStart, srcStart + src.width * 4), dstStart);
  }
}

export function isCellFullyTransparent(img: RawImage, rect: Rect): boolean {
  const { x, y, w, h } = rect;
  const maxX = Math.min(x + w, img.width);
  const maxY = Math.min(y + h, img.height);
  for (let yy = Math.max(0, y); yy < maxY; yy++) {
    for (let xx = Math.max(0, x); xx < maxX; xx++) {
      if (img.data[(yy * img.width + xx) * 4 + 3]! > 0) return false;
    }
  }
  return true;
}

export function imagesEqual(a: RawImage, b: RawImage): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  if (a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) return false;
  }
  return true;
}
