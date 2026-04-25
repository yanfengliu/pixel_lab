import { describe, it, expect } from 'vitest';
import { createImage } from '../../src/core/image';
import { buildExport } from '../../src/core/export';
import { decodePng } from '../../src/core/png';
import type { Project, PreparedSource } from '../../src/core/types';

function framesForSheet(count = 2) {
  const frames: ReturnType<typeof createImage>[] = [];
  for (let i = 0; i < count; i++) {
    const f = createImage(4, 4);
    for (let p = 0; p < 4 * 4; p++) {
      f.data[p * 4] = i * 30;
      f.data[p * 4 + 3] = 255;
    }
    frames.push(f);
  }
  return frames;
}

describe('buildExport', () => {
  const prepared: PreparedSource[] = [
    { sourceId: 'src', frames: framesForSheet(3) },
  ];
  const project: Project = {
    version: 2,
    name: 'hero',
    sources: [
      {
        id: 'src',
        name: 'walk.png',
        kind: 'sheet',
        width: 16,
        height: 4,
        imageBytes: new Uint8Array(),
        slicing: {
          kind: 'grid',
          cellW: 4,
          cellH: 4,
          offsetX: 0,
          offsetY: 0,
          rows: 1,
          cols: 3,
        },
      },
    ],
    animations: [
      {
        id: 'a',
        name: 'walk',
        fps: 12,
        loop: true,
        frames: [
          { sourceId: 'src', rectIndex: 0 },
          { sourceId: 'src', rectIndex: 1 },
          { sourceId: 'src', rectIndex: 2 },
          { sourceId: 'src', rectIndex: 0 }, // repeated frame
        ],
      },
    ],
  };

  it('emits atlas.png and manifest.json', () => {
    const bundle = buildExport(project, prepared);
    expect(bundle.files['atlas.png']).toBeInstanceOf(Uint8Array);
    expect(bundle.files['manifest.json']).toBeInstanceOf(Uint8Array);
  });

  it('atlas.png decodes to a valid image containing all unique frames', () => {
    const bundle = buildExport(project, prepared);
    const atlas = decodePng(bundle.files['atlas.png']!);
    expect(atlas.width).toBeGreaterThan(0);
    expect(atlas.height).toBeGreaterThan(0);
    // All unique frames reference distinct atlas coords.
    const m = bundle.manifest;
    expect(Object.keys(m.frames).length).toBe(3); // deduped
  });

  it('manifest animation lists frames with names + per-frame durationMs', () => {
    const bundle = buildExport(project, prepared);
    const anim = bundle.manifest.animations.walk!;
    expect(anim.loop).toBe(true);
    // fps: 12 -> 1000/12 = 83.33 -> rounded to 83 ms
    expect(anim.frames).toEqual([
      { name: 'walk_0', durationMs: 83 },
      { name: 'walk_1', durationMs: 83 },
      { name: 'walk_2', durationMs: 83 },
      { name: 'walk_0', durationMs: 83 },
    ]);
  });

  it('omits frames/ output by default, includes when emitPerFrame=true', () => {
    const base = buildExport(project, prepared);
    expect(Object.keys(base.files).some((k) => k.startsWith('frames/'))).toBe(false);
    const withFrames = buildExport(project, prepared, { emitPerFrame: true });
    const frameFiles = Object.keys(withFrames.files).filter((k) =>
      k.startsWith('frames/'),
    );
    expect(frameFiles.length).toBe(3);
  });

  it('manifest is v2 and has no fps field on animations', () => {
    const bundle = buildExport(project, prepared);
    expect(bundle.manifest.version).toBe(2);
    expect((bundle.manifest.animations.walk as unknown as Record<string, unknown>).fps).toBeUndefined();
  });

  it('packs per-frame timing animations with durationMs preserved per frame', () => {
    const perFrame: Project = {
      ...project,
      animations: [
        {
          id: 'a',
          name: 'walk',
          fps: 'per-frame',
          loop: true,
          frames: [
            { sourceId: 'src', rectIndex: 0, durationMs: 100 },
            { sourceId: 'src', rectIndex: 1, durationMs: 50 },
          ],
        },
      ],
    };
    const bundle = buildExport(perFrame, prepared);
    const anim = bundle.manifest.animations.walk!;
    expect(anim.frames).toEqual([
      { name: 'walk_0', durationMs: 100 },
      { name: 'walk_1', durationMs: 50 },
    ]);
  });
});
