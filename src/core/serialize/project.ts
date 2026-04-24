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
  const parsed = JSON.parse(text) as ProjectJson;
  if (parsed.version !== 1) {
    throw new Error(`projectFromJson: unsupported version ${parsed.version}`);
  }
  return {
    version: 1,
    name: parsed.name,
    sources: parsed.sources.map((s) => {
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
    animations: parsed.animations,
  };
}
