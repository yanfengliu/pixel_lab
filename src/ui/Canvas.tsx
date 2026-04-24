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
  onSliceError?: (message: string) => void;
}

export function Canvas({ source, bitmap, zoom, onSlicingChange, onSliceError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current) drawImageToCanvas(canvasRef.current, bitmap);
  }, [bitmap]);

  const rects = useMemo<Rect[]>(() => {
    try {
      if (source.slicing.kind === 'gif') return [];
      return slice(bitmap, source.slicing);
    } catch (err) {
      // Don't throw into the render — the user probably typed an invalid
      // number. Surface to the caller so it can show a readable banner.
      const msg = err instanceof Error ? err.message : String(err);
      onSliceError?.(msg);
      return [];
    }
  }, [bitmap, source.slicing, onSliceError]);

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

  // Track move/up on window so a drag that leaves the canvas or the
  // browser window doesn't leave the UI stuck mid-drag.
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
    // slicing.rects intentionally excluded: onUp captures the latest value
    // through the closure on the draft-side set; including it would detach
    // and reattach the listeners on every rect add.
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
