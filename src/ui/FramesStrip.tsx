import { useEffect, useMemo, useRef } from 'react';
import { useStore } from './store';
import type { RawImage } from '../core/image';
import type { Source } from '../core/types';
import { drawImageToCanvas } from './rendering';

const THUMB_SIZE = 48;

/**
 * Replaces the v1 `PreviewBar`'s frame strip role. Shows one thumbnail
 * per editable frame of the selected source: for sequences that's each
 * decoded/edited frame, for sheets that's each slice rect.
 *
 * Click a thumbnail to make that frame the active edit target.
 */
export function FramesStrip() {
  const project = useStore((s) => s.project);
  const prepared = useStore((s) => s.prepared);
  const selectedSourceId = useStore((s) => s.selectedSourceId);
  const selectedFrameIndex = useStore((s) => s.selectedFrameIndex);
  const setSelectedFrameIndex = useStore((s) => s.setSelectedFrameIndex);

  const source: Source | undefined = useMemo(
    () =>
      selectedSourceId
        ? project.sources.find((s) => s.id === selectedSourceId)
        : undefined,
    [selectedSourceId, project.sources],
  );

  const frames: RawImage[] = useMemo(() => {
    if (!source) return [];
    return prepared[source.id]?.frames ?? [];
  }, [source, prepared]);

  const activeIdx = source ? (selectedFrameIndex[source.id] ?? 0) : 0;

  return (
    <div className="frames-strip" role="list" aria-label="Frames">
      {frames.length === 0 ? (
        <div className="empty">
          {source
            ? 'No frames yet — paint to populate'
            : 'Select a source to see its frames'}
        </div>
      ) : null}
      {frames.map((img, i) => (
        <FrameThumb
          key={i}
          index={i}
          img={img}
          active={i === activeIdx}
          onClick={() => source && setSelectedFrameIndex(source.id, i)}
        />
      ))}
    </div>
  );
}

function FrameThumb({
  index,
  img,
  active,
  onClick,
}: {
  index: number;
  img: RawImage;
  active: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (ref.current) drawImageToCanvas(ref.current, img);
  }, [img]);
  return (
    <button
      role="listitem"
      className={`frame-thumb${active ? ' active' : ''}`}
      title={`frame ${index}`}
      aria-label={`Frame ${index}`}
      aria-pressed={active}
      onClick={onClick}
      style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
    >
      <canvas ref={ref} />
      <span className="idx">{index}</span>
    </button>
  );
}
