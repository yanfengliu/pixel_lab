import { useStore } from './store';
import { openBytes, saveBytes } from '../io/persist';
import { buildExport } from '../core/export';
import { projectFromJson, projectToJson } from '../core/serialize/project';
import { buildZip } from '../io/zip';

/**
 * Normalize a project name into something safe for filesystem output.
 * Strips path separators and control chars so `project.name = "../../etc"`
 * can't produce surprising save paths. Falls back to "untitled" if the
 * result is empty.
 */
function sanitizeFilenameStem(raw: string): string {
  const cleaned = raw.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : 'untitled';
}

export function TopBar() {
  const project = useStore((s) => s.project);
  const prepared = useStore((s) => s.prepared);
  const newProject = useStore((s) => s.newProject);
  const loadProject = useStore((s) => s.loadProject);
  const renameProject = useStore((s) => s.renameProject);

  async function handleSave() {
    const json = projectToJson(project);
    const stem = sanitizeFilenameStem(project.name);
    await saveBytes(new TextEncoder().encode(json), {
      suggestedName: `${stem}.pixellab.json`,
      mimeType: 'application/json',
      extension: '.pixellab.json',
    });
  }

  async function handleOpen() {
    const [bytes] = await openBytes({
      accept: { 'application/json': ['.json', '.pixellab.json'] },
    });
    if (!bytes) return;
    const text = new TextDecoder().decode(bytes);
    loadProject(projectFromJson(text));
  }

  async function handleExport() {
    const preparedArr = Object.values(prepared);
    const bundle = buildExport(project, preparedArr, { emitPerFrame: true });
    const zip = buildZip(bundle.files);
    const stem = sanitizeFilenameStem(project.name);
    await saveBytes(zip, {
      suggestedName: `${stem}.zip`,
      mimeType: 'application/zip',
      extension: '.zip',
    });
  }

  return (
    <div className="top">
      <span className="title">pixel_lab</span>
      <input
        type="text"
        value={project.name}
        onChange={(e) => renameProject(e.target.value)}
      />
      <button onClick={() => newProject('untitled')}>New</button>
      <button onClick={handleOpen}>Open</button>
      <button onClick={handleSave}>Save</button>
      <button className="primary" onClick={handleExport}>
        Export
      </button>
    </div>
  );
}
