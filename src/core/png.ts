import { PNG } from 'pngjs/browser';
import { Buffer } from 'buffer';
import type { RawImage } from './image';

/**
 * PNG encode/decode. Uses pngjs/browser with an explicit `buffer` package
 * import so the code runs identically under Node (vitest) and in the Vite
 * production bundle. Native Node Buffer cannot be assumed in the browser,
 * so we always go through the shim.
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
