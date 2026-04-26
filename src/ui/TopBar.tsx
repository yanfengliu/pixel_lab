import { useState } from 'react';
import { useStore } from './store';
import { openBytes, saveBytes } from '../io/persist';
import { buildExport } from '../core/export';
import { projectFromJson, projectToJson } from '../core/serialize/project';
import { buildZip } from '../io/zip';
import { NewBlankSource } from './NewBlankSource';

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

interface TopBarProps {
  /**
   * Surface async-handler failures to the parent's error banner.
   * AbortError (user cancellation) is filtered upstream in
   * `Shell.reportAppError`, so we can pass any thrown value through to
   * `onError` without polluting the UI.
   */
  onError?: (err: unknown) => void;
}

export function TopBar({ onError }: TopBarProps = {}) {
  const project = useStore((s) => s.project);
  const prepared = useStore((s) => s.prepared);
  const newProject = useStore((s) => s.newProject);
  const loadProject = useStore((s) => s.loadProject);
  const renameProject = useStore((s) => s.renameProject);
  const [blankOpen, setBlankOpen] = useState(false);

  async function handleSave() {
    try {
      const json = projectToJson(project);
      const stem = sanitizeFilenameStem(project.name);
      await saveBytes(new TextEncoder().encode(json), {
        suggestedName: `${stem}.pixellab.json`,
        mimeType: 'application/json',
        extension: '.pixellab.json',
      });
    } catch (err) {
      onError?.(err);
    }
  }

  async function handleOpen() {
    try {
      const [bytes] = await openBytes({
        accept: { 'application/json': ['.json', '.pixellab.json'] },
      });
      if (!bytes) return;
      const text = new TextDecoder().decode(bytes);
      loadProject(projectFromJson(text));
    } catch (err) {
      onError?.(err);
    }
  }

  async function handleExport() {
    try {
      const preparedArr = Object.values(prepared);
      const bundle = buildExport(project, preparedArr, { emitPerFrame: true });
      const zip = buildZip(bundle.files);
      const stem = sanitizeFilenameStem(project.name);
      await saveBytes(zip, {
        suggestedName: `${stem}.zip`,
        mimeType: 'application/zip',
        extension: '.zip',
      });
    } catch (err) {
      onError?.(err);
    }
  }

  return (
    <>
      <div className="top">
        <span className="title">pixel_lab</span>
        <input
          type="text"
          value={project.name}
          onChange={(e) => renameProject(e.target.value)}
        />
        <button onClick={() => newProject('untitled')}>New</button>
        <button onClick={() => setBlankOpen(true)}>+ New Blank</button>
        <button onClick={handleOpen}>Open</button>
        <button onClick={handleSave}>Save</button>
        <button className="primary" onClick={handleExport}>
          Export
        </button>
      </div>
      <NewBlankSource open={blankOpen} onClose={() => setBlankOpen(false)} />
    </>
  );
}
