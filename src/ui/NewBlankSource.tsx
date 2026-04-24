import { useEffect, useState } from 'react';
import { useStore } from './store';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal-style dialog for spawning a fresh sheet or animation source.
 * Renders nothing when `open` is false so a closed dialog adds zero
 * DOM weight.
 */
export function NewBlankSource({ open, onClose }: Props) {
  const createBlankSource = useStore((s) => s.createBlankSource);

  const [kind, setKind] = useState<'sheet' | 'sequence'>('sheet');
  const [width, setWidth] = useState(64);
  const [height, setHeight] = useState(64);
  const [frameCount, setFrameCount] = useState(8);
  const [name, setName] = useState('');

  // ESC closes the dialog while it's open. Listener is attached to the
  // window so the key fires no matter where focus lives (input fields
  // included). ToolPalette's ESC handler also runs but only clears the
  // marquee selection — harmless here.
  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isSheet = kind === 'sheet';
  const finalName =
    name.trim().length > 0
      ? name.trim()
      : isSheet
        ? 'Untitled Sheet'
        : 'Untitled Animation';

  function applyKind(next: 'sheet' | 'sequence') {
    setKind(next);
    // Sheets default a bit larger than animations because painting on a
    // single frame benefits from more room.
    if (next === 'sheet') {
      setWidth(64);
      setHeight(64);
    } else {
      setWidth(32);
      setHeight(32);
    }
  }

  function handleCreate() {
    createBlankSource({
      kind,
      name: finalName,
      width: clampDim(width),
      height: clampDim(height),
      ...(kind === 'sequence' ? { frameCount: clampFrames(frameCount) } : {}),
    });
    // Reset for next time the dialog opens.
    setName('');
    onClose();
  }

  return (
    <div
      className="new-blank-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Create new blank source"
      onMouseDown={(e) => {
        // Click on backdrop closes; clicks bubbling from inner dialog
        // are intercepted by stopPropagation below.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="new-blank-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Create new blank source</h3>
        <fieldset className="kind-fieldset">
          <legend>Kind</legend>
          <label>
            <input
              type="radio"
              name="blank-kind"
              checked={kind === 'sheet'}
              onChange={() => applyKind('sheet')}
              aria-label="Sheet"
            />
            Sheet
          </label>
          <label>
            <input
              type="radio"
              name="blank-kind"
              checked={kind === 'sequence'}
              onChange={() => applyKind('sequence')}
              aria-label="Animation"
            />
            Animation
          </label>
        </fieldset>
        <label className="row">
          <span>Name</span>
          <input
            type="text"
            placeholder={finalName}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="row">
          <span>Width</span>
          <input
            aria-label="Width"
            type="number"
            min={1}
            max={4096}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <label className="row">
          <span>Height</span>
          <input
            aria-label="Height"
            type="number"
            min={1}
            max={4096}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          />
        </label>
        {!isSheet && (
          <label className="row">
            <span>Frame count</span>
            <input
              aria-label="Frame count"
              type="number"
              min={1}
              max={1024}
              value={frameCount}
              onChange={(e) => setFrameCount(Number(e.target.value))}
            />
          </label>
        )}
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleCreate}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const i = Math.floor(n);
  return i < 1 ? 1 : i > 4096 ? 4096 : i;
}
function clampFrames(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const i = Math.floor(n);
  return i < 1 ? 1 : i > 1024 ? 1024 : i;
}
