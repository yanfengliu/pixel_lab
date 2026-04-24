import type {
  Project,
  Source,
  Animation,
  GifFrameMeta,
  Slicing,
} from '../types';
import type { RawImage } from '../image';
import { bytesToBase64, base64ToBytes } from './base64';
import { encodePng, decodePng } from '../png';

interface SourceJsonV1 {
  id: string;
  name: string;
  kind: 'sheet' | 'gif';
  width: number;
  height: number;
  imageBase64: string;
  slicing: { kind: 'grid' | 'auto' | 'manual' | 'gif' } & Record<string, unknown>;
  gifFrames?: GifFrameMeta[];
}

interface ProjectJsonV1 {
  version: 1;
  name: string;
  sources: SourceJsonV1[];
  animations: Animation[];
}

interface SourceJsonV2 {
  id: string;
  name: string;
  kind: 'sheet' | 'sequence';
  width: number;
  height: number;
  imageBase64: string;
  slicing: Source['slicing'];
  gifFrames?: GifFrameMeta[];
  /** PNG-encoded base64 of each authoritative edited frame, when present. */
  editedFrames?: string[];
  importedFrom?: 'png' | 'gif' | 'blank';
}

interface ProjectJsonV2 {
  version: 2;
  name: string;
  sources: SourceJsonV2[];
  animations: Animation[];
  swatches?: string[];
}

type ProjectJsonAny = ProjectJsonV1 | ProjectJsonV2;

export function projectToJson(project: Project): string {
  const obj: ProjectJsonV2 = {
    version: 2,
    name: project.name,
    sources: project.sources.map((s) => {
      const json: SourceJsonV2 = {
        id: s.id,
        name: s.name,
        kind: s.kind,
        width: s.width,
        height: s.height,
        imageBase64: bytesToBase64(s.imageBytes),
        slicing: s.slicing,
      };
      if (s.gifFrames) json.gifFrames = s.gifFrames;
      if (s.importedFrom) json.importedFrom = s.importedFrom;
      if (s.editedFrames && s.editedFrames.length > 0) {
        json.editedFrames = s.editedFrames.map((frame) =>
          bytesToBase64(encodePng(frame)),
        );
      }
      return json;
    }),
    animations: project.animations,
  };
  if (project.swatches && project.swatches.length > 0) {
    obj.swatches = project.swatches;
  }
  return JSON.stringify(obj, null, 2);
}

export function projectFromJson(text: string): Project {
  const parsed = JSON.parse(text) as Partial<ProjectJsonAny>;
  validateProjectJson(parsed);
  if (parsed.version === 1) {
    return migrateV1ToV2(parsed as ProjectJsonV1);
  }
  const p = parsed as ProjectJsonV2;
  return {
    version: 2,
    name: p.name,
    sources: p.sources.map((s) => {
      const source: Source = {
        id: s.id,
        name: s.name,
        kind: s.kind,
        width: s.width,
        height: s.height,
        imageBytes: base64ToBytes(s.imageBase64),
        slicing: s.slicing,
      };
      if (s.gifFrames) source.gifFrames = s.gifFrames;
      if (s.importedFrom) source.importedFrom = s.importedFrom;
      if (s.editedFrames && s.editedFrames.length > 0) {
        source.editedFrames = s.editedFrames.map((b64) =>
          decodePng(base64ToBytes(b64)),
        );
      }
      return source;
    }),
    animations: p.animations,
    ...(p.swatches && p.swatches.length > 0 ? { swatches: p.swatches } : {}),
  };
}

function migrateV1ToV2(v1: ProjectJsonV1): Project {
  return {
    version: 2,
    name: v1.name,
    sources: v1.sources.map((s) => {
      const isGif = s.kind === 'gif';
      const slicing: Slicing = isGif
        ? { kind: 'sequence' }
        : (s.slicing as unknown as Slicing);
      const source: Source = {
        id: s.id,
        name: s.name,
        kind: isGif ? 'sequence' : 'sheet',
        width: s.width,
        height: s.height,
        imageBytes: base64ToBytes(s.imageBase64),
        slicing,
      };
      if (s.gifFrames) source.gifFrames = s.gifFrames;
      if (isGif) source.importedFrom = 'gif';
      // v1 had no `editedFrames`. Nothing to populate.
      return source;
    }),
    animations: v1.animations,
  };
}

/**
 * Lightweight structural validation for a pasted / loaded project JSON.
 * Throws a descriptive error so the UI can surface it, rather than
 * letting a missing field crash slicing/export with a cryptic stack.
 *
 * Accepts both v1 (legacy `'gif'` kind) and v2 (`'sequence'` kind) shapes.
 */
function validateProjectJson(v: Partial<ProjectJsonAny>): void {
  if (v.version !== 1 && v.version !== 2) {
    throw new Error(`projectFromJson: unsupported version ${String(v.version)}`);
  }
  if (typeof v.name !== 'string') throw new Error('projectFromJson: name must be a string');
  if (!Array.isArray(v.sources)) throw new Error('projectFromJson: sources must be an array');
  if (!Array.isArray(v.animations)) throw new Error('projectFromJson: animations must be an array');
  const validKinds = v.version === 1 ? ['sheet', 'gif'] : ['sheet', 'sequence'];
  for (const s of v.sources as Array<Partial<SourceJsonV1 & SourceJsonV2>>) {
    if (!s || typeof s !== 'object') throw new Error('projectFromJson: source entry must be an object');
    if (typeof s.id !== 'string') throw new Error('projectFromJson: source.id must be a string');
    if (typeof s.imageBase64 !== 'string') {
      throw new Error(`projectFromJson: source ${s.id} missing imageBase64`);
    }
    if (!validKinds.includes(s.kind as string)) {
      throw new Error(`projectFromJson: source ${s.id} has invalid kind "${String(s.kind)}"`);
    }
    if (!s.slicing || typeof s.slicing !== 'object') {
      throw new Error(`projectFromJson: source ${s.id} missing slicing`);
    }
  }
  for (const a of v.animations) {
    if (!a || typeof a !== 'object') throw new Error('projectFromJson: animation entry must be an object');
    if (typeof a.name !== 'string') throw new Error('projectFromJson: animation.name must be a string');
    if (!Array.isArray(a.frames)) {
      throw new Error(`projectFromJson: animation ${a.name} frames must be an array`);
    }
  }
  if (v.version === 2) {
    const v2 = v as Partial<ProjectJsonV2>;
    if (v2.swatches !== undefined && !Array.isArray(v2.swatches)) {
      throw new Error('projectFromJson: swatches must be an array of strings');
    }
  }
}

// Help downstream readers locate the typed shape if they need it.
export type { ProjectJsonV2, SourceJsonV2 };

// Internal helper exposed for tests that want to construct synthetic v1
// project JSON.
export function _v1JsonForTests(args: {
  name: string;
  sources: Array<{
    id: string;
    name: string;
    kind: 'sheet' | 'gif';
    width: number;
    height: number;
    imageBytes: Uint8Array;
    slicing: { kind: 'grid' | 'auto' | 'manual' | 'gif' } & Record<string, unknown>;
    gifFrames?: GifFrameMeta[];
  }>;
  animations: Animation[];
}): string {
  const v1: ProjectJsonV1 = {
    version: 1,
    name: args.name,
    sources: args.sources.map((s) => {
      const out: SourceJsonV1 = {
        id: s.id,
        name: s.name,
        kind: s.kind,
        width: s.width,
        height: s.height,
        imageBase64: bytesToBase64(s.imageBytes),
        slicing: s.slicing,
      };
      if (s.gifFrames) out.gifFrames = s.gifFrames;
      return out;
    }),
    animations: args.animations,
  };
  return JSON.stringify(v1, null, 2);
}

// satisfy unused-import linting if RawImage isn't used directly
export type { RawImage };
