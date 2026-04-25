import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetStore, useStore } from '../../src/ui/store';
import { createImage } from '../../src/core/image';
import {
  projectFromJson,
  projectToJson,
} from '../../src/core/serialize/project';
import type { Project } from '../../src/core/types';

/**
 * M10: integration coverage for the imported-GIF reload path.
 *
 * When a user imports a GIF and saves the project before painting on it,
 * `Source.editedFrames` is absent, so the JSON ships only the original GIF
 * bytes in `imageBase64`. On reload, `loadProject`'s sequence branch falls
 * into `decodeGif(imageBytes).map(...)` to rehydrate frames. The previous
 * test suite saved a sequence source with empty mock bytes and an
 * `editedFrames` array so this branch was never exercised, leaving any
 * regression in `decodeGif` / `prepareSequence` interaction silent until
 * production. We mock `decodeGif` so we don't have to hand-encode an LZW
 * GIF stream here — the goal is to verify call shape and frame count flow
 * through the rehydrate path, not to re-test gifuct-js.
 */

vi.mock('../../src/core/gif', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    decodeGif: vi.fn((bytes: Uint8Array) => {
      // Sanity-check the call sees the bytes we round-tripped.
      if (bytes.length === 0) {
        throw new Error('mock decodeGif: empty bytes (regression in reload path)');
      }
      // Two synthetic frames at the source's declared size.
      return [
        { image: createImage(4, 4), delayMs: 100 },
        { image: createImage(4, 4), delayMs: 80 },
      ];
    }),
  };
});

describe('imported-GIF reload (M10)', () => {
  beforeEach(() => resetStore());

  it('rehydrates a sequence source via decodeGif when editedFrames is absent', () => {
    // The sentinel bytes start with a real "GIF89a" signature so
    // detectFormat would still recognize them in the import flow; the
    // mock above ignores the actual content.
    const sentinel = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x04, 0x00, 0x04, 0x00,
    ]);
    const project: Project = {
      version: 2,
      name: 'gif-roundtrip',
      sources: [
        {
          id: 'g1',
          name: 'walk.gif',
          kind: 'sequence',
          width: 4,
          height: 4,
          imageBytes: sentinel,
          slicing: { kind: 'sequence' },
          importedFrom: 'gif',
          gifFrames: [
            { index: 0, delayMs: 100 },
            { index: 1, delayMs: 80 },
          ],
        },
      ],
      animations: [],
    };

    // Round-trip through JSON to mirror the actual save-reload sequence.
    // projectToJson must NOT inject editedFrames here, otherwise the test
    // wouldn't exercise the decodeGif branch.
    const json = projectToJson(project);
    expect(json).not.toMatch(/"editedFrames"/);
    const reloaded = projectFromJson(json);
    useStore.getState().loadProject(reloaded);

    const prepared = useStore.getState().prepared['g1'];
    expect(prepared).toBeDefined();
    expect(prepared!.frames).toHaveLength(2);
    expect(prepared!.frames[0]!.width).toBe(4);
    expect(prepared!.frames[0]!.height).toBe(4);
  });

  it('rehydrate prefers editedFrames over decodeGif when both are present', () => {
    // Once the user paints on an imported GIF, editedFrames becomes the
    // authoritative pixel source and decodeGif is bypassed. Confirms the
    // KAD-007 invariant survives the reload path.
    const editedFrame = createImage(4, 4);
    // Mark the edited frame with a non-zero pixel so we can tell it apart
    // from the mock-decodeGif output (which is fully transparent).
    editedFrame.data[0] = 99;
    editedFrame.data[3] = 255;
    useStore.getState().loadProject({
      version: 2,
      name: 'edited-gif',
      sources: [
        {
          id: 'g2',
          name: 'walk.gif',
          kind: 'sequence',
          width: 4,
          height: 4,
          imageBytes: new Uint8Array([0x47, 0x49, 0x46]),
          slicing: { kind: 'sequence' },
          importedFrom: 'gif',
          editedFrames: [editedFrame],
        },
      ],
      animations: [],
    });
    const prepared = useStore.getState().prepared['g2'];
    expect(prepared!.frames).toHaveLength(1);
    expect(prepared!.frames[0]!.data[0]).toBe(99);
  });
});
