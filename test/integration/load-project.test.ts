import { describe, it, expect, beforeEach } from 'vitest';
import { resetStore, useStore } from '../../src/ui/store';
import { createImage, setPixel } from '../../src/core/image';
import { encodePng } from '../../src/core/png';
import {
  projectFromJson,
  projectToJson,
} from '../../src/core/serialize/project';
import type { Project } from '../../src/core/types';

describe('loadProject end-to-end', () => {
  beforeEach(() => resetStore());

  it('round-trips a sheet project through JSON and rehydrates frames', () => {
    const sheet = createImage(16, 8);
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        setPixel(sheet, x, y, 255, 0, 0, 255);
        setPixel(sheet, x + 8, y, 0, 0, 255, 255);
      }
    }
    const project: Project = {
      version: 2,
      name: 'hero',
      sources: [
        {
          id: 'src1',
          name: 'walk.png',
          kind: 'sheet',
          width: 16,
          height: 8,
          imageBytes: encodePng(sheet),
          slicing: {
            kind: 'grid',
            cellW: 8,
            cellH: 8,
            offsetX: 0,
            offsetY: 0,
            rows: 1,
            cols: 2,
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
            { sourceId: 'src1', rectIndex: 0 },
            { sourceId: 'src1', rectIndex: 1 },
          ],
        },
      ],
    };
    const json = projectToJson(project);
    const reloaded = projectFromJson(json);
    useStore.getState().loadProject(reloaded);

    const state = useStore.getState();
    const prepared = state.prepared['src1'];
    expect(prepared).toBeDefined();
    expect(prepared!.frames).toHaveLength(2);
    // First cell red, second blue — confirm rehydration picked the right pixels.
    expect(prepared!.frames[0]!.data[0]).toBe(255); // red
    expect(prepared!.frames[1]!.data[2]).toBe(255); // blue
    // sheetBitmap cached so further updateSlicing calls don't redecode.
    expect(state.sheetBitmaps['src1']).toBeDefined();
  });

  it('rejects a project with wrong version', () => {
    expect(() => projectFromJson('{"version":99,"name":"x","sources":[],"animations":[]}')).toThrow(
      /unsupported version/,
    );
  });

  it('rejects malformed sources with a descriptive error', () => {
    const missingBytes = JSON.stringify({
      version: 2,
      name: 'x',
      sources: [{ id: 'a', kind: 'sheet', width: 1, height: 1, slicing: { kind: 'sequence' } }],
      animations: [],
    });
    expect(() => projectFromJson(missingBytes)).toThrow(/missing imageBase64/);

    const invalidKind = JSON.stringify({
      version: 2,
      name: 'x',
      sources: [{ id: 'a', kind: 'bogus', imageBase64: '', slicing: { kind: 'sequence' } }],
      animations: [],
    });
    expect(() => projectFromJson(invalidKind)).toThrow(/invalid kind/);
  });

  it('rejects a sequence source with no editedFrames AND empty imageBase64 (M4)', () => {
    // Without this guard, loadProject would call decodeGif(empty) and
    // throw inside parseGIF, taking down the whole UI rather than
    // surfacing a clean validation error at the boundary.
    const bad = JSON.stringify({
      version: 2,
      name: 'x',
      sources: [
        {
          id: 'a',
          name: 'a',
          kind: 'sequence',
          width: 4,
          height: 4,
          imageBase64: '',
          slicing: { kind: 'sequence' },
        },
      ],
      animations: [],
    });
    expect(() => projectFromJson(bad)).toThrow(/sequence/i);
  });

  it('accepts a sequence source with editedFrames and empty imageBase64 (blank seq)', () => {
    const frame = createImage(4, 4);
    const bytes = encodePng(frame);
    const ok = JSON.stringify({
      version: 2,
      name: 'x',
      sources: [
        {
          id: 'a',
          name: 'a',
          kind: 'sequence',
          width: 4,
          height: 4,
          imageBase64: '',
          editedFrames: [Buffer.from(bytes).toString('base64')],
          slicing: { kind: 'sequence' },
        },
      ],
      animations: [],
    });
    expect(() => projectFromJson(ok)).not.toThrow();
  });
});
