import type { Project, FrameRef, PreparedSource } from './types';
import { packFrames, type PackInput } from './packer';
import { buildManifest, type Manifest } from './serialize/manifest';
import { encodePng } from './png';

export interface ExportOptions {
  /** If true, emit a `frames/` directory with one PNG per unique frame. */
  emitPerFrame?: boolean;
  /** Atlas padding (px). Default 1. */
  padding?: number;
}

export interface ExportBundle {
  /** Map of filename -> bytes. Caller zips & writes. */
  files: Record<string, Uint8Array>;
  manifest: Manifest;
}

function refKey(ref: FrameRef): string {
  return `${ref.sourceId}|${ref.rectIndex}`;
}

/**
 * Assigns a human-readable name to each unique (sourceId, rectIndex)
 * reference in the project. A ref first encountered inside animation
 * `walk` at index 2 becomes `walk_2`. Orphan refs (in no animation) are
 * ignored — v1 exports only what the user built animations out of.
 */
function assignFrameNames(project: Project): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const a of project.animations) {
    for (let i = 0; i < a.frames.length; i++) {
      const key = refKey(a.frames[i]!);
      if (names.has(key)) continue;
      const base = `${sanitize(a.name)}_${i}`;
      // Sanitize can collapse two distinct animation names into the same
      // prefix (e.g. "walk" and "walk!"). Disambiguate with a numeric
      // suffix so the manifest and frames/*.png filenames never collide.
      let candidate = base;
      let bump = 2;
      while (used.has(candidate)) candidate = `${base}__${bump++}`;
      used.add(candidate);
      names.set(key, candidate);
    }
  }
  return names;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function buildExport(
  project: Project,
  prepared: ReadonlyArray<PreparedSource>,
  opts: ExportOptions = {},
): ExportBundle {
  const preparedById = new Map(prepared.map((p) => [p.sourceId, p]));
  const names = assignFrameNames(project);

  // Collect unique frames in a deterministic order: by refKey sort.
  const uniqueKeys = Array.from(names.keys()).sort();
  const inputs: PackInput[] = uniqueKeys.map((key) => {
    const [sourceId, idxStr] = key.split('|');
    const p = preparedById.get(sourceId!);
    if (!p) throw new Error(`buildExport: no prepared source ${sourceId}`);
    const img = p.frames[Number(idxStr)];
    if (!img) {
      throw new Error(`buildExport: no frame ${idxStr} in source ${sourceId}`);
    }
    return { id: names.get(key)!, image: img };
  });

  const pack = packFrames(inputs, { padding: opts.padding ?? 1 });
  const atlasBytes = encodePng(pack.atlas);

  const frameCoords: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const p of pack.placements) {
    frameCoords[p.id] = { x: p.x, y: p.y, w: p.w, h: p.h };
  }

  const manifest = buildManifest({
    atlas: { image: 'atlas.png', width: pack.atlas.width, height: pack.atlas.height },
    frames: frameCoords,
    animations: project.animations,
    refToKey: (ref) => names.get(refKey(ref)) ?? (() => {
      throw new Error(`buildExport: missing name for ${refKey(ref)}`);
    })(),
  });

  const files: Record<string, Uint8Array> = {
    'atlas.png': atlasBytes,
    'manifest.json': new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  };

  if (opts.emitPerFrame) {
    for (const key of uniqueKeys) {
      const name = names.get(key)!;
      const [sourceId, idxStr] = key.split('|');
      const img = preparedById.get(sourceId!)!.frames[Number(idxStr)]!;
      files[`frames/${name}.png`] = encodePng(img);
    }
  }
  return { files, manifest };
}
