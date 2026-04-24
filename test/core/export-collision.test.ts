import { describe, it, expect } from 'vitest';
import { createImage } from '../../src/core/image';
import { buildExport } from '../../src/core/export';
import type { Project, PreparedSource } from '../../src/core/types';

/**
 * Regression test: even if sanitize() collapses two distinct animation
 * names into the same prefix, buildExport must produce unique frame keys
 * so manifest.json doesn't overwrite entries.
 *
 * "walk!" -> sanitize -> "walk_"? Actually "walk!" -> "walk_" (the "!" is
 * the only non-alphanumeric). And "walk" -> "walk". They differ. A more
 * reliable collision: "walk!" and "walk_" both sanitize to "walk_".
 */
describe('buildExport frame-key uniqueness under sanitize collapse', () => {
  it('assigns distinct keys when sanitized names collide', () => {
    const frame = (fill: number) => {
      const f = createImage(2, 2);
      for (let i = 0; i < 4; i++) {
        f.data[i * 4] = fill;
        f.data[i * 4 + 3] = 255;
      }
      return f;
    };
    const prepared: PreparedSource[] = [
      { sourceId: 'src', frames: [frame(50), frame(150)] },
    ];
    const project: Project = {
      version: 1,
      name: 'p',
      sources: [
        {
          id: 'src', name: 's.png', kind: 'sheet',
          width: 4, height: 2,
          imageBytes: new Uint8Array(),
          slicing: { kind: 'grid', cellW: 2, cellH: 2, offsetX: 0, offsetY: 0, rows: 1, cols: 2 },
        },
      ],
      // Two distinct animation names that both sanitize to "walk_"
      // (non-alnum chars map to underscore): "walk!" and "walk_".
      // Without the dedup fix in buildExport, the two "walk__0" keys
      // would collide.
      animations: [
        { id: 'a1', name: 'walk!', fps: 12, loop: true, frames: [{ sourceId: 'src', rectIndex: 0 }] },
        { id: 'a2', name: 'walk_', fps: 12, loop: true, frames: [{ sourceId: 'src', rectIndex: 1 }] },
      ],
    };
    const bundle = buildExport(project, prepared);
    // Each animation must reference a distinct frame key, and the
    // manifest.frames map must contain a coord for each.
    const animA = bundle.manifest.animations['walk!']!.frames as string[];
    const animB = bundle.manifest.animations['walk_']!.frames as string[];
    expect(animA[0]).not.toEqual(animB[0]);
    expect(bundle.manifest.frames[animA[0]!]).toBeDefined();
    expect(bundle.manifest.frames[animB[0]!]).toBeDefined();
  });
});
