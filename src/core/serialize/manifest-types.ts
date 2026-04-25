/**
 * Output shape of pixel_lab's exported manifest.json. Pure types only —
 * zero imports — so external consumers can depend on this module without
 * pulling in pixel_lab's authoring-side types.
 */

export interface FrameInfo {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AtlasInfo {
  image: string;
  width: number;
  height: number;
}

export interface ManifestAnimation {
  loop: boolean;
  /** One entry per frame, in playback order. */
  frames: Array<{
    name: string;
    durationMs: number;
  }>;
}

export interface Manifest {
  version: 2;
  atlas: AtlasInfo;
  /** Deduped frame table; animations reference frames by name. */
  frames: Record<string, FrameInfo>;
  animations: Record<string, ManifestAnimation>;
}
