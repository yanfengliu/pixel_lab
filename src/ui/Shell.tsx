import { useEffect, useState } from 'react';
import { useStore } from '../app/store';
import { decodeImport } from '../io/file';
import { filesFromDrop } from '../io/drag-drop';
import { Canvas } from './Canvas';
import { SlicerControls } from './SlicerControls';
import { SourcesPanel } from './SourcesPanel';
import { AnimationsPanel } from './AnimationsPanel';
import { PreviewBar } from './PreviewBar';
import { TopBar } from './TopBar';

export function Shell() {
  const project = useStore((s) => s.project);
  const sheetBitmaps = useStore((s) => s.sheetBitmaps);
  const prepared = useStore((s) => s.prepared);
  const selectedId = useStore((s) => s.selectedSourceId);
  const addSource = useStore((s) => s.addSource);
  const updateSlicing = useStore((s) => s.updateSlicing);

  const [zoom, setZoom] = useState(4);
  const [dragging, setDragging] = useState(false);

  const selected = selectedId
    ? project.sources.find((s) => s.id === selectedId)
    : undefined;

  const selectedBitmap = selected
    ? selected.kind === 'sheet'
      ? sheetBitmaps[selected.id]
      : prepared[selected.id]?.frames[0]
    : undefined;

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
      <SourcesPanel />
      <div className="canvas-zone">
        <div className="canvas-viewport">
          {selected && selectedBitmap ? (
            <Canvas
              source={selected}
              bitmap={selectedBitmap}
              zoom={zoom}
              onSlicingChange={(s) => updateSlicing(selected.id, s)}
            />
          ) : (
            <div className="empty" style={{ marginTop: 100 }}>
              Import a PNG sheet or GIF to begin
            </div>
          )}
        </div>
        {selected ? (
          <SlicerControls
            source={selected}
            zoom={zoom}
            onZoomChange={setZoom}
            onSlicingChange={(s) => updateSlicing(selected.id, s)}
          />
        ) : null}
      </div>
      <AnimationsPanel />
      <PreviewBar />
    </div>
  );
}
