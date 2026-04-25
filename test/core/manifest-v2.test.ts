import { describe, it, expect } from 'vitest';
import { buildManifest } from '../../src/core/serialize/manifest';

describe('manifest v2', () => {
  it('emits version: 2', () => {
    const m = buildManifest({
      atlas: { image: 'atlas.png', width: 16, height: 16 },
      frames: { f_0: { x: 0, y: 0, width: 4, height: 4 } },
      refToKey: () => 'f_0',
      animations: [
        {
          id: 'a',
          name: 'idle',
          fps: 10,
          loop: true,
          frames: [{ sourceId: 's', rectIndex: 0 }],
        },
      ],
    });
    expect(m.version).toBe(2);
  });

  it('converts uniform fps to per-frame durationMs (rounded)', () => {
    const m = buildManifest({
      atlas: { image: 'atlas.png', width: 16, height: 16 },
      frames: { f_0: { x: 0, y: 0, width: 4, height: 4 }, f_1: { x: 4, y: 0, width: 4, height: 4 } },
      refToKey: (r) => `f_${r.rectIndex}`,
      animations: [
        {
          id: 'a',
          name: 'walk',
          fps: 24,
          loop: true,
          frames: [
            { sourceId: 's', rectIndex: 0 },
            { sourceId: 's', rectIndex: 1 },
          ],
        },
      ],
    });
    // 1000/24 = 41.666... -> rounded to 42
    expect(m.animations.walk!.frames).toEqual([
      { name: 'f_0', durationMs: 42 },
      { name: 'f_1', durationMs: 42 },
    ]);
  });

  it('preserves per-frame durationMs verbatim for per-frame animations', () => {
    const m = buildManifest({
      atlas: { image: 'atlas.png', width: 16, height: 16 },
      frames: { f_0: { x: 0, y: 0, width: 4, height: 4 }, f_1: { x: 4, y: 0, width: 4, height: 4 } },
      refToKey: (r) => `f_${r.rectIndex}`,
      animations: [
        {
          id: 'a',
          name: 'idle',
          fps: 'per-frame',
          loop: false,
          frames: [
            { sourceId: 's', rectIndex: 0, durationMs: 250 },
            { sourceId: 's', rectIndex: 1, durationMs: 75 },
          ],
        },
      ],
    });
    expect(m.animations.idle!.frames).toEqual([
      { name: 'f_0', durationMs: 250 },
      { name: 'f_1', durationMs: 75 },
    ]);
    expect(m.animations.idle!.loop).toBe(false);
  });

  it('defaults missing per-frame durationMs to 100ms', () => {
    const m = buildManifest({
      atlas: { image: 'atlas.png', width: 16, height: 16 },
      frames: { f_0: { x: 0, y: 0, width: 4, height: 4 } },
      refToKey: () => 'f_0',
      animations: [
        {
          id: 'a',
          name: 'wave',
          fps: 'per-frame',
          loop: true,
          frames: [{ sourceId: 's', rectIndex: 0 }],
        },
      ],
    });
    expect(m.animations.wave!.frames[0]!.durationMs).toBe(100);
  });
});
