import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveBytes, openBytes } from '../../src/io/persist';

type Writable = {
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
};

type Handle = {
  createWritable: () => Promise<Writable>;
  getFile: () => Promise<File>;
};

declare global {
  // eslint-disable-next-line no-var
  var showSaveFilePicker: unknown;
  // eslint-disable-next-line no-var
  var showOpenFilePicker: unknown;
}

describe('saveBytes with File System Access API', () => {
  let written: Uint8Array | null = null;

  beforeEach(() => {
    written = null;
    const handle: Handle = {
      async createWritable(): Promise<Writable> {
        return {
          async write(data) {
            written = new Uint8Array(data);
          },
          async close() {
            /* no-op */
          },
        };
      },
      async getFile() {
        throw new Error('not used');
      },
    };
    globalThis.showSaveFilePicker = vi.fn(async () => handle);
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).showSaveFilePicker;
  });

  it('writes bytes through the returned handle', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await saveBytes(bytes, {
      suggestedName: 'x.json',
      mimeType: 'application/json',
      extension: '.json',
    });
    expect(written).not.toBeNull();
    expect(Array.from(written!)).toEqual([1, 2, 3, 4]);
  });
});

describe('openBytes with File System Access API', () => {
  beforeEach(() => {
    const file = new File([new Uint8Array([9, 8, 7])], 'x.bin');
    const handle: Handle = {
      async createWritable(): Promise<Writable> {
        throw new Error('not used');
      },
      async getFile() {
        return file;
      },
    };
    globalThis.showOpenFilePicker = vi.fn(async () => [handle]);
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).showOpenFilePicker;
  });

  it('returns bytes from picked files', async () => {
    const [bytes] = await openBytes({
      accept: { 'application/octet-stream': ['.bin'] },
    });
    expect(Array.from(bytes!)).toEqual([9, 8, 7]);
  });
});
