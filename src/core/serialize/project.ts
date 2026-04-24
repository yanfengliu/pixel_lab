import type { Project, Source, Animation, GifFrameMeta } from '../types';
import { bytesToBase64, base64ToBytes } from './base64';

interface SourceJson {
  id: string;
  name: string;
  kind: 'sheet' | 'gif';
  width: number;
  height: number;
  imageBase64: string;
  slicing: Source['slicing'];
  gifFrames?: GifFrameMeta[];
}

interface ProjectJson {
  version: 1;
  name: string;
  sources: SourceJson[];
  animations: Animation[];
}

export function projectToJson(project: Project): string {
  const obj: ProjectJson = {
    version: 1,
    name: project.name,
    sources: project.sources.map((s) => {
      const json: SourceJson = {
        id: s.id,
        name: s.name,
        kind: s.kind,
        width: s.width,
        height: s.height,
        imageBase64: bytesToBase64(s.imageBytes),
        slicing: s.slicing,
      };
      if (s.gifFrames) json.gifFrames = s.gifFrames;
      return json;
    }),
    animations: project.animations,
  };
  return JSON.stringify(obj, null, 2);
}

export function projectFromJson(text: string): Project {
  const parsed = JSON.parse(text) as Partial<ProjectJson>;
  validateProjectJson(parsed);
  const p = parsed as ProjectJson;
  return {
    version: 1,
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
      return source;
    }),
    animations: p.animations,
  };
}

/**
 * Lightweight structural validation for a pasted / loaded project JSON.
 * Throws a descriptive error so the UI can surface it, rather than
 * letting a missing field crash slicing/export with a cryptic stack.
 */
function validateProjectJson(v: Partial<ProjectJson>): void {
  if (v.version !== 1) {
    throw new Error(`projectFromJson: unsupported version ${String(v.version)}`);
  }
  if (typeof v.name !== 'string') throw new Error('projectFromJson: name must be a string');
  if (!Array.isArray(v.sources)) throw new Error('projectFromJson: sources must be an array');
  if (!Array.isArray(v.animations)) throw new Error('projectFromJson: animations must be an array');
  for (const s of v.sources) {
    if (!s || typeof s !== 'object') throw new Error('projectFromJson: source entry must be an object');
    if (typeof s.id !== 'string') throw new Error('projectFromJson: source.id must be a string');
    if (typeof s.imageBase64 !== 'string') {
      throw new Error(`projectFromJson: source ${s.id} missing imageBase64`);
    }
    if (s.kind !== 'sheet' && s.kind !== 'gif') {
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
}
