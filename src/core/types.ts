export type Id = string;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridSlicing {
  kind: 'grid';
  cellW: number;
  cellH: number;
  offsetX: number;
  offsetY: number;
  rows: number;
  cols: number;
}

export interface AutoSlicing {
  kind: 'auto';
  minGapPx: number;
  alphaThreshold: number;
}

export interface ManualSlicing {
  kind: 'manual';
  rects: Array<Rect & { label?: string }>;
}

export interface GifSlicing {
  kind: 'gif';
}

export type Slicing = GridSlicing | AutoSlicing | ManualSlicing | GifSlicing;

export type SourceKind = 'sheet' | 'gif';

export interface GifFrameMeta {
  index: number;
  delayMs: number;
}

export interface Source {
  id: Id;
  name: string;
  kind: SourceKind;
  width: number;
  height: number;
  slicing: Slicing;
  /** PNG / GIF source bytes (what was imported verbatim). */
  imageBytes: Uint8Array;
  /** GIF-only: per-frame delay metadata parsed from the source. */
  gifFrames?: GifFrameMeta[];
}

export interface FrameRef {
  sourceId: Id;
  rectIndex: number;
  /** Per-frame duration override, ms. If absent, animation's fps applies. */
  durationMs?: number;
}

export interface Animation {
  id: Id;
  name: string;
  /** Uniform fps across frames, or 'per-frame' to use FrameRef.durationMs. */
  fps: number | 'per-frame';
  loop: boolean;
  frames: FrameRef[];
}

export interface Project {
  version: 1;
  name: string;
  sources: Source[];
  animations: Animation[];
}

/** Runtime-only derived data; never serialized. */
export interface PreparedSource {
  sourceId: Id;
  /** RawImage matches the structural subset of DOM ImageData we use. */
  frames: import('./image').RawImage[];
}
