import type { Animation, FrameRef } from '../types';

export interface FrameInfo {
  /** Declared coordinates in the packed atlas. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasInfo {
  image: string;
  width: number;
  height: number;
}

export interface ManifestAnimation {
  fps: number | null;
  loop: boolean;
  frames: Array<string | { name: string; durationMs: number }>;
}

export interface Manifest {
  version: 1;
  atlas: AtlasInfo;
  frames: Record<string, FrameInfo>;
  animations: Record<string, ManifestAnimation>;
}

export interface BuildManifestInput {
  atlas: AtlasInfo;
  /** Map from our internal frame-key (e.g. "walk_0") to its atlas coords. */
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
    const frames = a.frames;
    const uniformFps = a.fps !== 'per-frame';
    if (uniformFps) {
      animations[a.name] = {
        fps: a.fps as number,
        loop: a.loop,
        frames: frames.map((f) => input.refToKey(f)),
      };
    } else {
      // Per-frame timing: a missing durationMs would mean "instant", which
      // browsers clamp to ~100ms anyway. Default to 100ms so consumers see
      // a visible frame rather than a zero-duration one.
      animations[a.name] = {
        fps: null,
        loop: a.loop,
        frames: frames.map((f) => ({
          name: input.refToKey(f),
          durationMs: f.durationMs ?? 100,
        })),
      };
    }
  }
  return {
    version: 1,
    atlas: input.atlas,
    frames: input.frames,
    animations,
  };
}
