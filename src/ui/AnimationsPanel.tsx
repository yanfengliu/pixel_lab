import { useStore } from './store';
import type { FrameRef, Source } from '../core/types';
import { slice } from '../core/slicers';

export function AnimationsPanel() {
  const project = useStore((s) => s.project);
  const prepared = useStore((s) => s.prepared);
  const sheetBitmaps = useStore((s) => s.sheetBitmaps);
  const selectedSourceId = useStore((s) => s.selectedSourceId);
  const selectedAnimId = useStore((s) => s.selectedAnimationId);
  const addAnimation = useStore((s) => s.addAnimation);
  const removeAnimation = useStore((s) => s.removeAnimation);
  const renameAnimation = useStore((s) => s.renameAnimation);
  const setFps = useStore((s) => s.setAnimationFps);
  const setLoop = useStore((s) => s.setAnimationLoop);
  const appendFrames = useStore((s) => s.appendFrames);
  const selectAnimation = useStore((s) => s.selectAnimation);

  const selectedSource: Source | undefined = selectedSourceId
    ? project.sources.find((s) => s.id === selectedSourceId)
    : undefined;

  function handleAddAll() {
    if (!selectedSource) return;
    const refs = buildFrameRefs(selectedSource, prepared, sheetBitmaps);
    if (refs.length === 0) return;
    // Reuse the current animation if one is selected; create one only on
    // demand so repeated clicks with no selection don't spawn orphan anims.
    const animId = selectedAnimId ?? addAnimation('new-anim').id;
    appendFrames(animId, refs);
  }

  return (
    <div className="panel anims">
      <h3>Animations</h3>
      <div className="actions">
        <button onClick={() => addAnimation(`anim-${project.animations.length + 1}`)}>
          + New
        </button>
        <button
          onClick={handleAddAll}
          disabled={!selectedSource}
          title="Append all frames from selected source to current (or new) animation"
        >
          + Frames from source
        </button>
      </div>
      <div className="list">
        {project.animations.length === 0 ? (
          <div className="empty">Add an animation, then append frames from a source</div>
        ) : null}
        {project.animations.map((a) => (
          <div
            key={a.id}
            className={`list-item ${selectedAnimId === a.id ? 'selected' : ''}`}
            onClick={() => selectAnimation(a.id)}
          >
            <input
              type="text"
              value={a.name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => renameAnimation(a.id, e.target.value)}
              style={{ width: 110 }}
            />
            <span className="meta">
              {a.frames.length}f · {a.fps === 'per-frame' ? '—' : `${a.fps}fps`}
            </span>
            <button
              className="del"
              onClick={(e) => {
                e.stopPropagation();
                removeAnimation(a.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {selectedAnimId ? (
        <AnimationDetails
          animationId={selectedAnimId}
          onFps={(f) => setFps(selectedAnimId, f)}
          onLoop={(l) => setLoop(selectedAnimId, l)}
        />
      ) : null}
    </div>
  );
}

function AnimationDetails({
  animationId,
  onFps,
  onLoop,
}: {
  animationId: string;
  onFps: (fps: number | 'per-frame') => void;
  onLoop: (loop: boolean) => void;
}) {
  const anim = useStore((s) =>
    s.project.animations.find((a) => a.id === animationId),
  );
  if (!anim) return null;
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <h3>Details — {anim.name}</h3>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          fps
          <input
            type="number"
            min={1}
            max={60}
            value={anim.fps === 'per-frame' ? 12 : anim.fps}
            disabled={anim.fps === 'per-frame'}
            onChange={(e) => onFps(Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={anim.fps === 'per-frame'}
            onChange={(e) => onFps(e.target.checked ? 'per-frame' : 12)}
          />
          per-frame
        </label>
        <label>
          <input
            type="checkbox"
            checked={anim.loop}
            onChange={(e) => onLoop(e.target.checked)}
          />
          loop
        </label>
      </div>
    </div>
  );
}

function buildFrameRefs(
  source: Source,
  prepared: ReturnType<typeof useStore.getState>['prepared'],
  sheetBitmaps: ReturnType<typeof useStore.getState>['sheetBitmaps'],
): FrameRef[] {
  if (source.kind === 'sequence') {
    const framesN = prepared[source.id]?.frames.length ?? 0;
    const delays = source.gifFrames?.map((f) => f.delayMs) ?? [];
    return Array.from({ length: framesN }, (_, i) => {
      const ref: FrameRef = { sourceId: source.id, rectIndex: i };
      if (delays[i] !== undefined) ref.durationMs = delays[i]!;
      return ref;
    });
  }
  // Sheet: count of rects from current slicing.
  const bitmap = sheetBitmaps[source.id];
  if (!bitmap) return [];
  const rects =
    source.slicing.kind === 'sequence'
      ? []
      : slice(bitmap, source.slicing);
  return rects.map((_, i) => ({ sourceId: source.id, rectIndex: i }));
}
