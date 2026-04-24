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

/**
 * Sequence sources (formerly "gif") have one bitmap per frame and no
 * sub-slicing. The slicing kind is fixed at construction time and never
 * dispatched through the slicer; `prepareSequence` produces frames directly.
 */
export interface SequenceSlicing {
  kind: 'sequence';
}

export type Slicing = GridSlicing | AutoSlicing | ManualSlicing | SequenceSlicing;

export type SourceKind = 'sheet' | 'sequence';

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
  /**
   * When present, authoritative pixel data for this source. Sheets have
   * length 1; sequences match the imported frame count. Edits land here so
   * the original `imageBytes` stays intact for provenance.
   */
  editedFrames?: import('./image').RawImage[];
  /**
   * Provenance marker. `'png'` and `'gif'` are imports; `'blank'` is a
   * source created from scratch via the New Blank dialog.
   */
  importedFrom?: 'png' | 'gif' | 'blank';
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
  version: 2;
  name: string;
  sources: Source[];
  animations: Animation[];
  /** User-curated swatches as hex strings ("#rrggbb" or "#rrggbbaa"). */
  swatches?: string[];
}

/** Phase 1 paint tools. Shape/selection tools land in Phase 2. */
export type Tool = 'pencil' | 'eraser' | 'eyedropper' | 'bucket';

/** Runtime-only derived data; never serialized. */
export interface PreparedSource {
  sourceId: Id;
  /** RawImage matches the structural subset of DOM ImageData we use. */
  frames: import('./image').RawImage[];
}
