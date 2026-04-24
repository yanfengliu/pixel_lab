import { useEffect, useState, type DragEvent } from 'react';
import { useStore } from './store';
import type { RGBA } from '../core/image';

/**
 * Color panel: primary/secondary chips, hex inputs, swap, swatch row,
 * opacity slider. The HSV picker referenced in the spec is intentionally
 * deferred to a follow-up pass — Phase 1 ships hex-only entry plus
 * swatches, which is enough to author colors end-to-end.
 */
export function ColorPanel() {
  const primary = useStore((s) => s.primaryColor);
  const secondary = useStore((s) => s.secondaryColor);
  const opacity = useStore((s) => s.opacity);
  const swatches = useStore((s) => s.project.swatches ?? []);
  const setPrimary = useStore((s) => s.setPrimaryColor);
  const setSecondary = useStore((s) => s.setSecondaryColor);
  const swap = useStore((s) => s.swapColors);
  const setOpacity = useStore((s) => s.setOpacity);
  const addSwatch = useStore((s) => s.addSwatch);
  const removeSwatch = useStore((s) => s.removeSwatch);
  const moveSwatch = useStore((s) => s.moveSwatch);

  const [primaryHex, setPrimaryHex] = useState(rgbaToHex(primary));
  const [secondaryHex, setSecondaryHex] = useState(rgbaToHex(secondary));
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);

  // Keep the hex inputs in sync with external color changes (eyedropper
  // sample, X-key swap, swatch click from outside the panel, etc.).
  // Only re-sync when the color actually differs from what the input's
  // current hex parses to, so typing mid-edit isn't clobbered.
  useEffect(() => {
    const current = parseHex(primaryHex);
    if (!current || !colorsEqual(current, primary)) {
      setPrimaryHex(rgbaToHex(primary));
    }
    // primaryHex intentionally omitted — the effect should only re-sync
    // when the store-side color changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary]);
  useEffect(() => {
    const current = parseHex(secondaryHex);
    if (!current || !colorsEqual(current, secondary)) {
      setSecondaryHex(rgbaToHex(secondary));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondary]);

  function commitHex(value: string, target: 'primary' | 'secondary') {
    const parsed = parseHex(value);
    if (!parsed) return; // ignore typos in-flight
    if (target === 'primary') setPrimary(parsed);
    else setSecondary(parsed);
  }

  function onDragStart(idx: number) {
    return (_e: DragEvent) => setDragFromIdx(idx);
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
  }
  function onDrop(idx: number) {
    return (e: DragEvent) => {
      e.preventDefault();
      if (dragFromIdx === null || dragFromIdx === idx) return;
      moveSwatch(dragFromIdx, idx);
      setDragFromIdx(null);
    };
  }

  return (
    <div className="color-panel">
      <div className="color-slots">
        <div className="slot-stack">
          <button
            className="color-chip"
            aria-label="Primary color"
            style={{ backgroundColor: rgbaToCss(primary) }}
            title="Primary color (X to swap)"
          />
          <input
            aria-label="Primary hex"
            type="text"
            value={primaryHex}
            onChange={(e) => {
              setPrimaryHex(e.target.value);
              commitHex(e.target.value, 'primary');
            }}
            onBlur={() => setPrimaryHex(rgbaToHex(primary))}
          />
        </div>
        <button
          className="swap-btn"
          aria-label="Swap colors"
          title="Swap (X)"
          onClick={() => {
            swap();
            // Re-sync the input fields so they reflect the new colors.
            setPrimaryHex(rgbaToHex(secondary));
            setSecondaryHex(rgbaToHex(primary));
          }}
        >
          ⇄
        </button>
        <div className="slot-stack">
          <button
            className="color-chip"
            aria-label="Secondary color"
            style={{ backgroundColor: rgbaToCss(secondary) }}
            title="Secondary color"
          />
          <input
            aria-label="Secondary hex"
            type="text"
            value={secondaryHex}
            onChange={(e) => {
              setSecondaryHex(e.target.value);
              commitHex(e.target.value, 'secondary');
            }}
            onBlur={() => setSecondaryHex(rgbaToHex(secondary))}
          />
        </div>
      </div>
      <label className="opacity-row">
        <span>Opacity</span>
        <input
          aria-label="Opacity"
          type="range"
          min={0}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={(e) => setOpacity(Number(e.target.value) / 100)}
        />
        <span className="opacity-readout">{Math.round(opacity * 100)}%</span>
      </label>
      <div className="swatches-row">
        {swatches.map((hex, i) => (
          <button
            key={hex}
            className="swatch"
            aria-label={`Swatch ${hex}`}
            title={`${hex} — left click sets primary, right click removes`}
            style={{ backgroundColor: hex }}
            draggable
            onDragStart={onDragStart(i)}
            onDragOver={onDragOver}
            onDrop={onDrop(i)}
            onClick={() => {
              const parsed = parseHex(hex);
              if (parsed) {
                setPrimary(parsed);
                setPrimaryHex(rgbaToHex(parsed));
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              removeSwatch(hex);
            }}
          />
        ))}
        <button
          className="swatch add"
          aria-label="Add swatch"
          title="Add primary as swatch"
          onClick={() => addSwatch(rgbaToHex(primary))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function colorsEqual(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

function parseHex(input: string): RGBA | null {
  const s = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(s)) return null;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  const a = s.length === 8 ? parseInt(s.slice(6, 8), 16) : 255;
  return { r, g, b, a };
}

function rgbaToHex(c: RGBA): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  if (c.a === 255) return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${h(c.a)}`;
}

function rgbaToCss(c: RGBA): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a / 255})`;
}
