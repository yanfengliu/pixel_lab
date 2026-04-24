import { describe, it, expect } from 'vitest';
import {
  projectToJson,
  projectFromJson,
} from '../../src/core/serialize/project';
import { buildManifest } from '../../src/core/serialize/manifest';
import { bytesToBase64, base64ToBytes } from '../../src/core/serialize/base64';
import type { Project } from '../../src/core/types';

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(
      Array.from(bytes),
    );
  });
});

describe('project serialize', () => {
  it('round-trips a minimal project byte-for-byte', () => {
    const project: Project = {
      version: 1,
      name: 'hero',
      sources: [
        {
          id: 'src1',
          name: 'walk.png',
          kind: 'sheet',
          width: 32,
          height: 16,
          imageBytes: new Uint8Array([137, 80, 78, 71]),
          slicing: {
            kind: 'grid',
            cellW: 16,
            cellH: 16,
            offsetX: 0,
            offsetY: 0,
            rows: 1,
            cols: 2,
          },
        },
      ],
      animations: [
        {
          id: 'a1',
          name: 'walk',
          fps: 12,
          loop: true,
          frames: [
            { sourceId: 'src1', rectIndex: 0 },
            { sourceId: 'src1', rectIndex: 1 },
          ],
        },
      ],
    };
    const json = projectToJson(project);
    const back = projectFromJson(json);
    expect(back.name).toBe('hero');
    expect(back.sources[0]!.imageBytes).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
    expect(back.animations[0]!.frames[1]!.rectIndex).toBe(1);
  });

  it('rejects unsupported versions', () => {
    expect(() => projectFromJson('{"version":99}')).toThrow();
  });
});

describe('buildManifest', () => {
  const atlas = { image: 'atlas.png', width: 64, height: 64 };
  const frames = {
    walk_0: { x: 0, y: 0, w: 16, h: 16 },
    walk_1: { x: 16, y: 0, w: 16, h: 16 },
  };
  const refToKey = (r: { rectIndex: number }) => `walk_${r.rectIndex}`;

  it('emits string frame lists for uniform-fps animations', () => {
    const m = buildManifest({
      atlas,
      frames,
      refToKey,
      animations: [
        {
          id: 'a',
          name: 'walk',
          fps: 12,
          loop: true,
          frames: [
            { sourceId: 's', rectIndex: 0 },
            { sourceId: 's', rectIndex: 1 },
          ],
        },
      ],
    });
    expect(m.animations.walk!.fps).toBe(12);
    expect(m.animations.walk!.frames).toEqual(['walk_0', 'walk_1']);
  });

  it('emits object frame lists with durationMs for per-frame timing', () => {
    const m = buildManifest({
      atlas,
      frames,
      refToKey,
      animations: [
        {
          id: 'a',
          name: 'walk',
          fps: 'per-frame',
          loop: true,
          frames: [
            { sourceId: 's', rectIndex: 0, durationMs: 100 },
            { sourceId: 's', rectIndex: 1, durationMs: 80 },
          ],
        },
      ],
    });
    expect(m.animations.walk!.fps).toBeNull();
    expect(m.animations.walk!.frames).toEqual([
      { name: 'walk_0', durationMs: 100 },
      { name: 'walk_1', durationMs: 80 },
    ]);
  });
});
