/**
 * File System Access API wrappers with graceful fallback.
 *
 * Windows 11 + Chromium: gets native "Save As" / "Open" dialogs.
 * Firefox / Safari: falls back to anchor-download for save and a hidden
 * <input type="file"> for open.
 */

export interface SavePickerOptions {
  suggestedName: string;
  mimeType: string;
  extension: string;
}

export interface OpenPickerOptions {
  accept: Record<string, string[]>; // e.g. { 'image/png': ['.png'] }
  multiple?: boolean;
}

interface ShowSavePicker {
  (opts: {
    suggestedName: string;
    types: Array<{ description?: string; accept: Record<string, string[]> }>;
  }): Promise<FileSystemFileHandleLike>;
}

interface ShowOpenPicker {
  (opts: {
    multiple?: boolean;
    types: Array<{ description?: string; accept: Record<string, string[]> }>;
  }): Promise<FileSystemFileHandleLike[]>;
}

interface FileSystemFileHandleLike {
  createWritable(): Promise<{
    write(data: Uint8Array | Blob): Promise<void>;
    close(): Promise<void>;
  }>;
  getFile(): Promise<File>;
}

function hasShowSavePicker(): boolean {
  return typeof (globalThis as unknown as { showSaveFilePicker?: ShowSavePicker })
    .showSaveFilePicker === 'function';
}

function hasShowOpenPicker(): boolean {
  return typeof (globalThis as unknown as { showOpenFilePicker?: ShowOpenPicker })
    .showOpenFilePicker === 'function';
}

export async function saveBytes(
  bytes: Uint8Array,
  opts: SavePickerOptions,
): Promise<void> {
  if (hasShowSavePicker()) {
    const picker = (globalThis as unknown as { showSaveFilePicker: ShowSavePicker })
      .showSaveFilePicker;
    const handle = await picker({
      suggestedName: opts.suggestedName,
      types: [
        {
          description: opts.mimeType,
          accept: { [opts.mimeType]: [opts.extension] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    return;
  }
  downloadBlob(bytes, opts.suggestedName, opts.mimeType);
}

export async function openBytes(
  opts: OpenPickerOptions,
): Promise<Uint8Array[]> {
  if (hasShowOpenPicker()) {
    const picker = (globalThis as unknown as { showOpenFilePicker: ShowOpenPicker })
      .showOpenFilePicker;
    const handles = await picker({
      multiple: opts.multiple ?? false,
      types: [{ accept: opts.accept }],
    });
    const files = await Promise.all(handles.map((h) => h.getFile()));
    return Promise.all(
      files.map(async (f) => new Uint8Array(await f.arrayBuffer())),
    );
  }
  return fallbackOpen(opts);
}

function downloadBlob(bytes: Uint8Array, name: string, mime: string): void {
  // Blob's types require ArrayBuffer, but Uint8Array's generic buffer may
  // be SharedArrayBuffer under strict TS. Copy to a plain ArrayBuffer.
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fallbackOpen(opts: OpenPickerOptions): Promise<Uint8Array[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = opts.multiple ?? false;
    input.accept = Object.values(opts.accept).flat().join(',');
    // Firefox requires the input to be in the DOM before programmatic
    // click fires the picker; detached inputs silently fail there. The
    // node is hidden and removed once resolved/cancelled.
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    document.body.appendChild(input);
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };
    input.onchange = async () => {
      try {
        const files = Array.from(input.files ?? []);
        if (files.length === 0) {
          cleanup();
          resolve([]);
          return;
        }
        const bytes = await Promise.all(
          files.map(async (f) => new Uint8Array(await f.arrayBuffer())),
        );
        cleanup();
        resolve(bytes);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    // Modern browsers fire 'cancel' when the dialog is dismissed. Older
    // browsers never fire anything on cancel — in that case the promise
    // stays pending (acceptable for a user-cancelled interaction).
    input.addEventListener('cancel', () => {
      cleanup();
      resolve([]);
    });
    input.click();
  });
}
