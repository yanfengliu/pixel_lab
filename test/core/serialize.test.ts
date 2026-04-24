import { describe, it, expect } from 'vitest';
import {
  projectToJson,
  projectFromJson,
  _v1JsonForTests,
} from '../../src/core/serialize/project';
import { buildManifest } from '../../src/core/serialize/manifest';
import { bytesToBase64, base64ToBytes } from '../../src/core/serialize/base64';
import { createImage, setPixel, imagesEqual } from '../../src/core/image';
import { encodePng } from '../../src/core/png';
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
      version: 2,
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

  it('migrates v1 gif source to v2 sequence with importedFrom: "gif"', () => {
    const v1Json = _v1JsonForTests({
      name: 'hero',
      sources: [
        {
          id: 'g1',
          name: 'walk.gif',
          kind: 'gif',
          width: 4,
          height: 4,
          imageBytes: new Uint8Array([0x47, 0x49, 0x46]),
          slicing: { kind: 'gif' },
          gifFrames: [
            { index: 0, delayMs: 100 },
            { index: 1, delayMs: 80 },
          ],
        },
      ],
      animations: [],
    });
    const project = projectFromJson(v1Json);
    expect(project.version).toBe(2);
    expect(project.sources[0]!.kind).toBe('sequence');
    expect(project.sources[0]!.slicing.kind).toBe('sequence');
    expect(project.sources[0]!.importedFrom).toBe('gif');
    expect(project.sources[0]!.gifFrames).toHaveLength(2);
  });

  it('v1 sheet without editedFrames round-trips identically on re-save', () => {
    const v1Json = _v1JsonForTests({
      name: 'plain',
      sources: [
        {
          id: 's1',
          name: 'walk.png',
          kind: 'sheet',
          width: 4,
          height: 4,
          imageBytes: new Uint8Array([1, 2, 3, 4]),
          slicing: { kind: 'grid', cellW: 4, cellH: 4, offsetX: 0, offsetY: 0, rows: 1, cols: 1 },
        },
      ],
      animations: [],
    });
    const loaded = projectFromJson(v1Json);
    const v2Json = projectToJson(loaded);
    const reloaded = projectFromJson(v2Json);
    expect(reloaded.sources[0]!.imageBytes).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(reloaded.sources[0]!.kind).toBe('sheet');
    expect(reloaded.sources[0]!.editedFrames).toBeUndefined();
  });

  it('v2 round-trip preserves editedFrames pixel-equal', () => {
    const edited = createImage(8, 8);
    setPixel(edited, 1, 1, 200, 50, 25, 255);
    setPixel(edited, 7, 7, 0, 0, 0, 255);
    const project: Project = {
      version: 2,
      name: 'edited',
      sources: [
        {
          id: 's1',
          name: 'walk.png',
          kind: 'sheet',
          width: 8,
          height: 8,
          imageBytes: encodePng(createImage(8, 8)),
          slicing: { kind: 'grid', cellW: 8, cellH: 8, offsetX: 0, offsetY: 0, rows: 1, cols: 1 },
          editedFrames: [edited],
          importedFrom: 'png',
        },
      ],
      animations: [],
    };
    const json = projectToJson(project);
    const back = projectFromJson(json);
    expect(back.sources[0]!.editedFrames).toBeDefined();
    expect(back.sources[0]!.editedFrames!).toHaveLength(1);
    expect(imagesEqual(back.sources[0]!.editedFrames![0]!, edited)).toBe(true);
    expect(back.sources[0]!.importedFrom).toBe('png');
  });

  it('v2 round-trip preserves swatches', () => {
    const project: Project = {
      version: 2,
      name: 'palette',
      sources: [],
      animations: [],
      swatches: ['#ff0080', '#00ff80', '#80ff00'],
    };
    const json = projectToJson(project);
    const back = projectFromJson(json);
    expect(back.swatches).toEqual(['#ff0080', '#00ff80', '#80ff00']);
  });

  it('omits editedFrames and swatches from JSON when empty/absent', () => {
    const project: Project = {
      version: 2,
      name: 'lean',
      sources: [
        {
          id: 's1',
          name: 'walk.png',
          kind: 'sheet',
          width: 4,
          height: 4,
          imageBytes: encodePng(createImage(4, 4)),
          slicing: { kind: 'grid', cellW: 4, cellH: 4, offsetX: 0, offsetY: 0, rows: 1, cols: 1 },
        },
      ],
      animations: [],
    };
    const json = projectToJson(project);
    const parsed = JSON.parse(json);
    expect(parsed.sources[0].editedFrames).toBeUndefined();
    expect(parsed.swatches).toBeUndefined();
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
