import { describe, it, expect } from 'vitest';
import { filesFromDrop } from '../../src/io/drag-drop';

function fakeItem(file: File): DataTransferItem {
  return {
    kind: 'file',
    type: file.type,
    getAsFile: () => file,
  } as unknown as DataTransferItem;
}

function fakeDragEvent(items: File[] | null, files: File[] | null): DragEvent {
  const itemsList = items
    ? (Object.assign(
        items.map((f) => fakeItem(f)),
        { length: items.length },
      ) as unknown as DataTransferItemList)
    : undefined;
  const filesList = files
    ? (Object.assign(
        files.slice(),
        {
          length: files.length,
          item: (i: number) => files[i] ?? null,
        },
      ) as unknown as FileList)
    : undefined;
  const dt = {
    ...(itemsList ? { items: itemsList } : {}),
    ...(filesList ? { files: filesList } : {}),
  } as DataTransfer;
  return { dataTransfer: dt } as DragEvent;
}

describe('filesFromDrop', () => {
  it('extracts files from dt.items when present', () => {
    const f = new File([new Uint8Array([1])], 'x.png');
    const ev = fakeDragEvent([f], null);
    expect(filesFromDrop(ev)).toEqual([f]);
  });

  it('falls back to dt.files when items missing', () => {
    const f = new File([new Uint8Array([1])], 'x.png');
    const ev = fakeDragEvent(null, [f]);
    expect(filesFromDrop(ev)).toEqual([f]);
  });

  it('returns empty array when dataTransfer is null', () => {
    const ev = { dataTransfer: null } as unknown as DragEvent;
    expect(filesFromDrop(ev)).toEqual([]);
  });

  it('ignores non-file items', () => {
    const f = new File([new Uint8Array([1])], 'x.png');
    const items = Object.assign(
      [
        { kind: 'string', getAsFile: () => null } as unknown as DataTransferItem,
        { kind: 'file', getAsFile: () => f } as unknown as DataTransferItem,
      ],
      { length: 2 },
    ) as unknown as DataTransferItemList;
    const ev = { dataTransfer: { items } as DataTransfer } as DragEvent;
    expect(filesFromDrop(ev)).toEqual([f]);
  });
});
