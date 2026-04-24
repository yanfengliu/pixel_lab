import { useStore } from '../app/store';
import { openBytes, saveBytes } from '../io/persist';
import { buildExport } from '../core/export';
import { projectFromJson, projectToJson } from '../core/serialize/project';
import { buildZip } from '../io/zip';

export function TopBar() {
  const project = useStore((s) => s.project);
  const prepared = useStore((s) => s.prepared);
  const newProject = useStore((s) => s.newProject);
  const loadProject = useStore((s) => s.loadProject);
  const renameProject = (name: string) =>
    useStore.setState((st) => ({ project: { ...st.project, name } }));

  async function handleSave() {
    const json = projectToJson(project);
    await saveBytes(new TextEncoder().encode(json), {
      suggestedName: `${project.name}.pixellab.json`,
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
    await saveBytes(zip, {
      suggestedName: `${project.name}.zip`,
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
