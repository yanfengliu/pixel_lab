import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [panning, setPanning] = useState(false);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const handleSliceError = useCallback((msg: string) => setSliceError(msg), []);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<
    | { startClientX: number; startClientY: number; scrollLeft: number; scrollTop: number }
    | null
  >(null);

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 16;

  // Scroll-wheel zooms (anchored at cursor), middle-button drags pan.
  // Attached natively so wheel preventDefault actually stops the
  // viewport scroll — React wheel synthetic events are passive.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = vp!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const contentX = vp!.scrollLeft + mouseX;
      const contentY = vp!.scrollTop + mouseY;
      setZoom((oldZoom) => {
        const step = e.deltaY < 0 ? 1 : -1;
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom + step));
        if (newZoom === oldZoom) return oldZoom;
        // Adjust scroll so the content point under the cursor stays put
        // after the zoom ratio is applied. Schedule after React commits
        // so the inner canvas has already resized.
        requestAnimationFrame(() => {
          const ratio = newZoom / oldZoom;
          vp!.scrollLeft = contentX * ratio - mouseX;
          vp!.scrollTop = contentY * ratio - mouseY;
        });
        return newZoom;
      });
    }
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, []);

  // Pointer capture handles the lost-mouseup case: the browser routes
  // pointer events back to the captured viewport regardless of cursor
  // location, so middle-button pan can't get stuck "panning" when the
  // user releases the button outside the window.
  const capturedPanPointerIdRef = useRef<number | null>(null);

  // Mirror Canvas's defense-in-depth release: if the component unmounts
  // mid-pan, explicitly release the captured pointer. Browsers auto-
  // release on unmount so this is belt-and-suspenders, but the symmetry
  // with Canvas keeps the pattern consistent for future maintainers.
  useEffect(() => {
    return () => {
      const id = capturedPanPointerIdRef.current;
      if (id !== null && viewportRef.current) {
        try {
          viewportRef.current.releasePointerCapture(id);
        } catch {
          // Already released or never captured.
        }
      }
      capturedPanPointerIdRef.current = null;
      panRef.current = null;
    };
  }, []);

  function handleViewportPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 1) return;
    const vp = viewportRef.current;
    if (!vp) return;
    e.preventDefault(); // stop Windows auto-scroll cursor
    panRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      scrollLeft: vp.scrollLeft,
      scrollTop: vp.scrollTop,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
      capturedPanPointerIdRef.current = e.pointerId;
    } catch {
      capturedPanPointerIdRef.current = null;
    }
    setPanning(true);
  }

  function handleViewportPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = panRef.current;
    const vp = viewportRef.current;
    if (!p || !vp) return;
    vp.scrollLeft = p.scrollLeft - (e.clientX - p.startClientX);
    vp.scrollTop = p.scrollTop - (e.clientY - p.startClientY);
  }

  function handleViewportPointerUp(_e: React.PointerEvent<HTMLDivElement>) {
    if (panRef.current === null) return;
    panRef.current = null;
    capturedPanPointerIdRef.current = null;
    setPanning(false);
  }

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
        <div
          ref={viewportRef}
          className={`canvas-viewport${panning ? ' panning' : ''}`}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={handleViewportPointerUp}
          onPointerCancel={handleViewportPointerUp}
        >
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
