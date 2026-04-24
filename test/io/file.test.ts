import { describe, it, expect } from 'vitest';
import { detectKind } from '../../src/io/file';

describe('detectKind', () => {
  it('identifies the full PNG 8-byte signature', () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(detectKind(bytes)).toBe('sheet');
  });

  it('rejects a truncated PNG-like prefix', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    expect(() => detectKind(bytes)).toThrow();
  });

  it('rejects GIF-prefixed bytes that are not 87a/89a', () => {
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x35, 0x61]);
    expect(() => detectKind(bytes)).toThrow();
  });

  it('identifies GIF89a and GIF87a signatures', () => {
    expect(
      detectKind(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])),
    ).toBe('gif');
    expect(
      detectKind(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61])),
    ).toBe('gif');
  });

  it('rejects unknown formats', () => {
    expect(() => detectKind(new Uint8Array([1, 2, 3, 4]))).toThrow();
    expect(() => detectKind(new Uint8Array([]))).toThrow();
  });
});
