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
