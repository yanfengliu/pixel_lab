import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { ToolPalette } from '../../src/ui/ToolPalette';
import { useStore, resetStore } from '../../src/ui/store';

describe('ToolPalette', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('renders all four phase-1 tools', () => {
    const { getByRole } = render(<ToolPalette />);
    expect(getByRole('button', { name: /pencil/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /eraser/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /eyedropper/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /bucket/i })).toBeInTheDocument();
  });

  it('clicking the eraser button sets activeTool to "eraser"', () => {
    const { getByRole } = render(<ToolPalette />);
    fireEvent.click(getByRole('button', { name: /eraser/i }));
    expect(useStore.getState().activeTool).toBe('eraser');
  });

  it('highlights the active tool button', () => {
    useStore.getState().setActiveTool('bucket');
    const { getByRole } = render(<ToolPalette />);
    const btn = getByRole('button', { name: /bucket/i });
    expect(btn.className).toContain('active');
  });

  it('pressing B sets active tool to pencil', () => {
    useStore.getState().setActiveTool('bucket');
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'b' });
    expect(useStore.getState().activeTool).toBe('pencil');
  });

  it('pressing E selects eraser, I eyedropper, G bucket', () => {
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'e' });
    expect(useStore.getState().activeTool).toBe('eraser');
    fireEvent.keyDown(window, { key: 'i' });
    expect(useStore.getState().activeTool).toBe('eyedropper');
    fireEvent.keyDown(window, { key: 'g' });
    expect(useStore.getState().activeTool).toBe('bucket');
  });

  it('pressing [ decrements brushSize, clamping at 1', () => {
    useStore.getState().setBrushSize(3);
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: '[' });
    expect(useStore.getState().brushSize).toBe(2);
    fireEvent.keyDown(window, { key: '[' });
    fireEvent.keyDown(window, { key: '[' });
    fireEvent.keyDown(window, { key: '[' });
    expect(useStore.getState().brushSize).toBe(1);
  });

  it('pressing ] increments brushSize, clamping at 8', () => {
    useStore.getState().setBrushSize(7);
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: ']' });
    expect(useStore.getState().brushSize).toBe(8);
    fireEvent.keyDown(window, { key: ']' });
    expect(useStore.getState().brushSize).toBe(8);
  });

  it('pressing X swaps colors', () => {
    useStore.getState().setPrimaryColor({ r: 1, g: 1, b: 1, a: 255 });
    useStore.getState().setSecondaryColor({ r: 9, g: 9, b: 9, a: 255 });
    render(<ToolPalette />);
    fireEvent.keyDown(window, { key: 'x' });
    expect(useStore.getState().primaryColor.r).toBe(9);
  });

  it('ignores shortcuts when focus is in an input', () => {
    useStore.getState().setActiveTool('eraser');
    const { container } = render(
      <div>
        <input type="text" data-testid="myinput" />
        <ToolPalette />
      </div>,
    );
    const input = container.querySelector('input')!;
    input.focus();
    fireEvent.keyDown(input, { key: 'b' });
    // activeTool should NOT have changed.
    expect(useStore.getState().activeTool).toBe('eraser');
  });

  it('Ctrl+Z triggers undo on the selected source', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 4, height: 4 });
    // Push a stroke onto the undo stack.
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
});
