import { useEffect } from 'react';
import { useStore } from './store';
import type { Tool } from '../core/types';

interface ToolDef {
  key: Tool;
  label: string;
  shortcut?: string;
  glyph: string;
}

/** Tool groups are rendered with a thin separator between them. */
interface ToolGroup {
  key: string;
  tools: ToolDef[];
}

const GROUPS: ToolGroup[] = [
  {
    key: 'paint',
    tools: [
      { key: 'pencil', label: 'Pencil', shortcut: 'B', glyph: '✎' },
      { key: 'eraser', label: 'Eraser', shortcut: 'E', glyph: '◇' },
      { key: 'eyedropper', label: 'Eyedropper', shortcut: 'I', glyph: '⊙' },
      { key: 'bucket', label: 'Bucket', shortcut: 'G', glyph: '◈' },
    ],
  },
  {
    key: 'shapes',
    tools: [
      { key: 'line', label: 'Line', shortcut: 'L', glyph: '╱' },
      { key: 'rectOutline', label: 'Rectangle Outline', shortcut: 'U', glyph: '▯' },
      { key: 'rectFilled', label: 'Rectangle Filled', glyph: '▮' },
      { key: 'ellipseOutline', label: 'Ellipse Outline', glyph: '○' },
      { key: 'ellipseFilled', label: 'Ellipse Filled', glyph: '●' },
    ],
  },
  {
    key: 'selection',
    tools: [
      { key: 'marquee', label: 'Marquee Select', shortcut: 'M', glyph: '⬚' },
      { key: 'move', label: 'Move', shortcut: 'V', glyph: '✚' },
    ],
  },
  {
    key: 'slice',
    tools: [{ key: 'slice', label: 'Slice Rect', shortcut: 'S', glyph: '✂' }],
  },
];

const SHORTCUT_TO_TOOL: Record<string, Tool> = {
  b: 'pencil',
  e: 'eraser',
  i: 'eyedropper',
  g: 'bucket',
  l: 'line',
  u: 'rectOutline',
  m: 'marquee',
  v: 'move',
  // 's' handled specially — only when slicing is manual.
};

/**
 * Tool palette with click-to-select and keyboard shortcuts.
 *
 * Shortcuts:
 * - B/E/I/G/L/U/M/V: select tool.
 * - S: slice rect, only when the selected source's slicing is manual.
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
  const clearSelection = useStore((s) => s.clearSelection);

  // The slice tool is ghosted unless the selected source has manual
  // slicing; shortcut `S` and clicks both respect that.
  const sliceAvailable = useStore((s) => {
    if (!s.selectedSourceId) return false;
    const src = s.project.sources.find((x) => x.id === s.selectedSourceId);
    return src?.slicing.kind === 'manual';
  });

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
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
      // ESC clears any active marquee selection (Aseprite parity).
      if (ev.key === 'Escape') {
        if (useStore.getState().selection) clearSelection();
        return;
      }
      if (k === 's') {
        // Guard: slice tool requires manual slicing.
        if (sliceAvailable) setActiveTool('slice');
        return;
      }
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
  }, [
    setActiveTool,
    setBrushSize,
    swapColors,
    undo,
    redo,
    sliceAvailable,
    clearSelection,
  ]);

  return (
    <div className="tool-palette" role="toolbar" aria-label="Drawing tools">
      {GROUPS.map((group, gi) => (
        <div key={group.key} className={`tool-group tool-group-${group.key}`}>
          {gi > 0 ? <div className="tool-divider" aria-hidden="true" /> : null}
          {group.tools.map((t) => {
            const isSlice = t.key === 'slice';
            const disabled = isSlice && !sliceAvailable;
            const title =
              disabled
                ? 'Switch slicing to Manual to use'
                : t.shortcut
                  ? `${t.label} (${t.shortcut})`
                  : t.label;
            return (
              <button
                key={t.key}
                className={`tool-btn${activeTool === t.key ? ' active' : ''}${
                  disabled ? ' ghosted' : ''
                }`}
                title={title}
                aria-label={t.label}
                aria-pressed={activeTool === t.key}
                aria-disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  setActiveTool(t.key);
                }}
              >
                <span className="glyph" aria-hidden="true">
                  {t.glyph}
                </span>
                {t.shortcut ? (
                  <span className="shortcut">{t.shortcut}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
      <div className="brush-size-row" title="Brush size ([ / ])">
        <button
          className="size-btn"
          aria-label="Decrease brush size"
          onClick={() => setBrushSize(brushSize - 1)}
        >
          &minus;
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
