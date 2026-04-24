import { parseGIF, decompressFrames } from 'gifuct-js';
import type { RawImage } from './image';
import { createImage } from './image';

export interface DecodedGifFrame {
  image: RawImage;
  delayMs: number;
}

/**
 * Minimal shape of a gifuct-js decompressed frame (what we rely on).
 * Using our own interface keeps the adapter-boundary tests free of a
 * hard dep on gifuct-js internals.
 */
export interface GifFramePatch {
  patch: Uint8ClampedArray;
  dims: { left: number; top: number; width: number; height: number };
  /** Centiseconds as gifuct-js returns them. */
  delay: number;
  disposalType: number;
}

export function compositeGifFrames(
  frames: ReadonlyArray<GifFramePatch>,
  screenWidth: number,
  screenHeight: number,
): DecodedGifFrame[] {
  const canvas = createImage(screenWidth, screenHeight);
  const out: DecodedGifFrame[] = [];

  for (const f of frames) {
    // disposalType 3 means "restore to the canvas state **before** this
    // frame was drawn." Snapshot now so we can restore later without
    // paying the snapshot cost for the far-more-common 0/1/2 cases.
    const snapshot =
      f.disposalType === 3
        ? new Uint8ClampedArray(canvas.data)
        : null;

    blitPatch(canvas, f.patch, f.dims.left, f.dims.top, f.dims.width, f.dims.height);
    out.push({
      image: cloneImage(canvas),
      delayMs: gifDelayToMs(f.delay),
    });

    if (f.disposalType === 2) {
      clearRect(canvas, f.dims.left, f.dims.top, f.dims.width, f.dims.height);
    } else if (f.disposalType === 3 && snapshot) {
      canvas.data.set(snapshot);
    }
  }
  return out;
}

/**
 * GIF delay is in centiseconds. Browsers normalize 0 -> ~100ms because a
 * 0-delay frame would otherwise run at uncontrolled speed. We mirror that
 * convention so the in-tool preview matches how users see the GIF
 * elsewhere.
 */
function gifDelayToMs(delayCs: number): number {
  const ms = Math.max(0, (delayCs | 0) * 10);
  return ms === 0 ? 100 : ms;
}

export function decodeGif(bytes: Uint8Array): DecodedGifFrame[] {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const gif = parseGIF(buffer);
  const frames = decompressFrames(gif, true) as unknown as GifFramePatch[];
  return compositeGifFrames(frames, gif.lsd.width, gif.lsd.height);
}

function blitPatch(
  dst: RawImage,
  patch: Uint8ClampedArray,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  for (let row = 0; row < height; row++) {
    const srcStart = row * width * 4;
    const dstStart = ((top + row) * dst.width + left) * 4;
    for (let i = 0; i < width * 4; i += 4) {
      const a = patch[srcStart + i + 3]!;
      if (a === 0) continue;
      dst.data[dstStart + i] = patch[srcStart + i]!;
      dst.data[dstStart + i + 1] = patch[srcStart + i + 1]!;
      dst.data[dstStart + i + 2] = patch[srcStart + i + 2]!;
      dst.data[dstStart + i + 3] = a;
    }
  }
}

function clearRect(
  dst: RawImage,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  for (let row = 0; row < height; row++) {
    const start = ((top + row) * dst.width + left) * 4;
    dst.data.fill(0, start, start + width * 4);
  }
}

function cloneImage(img: RawImage): RawImage {
  return {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.data),
  };
}
