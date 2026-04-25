import type { Animation, FrameRef } from '../types';
import type {
  AtlasInfo,
  FrameInfo,
  Manifest,
  ManifestAnimation,
} from './manifest-types';

export type { AtlasInfo, FrameInfo, Manifest, ManifestAnimation };

export interface BuildManifestInput {
  atlas: AtlasInfo;
  /** Map from frame-key (e.g. "walk_0") to its atlas coords. */
  frames: Record<string, FrameInfo>;
  animations: Animation[];
  /** Given a FrameRef, return the frame-key it resolves to in `frames`. */
  refToKey: (ref: FrameRef) => string;
}

export function buildManifest(input: BuildManifestInput): Manifest {
  const animations: Record<string, ManifestAnimation> = {};
  const seen = new Set<string>();
  for (const a of input.animations) {
    if (seen.has(a.name)) {
      throw new Error(
        `buildManifest: duplicate animation name "${a.name}" would overwrite in manifest.json; rename before export`,
      );
    }
    seen.add(a.name);

    const frames = a.frames.map((f) => {
      const name = input.refToKey(f);
      const durationMs =
        a.fps === 'per-frame'
          ? (f.durationMs ?? 100)
          : Math.round(1000 / (a.fps as number));
      return { name, durationMs };
    });

    animations[a.name] = { loop: a.loop, frames };
  }
  return {
    version: 2,
    atlas: input.atlas,
    frames: input.frames,
    animations,
  };
}
