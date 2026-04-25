import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';

// Mock the rendering helper so we can count how often the Canvas pushes
// pixels to the DOM. vi.mock is hoisted so must run before imports.
const drawMock = vi.fn();
vi.mock('../../src/ui/rendering', () => ({
  drawImageToCanvas: (...args: unknown[]) => drawMock(...args),
}));

// eslint-disable-next-line import/first
import { Canvas } from '../../src/ui/Canvas';
// eslint-disable-next-line import/first
import { useStore, resetStore } from '../../src/ui/store';
// eslint-disable-next-line import/first
import { setPixel } from '../../src/core/image';

function stubRect(overlay: Element) {
  Object.defineProperty(overlay, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  });
}

describe('Canvas — reactivity (I2 regression)', () => {
  beforeEach(() => {
    resetStore();
    cleanup();
    drawMock.mockClear();
  });

  it('undo after paint re-invokes drawImageToCanvas on the sheet', () => {
    useStore.getState().setActiveTool('pencil');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 't', width: 8, height: 8 });
    useStore.getState().selectSource(src.id);
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    const source = useStore
      .getState()
      .project.sources.find((x) => x.id === src.id)!;
    const { container } = render(
      <Canvas source={source} bitmap={bmp} zoom={1} onSlicingChange={() => {}} />,
    );
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.pointerUp(overlay);
    const before = drawMock.mock.calls.length;
    act(() => {
      useStore.getState().undo(src.id);
    });
    expect(drawMock.mock.calls.length).toBeGreaterThan(before);
  });

  it('redo after undo re-invokes drawImageToCanvas on the sheet', () => {
    useStore.getState().setActiveTool('pencil');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const src = useStore
      .getState()
      .createBlankSource({ kind: 'sheet', name: 't', width: 8, height: 8 });
    useStore.getState().selectSource(src.id);
    const bmp = useStore.getState().sheetBitmaps[src.id]!;
    const source = useStore
      .getState()
      .project.sources.find((x) => x.id === src.id)!;
    const { container } = render(
      <Canvas source={source} bitmap={bmp} zoom={1} onSlicingChange={() => {}} />,
    );
    const overlay = container.querySelector('.paint-overlay')!;
    stubRect(overlay);
    fireEvent.pointerDown(overlay, { button: 0, clientX: 1.5, clientY: 1.5 });
    fireEvent.pointerUp(overlay);
    act(() => {
      useStore.getState().undo(src.id);
    });
    const before = drawMock.mock.calls.length;
    act(() => {
      useStore.getState().redo(src.id);
    });
    expect(drawMock.mock.calls.length).toBeGreaterThan(before);
  });

  it('undo on a sequence frame re-invokes drawImageToCanvas', () => {
    useStore.getState().setActiveTool('pencil');
    useStore.getState().setPrimaryColor({ r: 200, g: 50, b: 25, a: 255 });
    const src = useStore.getState().createBlankSource({
      kind: 'sequence',
      name: 'seq',
      width: 4,
      height: 4,
      frameCount: 2,
    });
    useStore.getState().selectSource(src.id);
    useStore.getState().setSelectedFrameIndex(src.id, 1);
    const frame1 = useStore.getState().prepared[src.id]!.frames[1]!;
    setPixel(frame1, 0, 0, 200, 0, 0, 255);
    const commit = useStore.getState().beginStroke(src.id, 1);
    setPixel(frame1, 1, 1, 0, 200, 0, 255);
    commit();
    const source = useStore
      .getState()
      .project.sources.find((x) => x.id === src.id)!;
    render(
      <Canvas source={source} bitmap={frame1} zoom={1} onSlicingChange={() => {}} />,
    );
    const before = drawMock.mock.calls.length;
    act(() => {
      useStore.getState().undo(src.id);
    });
    expect(drawMock.mock.calls.length).toBeGreaterThan(before);
  });

  it('editing previous frame re-invokes onion-skin drawImageToCanvas (I7)', () => {
    const src = useStore.getState().createBlankSource({
      kind: 'sequence',
      name: 'seq',
      width: 4,
      height: 4,
      frameCount: 2,
    });
    useStore.getState().selectSource(src.id);
    useStore.getState().setSelectedFrameIndex(src.id, 1);
    useStore.getState().setOnionSkin(true);
    const source = useStore
      .getState()
      .project.sources.find((x) => x.id === src.id)!;
    const frame1 = useStore.getState().prepared[src.id]!.frames[1]!;
    render(
      <Canvas source={source} bitmap={frame1} zoom={1} onSlicingChange={() => {}} />,
    );
    const before = drawMock.mock.calls.length;
    // Edit frame 0 (the onion-skin ghost). The Canvas still displays
    // frame 1 but the onion-skin layer must refresh with the new pixels.
    act(() => {
      const commit = useStore.getState().beginStroke(src.id, 0);
      const frame0 = useStore.getState().prepared[src.id]!.frames[0]!;
      setPixel(frame0, 2, 2, 111, 222, 33, 255);
      commit();
    });
    expect(drawMock.mock.calls.length).toBeGreaterThan(before);
  });
});
