import { create } from 'zustand';
import type {
  Animation,
  FrameRef,
  Id,
  PreparedSource,
  Project,
  Slicing,
  Source,
  Tool,
} from '../core/types';
import { newId } from '../core/ids';
import { prepareSheet, prepareSequence } from '../core/source';
import { decodePng } from '../core/png';
import { decodeGif } from '../core/gif';
import { createImage, type RawImage, type RGBA } from '../core/image';
import {
  computeDelta,
  redoDelta,
  undoDelta,
  type Selection,
  type StrokeDelta,
} from '../core/drawing';
import type { DecodedImport } from '../io/file';

export interface CreateBlankSourceArgs {
  kind: 'sheet' | 'sequence';
  name: string;
  width: number;
  height: number;
  /** Sequence-only. Defaults to 1. */
  frameCount?: number;
}

export interface StoreState {
  project: Project;
  prepared: Record<Id, PreparedSource>;
  /**
   * Sheet-only: decoded full-size bitmap kept in memory so that changing
   * slicing re-crops without re-decoding the PNG bytes. Sequence sources
   * keep their decoded per-frame bitmaps inside `prepared[id].frames`
   * and don't need an entry here.
   */
  sheetBitmaps: Record<Id, RawImage>;
  selectedSourceId: Id | null;
  selectedAnimationId: Id | null;

  // Drawing state.
  activeTool: Tool;
  primaryColor: RGBA;
  secondaryColor: RGBA;
  /** 0..1, applied to drawing tools when blending. */
  opacity: number;
  /** 1..8, square brush side length. */
  brushSize: number;
  /** Per-source: which frame is being edited / previewed. */
  selectedFrameIndex: Record<Id, number>;
  /** Per-source undo/redo stacks. Session-only; not serialized. */
  undoStacks: Record<Id, StrokeDelta[]>;
  redoStacks: Record<Id, StrokeDelta[]>;
  /**
   * Per-source monotonic counter bumped on every in-place pixel mutation
   * that doesn't change a RawImage reference (stroke commits, undo,
   * redo). React effects that render these bitmaps to DOM canvases key
   * on this counter so they refresh even when the RawImage identity
   * didn't change. Session-only; not serialized.
   */
  renderCounters: Record<Id, number>;

  /**
   * Current marquee selection, if any. Selection is per-frame, not
   * persisted, and wiped on frame switch (see `setSelectedFrameIndex`).
   */
  selection: { sourceId: Id; frameIndex: number; sel: Selection } | null;

  /**
   * Global onion-skin toggle. When true, the Canvas renders the previous
   * frame of a sequence source at reduced alpha underneath the current
   * frame (Aseprite-style). No-op for sheet sources — they have no
   * "previous frame" in the sequence sense.
   */
  onionSkin: boolean;

  // Actions
  newProject: (name: string) => void;
  loadProject: (project: Project) => void;
  addSource: (name: string, imported: DecodedImport) => Source;
  removeSource: (id: Id) => void;
  updateSlicing: (id: Id, slicing: Slicing) => void;
  selectSource: (id: Id | null) => void;
  createBlankSource: (args: CreateBlankSourceArgs) => Source;

  addAnimation: (name: string) => Animation;
  removeAnimation: (id: Id) => void;
  renameAnimation: (id: Id, name: string) => void;
  setAnimationFps: (id: Id, fps: number | 'per-frame') => void;
  setAnimationLoop: (id: Id, loop: boolean) => void;
  selectAnimation: (id: Id | null) => void;

  renameProject: (name: string) => void;

  appendFrames: (animationId: Id, refs: FrameRef[]) => void;
  removeFrameAt: (animationId: Id, index: number) => void;
  reorderFrame: (animationId: Id, from: number, to: number) => void;

  // Tools / colors.
  setActiveTool: (tool: Tool) => void;
  setPrimaryColor: (c: RGBA) => void;
  setSecondaryColor: (c: RGBA) => void;
  swapColors: () => void;
  setOpacity: (n: number) => void;
  setBrushSize: (n: number) => void;
  addSwatch: (hex: string) => void;
  removeSwatch: (hex: string) => void;
  moveSwatch: (from: number, to: number) => void;

  // Frame selection.
  setSelectedFrameIndex: (sourceId: Id, index: number) => void;

  // Marquee selection.
  setSelection: (
    sel: { sourceId: Id; frameIndex: number; sel: Selection } | null,
  ) => void;
  clearSelection: () => void;

  // Onion skin.
  setOnionSkin: (b: boolean) => void;

  // Undo/redo. `beginStroke` returns a closure that, when called,
  // computes a delta from the snapshot+current frame and pushes it
  // into the undo stack (clearing redo). Caller is expected to mutate
  // the prepared frame's pixels between begin and commit.
  beginStroke: (sourceId: Id, frameIndex: number) => () => void;
  undo: (sourceId: Id) => void;
  redo: (sourceId: Id) => void;
}

function emptyProject(name: string): Project {
  return { version: 2, name, sources: [], animations: [] };
}

const DEFAULT_PRIMARY: RGBA = { r: 0, g: 0, b: 0, a: 255 };
const DEFAULT_SECONDARY: RGBA = { r: 255, g: 255, b: 255, a: 255 };

/**
 * Keep animation names unique across a project. Manifest.json keys
 * animations by name and a duplicate would silently overwrite on export,
 * so we enforce uniqueness at the input boundary. If `name` clashes, we
 * append ` (2)`, ` (3)`, ... until unique.
 */
function ensureUniqueName(name: string, taken: ReadonlyArray<string>): string {
  const set = new Set(taken);
  if (!set.has(name)) return name;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${name} (${i})`;
    if (!set.has(candidate)) return candidate;
  }
  throw new Error('ensureUniqueName: ran out of disambiguating suffixes');
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function clampBrushSize(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const i = Math.floor(n);
  return i < 1 ? 1 : i > 8 ? 8 : i;
}
function normalizeHex(hex: string): string {
  return hex.toLowerCase();
}

export const useStore = create<StoreState>((set) => ({
  project: emptyProject('untitled'),
  prepared: {},
  sheetBitmaps: {},
  selectedSourceId: null,
  selectedAnimationId: null,
  activeTool: 'pencil',
  primaryColor: DEFAULT_PRIMARY,
  secondaryColor: DEFAULT_SECONDARY,
  opacity: 1,
  brushSize: 1,
  selectedFrameIndex: {},
  undoStacks: {},
  redoStacks: {},
  renderCounters: {},
  selection: null,
  onionSkin: false,

  newProject: (name) =>
    set({
      project: emptyProject(name),
      prepared: {},
      sheetBitmaps: {},
      selectedSourceId: null,
      selectedAnimationId: null,
      selectedFrameIndex: {},
      undoStacks: {},
      redoStacks: {},
      renderCounters: {},
      selection: null,
    }),

  loadProject: (project) => {
    const prepared: Record<Id, PreparedSource> = {};
    const sheetBitmaps: Record<Id, RawImage> = {};
    for (const s of project.sources) {
      if (s.kind === 'sheet') {
        // Prefer authoritative editedFrames when present; otherwise decode
        // the imported PNG bytes once and cache so further updateSlicing
        // calls don't redecode.
        const bitmap = s.editedFrames?.[0] ?? decodePng(s.imageBytes);
        sheetBitmaps[s.id] = bitmap;
        prepared[s.id] = prepareSheet(s, bitmap);
      } else {
        // Sequence sources keep their original bytes in imageBytes when
        // imported from a GIF, so a saved project is self-contained:
        // re-decode via decodeGif and feed the frames to prepareSequence.
        // Blank sequences carry editedFrames-only and an empty
        // imageBytes; prepareSequence will use editedFrames in that case.
        const decoded =
          s.editedFrames && s.editedFrames.length > 0
            ? []
            : decodeGif(s.imageBytes).map((f) => f.image);
        prepared[s.id] = prepareSequence(s, decoded);
      }
    }
    set({
      project,
      prepared,
      sheetBitmaps,
      selectedSourceId: null,
      selectedAnimationId: null,
      selectedFrameIndex: {},
      undoStacks: {},
      redoStacks: {},
      renderCounters: {},
      selection: null,
    });
  },

  addSource: (name, imported) => {
    const id = newId();
    const firstFrame: RawImage | undefined = imported.frames[0];
    if (!firstFrame) throw new Error('addSource: imported has no frames');
    const source: Source = {
      id,
      name,
      kind: imported.kind,
      width: firstFrame.width,
      height: firstFrame.height,
      imageBytes: imported.bytes,
      importedFrom: imported.format,
      slicing:
        imported.kind === 'sheet'
          ? {
              kind: 'grid',
              cellW: firstFrame.width,
              cellH: firstFrame.height,
              offsetX: 0,
              offsetY: 0,
              rows: 1,
              cols: 1,
            }
          : { kind: 'sequence' },
      ...(imported.kind === 'sequence'
        ? {
            gifFrames: imported.frames.map((_, i) => ({
              index: i,
              delayMs: imported.delaysMs[i] ?? 0,
            })),
          }
        : {}),
    };
    const prepared: PreparedSource =
      imported.kind === 'sheet'
        ? prepareSheet(source, firstFrame)
        : prepareSequence(source, imported.frames);

    set((s) => ({
      project: { ...s.project, sources: [...s.project.sources, source] },
      prepared: { ...s.prepared, [id]: prepared },
      sheetBitmaps:
        imported.kind === 'sheet'
          ? { ...s.sheetBitmaps, [id]: firstFrame }
          : s.sheetBitmaps,
      selectedSourceId: id,
    }));
    return source;
  },

  removeSource: (id) =>
    set((s) => {
      const sources = s.project.sources.filter((x) => x.id !== id);
      const animations = s.project.animations.map((a) => ({
        ...a,
        frames: a.frames.filter((f) => f.sourceId !== id),
      }));
      const restPrepared = Object.fromEntries(
        Object.entries(s.prepared).filter(([k]) => k !== id),
      );
      const restBitmaps = Object.fromEntries(
        Object.entries(s.sheetBitmaps).filter(([k]) => k !== id),
      );
      const restSelected = Object.fromEntries(
        Object.entries(s.selectedFrameIndex).filter(([k]) => k !== id),
      );
      const restUndo = Object.fromEntries(
        Object.entries(s.undoStacks).filter(([k]) => k !== id),
      );
      const restRedo = Object.fromEntries(
        Object.entries(s.redoStacks).filter(([k]) => k !== id),
      );
      const restCounters = Object.fromEntries(
        Object.entries(s.renderCounters).filter(([k]) => k !== id),
      );
      return {
        project: { ...s.project, sources, animations },
        prepared: restPrepared,
        sheetBitmaps: restBitmaps,
        selectedFrameIndex: restSelected,
        undoStacks: restUndo,
        redoStacks: restRedo,
        renderCounters: restCounters,
        selectedSourceId: s.selectedSourceId === id ? null : s.selectedSourceId,
        selection: s.selection?.sourceId === id ? null : s.selection,
      };
    }),

  updateSlicing: (id, slicing) =>
    set((s) => {
      const sources = s.project.sources.map((src) =>
        src.id === id ? { ...src, slicing } : src,
      );
      const source = sources.find((x) => x.id === id)!;
      const prepared = { ...s.prepared };
      if (source.kind === 'sheet') {
        const bitmap = s.sheetBitmaps[id];
        if (!bitmap) {
          throw new Error(`updateSlicing: no decoded bitmap cached for ${id}`);
        }
        prepared[id] = prepareSheet(source, bitmap);
      }
      // Sequence slicing is fixed to {kind:'sequence'} — no rebuild needed.
      return { project: { ...s.project, sources }, prepared };
    }),

  selectSource: (id) => set({ selectedSourceId: id }),

  createBlankSource: (args) => {
    const id = newId();
    const frameCount = args.kind === 'sheet' ? 1 : Math.max(1, args.frameCount ?? 1);
    const editedFrames: RawImage[] = [];
    for (let i = 0; i < frameCount; i++) {
      editedFrames.push(createImage(args.width, args.height));
    }
    const source: Source = {
      id,
      name: args.name,
      kind: args.kind,
      width: args.width,
      height: args.height,
      imageBytes: new Uint8Array(),
      importedFrom: 'blank',
      editedFrames,
      slicing:
        args.kind === 'sheet'
          ? {
              kind: 'grid',
              cellW: args.width,
              cellH: args.height,
              offsetX: 0,
              offsetY: 0,
              rows: 1,
              cols: 1,
            }
          : { kind: 'sequence' },
    };
    const prepared: PreparedSource =
      args.kind === 'sheet'
        ? prepareSheet(source, editedFrames[0]!)
        : prepareSequence(source, editedFrames);
    set((s) => ({
      project: { ...s.project, sources: [...s.project.sources, source] },
      prepared: { ...s.prepared, [id]: prepared },
      sheetBitmaps:
        args.kind === 'sheet'
          ? { ...s.sheetBitmaps, [id]: editedFrames[0]! }
          : s.sheetBitmaps,
      selectedSourceId: id,
    }));
    return source;
  },

  addAnimation: (name) => {
    const state = useStore.getState();
    const unique = ensureUniqueName(
      name,
      state.project.animations.map((a) => a.name),
    );
    const anim: Animation = {
      id: newId(),
      name: unique,
      fps: 12,
      loop: true,
      frames: [],
    };
    set((s) => ({
      project: { ...s.project, animations: [...s.project.animations, anim] },
      selectedAnimationId: anim.id,
    }));
    return anim;
  },

  removeAnimation: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        animations: s.project.animations.filter((a) => a.id !== id),
      },
      selectedAnimationId:
        s.selectedAnimationId === id ? null : s.selectedAnimationId,
    })),

  renameAnimation: (id, name) =>
    set((s) => {
      const taken = s.project.animations
        .filter((a) => a.id !== id)
        .map((a) => a.name);
      const unique = ensureUniqueName(name, taken);
      return {
        project: {
          ...s.project,
          animations: s.project.animations.map((a) =>
            a.id === id ? { ...a, name: unique } : a,
          ),
        },
      };
    }),

  renameProject: (name) =>
    set((s) => ({ project: { ...s.project, name } })),

  setAnimationFps: (id, fps) =>
    set((s) => ({
      project: {
        ...s.project,
        animations: s.project.animations.map((a) =>
          a.id === id ? { ...a, fps } : a,
        ),
      },
    })),

  setAnimationLoop: (id, loop) =>
    set((s) => ({
      project: {
        ...s.project,
        animations: s.project.animations.map((a) =>
          a.id === id ? { ...a, loop } : a,
        ),
      },
    })),

  selectAnimation: (id) => set({ selectedAnimationId: id }),

  appendFrames: (animationId, refs) =>
    set((s) => ({
      project: {
        ...s.project,
        animations: s.project.animations.map((a) =>
          a.id === animationId ? { ...a, frames: [...a.frames, ...refs] } : a,
        ),
      },
    })),

  removeFrameAt: (animationId, index) =>
    set((s) => ({
      project: {
        ...s.project,
        animations: s.project.animations.map((a) =>
          a.id === animationId
            ? { ...a, frames: a.frames.filter((_, i) => i !== index) }
            : a,
        ),
      },
    })),

  reorderFrame: (animationId, from, to) =>
    set((s) => ({
      project: {
        ...s.project,
        animations: s.project.animations.map((a) => {
          if (a.id !== animationId) return a;
          const frames = [...a.frames];
          const [moved] = frames.splice(from, 1);
          if (moved) frames.splice(to, 0, moved);
          return { ...a, frames };
        }),
      },
    })),

  setActiveTool: (tool) => set({ activeTool: tool }),
  setPrimaryColor: (c) => set({ primaryColor: c }),
  setSecondaryColor: (c) => set({ secondaryColor: c }),
  swapColors: () =>
    set((s) => ({ primaryColor: s.secondaryColor, secondaryColor: s.primaryColor })),
  setOpacity: (n) => set({ opacity: clamp01(n) }),
  setBrushSize: (n) => set({ brushSize: clampBrushSize(n) }),

  addSwatch: (hex) =>
    set((s) => {
      const norm = normalizeHex(hex);
      const list = s.project.swatches ?? [];
      if (list.some((x) => normalizeHex(x) === norm)) return {};
      return { project: { ...s.project, swatches: [...list, norm] } };
    }),
  removeSwatch: (hex) =>
    set((s) => {
      const norm = normalizeHex(hex);
      const list = (s.project.swatches ?? []).filter(
        (x) => normalizeHex(x) !== norm,
      );
      return { project: { ...s.project, swatches: list } };
    }),
  moveSwatch: (from, to) =>
    set((s) => {
      const list = [...(s.project.swatches ?? [])];
      if (from < 0 || from >= list.length) return {};
      const [moved] = list.splice(from, 1);
      if (!moved) return {};
      const dest = Math.max(0, Math.min(list.length, to));
      list.splice(dest, 0, moved);
      return { project: { ...s.project, swatches: list } };
    }),

  setSelectedFrameIndex: (sourceId, index) =>
    set((s) => {
      // Selection is per-frame, not persisted across switches. Keep the
      // current selection on no-op same-index calls so the UI can fire
      // redundant selects without clobbering user state.
      const previous = s.selectedFrameIndex[sourceId];
      const frameChanged = previous !== index;
      const nextSelection =
        frameChanged && s.selection && s.selection.sourceId === sourceId
          ? null
          : s.selection;
      return {
        selectedFrameIndex: { ...s.selectedFrameIndex, [sourceId]: index },
        selection: nextSelection,
      };
    }),

  setSelection: (sel) => set({ selection: sel }),
  clearSelection: () => set({ selection: null }),

  setOnionSkin: (b) => set({ onionSkin: b }),

  beginStroke: (sourceId, frameIndex) => {
    // Snapshot the current pixels so commit can compute a delta.
    const state = useStore.getState();
    const source = state.project.sources.find((s) => s.id === sourceId);
    if (!source) {
      throw new Error(`beginStroke: unknown source ${sourceId}`);
    }
    const target = getEditTarget(state, source, frameIndex);
    if (!target) {
      throw new Error(
        `beginStroke: frame ${frameIndex} missing for source ${sourceId}`,
      );
    }
    const before: RawImage = {
      width: target.width,
      height: target.height,
      data: new Uint8ClampedArray(target.data),
    };
    return () => {
      const cur = useStore.getState();
      const curSource = cur.project.sources.find((s) => s.id === sourceId);
      if (!curSource) return;
      const after = getEditTarget(cur, curSource, frameIndex);
      if (!after) return;
      const delta = computeDelta(sourceId, frameIndex, before, after);
      if (!delta) return;
      // Materialize or update editedFrames on every commit so that
      // serialization and subsequent re-slicing always see the latest
      // pixels. For sheets this is frame[0]; for sequences it is the
      // edited frame index (other frames stay as their current buffers,
      // cloned on first-edit to break aliasing with prepared.frames).
      const sources = syncEditedFrames(
        cur.project.sources,
        cur.prepared,
        sourceId,
        frameIndex,
        after,
      );
      // For sheets we also need to refresh prepared.frames so the new
      // pixels land in subsequent slicing operations / exports.
      let prepared = cur.prepared;
      if (curSource.kind === 'sheet') {
        const updatedSource = sources.find((x) => x.id === sourceId)!;
        const bitmap = cur.sheetBitmaps[sourceId];
        if (bitmap) {
          prepared = {
            ...prepared,
            [sourceId]: prepareSheet(updatedSource, bitmap),
          };
        }
      }
      const undoStack = [...(cur.undoStacks[sourceId] ?? []), delta];
      // Any new stroke after an undo invalidates the redo stack.
      const { [sourceId]: _drop, ...restRedo } = cur.redoStacks;
      void _drop;
      set({
        project: { ...cur.project, sources },
        prepared,
        undoStacks: { ...cur.undoStacks, [sourceId]: undoStack },
        redoStacks: restRedo,
        renderCounters: bumpCounter(cur.renderCounters, sourceId),
      });
    };
  },

  undo: (sourceId) => {
    const cur = useStore.getState();
    const stack = cur.undoStacks[sourceId];
    if (!stack || stack.length === 0) return;
    const delta = stack[stack.length - 1]!;
    const newUndo = stack.slice(0, -1);
    const newRedo = [...(cur.redoStacks[sourceId] ?? []), delta];
    const source = cur.project.sources.find((s) => s.id === sourceId);
    if (!source) return;
    const target = getEditTarget(cur, source, delta.frameIndex);
    if (!target) return;
    undoDelta(target, delta);
    // Keep editedFrames in sync with the undone pixels so save/reload
    // reflects the undone state (not the pre-undo state).
    const sources = syncEditedFrames(
      cur.project.sources,
      cur.prepared,
      sourceId,
      delta.frameIndex,
      target,
    );
    let prepared = cur.prepared;
    if (source.kind === 'sheet') {
      const updatedSource = sources.find((x) => x.id === sourceId)!;
      const bitmap = cur.sheetBitmaps[sourceId];
      if (bitmap) {
        prepared = {
          ...prepared,
          [sourceId]: prepareSheet(updatedSource, bitmap),
        };
      }
    } else {
      // Replace shell to push downstream re-read.
      const p = cur.prepared[sourceId];
      if (p) prepared = { ...prepared, [sourceId]: { ...p } };
    }
    set({
      project: { ...cur.project, sources },
      undoStacks: { ...cur.undoStacks, [sourceId]: newUndo },
      redoStacks: { ...cur.redoStacks, [sourceId]: newRedo },
      prepared,
      renderCounters: bumpCounter(cur.renderCounters, sourceId),
    });
  },

  redo: (sourceId) => {
    const cur = useStore.getState();
    const stack = cur.redoStacks[sourceId];
    if (!stack || stack.length === 0) return;
    const delta = stack[stack.length - 1]!;
    const newRedo = stack.slice(0, -1);
    const newUndo = [...(cur.undoStacks[sourceId] ?? []), delta];
    const source = cur.project.sources.find((s) => s.id === sourceId);
    if (!source) return;
    const target = getEditTarget(cur, source, delta.frameIndex);
    if (!target) return;
    redoDelta(target, delta);
    const sources = syncEditedFrames(
      cur.project.sources,
      cur.prepared,
      sourceId,
      delta.frameIndex,
      target,
    );
    let prepared = cur.prepared;
    if (source.kind === 'sheet') {
      const updatedSource = sources.find((x) => x.id === sourceId)!;
      const bitmap = cur.sheetBitmaps[sourceId];
      if (bitmap) {
        prepared = {
          ...prepared,
          [sourceId]: prepareSheet(updatedSource, bitmap),
        };
      }
    } else {
      const p = cur.prepared[sourceId];
      if (p) prepared = { ...prepared, [sourceId]: { ...p } };
    }
    set({
      project: { ...cur.project, sources },
      undoStacks: { ...cur.undoStacks, [sourceId]: newUndo },
      redoStacks: { ...cur.redoStacks, [sourceId]: newRedo },
      prepared,
      renderCounters: bumpCounter(cur.renderCounters, sourceId),
    });
  },
}));

function bumpCounter(
  counters: Record<Id, number>,
  sourceId: Id,
): Record<Id, number> {
  return { ...counters, [sourceId]: (counters[sourceId] ?? 0) + 1 };
}

/**
 * The canonical paint target for a (source, frameIndex). Sheets paint
 * on the cached `sheetBitmap`, so painting outside the current grid
 * cells still lands in pixels that subsequent slicing will pick up.
 * Sequences paint directly on the per-frame prepared bitmap. After each
 * stroke commit, `syncEditedFrames` clones the paint target into
 * `source.editedFrames[frameIndex]`, keeping the authoritative buffer
 * fresh so save/reload sees the latest pixels.
 */
function getEditTarget(
  state: StoreState,
  source: Source,
  frameIndex: number,
): RawImage | undefined {
  if (source.kind === 'sheet') {
    return state.sheetBitmaps[source.id];
  }
  return state.prepared[source.id]?.frames[frameIndex];
}

function cloneRaw(img: RawImage): RawImage {
  return {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.data),
  };
}

/**
 * Mirror the live paint target into `source.editedFrames[frameIndex]`
 * so the authoritative pixel data stays fresh across stroke commits,
 * undo, and redo. If the source had no `editedFrames`, materialize it:
 * for sheets that's `[target]`; for sequences it's a clone of every
 * prepared frame (so frames we didn't edit still carry pixel data).
 */
function syncEditedFrames(
  sources: ReadonlyArray<Source>,
  prepared: Record<Id, PreparedSource>,
  sourceId: Id,
  frameIndex: number,
  target: RawImage,
): Source[] {
  return sources.map((src) => {
    if (src.id !== sourceId) return src;
    const existing = src.editedFrames;
    if (!existing || existing.length === 0) {
      const seed: RawImage[] =
        src.kind === 'sheet'
          ? [cloneRaw(target)]
          : (prepared[sourceId]?.frames ?? []).map(cloneRaw);
      return { ...src, editedFrames: seed };
    }
    const next = existing.slice();
    next[frameIndex] = cloneRaw(target);
    return { ...src, editedFrames: next };
  });
}

export const getStore = useStore;
// For tests: reset to initial.
export function resetStore(): void {
  useStore.setState({
    project: emptyProject('untitled'),
    prepared: {},
    sheetBitmaps: {},
    selectedSourceId: null,
    selectedAnimationId: null,
    activeTool: 'pencil',
    primaryColor: DEFAULT_PRIMARY,
    secondaryColor: DEFAULT_SECONDARY,
    opacity: 1,
    brushSize: 1,
    selectedFrameIndex: {},
    undoStacks: {},
    redoStacks: {},
    renderCounters: {},
    selection: null,
    onionSkin: false,
  });
}
