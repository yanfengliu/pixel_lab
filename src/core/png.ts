import { PNG } from 'pngjs/browser';
import type { RawImage } from './image';

/**
 * Encode a RawImage to PNG bytes. Uses pngjs' browser entry so the same
 * function runs under Node (via pngjs-internal Buffer polyfill) and Vite.
 */
export function encodePng(img: RawImage): Uint8Array {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  const buf = PNG.sync.write(png);
  return Uint8Array.from(buf);
}

export function decodePng(bytes: Uint8Array): RawImage {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png = PNG.sync.read(buf);
  return {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
}
