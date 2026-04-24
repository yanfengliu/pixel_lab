import { describe, it, expect } from 'vitest';
import { compositeGifFrames, type GifFramePatch } from '../../src/core/gif';

function patchRGBA(
  r: number,
  g: number,
  b: number,
  a: number,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return out;
}

describe('compositeGifFrames', () => {
  it('returns one DecodedGifFrame per patch with centiseconds -> ms', () => {
    const frames: GifFramePatch[] = [
      {
        patch: patchRGBA(255, 0, 0, 255, 2, 2),
        dims: { left: 0, top: 0, width: 2, height: 2 },
        delay: 5,
        disposalType: 1,
      },
      {
        patch: patchRGBA(0, 255, 0, 255, 2, 2),
        dims: { left: 0, top: 0, width: 2, height: 2 },
        delay: 10,
        disposalType: 1,
      },
    ];
    const out = compositeGifFrames(frames, 2, 2);
    expect(out).toHaveLength(2);
    expect(out[0]!.delayMs).toBe(50);
    expect(out[1]!.delayMs).toBe(100);
    expect(out[0]!.image.data[0]).toBe(255); // red in frame 0
    expect(out[1]!.image.data[1]).toBe(255); // green in frame 1
  });

  it('persists pixels across frames when disposal is leave-previous', () => {
    // Frame 1 paints only top-left pixel; frame 2 paints only bottom-right.
    // With disposalType 0/1, frame 2's output must still show the top-left
    // pixel from frame 1.
    const topLeft = new Uint8ClampedArray([255, 0, 0, 255]);
    const bottomRight = new Uint8ClampedArray([0, 0, 255, 255]);
    const frames: GifFramePatch[] = [
      {
        patch: topLeft,
        dims: { left: 0, top: 0, width: 1, height: 1 },
        delay: 0,
        disposalType: 1,
      },
      {
        patch: bottomRight,
        dims: { left: 1, top: 1, width: 1, height: 1 },
        delay: 0,
        disposalType: 1,
      },
    ];
    const out = compositeGifFrames(frames, 2, 2);
    expect(out[1]!.image.data[0]).toBe(255); // top-left still red
    expect(out[1]!.image.data[(1 * 2 + 1) * 4 + 2]).toBe(255); // bottom-right blue
  });

  it('clears the region when disposalType is 2 (restore-to-background)', () => {
    const frames: GifFramePatch[] = [
      {
        patch: patchRGBA(255, 0, 0, 255, 2, 2),
        dims: { left: 0, top: 0, width: 2, height: 2 },
        delay: 0,
        disposalType: 2,
      },
      {
        patch: patchRGBA(0, 0, 0, 0, 2, 2), // fully transparent patch; blit ignored
        dims: { left: 0, top: 0, width: 2, height: 2 },
        delay: 0,
        disposalType: 1,
      },
    ];
    const out = compositeGifFrames(frames, 2, 2);
    // After frame 1 disposalType 2 the canvas is cleared, so frame 2
    // output (which doesn't paint anything opaque) is fully transparent.
    expect(out[1]!.image.data.every((b) => b === 0)).toBe(true);
  });

  it('skips transparent patch pixels rather than overwriting with zeros', () => {
    const frames: GifFramePatch[] = [
      {
        patch: patchRGBA(255, 0, 0, 255, 2, 2),
        dims: { left: 0, top: 0, width: 2, height: 2 },
        delay: 0,
        disposalType: 1,
      },
      {
        // Fully transparent patch should not clear the canvas.
        patch: patchRGBA(0, 0, 0, 0, 2, 2),
        dims: { left: 0, top: 0, width: 2, height: 2 },
        delay: 0,
        disposalType: 1,
      },
    ];
    const out = compositeGifFrames(frames, 2, 2);
    expect(out[1]!.image.data[0]).toBe(255);
  });
});
