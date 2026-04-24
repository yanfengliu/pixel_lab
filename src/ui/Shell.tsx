import { useCallback, useEffect, useState } from 'react';
import { useStore } from './store';
import { decodeImport } from '../io/file';
import { filesFromDrop } from '../io/drag-drop';
import { Canvas } from './Canvas';
import { SlicerControls } from './SlicerControls';
import { SourcesPanel } from './SourcesPanel';
import { AnimationsPanel } from './AnimationsPanel';
import { PreviewBar } from './PreviewBar';
import { TopBar } from './TopBar';
import { ToolPalette } from './ToolPalette';
import { ColorPanel } from './ColorPanel';
import { FramesStrip } from './FramesStrip';

export function Shell() {
  const project = useStore((s) => s.project);
  const sheetBitmaps = useStore((s) => s.sheetBitmaps);
  const prepared = useStore((s) => s.prepared);
  const selectedId = useStore((s) => s.selectedSourceId);
  const selectedFrameIndex = useStore((s) => s.selectedFrameIndex);
  const addSource = useStore((s) => s.addSource);
  const updateSlicing = useStore((s) => s.updateSlicing);

  const [zoom, setZoom] = useState(4);
  const [dragging, setDragging] = useState(false);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const handleSliceError = useCallback((msg: string) => setSliceError(msg), []);

  const selected = selectedId
    ? project.sources.find((s) => s.id === selectedId)
    : undefined;

  // For sheets the canvas needs the full bitmap; for sequences it needs
  // the currently selected frame's bitmap (so painting lands on the
  // right frame).
  const selectedBitmap = (() => {
    if (!selected) return undefined;
    if (selected.kind === 'sheet') return sheetBitmaps[selected.id];
    const idx = selectedFrameIndex[selected.id] ?? 0;
    return prepared[selected.id]?.frames[idx];
  })();

  async function handleDrop(ev: React.DragEvent) {
    ev.preventDefault();
    setDragging(false);
    const files = filesFromDrop(ev.nativeEvent);
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        const imported = decodeImport(bytes);
        addSource(file.name, imported);
      } catch (err) {
        console.error(`Drop failed for ${file.name}:`, err);
      }
    }
  }

  useEffect(() => {
    function prevent(e: DragEvent) {
      e.preventDefault();
    }
    window.addEventListener('dragover', prevent);
    return () => window.removeEventListener('dragover', prevent);
  }, []);

  return (
    <div
      className="shell"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {dragging ? <div className="drop-overlay">Drop to import</div> : null}
      <TopBar />
      <div className="left-rail">
        <ToolPalette />
        <ColorPanel />
      </div>
      <SourcesPanel />
      <div className="canvas-zone">
        <div className="canvas-viewport">
          {selected && selectedBitmap ? (
            <Canvas
              source={selected}
              bitmap={selectedBitmap}
              zoom={zoom}
              onSlicingChange={(s) => {
                setSliceError(null);
                updateSlicing(selected.id, s);
              }}
              onSliceError={handleSliceError}
            />
          ) : (
            <div className="empty" style={{ marginTop: 100 }}>
              Import a PNG sheet or GIF to begin, or click "+ New Blank" to
              create one.
            </div>
          )}
        </div>
        {sliceError ? (
          <div className="empty" style={{ color: 'var(--danger)', padding: '4px 12px' }}>
            Slicing error: {sliceError}
          </div>
        ) : null}
        {selected ? (
          <SlicerControls
            source={selected}
            zoom={zoom}
            onZoomChange={setZoom}
            onSlicingChange={(s) => {
              setSliceError(null);
              updateSlicing(selected.id, s);
            }}
          />
        ) : null}
      </div>
      <AnimationsPanel />
      <div className="frames-zone">
        <FramesStrip />
        <PreviewBar />
      </div>
    </div>
  );
}
