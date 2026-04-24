import { create } from 'zustand';
import type {
  Animation,
  FrameRef,
  Id,
  PreparedSource,
  Project,
  Slicing,
  Source,
} from '../core/types';
import { newId } from '../core/ids';
import { prepareSheet, prepareGif } from '../core/source';
import { decodePng } from '../core/png';
import { decodeGif } from '../core/gif';
import type { RawImage } from '../core/image';
import type { DecodedImport } from '../io/file';

export interface StoreState {
  project: Project;
  prepared: Record<Id, PreparedSource>;
  /**
   * Sheet-only: decoded full-size bitmap kept in memory so that changing
   * slicing re-crops without re-decoding the PNG bytes. GIF sources keep
   * their decoded per-frame bitmaps inside `prepared[id].frames` and don't
   * need an entry here.
   */
  sheetBitmaps: Record<Id, RawImage>;
  selectedSourceId: Id | null;
  selectedAnimationId: Id | null;

  // Actions
  newProject: (name: string) => void;
  loadProject: (project: Project) => void;
  addSource: (name: string, imported: DecodedImport) => Source;
  removeSource: (id: Id) => void;
  updateSlicing: (id: Id, slicing: Slicing) => void;
  selectSource: (id: Id | null) => void;

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
}

function emptyProject(name: string): Project {
  return { version: 1, name, sources: [], animations: [] };
}

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

export const useStore = create<StoreState>((set) => ({
  project: emptyProject('untitled'),
  prepared: {},
  sheetBitmaps: {},
  selectedSourceId: null,
  selectedAnimationId: null,

  newProject: (name) =>
    set({
      project: emptyProject(name),
      prepared: {},
      sheetBitmaps: {},
      selectedSourceId: null,
      selectedAnimationId: null,
    }),

  loadProject: (project) => {
    const prepared: Record<Id, PreparedSource> = {};
    const sheetBitmaps: Record<Id, RawImage> = {};
    for (const s of project.sources) {
      if (s.kind === 'sheet') {
        const bitmap = decodePng(s.imageBytes);
        sheetBitmaps[s.id] = bitmap;
        prepared[s.id] = prepareSheet(s, bitmap);
      } else {
        // GIF sources keep their original bytes in imageBytes, so a saved
        // project is self-contained: re-decode via decodeGif and feed the
        // frames to prepareGif so export/preview work on reload.
        const decoded = decodeGif(s.imageBytes);
        prepared[s.id] = prepareGif(
          s,
          decoded.map((f) => f.image),
        );
      }
    }
    set({
      project,
      prepared,
      sheetBitmaps,
      selectedSourceId: null,
      selectedAnimationId: null,
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
          : { kind: 'gif' },
      ...(imported.kind === 'gif'
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
        : prepareGif(source, imported.frames);

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
      return {
        project: { ...s.project, sources, animations },
        prepared: restPrepared,
        sheetBitmaps: restBitmaps,
        selectedSourceId: s.selectedSourceId === id ? null : s.selectedSourceId,
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
      // GIF slicing is fixed to {kind:'gif'} — no rebuild needed.
      return { project: { ...s.project, sources }, prepared };
    }),

  selectSource: (id) => set({ selectedSourceId: id }),

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
}));

export const getStore = useStore;
// For tests: reset to initial.
export function resetStore(): void {
  useStore.setState({
    project: emptyProject('untitled'),
    prepared: {},
    sheetBitmaps: {},
    selectedSourceId: null,
    selectedAnimationId: null,
  });
}
