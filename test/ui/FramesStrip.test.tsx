import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { FramesStrip } from '../../src/ui/FramesStrip';
import { useStore, resetStore } from '../../src/ui/store';

describe('FramesStrip', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('renders nothing useful when no source is selected', () => {
    const { container } = render(<FramesStrip />);
    // Strip container exists but has no thumbnails.
    expect(container.querySelectorAll('.frame-thumb')).toHaveLength(0);
  });

  it('renders N thumbnails for an N-frame sequence', () => {
    const src = useStore.getState().createBlankSource({
      kind: 'sequence',
      name: 'a',
      width: 4,
      height: 4,
      frameCount: 5,
    });
    useStore.getState().selectSource(src.id);
    const { container } = render(<FramesStrip />);
    expect(container.querySelectorAll('.frame-thumb')).toHaveLength(5);
  });

  it('clicking a thumbnail updates selectedFrameIndex for that source', () => {
    const src = useStore.getState().createBlankSource({
      kind: 'sequence',
      name: 'a',
      width: 4,
      height: 4,
      frameCount: 4,
    });
    useStore.getState().selectSource(src.id);
    const { container } = render(<FramesStrip />);
    const thumbs = container.querySelectorAll<HTMLElement>('.frame-thumb');
    fireEvent.click(thumbs[2]!);
    expect(useStore.getState().selectedFrameIndex[src.id]).toBe(2);
  });

  it('marks the selected frame thumbnail as active', () => {
    const src = useStore.getState().createBlankSource({
      kind: 'sequence',
      name: 'a',
      width: 4,
      height: 4,
      frameCount: 3,
    });
    useStore.getState().selectSource(src.id);
    useStore.getState().setSelectedFrameIndex(src.id, 1);
    const { container } = render(<FramesStrip />);
    const thumbs = container.querySelectorAll<HTMLElement>('.frame-thumb');
    expect(thumbs[1]!.className).toContain('active');
    expect(thumbs[0]!.className).not.toContain('active');
  });
});
