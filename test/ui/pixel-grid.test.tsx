import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Canvas } from '../../src/ui/Canvas';
import { useStore, resetStore } from '../../src/ui/store';

/**
 * Mount a small sheet Canvas at a given zoom and return the container.
 * The pixel-grid overlay appears at zoom >= 8; below that, no grid.
 */
function mountAt(zoom: number) {
  const src = useStore
    .getState()
    .createBlankSource({ kind: 'sheet', name: 's', width: 4, height: 4 });
  useStore.getState().selectSource(src.id);
  const source = useStore.getState().project.sources.find((x) => x.id === src.id)!;
  const bmp = useStore.getState().sheetBitmaps[src.id]!;
  return render(
    <Canvas source={source} bitmap={bmp} zoom={zoom} onSlicingChange={() => {}} />,
  );
}

describe('Canvas: pixel grid overlay', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('zoom=4 does not render a pixel grid', () => {
    const { container } = mountAt(4);
    expect(container.querySelector('.pixel-grid-overlay')).toBeNull();
  });

  it('zoom=8 renders a pixel grid', () => {
    const { container } = mountAt(8);
    const grid = container.querySelector<HTMLElement>('.pixel-grid-overlay');
    expect(grid).not.toBeNull();
  });

  it('zoom=16 renders a pixel grid scaled to the zoom', () => {
    const { container } = mountAt(16);
    const grid = container.querySelector<HTMLElement>('.pixel-grid-overlay');
    expect(grid).not.toBeNull();
    // background-size must reflect current zoom so lines land on every
    // pixel boundary.
    const bgSize = grid!.style.backgroundSize;
    expect(bgSize).toContain('16px');
  });

  it('pixel grid is non-interactive (pointer-events: none)', () => {
    const { container } = mountAt(8);
    const grid = container.querySelector<HTMLElement>('.pixel-grid-overlay');
    expect(grid).not.toBeNull();
    expect(grid!.style.pointerEvents).toBe('none');
  });
});
