import type { Slicing, Source } from '../core/types';

interface Props {
  source: Source;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onSlicingChange: (slicing: Slicing) => void;
}

export function SlicerControls({ source, zoom, onZoomChange, onSlicingChange }: Props) {
  const kind = source.slicing.kind;

  function changeKind(next: Slicing['kind']) {
    if (next === kind) return;
    if (source.kind === 'sequence') return; // sequence slicing is fixed
    switch (next) {
      case 'grid':
        onSlicingChange({
          kind: 'grid',
          cellW: Math.min(source.width, 32),
          cellH: Math.min(source.height, 32),
          offsetX: 0,
          offsetY: 0,
          rows: Math.max(1, Math.floor(source.height / 32)),
          cols: Math.max(1, Math.floor(source.width / 32)),
        });
        break;
      case 'auto':
        onSlicingChange({ kind: 'auto', minGapPx: 0, alphaThreshold: 0 });
        break;
      case 'manual':
        onSlicingChange({ kind: 'manual', rects: [] });
        break;
      default:
        break;
    }
  }

  return (
    <div className="slicer-controls">
      {source.kind === 'sequence' ? (
        <span>
          {source.importedFrom === 'gif' ? 'GIF' : 'Sequence'} source —{' '}
          {source.gifFrames?.length ?? source.editedFrames?.length ?? 0} frames
        </span>
      ) : (
        <>
          <label>
            Slicer:
            <select
              value={kind}
              onChange={(e) => changeKind(e.target.value as Slicing['kind'])}
            >
              <option value="grid">Grid</option>
              <option value="auto">Auto</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          {source.slicing.kind === 'grid' ? (
            <GridInputs slicing={source.slicing} onChange={onSlicingChange} />
          ) : null}
          {source.slicing.kind === 'auto' ? (
            <AutoInputs slicing={source.slicing} onChange={onSlicingChange} />
          ) : null}
          {source.slicing.kind === 'manual' ? (
            <span className="muted">
              Drag on the canvas to add rects. Right-click a rect to remove it.
            </span>
          ) : null}
        </>
      )}
      <div className="zoom">
        <label>Zoom {zoom}x</label>
        <input
          type="range"
          min={1}
          max={16}
          value={zoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

/** Clamp a user-typed number to [min,max] and fall back to fallback for NaN/empty. */
function readNum(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return Math.floor(n);
}

function GridInputs({
  slicing,
  onChange,
}: {
  slicing: Extract<Slicing, { kind: 'grid' }>;
  onChange: (s: Slicing) => void;
}) {
  const upd = (patch: Partial<typeof slicing>) =>
    onChange({ ...slicing, ...patch });
  const MAX = 4096;
  return (
    <>
      <label>cellW <input type="number" min={1} value={slicing.cellW} onChange={(e) => upd({ cellW: readNum(e.target.value, 1, MAX, slicing.cellW) })} /></label>
      <label>cellH <input type="number" min={1} value={slicing.cellH} onChange={(e) => upd({ cellH: readNum(e.target.value, 1, MAX, slicing.cellH) })} /></label>
      <label>cols <input type="number" min={1} value={slicing.cols} onChange={(e) => upd({ cols: readNum(e.target.value, 1, MAX, slicing.cols) })} /></label>
      <label>rows <input type="number" min={1} value={slicing.rows} onChange={(e) => upd({ rows: readNum(e.target.value, 1, MAX, slicing.rows) })} /></label>
      <label>offX <input type="number" value={slicing.offsetX} onChange={(e) => upd({ offsetX: readNum(e.target.value, 0, MAX, slicing.offsetX) })} /></label>
      <label>offY <input type="number" value={slicing.offsetY} onChange={(e) => upd({ offsetY: readNum(e.target.value, 0, MAX, slicing.offsetY) })} /></label>
    </>
  );
}

function AutoInputs({
  slicing,
  onChange,
}: {
  slicing: Extract<Slicing, { kind: 'auto' }>;
  onChange: (s: Slicing) => void;
}) {
  const upd = (patch: Partial<typeof slicing>) =>
    onChange({ ...slicing, ...patch });
  return (
    <>
      <label>minGapPx <input type="number" min={0} value={slicing.minGapPx} onChange={(e) => upd({ minGapPx: readNum(e.target.value, 0, 256, slicing.minGapPx) })} /></label>
      <label>alpha &gt; <input type="number" min={0} max={255} value={slicing.alphaThreshold} onChange={(e) => upd({ alphaThreshold: readNum(e.target.value, 0, 255, slicing.alphaThreshold) })} /></label>
    </>
  );
}
