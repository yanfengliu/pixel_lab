import { useEffect } from 'react';
import { useStore } from './store';
import type { Tool } from '../core/types';

interface ToolDef {
  key: Tool;
  label: string;
  shortcut: string;
  glyph: string;
}

const TOOLS: ToolDef[] = [
  { key: 'pencil', label: 'Pencil', shortcut: 'B', glyph: '✎' },
  { key: 'eraser', label: 'Eraser', shortcut: 'E', glyph: '◇' },
  { key: 'eyedropper', label: 'Eyedropper', shortcut: 'I', glyph: '⊙' },
  { key: 'bucket', label: 'Bucket', shortcut: 'G', glyph: '◈' },
];

const SHORTCUT_TO_TOOL: Record<string, Tool> = {
  b: 'pencil',
  e: 'eraser',
  i: 'eyedropper',
  g: 'bucket',
};

/**
 * Tool palette with click-to-select and keyboard shortcuts.
 *
 * Shortcuts:
 * - B/E/I/G: select tool.
 * - [ / ]: shrink / grow brush.
 * - X: swap primary/secondary color.
 * - Ctrl+Z / Ctrl+Shift+Z: undo / redo on the selected source.
 *
 * Listeners attach at the window level so they fire from anywhere on
 * the page, but only when focus isn't trapped in an input/textarea
 * (otherwise the user typing "b" in a name field would change tools).
 */
export function ToolPalette() {
  const activeTool = useStore((s) => s.activeTool);
  const brushSize = useStore((s) => s.brushSize);
  const setActiveTool = useStore((s) => s.setActiveTool);
  const setBrushSize = useStore((s) => s.setBrushSize);
  const swapColors = useStore((s) => s.swapColors);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target.isContentEditable
      );
    }
    function onKey(ev: KeyboardEvent) {
      if (isEditableTarget(ev.target)) return;
      const k = ev.key.toLowerCase();
      // Undo / redo first (with modifiers).
      if ((ev.ctrlKey || ev.metaKey) && k === 'z') {
        ev.preventDefault();
        const sid = useStore.getState().selectedSourceId;
        if (!sid) return;
        if (ev.shiftKey) redo(sid);
        else undo(sid);
        return;
      }
      // Bare-key shortcuts.
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (k in SHORTCUT_TO_TOOL) {
        setActiveTool(SHORTCUT_TO_TOOL[k]!);
        return;
      }
      if (k === '[') {
        setBrushSize(useStore.getState().brushSize - 1);
        return;
      }
      if (k === ']') {
        setBrushSize(useStore.getState().brushSize + 1);
        return;
      }
      if (k === 'x') {
        swapColors();
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setActiveTool, setBrushSize, swapColors, undo, redo]);

  return (
    <div className="tool-palette" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => (
        <button
          key={t.key}
          className={`tool-btn${activeTool === t.key ? ' active' : ''}`}
          title={`${t.label} (${t.shortcut})`}
          aria-label={t.label}
          aria-pressed={activeTool === t.key}
          onClick={() => setActiveTool(t.key)}
        >
          <span className="glyph" aria-hidden="true">{t.glyph}</span>
          <span className="shortcut">{t.shortcut}</span>
        </button>
      ))}
      <div className="brush-size-row" title="Brush size ([ / ])">
        <button
          className="size-btn"
          aria-label="Decrease brush size"
          onClick={() => setBrushSize(brushSize - 1)}
        >
          −
        </button>
        <span className="size-readout">{brushSize}</span>
        <button
          className="size-btn"
          aria-label="Increase brush size"
          onClick={() => setBrushSize(brushSize + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
