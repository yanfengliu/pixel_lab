import { useEffect, useRef, useMemo, useState } from 'react';
import type { Rect, Source, Slicing, ManualSlicing, Tool } from '../core/types';
import type { RawImage, RGBA } from '../core/image';
import { slice } from '../core/slicers';
import {
  stampDot,
  stampLine,
  stampErase,
  stampEraseLine,
  floodFill,
  samplePixel,
  type Brush,
} from '../core/drawing';
import { drawImageToCanvas } from './rendering';
import { useStore } from './store';

interface Props {
  source: Source;
  bitmap: RawImage;
  zoom: number;
  onSlicingChange: (slicing: Slicing) => void;
  onSliceError?: (message: string) => void;
}

/**
 * Zoomable view of a source. The mouse-behavior on the canvas depends on
 * the current tool:
 *
 * - pencil / eraser: drag to paint a stroke. Snapshot on down, commit
 *   delta on up.
 * - eyedropper: single click samples the pixel under the cursor into
 *   `primaryColor` (Alt-click sets secondary).
 * - bucket: single click floods the reachable region then commits.
 * - When slicing is `manual`, the manual-rect overlay renders **in
 *   addition** to the paint overlay. The paint overlay sits on top and
 *   absorbs mouse events for paint tools.
 */
export function Canvas({ source, bitmap, zoom, onSlicingChange, onSliceError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeTool = useStore((s) => s.activeTool);
  const primaryColor = useStore((s) => s.primaryColor);
  const opacity = useStore((s) => s.opacity);
  const brushSize = useStore((s) => s.brushSize);
  const selectedFrameIndex = useStore((s) => s.selectedFrameIndex);
  const setSelectedFrameIndex = useStore((s) => s.setSelectedFrameIndex);
  const setPrimaryColor = useStore((s) => s.setPrimaryColor);
  const setSecondaryColor = useStore((s) => s.setSecondaryColor);
  const beginStroke = useStore((s) => s.beginStroke);
  const prepared = useStore((s) => s.prepared);

  const frameIdx = selectedFrameIndex[source.id] ?? 0;

  // Pick the active paint target: sheets paint on the full bitmap,
  // sequences on the selected frame's prepared image.
  const paintTarget: RawImage =
    source.kind === 'sheet'
      ? bitmap
      : (prepared[source.id]?.frames[frameIdx] ?? bitmap);

  useEffect(() => {
    if (canvasRef.current) drawImageToCanvas(canvasRef.current, paintTarget);
    // bitmap is used in the dep list so the canvas redraws after the
    // store swaps a new prepared frame entry (undo / redo path).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintTarget, paintTarget.data]);

  const rects = useMemo<Rect[]>(() => {
    try {
      if (source.slicing.kind === 'sequence') return [];
      return slice(paintTarget, source.slicing);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onSliceError?.(msg);
      return [];
    }
  }, [paintTarget, source.slicing, onSliceError]);

  const manual = source.slicing.kind === 'manual' ? source.slicing : null;

  return (
    <div
      className="canvas-inner"
      style={{
        width: paintTarget.width * zoom,
        height: paintTarget.height * zoom,
      }}
    >
      <canvas
        ref={canvasRef}
        className="canvas-image"
        style={{ width: paintTarget.width * zoom, height: paintTarget.height * zoom }}
      />
      {manual ? (
        <ManualOverlay
          bitmap={paintTarget}
          zoom={zoom}
          slicing={manual}
          onChange={onSlicingChange}
        />
      ) : (
        <RectsOverlay rects={rects} zoom={zoom} onClickRect={
          source.kind === 'sheet'
            ? (i) => setSelectedFrameIndex(source.id, i)
            : undefined
        } />
      )}
      <PaintOverlay
        source={source}
        bitmap={paintTarget}
        zoom={zoom}
        activeTool={activeTool}
        primary={primaryColor}
        opacity={opacity}
        brushSize={brushSize}
        frameIndex={frameIdx}
        beginStroke={beginStroke}
        onSample={(color, alt) =>
          alt ? setSecondaryColor(color) : setPrimaryColor(color)
        }
        onRepaintCanvas={() => {
          if (canvasRef.current) drawImageToCanvas(canvasRef.current, paintTarget);
        }}
      />
    </div>
  );
}

function RectsOverlay({
  rects,
  zoom,
  onClickRect,
}: {
  rects: Rect[];
  zoom: number;
  onClickRect?: (index: number) => void;
}) {
  return (
    <div className="overlay">
      {rects.map((r, i) => (
        <div
          key={i}
          className="rect-outline"
          style={{
            left: r.x * zoom,
            top: r.y * zoom,
            width: r.w * zoom,
            height: r.h * zoom,
            pointerEvents: onClickRect ? 'auto' : 'none',
            cursor: onClickRect ? 'pointer' : 'default',
          }}
          onClick={() => onClickRect?.(i)}
        />
      ))}
    </div>
  );
}

function PaintOverlay({
  source,
  bitmap,
  zoom,
  activeTool,
  primary,
  opacity,
  brushSize,
  frameIndex,
  beginStroke,
  onSample,
  onRepaintCanvas,
}: {
  source: Source;
  bitmap: RawImage;
  zoom: number;
  activeTool: Tool;
  primary: RGBA;
  opacity: number;
  brushSize: number;
  frameIndex: number;
  beginStroke: (sourceId: string, frameIndex: number) => () => void;
  onSample: (color: RGBA, alt: boolean) => void;
  onRepaintCanvas: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    commit: () => void;
    lastX: number;
    lastY: number;
    brush: Brush;
  } | null>(null);

  function eventToPixel(clientX: number, clientY: number) {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.floor((clientX - rect.left) / zoom);
    const y = Math.floor((clientY - rect.top) / zoom);
    return {
      x: Math.max(0, Math.min(bitmap.width - 1, x)),
      y: Math.max(0, Math.min(bitmap.height - 1, y)),
    };
  }

  function handleDown(ev: React.MouseEvent) {
    if (ev.button !== 0) return;
    const p = eventToPixel(ev.clientX, ev.clientY);
    if (!p) return;

    if (activeTool === 'eyedropper') {
      onSample(samplePixel(bitmap, p.x, p.y), ev.altKey);
      return;
    }

    if (activeTool === 'bucket') {
      const commit = beginStroke(source.id, frameIndex);
      floodFill(bitmap, p.x, p.y, primary, opacity);
      onRepaintCanvas();
      commit();
      return;
    }

    // Pencil / eraser — start a drag-stroke.
    const commit = beginStroke(source.id, frameIndex);
    const brush: Brush = { size: brushSize, color: primary, opacity };
    if (activeTool === 'pencil') {
      stampDot(bitmap, p.x, p.y, brush);
    } else {
      stampErase(bitmap, p.x, p.y, brushSize);
    }
    onRepaintCanvas();
    dragRef.current = { commit, lastX: p.x, lastY: p.y, brush };
  }

  useEffect(() => {
    // Listeners attach unconditionally. They read `dragRef.current` at
    // event time, so firing mouseup before any stroke is harmless, and
    // we don't miss an up event because an effect hadn't re-run.
    function onMove(ev: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      const p = eventToPixel(ev.clientX, ev.clientY);
      if (!p) return;
      if (p.x === d.lastX && p.y === d.lastY) return;
      if (activeTool === 'pencil') {
        stampLine(bitmap, d.lastX, d.lastY, p.x, p.y, d.brush);
      } else if (activeTool === 'eraser') {
        stampEraseLine(bitmap, d.lastX, d.lastY, p.x, p.y, brushSize);
      }
      d.lastX = p.x;
      d.lastY = p.y;
      onRepaintCanvas();
    }
    function onUp() {
      const d = dragRef.current;
      if (!d) return;
      d.commit();
      dragRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, bitmap, brushSize, onRepaintCanvas]);

  // When the tool changes between paint and slicing-like modes, this
  // overlay still mounts so mouse events land here. For eyedropper /
  // bucket the drag never starts, so we disable cursor hints.
  const cursor = (() => {
    switch (activeTool) {
      case 'pencil':
      case 'eraser':
        return 'crosshair';
      case 'bucket':
        return 'cell';
      case 'eyedropper':
        return 'copy';
      default:
        return 'default';
    }
  })();

  return (
    <div
      ref={rootRef}
      className="overlay paint-overlay"
      style={{ cursor, pointerEvents: 'auto' }}
      onMouseDown={handleDown}
    />
  );
}

function ManualOverlay({
  bitmap,
  zoom,
  slicing,
  onChange,
}: {
  bitmap: RawImage;
  zoom: number;
  slicing: ManualSlicing;
  onChange: (slicing: Slicing) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  function eventToPixel(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.floor((clientX - rect.left) / zoom);
    const y = Math.floor((clientY - rect.top) / zoom);
    return {
      x: Math.max(0, Math.min(bitmap.width - 1, x)),
      y: Math.max(0, Math.min(bitmap.height - 1, y)),
    };
  }

  function handleDown(ev: React.MouseEvent) {
    if (ev.button !== 0) return;
    const p = eventToPixel(ev.clientX, ev.clientY);
    if (!p) return;
    dragStartRef.current = p;
    setDraft({ x: p.x, y: p.y, w: 1, h: 1 });
  }

  useEffect(() => {
    if (!draft) return;
    const onMove = (ev: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const p = eventToPixel(ev.clientX, ev.clientY);
      if (!p) return;
      const x = Math.min(start.x, p.x);
      const y = Math.min(start.y, p.y);
      const w = Math.abs(p.x - start.x) + 1;
      const h = Math.abs(p.y - start.y) + 1;
      setDraft({ x, y, w, h });
    };
    const onUp = () => {
      const current = dragStartRef.current;
      dragStartRef.current = null;
      setDraft((d) => {
        if (d && current) {
          onChange({ kind: 'manual', rects: [...slicing.rects, d] });
        }
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft !== null]);

  function removeRect(idx: number) {
    onChange({
      kind: 'manual',
      rects: slicing.rects.filter((_, i) => i !== idx),
    });
  }

  return (
    <div
      ref={rootRef}
      className="overlay manual"
      onMouseDown={handleDown}
    >
      {slicing.rects.map((r, i) => (
        <div
          key={i}
          className="rect-outline"
          style={{
            left: r.x * zoom,
            top: r.y * zoom,
            width: r.w * zoom,
            height: r.h * zoom,
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            removeRect(i);
          }}
        />
      ))}
      {draft ? (
        <div
          className="rect-outline selected"
          style={{
            left: draft.x * zoom,
            top: draft.y * zoom,
            width: draft.w * zoom,
            height: draft.h * zoom,
          }}
        />
      ) : null}
    </div>
  );
}
