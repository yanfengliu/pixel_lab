import { describe, it, expect } from 'vitest';
import { buildManifest } from '../../src/core/serialize/manifest';

describe('buildManifest duplicate animation name guard', () => {
  it('throws when two animations share the same name', () => {
    const refToKey = (r: { rectIndex: number }) => `f_${r.rectIndex}`;
    const animations = [
      { id: 'a1', name: 'walk', fps: 12, loop: true,
        frames: [{ sourceId: 's', rectIndex: 0 }] },
      { id: 'a2', name: 'walk', fps: 12, loop: true,
        frames: [{ sourceId: 's', rectIndex: 1 }] },
    ];
    expect(() =>
      buildManifest({
        atlas: { image: 'atlas.png', width: 32, height: 32 },
        frames: { f_0: { x: 0, y: 0, w: 4, h: 4 }, f_1: { x: 4, y: 0, w: 4, h: 4 } },
        refToKey,
        animations,
      }),
    ).toThrow(/duplicate animation name/);
  });
});
