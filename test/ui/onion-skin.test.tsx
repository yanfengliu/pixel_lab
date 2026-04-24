import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Canvas } from '../../src/ui/Canvas';
import { FramesStrip } from '../../src/ui/FramesStrip';
import { useStore, resetStore } from '../../src/ui/store';
import { setPixel } from '../../src/core/image';

/**
 * Mount a two-frame sequence for onion-skin tests. Returns the source and
 * both bitmaps. Frame 0 is painted red, frame 1 blue so we can tell which
 * was rendered where.
 */
function mountTwoFrameSequence() {
  const src = useStore
    .getState()
    .createBlankSource({
      kind: 'sequence',
      name: 'anim',
      width: 4,
      height: 4,
      frameCount: 2,
    });
  useStore.getState().selectSource(src.id);
  const frames = useStore.getState().prepared[src.id]!.frames;
  // Paint frame 0 red, frame 1 blue.
  setPixel(frames[0]!, 0, 0, 255, 0, 0, 255);
  setPixel(frames[1]!, 0, 0, 0, 0, 255, 255);
  return { src, frames };
}

describe('store: onion skin', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('onionSkin defaults to false', () => {
    expect(useStore.getState().onionSkin).toBe(false);
  });

  it('setOnionSkin toggles the flag', () => {
    useStore.getState().setOnionSkin(true);
    expect(useStore.getState().onionSkin).toBe(true);
    useStore.getState().setOnionSkin(false);
    expect(useStore.getState().onionSkin).toBe(false);
  });
});

describe('FramesStrip: onion skin toggle', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('renders an onion skin toggle button', () => {
    const { getByRole } = render(<FramesStrip />);
    expect(getByRole('button', { name: /onion skin/i })).toBeInTheDocument();
  });

  it('clicking the toggle flips store.onionSkin', () => {
    const { getByRole } = render(<FramesStrip />);
    expect(useStore.getState().onionSkin).toBe(false);
    fireEvent.click(getByRole('button', { name: /onion skin/i }));
    expect(useStore.getState().onionSkin).toBe(true);
    fireEvent.click(getByRole('button', { name: /onion skin/i }));
    expect(useStore.getState().onionSkin).toBe(false);
  });

  it('reflects the current onionSkin state as aria-pressed', () => {
    const { getByRole } = render(<FramesStrip />);
    const btn = getByRole('button', { name: /onion skin/i });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Canvas: onion skin layer', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
  });

  it('does not render an onion skin layer when onionSkin is off', () => {
    const { src, frames } = mountTwoFrameSequence();
    useStore.getState().setSelectedFrameIndex(src.id, 1);
    useStore.getState().setOnionSkin(false);
    const source = useStore.getState().project.sources.find((x) => x.id === src.id)!;
    const { container } = render(
      <Canvas
        source={source}
        bitmap={frames[1]!}
        zoom={1}
        onSlicingChange={() => {}}
      />,
    );
    expect(container.querySelector('.onion-skin-layer')).toBeNull();
  });

  it('renders an onion skin layer for a sequence with selectedFrameIndex > 0', () => {
    const { src, frames } = mountTwoFrameSequence();
    useStore.getState().setSelectedFrameIndex(src.id, 1);
    useStore.getState().setOnionSkin(true);
    const source = useStore.getState().project.sources.find((x) => x.id === src.id)!;
    const { container } = render(
      <Canvas
        source={source}
        bitmap={frames[1]!}
        zoom={1}
        onSlicingChange={() => {}}
      />,
    );
    const layer = container.querySelector<HTMLElement>('.onion-skin-layer');
    expect(layer).not.toBeNull();
    // Layer must be semi-transparent, sitting under the current frame.
    const opacity = parseFloat(layer!.style.opacity || '1');
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });

  it('does not render an onion skin layer at selectedFrameIndex === 0', () => {
    const { src, frames } = mountTwoFrameSequence();
    useStore.getState().setSelectedFrameIndex(src.id, 0);
    useStore.getState().setOnionSkin(true);
    const source = useStore.getState().project.sources.find((x) => x.id === src.id)!;
    const { container } = render(
      <Canvas
        source={source}
        bitmap={frames[0]!}
        zoom={1}
        onSlicingChange={() => {}}
      />,
    );
    // Frame 0 has no previous frame to show.
    expect(container.querySelector('.onion-skin-layer')).toBeNull();
  });

  it('does not render an onion skin layer on a sheet source even when onionSkin is on', () => {
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 's', width: 4, height: 4 });
    useStore.getState().selectSource(src.id);
    useStore.getState().setOnionSkin(true);
    const source = useStore.getState().project.sources.find((x) => x.id === src.id)!;
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    const { container } = render(
      <Canvas
        source={source}
        bitmap={bmp}
        zoom={1}
        onSlicingChange={() => {}}
      />,
    );
    expect(container.querySelector('.onion-skin-layer')).toBeNull();
  });
});
