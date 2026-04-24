import { decodePng } from '../core/png';
import { decodeGif } from '../core/gif';
import type { RawImage } from '../core/image';
import type { SourceKind } from '../core/types';

export interface DecodedImport {
  kind: SourceKind;
  /** All decoded frames. Sheets produce exactly one. GIFs produce N. */
  frames: RawImage[];
  /** Per-frame delays for GIFs, empty for sheets. */
  delaysMs: number[];
  /** Original bytes, preserved for the source's imageBytes field. */
  bytes: Uint8Array;
}

export function detectKind(bytes: Uint8Array): SourceKind {
  // GIF87a / GIF89a
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'gif';
  }
  // PNG signature 89 50 4E 47
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return 'sheet';
  }
  throw new Error('detectKind: unrecognized image format (only PNG and GIF are supported)');
}

export function decodeImport(bytes: Uint8Array): DecodedImport {
  const kind = detectKind(bytes);
  if (kind === 'sheet') {
    return {
      kind,
      frames: [decodePng(bytes)],
      delaysMs: [],
      bytes,
    };
  }
  const decoded = decodeGif(bytes);
  return {
    kind,
    frames: decoded.map((f) => f.image),
    delaysMs: decoded.map((f) => f.delayMs),
    bytes,
  };
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}
