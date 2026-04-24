import { useEffect, useRef, useMemo, useState } from 'react';
import type { Rect, Source, Slicing, ManualSlicing } from '../core/types';
import type { RawImage } from '../core/image';
import { slice } from '../core/slicers';
import { drawImageToCanvas } from './rendering';

interface Props {
  source: Source;
  bitmap: RawImage;
  zoom: number;
  onSlicingChange: (slicing: Slicing) => void;
}

export function Canvas({ source, bitmap, zoom, onSlicingChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current) drawImageToCanvas(canvasRef.current, bitmap);
  }, [bitmap]);

  const rects = useMemo<Rect[]>(() => {
    try {
      if (source.slicing.kind === 'gif') return [];
      return slice(bitmap, source.slicing);
    } catch {
      return [];
    }
  }, [bitmap, source.slicing]);

  const manual = source.slicing.kind === 'manual' ? source.slicing : null;

  return (
    <div
      className="canvas-inner"
      style={{
        width: bitmap.width * zoom,
        height: bitmap.height * zoom,
      }}
    >
      <canvas
        ref={canvasRef}
        className="canvas-image"
        style={{ width: bitmap.width * zoom, height: bitmap.height * zoom }}
      />
      {manual ? (
        <ManualOverlay
          bitmap={bitmap}
          zoom={zoom}
          slicing={manual}
          onChange={onSlicingChange}
        />
      ) : (
        <RectsOverlay rects={rects} zoom={zoom} />
      )}
    </div>
  );
}

function RectsOverlay({ rects, zoom }: { rects: Rect[]; zoom: number }) {
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
          }}
        />
      ))}
    </div>
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
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );

  function eventToPixel(ev: React.MouseEvent): { x: number; y: number } | null {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.floor((ev.clientX - rect.left) / zoom);
    const y = Math.floor((ev.clientY - rect.top) / zoom);
    return {
      x: Math.max(0, Math.min(bitmap.width - 1, x)),
      y: Math.max(0, Math.min(bitmap.height - 1, y)),
    };
  }

  function handleDown(ev: React.MouseEvent) {
    if (ev.button !== 0) return;
    const p = eventToPixel(ev);
    if (!p) return;
    setDragStart(p);
    setDraft({ x: p.x, y: p.y, w: 1, h: 1 });
  }

  function handleMove(ev: React.MouseEvent) {
    if (!dragStart) return;
    const p = eventToPixel(ev);
    if (!p) return;
    const x = Math.min(dragStart.x, p.x);
    const y = Math.min(dragStart.y, p.y);
    const w = Math.abs(p.x - dragStart.x) + 1;
    const h = Math.abs(p.y - dragStart.y) + 1;
    setDraft({ x, y, w, h });
  }

  function handleUp() {
    if (draft && draft.w > 1 && draft.h > 1) {
      onChange({
        kind: 'manual',
        rects: [...slicing.rects, draft],
      });
    }
    setDragStart(null);
    setDraft(null);
  }

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
      onMouseMove={handleMove}
      onMouseUp={handleUp}
      onMouseLeave={handleUp}
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
