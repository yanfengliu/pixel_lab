import { decodePng } from '../core/png';
import { decodeGif } from '../core/gif';
import type { RawImage } from '../core/image';
import type { SourceKind } from '../core/types';

/**
 * On-disk format of an imported file. This is provenance only — the
 * resulting `Source.kind` (`'sheet'` for PNG, `'sequence'` for GIF) is
 * carried in `DecodedImport.kind`.
 */
export type ImportFormat = 'png' | 'gif';

export interface DecodedImport {
  /** Resulting `Source.kind` (`'sheet'` for PNG, `'sequence'` for GIF). */
  kind: SourceKind;
  /** Original on-disk format, recorded as `Source.importedFrom`. */
  format: ImportFormat;
  /** All decoded frames. PNGs produce exactly one. GIFs produce N. */
  frames: RawImage[];
  /** Per-frame delays for GIFs, empty for PNG sheets. */
  delaysMs: number[];
  /** Original bytes, preserved for the source's imageBytes field. */
  bytes: Uint8Array;
}

export function detectFormat(bytes: Uint8Array): ImportFormat {
  // GIF87a or GIF89a — full 6-byte magic. "GIF8" alone is not specific
  // enough and would let "GIF80" etc. reach parseGIF, throwing a vague
  // error at the user.
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'gif';
  }
  // PNG signature 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
    bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'png';
  }
  throw new Error('detectFormat: unrecognized image format (only PNG and GIF are supported)');
}

export function decodeImport(bytes: Uint8Array): DecodedImport {
  const format = detectFormat(bytes);
  if (format === 'png') {
    return {
      kind: 'sheet',
      format,
      frames: [decodePng(bytes)],
      delaysMs: [],
      bytes,
    };
  }
  const decoded = decodeGif(bytes);
  return {
    kind: 'sequence',
    format,
    frames: decoded.map((f) => f.image),
    delaysMs: decoded.map((f) => f.delayMs),
    bytes,
  };
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}
