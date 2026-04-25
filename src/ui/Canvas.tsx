import { useEffect, useRef, useMemo } from 'react';
import type { Rect, Source, Slicing, Tool } from '../core/types';
import type { RawImage, RGBA } from '../core/image';
import { createImage } from '../core/image';
import { slice } from '../core/slicers';
import {
  stampDot,
  stampLine,
  stampErase,
  stampEraseLine,
  floodFill,
  samplePixel,
  drawLine,
  drawRectOutline,
  drawRectFilled,
  drawEllipseOutline,
  drawEllipseFilled,
  extractSelection,
  pasteSelection,
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
 * Zoomable view of a source with tool-dispatched mouse handling.
 *
 * Each tool is a mouse-behavior mode:
 * - pencil / eraser: brush-stamped drag that commits on mouseup.
 * - eyedropper: single-click samples primary/secondary color.
 * - bucket: single-click flood fill.
 * - line / rect (outline or filled) / ellipse (outline or filled): drag
 *   renders a preview on the overlay canvas; mouseup rasterizes into the
 *   bitmap. Shift held on mouseup converts rectOutline/ellipseOutline to
 *   the filled variant without mutating activeTool.
 * - marquee: drag defines a rectangular selection, stored on the store.
 * - move: drag moves the selection contents within the same frame,
 *   committing a single stroke delta. No-op if the drag starts outside
 *   the active selection.
 * - slice: drag appends a rect to manual slicing. Only available when
 *   `slicing.kind === 'manual'`.
 */
export function Canvas({ source, bitmap, zoom, onSlicingChange, onSliceError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeTool = useStore((s) => s.activeTool);
  const primaryColor = useStore((s) => s.primaryColor);
  const opacity = useStore((s) => s.opacity);
  const brushSize = useStore((s) => s.brushSize);
  const selectedFrameIndex = useStore((s) => s.selectedFrameIndex);
  const setPrimaryColor = useStore((s) => s.setPrimaryColor);
  const setSecondaryColor = useStore((s) => s.setSecondaryColor);
  const beginStroke = useStore((s) => s.beginStroke);
  const prepared = useStore((s) => s.prepared);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const clearSelection = useStore((s) => s.clearSelection);
  const onionSkin = useStore((s) => s.onionSkin);
  const renderCounter = useStore(
    (s) => s.renderCounters[source.id] ?? 0,
  );

  const frameIdx = selectedFrameIndex[source.id] ?? 0;

  // Paint target: sheets paint on the full bitmap; sequences on the frame's
  // prepared image.
  const paintTarget: RawImage =
    source.kind === 'sheet'
      ? bitmap
      : (prepared[source.id]?.frames[frameIdx] ?? bitmap);

  // Onion-skin source: the previous frame of a sequence, if any.
  // Sheets have no "previous frame" concept (a single canvas — the slicing
  // rects aren't an animation timeline), so onion skin is a no-op there.
  const onionSkinFrame: RawImage | null =
    onionSkin && source.kind === 'sequence' && frameIdx > 0
      ? (prepared[source.id]?.frames[frameIdx - 1] ?? null)
      : null;

  useEffect(() => {
    if (canvasRef.current) drawImageToCanvas(canvasRef.current, paintTarget);
    // renderCounter bumps on every in-place pixel mutation (stroke
    // commit, undo, redo) so the DOM canvas refreshes even though
    // paintTarget.data's reference didn't change. `paintTarget.data` is
    // intentionally not in the dep list — the Uint8ClampedArray reference
    // is stable across in-place mutations (that's the whole point of the
    // renderCounter), so it would be a no-op dep (N1).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintTarget, renderCounter]);

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

  // Current selection on this source+frame, if any.
  const activeSelection =
    selection &&
    selection.sourceId === source.id &&
    selection.frameIndex === frameIdx
      ? selection
      : null;

  return (
    <div
      className="canvas-inner"
      style={{
        width: paintTarget.width * zoom,
        height: paintTarget.height * zoom,
      }}
    >
      {onionSkinFrame ? (
        <OnionSkinLayer
          img={onionSkinFrame}
          zoom={zoom}
          dirty={renderCounter}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className="canvas-image"
        style={{
          width: paintTarget.width * zoom,
          height: paintTarget.height * zoom,
          position: 'relative',
          zIndex: 1,
          // Visual layer only. Without this, the browser hit-tests the
          // canvas (topmost at z=1 with default pointer-events: auto) and
          // routes clicks there instead of bubbling to the sibling
          // paint-overlay div where the tool handlers live. jsdom tests
          // fire events directly on the overlay, so they missed this.
          pointerEvents: 'none',
        }}
      />
      {zoom >= 8 ? (
        <PixelGridOverlay
          width={paintTarget.width}
          height={paintTarget.height}
          zoom={zoom}
        />
      ) : null}
      <RectsOverlay rects={rects} zoom={zoom} />
      <PaintOverlay
        source={source}
        bitmap={paintTarget}
        zoom={zoom}
        activeTool={activeTool}
        primary={primaryColor}
        opacity={opacity}
        brushSize={brushSize}
        frameIndex={frameIdx}
        slicing={source.slicing}
        selection={activeSelection?.sel ?? null}
        beginStroke={beginStroke}
        setSelection={(sel) =>
          setSelection({ sourceId: source.id, frameIndex: frameIdx, sel })
        }
        clearSelection={clearSelection}
        onSlicingChange={onSlicingChange}
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

/**
 * 1-device-pixel grid rendered on top of the canvas via CSS
 * `linear-gradient`s — cheaper than a third canvas and DOM-renderable
 * under jsdom. Only mounted at zoom >= 8 (below that the lines would
 * dominate the pixel art).
 *
 * The gradients describe two 1-px-wide hard stops per tile, one
 * vertical and one horizontal, repeated at `zoom` × `zoom` cells.
 */
function PixelGridOverlay({
  width,
  height,
  zoom,
}: {
  width: number;
  height: number;
  zoom: number;
}) {
  const line = 'rgba(0, 0, 0, 0.25)';
  return (
    <div
      className="pixel-grid-overlay"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: width * zoom,
        height: height * zoom,
        pointerEvents: 'none',
        zIndex: 2,
        backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
        backgroundSize: `${zoom}px ${zoom}px`,
      }}
    />
  );
}

/**
 * Under-layer showing the previous frame's pixels at reduced alpha so the
 * user can see what came before the current frame. Lives beneath the
 * `canvas-image` layer in paint order via DOM position + `z-index: 0`.
 * The image canvas has its own position/z-index set so it paints on top.
 */
function OnionSkinLayer({
  img,
  zoom,
  dirty,
}: {
  img: RawImage;
  zoom: number;
  /**
   * Source-level render counter bumped on every delta apply. Included
   * in the effect deps so the ghost refreshes when the previous frame
   * is edited without the `img` reference changing (same root cause as
   * I2 on the main canvas).
   */
  dirty: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (ref.current) drawImageToCanvas(ref.current, img);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, dirty]);
  return (
    <canvas
      ref={ref}
      className="onion-skin-layer"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: img.width * zoom,
        height: img.height * zoom,
        pointerEvents: 'none',
        opacity: 0.3,
      }}
    />
  );
}

function RectsOverlay({ rects, zoom }: { rects: Rect[]; zoom: number }) {
  // RectsOverlay is display-only: the PaintOverlay above it captures
  // clicks for paint/slice tools, and FramesStrip owns the "pick a
  // frame" UX. An earlier version wired a click-to-select handler
  // here but it was unreachable — PaintOverlay's `pointer-events: auto`
  // absorbed every click before it bubbled.
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
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Drag state union — different tools need different captured state at
 * mousedown so we discriminate rather than share a single loose struct.
 */
type DragState =
  | {
      kind: 'brush';
      tool: 'pencil' | 'eraser';
      commit: () => void;
      lastX: number;
      lastY: number;
      brush: Brush;
    }
  | {
      kind: 'shape';
      tool: 'line' | 'rectOutline' | 'rectFilled' | 'ellipseOutline' | 'ellipseFilled';
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    }
  | {
      kind: 'marquee';
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    }
  | {
      kind: 'move';
      /** Original selection rect snapshot (start of drag). */
      startRect: Rect;
      /** Pixels lifted from the source frame. */
      pixels: RawImage;
      /** Mask from the selection. */
      mask: Uint8Array;
      /** Grab anchor — where inside the bitmap the mouse went down. */
      grabX: number;
      grabY: number;
      /** Current offset applied to the lifted pixels. */
      dx: number;
      dy: number;
      /** Commit closure into the undo stack once the move resolves. */
      commit: () => void;
    }
  | {
      kind: 'slice';
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };

function PaintOverlay({
  source,
  bitmap,
  zoom,
  activeTool,
  primary,
  opacity,
  brushSize,
  frameIndex,
  slicing,
  selection,
  beginStroke,
  setSelection,
  clearSelection,
  onSlicingChange,
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
  slicing: Slicing;
  selection: import('../core/drawing').Selection | null;
  beginStroke: (sourceId: string, frameIndex: number) => () => void;
  setSelection: (sel: import('../core/drawing').Selection) => void;
  clearSelection: () => void;
  onSlicingChange: (slicing: Slicing) => void;
  onSample: (color: RGBA, alt: boolean) => void;
  onRepaintCanvas: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // Preallocated preview buffer + ImageData for shape-tool drags so we
  // don't allocate a new Uint8ClampedArray + ImageData per mousemove.
  // Reset on bitmap size change (see resetPreviewBuffer below).
  const previewImageRef = useRef<RawImage | null>(null);
  const previewDataRef = useRef<ImageData | null>(null);
  const lastShapeBboxRef = useRef<Rect | null>(null);

  // Brush params are read on every mousedown/move/up, but we don't want
  // them in the paint-overlay effect deps — a mid-drag color or brush-size
  // change would tear down the listener and trigger the abandoned-drag
  // cleanup, which (for move-tool) committed a cut-only delta and
  // silently lost the lifted pixels (R2-B2). Refs keep the values live
  // without re-running the effect; they are synced on every render via
  // the small effect below.
  const primaryRef = useRef(primary);
  const opacityRef = useRef(opacity);
  const brushSizeRef = useRef(brushSize);
  useEffect(() => {
    primaryRef.current = primary;
    opacityRef.current = opacity;
    brushSizeRef.current = brushSize;
  }, [primary, opacity, brushSize]);

  // Re-render preview whenever selection, tool state, or brush params
  // change even if no drag is active. Without primary/brushSize/opacity
  // in deps, mid-drag color or size tweaks wouldn't refresh the shape
  // preview until the next mousemove. `activeTool` is included so a tool
  // switch mid-drag re-paints the preview (R2-I12) — otherwise the
  // abandoned shape/marquee/slice rectangle stays ghosted on screen until
  // the next mousemove lands. (The paint-overlay useEffect cleanup also
  // calls clearPreview as a belt-and-suspenders safeguard.)
  useEffect(() => {
    drawPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, bitmap.width, bitmap.height, zoom, primary, brushSize, opacity, activeTool]);

  function eventToPixel(clientX: number, clientY: number) {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.floor((clientX - rect.left) / zoom);
    const y = Math.floor((clientY - rect.top) / zoom);
    // Allow modest overshoot past the canvas edge so a drag that leaves
    // the bitmap (very common for line/rect/ellipse tools) still paints
    // pixels up to the boundary. Drawing primitives already clip writes
    // that fall outside `[0, w) × [0, h)`. Cap the overshoot to keep
    // absurd coordinates from blowing up diff/preview math.
    const overshoot = Math.max(8, bitmap.width, bitmap.height);
    return {
      x: Math.max(-overshoot, Math.min(bitmap.width - 1 + overshoot, x)),
      y: Math.max(-overshoot, Math.min(bitmap.height - 1 + overshoot, y)),
    };
  }

  function pointInRect(p: { x: number; y: number }, r: Rect): boolean {
    return p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
  }

  function clearPreview() {
    const c = previewCanvasRef.current;
    if (!c) return;
    try {
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
    } catch {
      // jsdom without canvas package.
    }
  }

  /**
   * Ensure the preview RawImage + ImageData scratch buffers match the
   * current bitmap dimensions. Allocates at most once per size change,
   * so long drag sessions do not push pressure on GC.
   */
  function ensurePreviewBuffer(
    ctx: CanvasRenderingContext2D,
  ): { preview: RawImage; imageData: ImageData } | null {
    const w = bitmap.width;
    const h = bitmap.height;
    let preview = previewImageRef.current;
    let imageData = previewDataRef.current;
    if (!preview || preview.width !== w || preview.height !== h) {
      preview = createImage(w, h);
      previewImageRef.current = preview;
    }
    if (!imageData || imageData.width !== w || imageData.height !== h) {
      try {
        imageData = ctx.createImageData(w, h);
      } catch {
        return null;
      }
      previewDataRef.current = imageData;
    }
    return { preview, imageData };
  }

  /** Zero the pixels in `rect` of the preallocated preview buffer. */
  function clearPreviewBboxInBuffer(preview: RawImage, rect: Rect): void {
    const { x, y, w, h } = rect;
    const xMin = Math.max(0, x);
    const yMin = Math.max(0, y);
    const xMax = Math.min(preview.width, x + w);
    const yMax = Math.min(preview.height, y + h);
    for (let yy = yMin; yy < yMax; yy++) {
      const rowStart = (yy * preview.width + xMin) * 4;
      preview.data.fill(0, rowStart, rowStart + (xMax - xMin) * 4);
    }
  }

  /**
   * Render the overlay preview canvas. Called on every drag step and
   * whenever the selection changes. Draws, in order:
   *   1. Active shape preview (line / rect / ellipse drag) in primary.
   *   2. Move ghost (pixels-being-dragged at current offset).
   *   3. Marquee dashed rect (drag OR current selection).
   *   4. Slice tool drag rect.
   */
  function drawPreview() {
    const c = previewCanvasRef.current;
    if (!c) return;
    c.width = bitmap.width;
    c.height = bitmap.height;
    let ctx: CanvasRenderingContext2D | null;
    try {
      ctx = c.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);

    const drag = dragRef.current;

    // 1. Shape-tool preview.
    if (drag?.kind === 'shape') {
      const buf = ensurePreviewBuffer(ctx);
      if (buf) {
        // Clear just the previous bbox instead of the whole buffer so
        // long drags stay cheap (O(bbox area) per frame, not O(w*h)).
        const prev = lastShapeBboxRef.current;
        if (prev) clearPreviewBboxInBuffer(buf.preview, prev);
        const brush: Brush = { size: brushSize, color: primary, opacity };
        const effective = applyShiftModifier(drag.tool, isShiftHeld());
        renderShape(
          effective,
          buf.preview,
          drag.x0,
          drag.y0,
          drag.x1,
          drag.y1,
          brush,
        );
        buf.imageData.data.set(buf.preview.data);
        ctx.putImageData(buf.imageData, 0, 0);
        lastShapeBboxRef.current = shapeBbox(drag, brush.size);
      }
    } else {
      // No active shape drag — make sure the cached bbox is cleared so
      // the next drag starts from a clean slate (no ghost).
      const prev = lastShapeBboxRef.current;
      if (prev) {
        const preview = previewImageRef.current;
        if (preview) clearPreviewBboxInBuffer(preview, prev);
        lastShapeBboxRef.current = null;
      }
    }

    // 2. Move ghost: paint the lifted pixels at the current offset so the
    //    user sees where the release will land.
    if (drag?.kind === 'move') {
      const imageData = ctx.createImageData(drag.pixels.width, drag.pixels.height);
      imageData.data.set(drag.pixels.data);
      ctx.putImageData(imageData, drag.startRect.x + drag.dx, drag.startRect.y + drag.dy);
    }

    // 3. Marquee: draw either the drag or the existing selection as a
    //    dashed outline.
    const marqueeRect = (() => {
      if (drag?.kind === 'marquee') {
        return dragToRect(drag.x0, drag.y0, drag.x1, drag.y1);
      }
      if (selection) return selection.rect;
      return null;
    })();
    if (marqueeRect) {
      ctx.save();
      ctx.strokeStyle = '#6ba7ff';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      // Use the full rect extent (w, h) rather than (w-1, h-1) so 1x1
      // marquees don't collapse to an invisible 0x0. Screen-resolution
      // overlay rendering (to keep the dashed line 1 device-px thick
      // at high zoom) is a deferred follow-up.
      ctx.strokeRect(
        marqueeRect.x + 0.5,
        marqueeRect.y + 0.5,
        marqueeRect.w,
        marqueeRect.h,
      );
      ctx.restore();
    }

    // 4. Slice drag preview.
    if (drag?.kind === 'slice') {
      const r = dragToRect(drag.x0, drag.y0, drag.x1, drag.y1);
      ctx.save();
      ctx.strokeStyle = '#60d394';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
      ctx.restore();
    }
  }

  // Track Shift state across the drag so the preview can reflect it live.
  const shiftRef = useRef(false);
  function isShiftHeld(): boolean {
    return shiftRef.current;
  }

  // Pointer-capture id for the in-flight drag. Stored so cleanup can
  // releasePointerCapture if a teardown happens mid-drag (abandoned
  // drag cleanup path). Browsers auto-release on pointerup/cancel; this
  // ref handles the "deps changed mid-drag" path.
  const capturedPointerIdRef = useRef<number | null>(null);

  function handleDown(ev: React.PointerEvent<HTMLDivElement>) {
    // Capture the Shift modifier at drag start so the initial preview
    // reflects Shift-held-before-click (otherwise the filled variant of
    // rect/ellipse tools would only show up on the first mousemove).
    shiftRef.current = ev.shiftKey;
    const p = eventToPixel(ev.clientX, ev.clientY);
    if (!p) return;
    // Capture this pointer so move/up events route back to this element
    // even if the cursor leaves the viewport. Eliminates the lost-mouseup
    // bug class without needing a `buttons === 0` workaround. jsdom
    // doesn't always implement setPointerCapture; ignore errors.
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
      capturedPointerIdRef.current = ev.pointerId;
    } catch {
      capturedPointerIdRef.current = null;
    }

    // Right-click on slice tool deletes the hovered manual rect.
    if (ev.button === 2 && activeTool === 'slice' && slicing.kind === 'manual') {
      const idx = slicing.rects.findIndex((r) => pointInRect(p, r));
      if (idx >= 0) {
        ev.preventDefault();
        onSlicingChange({
          kind: 'manual',
          rects: slicing.rects.filter((_, i) => i !== idx),
        });
      }
      return;
    }

    if (ev.button !== 0) return;

    switch (activeTool) {
      case 'eyedropper':
        onSample(samplePixel(bitmap, p.x, p.y), ev.altKey);
        return;

      case 'bucket': {
        const commit = beginStroke(source.id, frameIndex);
        floodFill(bitmap, p.x, p.y, primary, opacity);
        onRepaintCanvas();
        commit();
        return;
      }

      case 'pencil':
      case 'eraser': {
        const commit = beginStroke(source.id, frameIndex);
        const brush: Brush = { size: brushSize, color: primary, opacity };
        if (activeTool === 'pencil') {
          stampDot(bitmap, p.x, p.y, brush);
        } else {
          stampErase(bitmap, p.x, p.y, brushSize);
        }
        onRepaintCanvas();
        dragRef.current = {
          kind: 'brush',
          tool: activeTool,
          commit,
          lastX: p.x,
          lastY: p.y,
          brush,
        };
        return;
      }

      case 'line':
      case 'rectOutline':
      case 'rectFilled':
      case 'ellipseOutline':
      case 'ellipseFilled':
        dragRef.current = {
          kind: 'shape',
          tool: activeTool,
          x0: p.x,
          y0: p.y,
          x1: p.x,
          y1: p.y,
        };
        drawPreview();
        return;

      case 'marquee':
        // New marquee drag clears any existing selection.
        clearSelection();
        dragRef.current = {
          kind: 'marquee',
          x0: p.x,
          y0: p.y,
          x1: p.x,
          y1: p.y,
        };
        drawPreview();
        return;

      case 'move': {
        // Only start a move when the mouse goes down inside the current
        // selection. Outside is intentionally a no-op (per spec).
        if (!selection) return;
        if (!pointInRect(p, selection.rect)) return;
        const commit = beginStroke(source.id, frameIndex);
        const { pixels, cleared } = extractSelection(bitmap, selection);
        // Replace the bitmap's pixels with the "cleared" version so the
        // painted canvas shows the source region already lifted.
        bitmap.data.set(cleared.data);
        onRepaintCanvas();
        dragRef.current = {
          kind: 'move',
          startRect: { ...selection.rect },
          pixels,
          mask: selection.mask,
          grabX: p.x,
          grabY: p.y,
          dx: 0,
          dy: 0,
          commit,
        };
        drawPreview();
        return;
      }

      case 'slice':
        if (slicing.kind !== 'manual') return;
        dragRef.current = {
          kind: 'slice',
          x0: p.x,
          y0: p.y,
          x1: p.x,
          y1: p.y,
        };
        drawPreview();
        return;
    }
  }

  function handleMove(ev: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    // Defense in depth: even with pointer capture in place, if no mouse
    // button is pressed (`buttons === 0`) something has gone sideways —
    // synthesize an up to keep state from sticking. With setPointerCapture
    // the browser guarantees pointerup, so this should be unreachable in
    // practice; left here in case capture failed silently (jsdom, exotic
    // input devices, browser quirks).
    if (ev.buttons === 0) {
      handleUp(ev);
      return;
    }
    shiftRef.current = ev.shiftKey;
    const p = eventToPixel(ev.clientX, ev.clientY);
    if (!p) return;

    switch (d.kind) {
      case 'brush': {
        if (p.x === d.lastX && p.y === d.lastY) return;
        if (d.tool === 'pencil') {
          stampLine(bitmap, d.lastX, d.lastY, p.x, p.y, d.brush);
        } else {
          stampEraseLine(bitmap, d.lastX, d.lastY, p.x, p.y, brushSizeRef.current);
        }
        d.lastX = p.x;
        d.lastY = p.y;
        onRepaintCanvas();
        return;
      }
      case 'shape':
        d.x1 = p.x;
        d.y1 = p.y;
        drawPreview();
        return;
      case 'marquee':
        d.x1 = p.x;
        d.y1 = p.y;
        drawPreview();
        return;
      case 'move':
        d.dx = p.x - d.grabX;
        d.dy = p.y - d.grabY;
        drawPreview();
        return;
      case 'slice':
        d.x1 = p.x;
        d.y1 = p.y;
        drawPreview();
        return;
    }
  }

  function handleUp(ev: React.PointerEvent<HTMLDivElement> | PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    shiftRef.current = ev.shiftKey;
    // Browsers auto-release pointer capture on pointerup, but tracking the
    // id lets the abandoned-drag cleanup path release explicitly.
    capturedPointerIdRef.current = null;
    try {
      switch (d.kind) {
        case 'brush':
          d.commit();
          return;
        case 'shape': {
          const effective = applyShiftModifier(d.tool, ev.shiftKey);
          const commit = beginStroke(source.id, frameIndex);
          const brush: Brush = {
            size: brushSizeRef.current,
            color: primaryRef.current,
            opacity: opacityRef.current,
          };
          renderShape(effective, bitmap, d.x0, d.y0, d.x1, d.y1, brush);
          onRepaintCanvas();
          commit();
          return;
        }
        case 'marquee': {
          const rect = dragToRect(d.x0, d.y0, d.x1, d.y1);
          const mask = new Uint8Array(rect.w * rect.h).fill(1);
          setSelection({ rect, mask });
          return;
        }
        case 'move': {
          const nextRect: Rect = {
            x: d.startRect.x + d.dx,
            y: d.startRect.y + d.dy,
            w: d.startRect.w,
            h: d.startRect.h,
          };
          const next = pasteSelection(bitmap, nextRect.x, nextRect.y, d.pixels, d.mask);
          bitmap.data.set(next.data);
          onRepaintCanvas();
          d.commit();
          // Selection follows the moved pixels to their new location.
          setSelection({ rect: nextRect, mask: d.mask });
          return;
        }
        case 'slice': {
          if (slicing.kind !== 'manual') return;
          const r = dragToRect(d.x0, d.y0, d.x1, d.y1);
          onSlicingChange({ kind: 'manual', rects: [...slicing.rects, r] });
          return;
        }
      }
    } finally {
      dragRef.current = null;
      clearPreview();
      // Re-render preview to reflect any selection set in the finally.
      drawPreview();
    }
  }

  // Abandoned-drag cleanup. When effect deps change (tool switch via
  // shortcut, selection change, bitmap switch, etc.) or the component
  // unmounts mid-drag, this cleanup runs to keep state and bitmap in
  // sync. With pointer capture in place there is no window-level
  // listener to remove — only state-restoration work.
  useEffect(() => {
    return () => {
      // Abandoned-drag cleanup. Any effect-dep change (tool switch,
      // selection change, bitmap switch, etc.) or unmount teardown runs
      // this path. Discriminate on drag kind:
      //   - move: pre-lift pixels are held in `d.pixels`. Paste them back
      //     at the original rect to revert, and DO NOT commit — the
      //     delta would otherwise encode a "cut-only" state (R2-B2).
      //     Ctrl+Z would recover but the UX reads as data loss.
      //   - brush: in-progress pixels are already in the bitmap; commit
      //     so undo can recover them and editedFrames stays consistent.
      //   - shape/marquee/slice: no bitmap writes yet — just discard.
      //
      // Additionally, clear the preview so any active shape/marquee/slice
      // ghost disappears alongside the drag teardown (R2-I12).
      const d = dragRef.current;
      if (d) {
        if (d.kind === 'move') {
          // Revert the cut: paste lifted pixels back at their origin.
          const reverted = pasteSelection(
            bitmap,
            d.startRect.x,
            d.startRect.y,
            d.pixels,
            d.mask,
          );
          bitmap.data.set(reverted.data);
          onRepaintCanvas();
        } else if ('commit' in d) {
          d.commit();
        }
      }
      dragRef.current = null;
      clearPreview();
      // Release any pointer capture still in flight so the next drag
      // starts cleanly. Browsers also auto-release on unmount, but doing
      // it explicitly avoids relying on that.
      const id = capturedPointerIdRef.current;
      if (id !== null && rootRef.current) {
        try {
          rootRef.current.releasePointerCapture(id);
        } catch {
          // Already released or never captured.
        }
      }
      capturedPointerIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, bitmap, slicing, selection]);

  // ESC (clear selection) is owned by the ToolPalette's global keymap so
  // the complete shortcut table lives in one place. No Canvas-local ESC
  // handler needed.

  const cursor = (() => {
    switch (activeTool) {
      case 'pencil':
      case 'eraser':
      case 'line':
      case 'rectOutline':
      case 'rectFilled':
      case 'ellipseOutline':
      case 'ellipseFilled':
      case 'marquee':
      case 'slice':
        return 'crosshair';
      case 'move':
        return selection ? 'move' : 'not-allowed';
      case 'bucket':
        return 'cell';
      case 'eyedropper':
        return 'copy';
      default:
        return 'default';
    }
  })();

  return (
    <>
      <canvas
        ref={previewCanvasRef}
        className="overlay preview-overlay"
        style={{
          position: 'absolute',
          inset: 0,
          width: bitmap.width * zoom,
          height: bitmap.height * zoom,
          pointerEvents: 'none',
          imageRendering: 'pixelated',
        }}
      />
      <div
        ref={rootRef}
        className="overlay paint-overlay"
        style={{
          cursor,
          pointerEvents: 'auto',
          // touch-action: none lets the user paint on touch devices
          // without the browser interpreting the gesture as scroll/pan.
          touchAction: 'none',
        }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onContextMenu={(e) => {
          // Suppress the browser menu only when the slice tool would
          // actually consume this right-click (hit-test matches a manual
          // rect). Otherwise let the normal browser menu appear so the
          // user can still right-click on empty space / non-manual slicing
          // without UI being swallowed (N-G1).
          if (activeTool !== 'slice' || slicing.kind !== 'manual') return;
          const p = eventToPixel(e.clientX, e.clientY);
          if (!p) return;
          if (slicing.rects.some((r) => pointInRect(p, r))) {
            e.preventDefault();
          }
        }}
      />
    </>
  );
}

function applyShiftModifier(
  tool: 'line' | 'rectOutline' | 'rectFilled' | 'ellipseOutline' | 'ellipseFilled',
  shift: boolean,
): 'line' | 'rectOutline' | 'rectFilled' | 'ellipseOutline' | 'ellipseFilled' {
  if (!shift) return tool;
  if (tool === 'rectOutline') return 'rectFilled';
  if (tool === 'ellipseOutline') return 'ellipseFilled';
  return tool;
}

function renderShape(
  tool: 'line' | 'rectOutline' | 'rectFilled' | 'ellipseOutline' | 'ellipseFilled',
  dst: RawImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brush: Brush,
): void {
  switch (tool) {
    case 'line':
      drawLine(dst, x0, y0, x1, y1, brush);
      return;
    case 'rectOutline':
      drawRectOutline(dst, x0, y0, x1, y1, brush);
      return;
    case 'rectFilled':
      drawRectFilled(dst, x0, y0, x1, y1, brush);
      return;
    case 'ellipseOutline':
      drawEllipseOutline(dst, x0, y0, x1, y1, brush);
      return;
    case 'ellipseFilled':
      drawEllipseFilled(dst, x0, y0, x1, y1, brush);
      return;
  }
}

function dragToRect(x0: number, y0: number, x1: number, y1: number): Rect {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const w = Math.abs(x1 - x0) + 1;
  const h = Math.abs(y1 - y0) + 1;
  return { x, y, w, h };
}

/**
 * Conservative bbox for the pixels a shape-drag preview writes, inflated
 * by the brush radius so subsequent clears erase every painted pixel.
 * Returns the exact bitmap-pixel rect (not clipped to canvas bounds —
 * the caller's clearPreviewBboxInBuffer clips).
 */
function shapeBbox(
  drag: { x0: number; y0: number; x1: number; y1: number },
  brushSize: number,
): Rect {
  const r = dragToRect(drag.x0, drag.y0, drag.x1, drag.y1);
  const halfLo = Math.floor((brushSize - 1) / 2);
  const halfHi = Math.floor(brushSize / 2);
  return {
    x: r.x - halfLo,
    y: r.y - halfLo,
    w: r.w + halfLo + halfHi,
    h: r.h + halfLo + halfHi,
  };
}
