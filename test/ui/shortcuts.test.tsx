import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { ToolPalette } from '../../src/ui/ToolPalette';
import { useStore, resetStore } from '../../src/ui/store';

/**
 * End-to-end keyboard shortcut coverage for every binding in the spec:
 *
 *   B, E, I, G, L, U, M, V, S, X, [, ], Ctrl+Z, Ctrl+Shift+Z, ESC
 *
 * The ToolPalette owns the keyboard listener (window-level). These
 * tests mount the palette and assert the store side-effect of each
 * shortcut.
 */
describe('Keyboard shortcuts — complete spec map', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('B selects pencil', () => {
    useStore.getState().setActiveTool('eraser');
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'b' });
    expect(useStore.getState().activeTool).toBe('pencil');
  });

  it('E selects eraser', () => {
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'e' });
    expect(useStore.getState().activeTool).toBe('eraser');
  });

  it('I selects eyedropper', () => {
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'i' });
    expect(useStore.getState().activeTool).toBe('eyedropper');
  });

  it('G selects bucket', () => {
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'g' });
    expect(useStore.getState().activeTool).toBe('bucket');
  });

  it('L selects line', () => {
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'l' });
    expect(useStore.getState().activeTool).toBe('line');
  });

  it('U selects rectangle outline', () => {
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'u' });
    expect(useStore.getState().activeTool).toBe('rectOutline');
  });

  it('M selects marquee', () => {
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'm' });
    expect(useStore.getState().activeTool).toBe('marquee');
  });

  it('V selects move', () => {
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'v' });
    expect(useStore.getState().activeTool).toBe('move');
  });

  it('S selects slice only when slicing is manual', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 4, height: 4 });
    useStore.getState().selectSource(src.id);
    useStore.getState().updateSlicing(src.id, { kind: 'manual', rects: [] });
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 's' });
    expect(useStore.getState().activeTool).toBe('slice');
  });

  it('S is a no-op when slicing is not manual', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 4, height: 4 });
    useStore.getState().selectSource(src.id);
    useStore.getState().setActiveTool('pencil');
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 's' });
    expect(useStore.getState().activeTool).toBe('pencil');
  });

  it('X swaps primary and secondary colors', () => {
    useStore.getState().setPrimaryColor({ r: 1, g: 2, b: 3, a: 255 });
    useStore.getState().setSecondaryColor({ r: 10, g: 20, b: 30, a: 255 });
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'x' });
    const s = useStore.getState();
    expect(s.primaryColor).toEqual({ r: 10, g: 20, b: 30, a: 255 });
    expect(s.secondaryColor).toEqual({ r: 1, g: 2, b: 3, a: 255 });
  });

  it('[ decrements brush size (clamped to 1)', () => {
    useStore.getState().setBrushSize(3);
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: '[' });
    expect(useStore.getState().brushSize).toBe(2);
  });

  it('] increments brush size (clamped to 8)', () => {
    useStore.getState().setBrushSize(3);
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: ']' });
    expect(useStore.getState().brushSize).toBe(4);
  });

  it('Ctrl+Z undoes the most recent stroke on the selected source', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 4, height: 4 });
    const commit = useStore.getState().beginStroke(src.id, 0);
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    bmp.data[0] = 200;
    bmp.data[3] = 255;
    commit();
    expect(useStore.getState().undoStacks[src.id]).toHaveLength(1);
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(0);
    expect(useStore.getState().redoStacks[src.id]).toHaveLength(1);
  });

  it('Ctrl+Shift+Z redoes the most recent undo on the selected source', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 4, height: 4 });
    const commit = useStore.getState().beginStroke(src.id, 0);
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    bmp.data[0] = 200;
    bmp.data[3] = 255;
    commit();
    useStore.getState().undo(src.id);
    expect(useStore.getState().redoStacks[src.id]).toHaveLength(1);
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(useStore.getState().redoStacks[src.id] ?? []).toHaveLength(0);
    expect(useStore.getState().undoStacks[src.id]).toHaveLength(1);
  });

  it('Cmd+Z (metaKey) on mac also undoes', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 4, height: 4 });
    const commit = useStore.getState().beginStroke(src.id, 0);
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    bmp.data[0] = 50;
    bmp.data[3] = 255;
    commit();
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(useStore.getState().undoStacks[src.id] ?? []).toHaveLength(0);
  });

  it('ESC clears the active marquee selection', () => {
    const src = useStore.getState().createBlankSource({
      kind: 'sequence',
      name: 'a',
      width: 8,
      height: 8,
      frameCount: 2,
    });
    useStore.getState().setSelection({
      sourceId: src.id,
      frameIndex: 0,
      sel: { rect: { x: 1, y: 1, w: 3, h: 3 }, mask: new Uint8Array(9).fill(1) },
    });
    expect(useStore.getState().selection).not.toBeNull();
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useStore.getState().selection).toBeNull();
  });

  it('ESC does nothing when there is no selection', () => {
    render(<ToolPalette />);
    // Should not throw.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useStore.getState().selection).toBeNull();
  });

  it('all shortcuts ignore events from inputs/textareas/contenteditables', () => {
    useStore.getState().setActiveTool('pencil');
    const { container } = render(
      <div>
        <input type="text" data-testid="text-input" />
        <textarea data-testid="ta" />
        <div contentEditable="true" data-testid="ce" />
        <ToolPalette />
      </div>,
    );
    const input = container.querySelector('input')!;
    input.focus();
    fireEvent.keyDown(input, { key: 'e' });
    expect(useStore.getState().activeTool).toBe('pencil');

    const ta = container.querySelector('textarea')!;
    ta.focus();
    fireEvent.keyDown(ta, { key: 'g' });
    expect(useStore.getState().activeTool).toBe('pencil');

    const ce = container.querySelector('[contenteditable="true"]')!;
    (ce as HTMLElement).focus();
    fireEvent.keyDown(ce, { key: 'b' });
    expect(useStore.getState().activeTool).toBe('pencil');
  });
});
