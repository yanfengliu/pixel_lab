/**
 * Pure helpers for drag-and-drop: extract the File[] out of a DragEvent.
 * Kept in io/ (not ui/) so the wiring can be tested without React.
 */
export function filesFromDrop(ev: DragEvent): File[] {
  const out: File[] = [];
  const dt = ev.dataTransfer;
  if (!dt) return out;
  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item && item.kind === 'file') {
        const f = item.getAsFile();
        if (f) out.push(f);
      }
    }
  } else if (dt.files && dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      if (f) out.push(f);
    }
  }
  return out;
}
