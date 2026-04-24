import { useEffect, useMemo, useRef } from 'react';
import { useStore } from './store';
import { drawImageToCanvas } from './rendering';
import { useAnimationPlayback } from './usePlayback';
import type { RawImage } from '../core/image';
import type { Animation } from '../core/types';

export function PreviewBar() {
  const project = useStore((s) => s.project);
  const prepared = useStore((s) => s.prepared);
  const selectedAnimId = useStore((s) => s.selectedAnimationId);
  const removeFrame = useStore((s) => s.removeFrameAt);
  // PreviewBar watches every source's render counter so a paint on the
  // active-source's frames refreshes the preview frames (thumbnails
  // and the play-box canvas). `renderCounters` is session-only.
  const renderCounters = useStore((s) => s.renderCounters);

  const animation = useMemo<Animation | undefined>(
    () => project.animations.find((a) => a.id === selectedAnimId),
    [project.animations, selectedAnimId],
  );

  // Aggregate a single dirty value from every source this animation
  // references; a bump on any of them re-renders the strip.
  const dirty = useMemo(() => {
    if (!animation) return 0;
    let sum = 0;
    for (const ref of animation.frames) {
      sum += renderCounters[ref.sourceId] ?? 0;
    }
    return sum;
  }, [animation, renderCounters]);

  return (
    <div className="preview">
      <PlayBox animation={animation} prepared={prepared} dirty={dirty} />
      <div className="strip">
        {animation?.frames.map((ref, i) => (
          <Thumb
            key={i}
            index={i}
            src={getFrameImage(prepared, ref.sourceId, ref.rectIndex)}
            dirty={renderCounters[ref.sourceId] ?? 0}
            onDelete={() => removeFrame(animation.id, i)}
          />
        ))}
        {!animation || animation.frames.length === 0 ? (
          <div className="empty">Select or create an animation to preview</div>
        ) : null}
      </div>
    </div>
  );
}

function PlayBox({
  animation,
  prepared,
  dirty,
}: {
  animation: Animation | undefined;
  prepared: ReturnType<typeof useStore.getState>['prepared'];
  /** Summed render counter of every referenced source. */
  dirty: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const frames = useMemo<RawImage[]>(() => {
    if (!animation) return [];
    return animation.frames
      .map((ref) => getFrameImage(prepared, ref.sourceId, ref.rectIndex))
      .filter((f): f is RawImage => Boolean(f));
  }, [animation, prepared]);

  const { playing, setPlaying, frameIdx, setFrameIdx } = useAnimationPlayback(
    animation,
    frames.length,
  );

  useEffect(() => {
    const img = frames[frameIdx];
    if (canvasRef.current && img) {
      drawImageToCanvas(canvasRef.current, img);
    }
    // dirty bumps on in-place pixel mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, frameIdx, dirty]);

  return (
    <>
      <div className="play-box">
        {frames.length === 0 ? (
          <span className="empty" style={{ padding: 0 }}>—</span>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        )}
      </div>
      <div className="controls">
        <button onClick={() => setPlaying(!playing)}>
          {playing ? '⏸ pause' : '▶ play'}
        </button>
        <button onClick={() => setFrameIdx(0)}>⏮ first</button>
        <span className="meta">
          {frames.length === 0 ? '0 / 0' : `${frameIdx + 1} / ${frames.length}`}
          {animation && animation.fps !== 'per-frame' ? ` · ${animation.fps}fps` : ''}
          {animation && !animation.loop ? ' · no loop' : ''}
        </span>
      </div>
    </>
  );
}

function Thumb({
  index,
  src,
  dirty,
  onDelete,
}: {
  index: number;
  src: RawImage | undefined;
  /** Source-level render counter — bumps on every in-place paint. */
  dirty: number;
  onDelete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (canvasRef.current && src) drawImageToCanvas(canvasRef.current, src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, dirty]);
  return (
    <div
      className="thumb"
      title={`frame ${index} (right-click to delete)`}
      onContextMenu={(e) => {
        e.preventDefault();
        onDelete();
      }}
    >
      {src ? <canvas ref={canvasRef} /> : null}
      <span className="idx">{index}</span>
    </div>
  );
}

function getFrameImage(
  prepared: ReturnType<typeof useStore.getState>['prepared'],
  sourceId: string,
  rectIndex: number,
): RawImage | undefined {
  return prepared[sourceId]?.frames[rectIndex];
}
