import { useStore } from './store';
import { openBytes } from '../io/persist';
import { decodeImport } from '../io/file';

interface SourcesPanelProps {
  /**
   * Surfaces import-button failures (picker rejection, unsupported file
   * format, decode error) to the parent's appError banner. AbortError
   * (user cancellation of the FS picker) is filtered upstream in
   * `Shell.reportAppError`. Without this, `handleImport` previously
   * console.error'd silently and the user got no UI feedback (RC3.1).
   */
  onError?: (err: unknown) => void;
}

export function SourcesPanel({ onError }: SourcesPanelProps = {}) {
  const project = useStore((s) => s.project);
  const selectedId = useStore((s) => s.selectedSourceId);
  const addSource = useStore((s) => s.addSource);
  const removeSource = useStore((s) => s.removeSource);
  const selectSource = useStore((s) => s.selectSource);

  async function handleImport() {
    try {
      const files = await openBytes({
        accept: {
          'image/png': ['.png'],
          'image/gif': ['.gif'],
        },
        multiple: true,
      });
      for (let i = 0; i < files.length; i++) {
        const bytes = files[i]!;
        const imported = decodeImport(bytes);
        addSource(`source-${project.sources.length + i + 1}`, imported);
      }
    } catch (err) {
      onError?.(err);
    }
  }

  return (
    <div className="panel sources">
      <h3>Sources</h3>
      <div className="actions">
        <button onClick={handleImport}>+ Import PNG/GIF</button>
      </div>
      <div className="list">
        {project.sources.length === 0 ? (
          <div className="empty">Drop a PNG sheet or GIF here</div>
        ) : null}
        {project.sources.map((s) => (
          <div
            key={s.id}
            className={`list-item ${selectedId === s.id ? 'selected' : ''}`}
            onClick={() => selectSource(s.id)}
          >
            <span className="name" title={s.name}>{s.name}</span>
            <span className="meta">
              {s.kind === 'sequence'
                ? `${s.gifFrames?.length ?? s.editedFrames?.length ?? 0}f`
                : `${s.width}x${s.height}`}
            </span>
            <button
              className="del"
              title="Delete source"
              onClick={(e) => {
                e.stopPropagation();
                removeSource(s.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
