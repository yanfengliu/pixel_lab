import { describe, it, expect } from 'vitest';
import { buildZip, parseZip } from '../../src/io/zip';

describe('zip round-trip', () => {
  it('builds and parses a ZIP preserving file contents', () => {
    const files = {
      'atlas.png': new Uint8Array([137, 80, 78, 71]),
      'manifest.json': new TextEncoder().encode('{"version":1}'),
      'frames/walk_0.png': new Uint8Array([1, 2, 3]),
    };
    const zip = buildZip(files);
    const parsed = parseZip(zip);
    for (const [name, bytes] of Object.entries(files)) {
      expect(Array.from(parsed[name]!)).toEqual(Array.from(bytes));
    }
  });
});
