# Devlog summary

**Last updated:** 2026-04-30

## Current state

0.2.1 on `main`. Full-repo review iteration 1 (1 BLOCKER, 11 MAJOR, 23 MINOR, 19 NIT) closed and archived under `docs/threads/done/full/2026-04-25/1/`; fix cluster landed. Manifest v2 (KAD-008) is the export schema; types-only `pixel_lab/manifest` subpath is published for external consumers. 296+ tests pass, `tsc --noEmit` clean.

## What exists

- `src/core/` — DOM-free: types (v2: `SequenceSlicing`, `editedFrames`, `importedFrom`, `swatches`), `RawImage`/`RGBA`, slicers, GIF adapter, MaxRects packer, v1→v2 serializers, PNG codec, export, `core/drawing/` (brush + `stampLineFrom` for chained-segment opacity, flood fill, sample, shapes, selection extract/paste, deltas), `core/serialize/manifest-types.ts` (pure types, exposed via `pixel_lab/manifest`).
- `src/io/` — `detectFormat`, `decodeImport`, ZIP, FS Access API + anchor fallback, drag-drop.
- `src/ui/` — Zustand store with drawing state (`activeTool`, colors, opacity, brushSize, `selectedFrameIndex`, undo/redo, `selection`, `onionSkin`, `renderCounters`, `isDragging`). 5-zone Shell: left rail (ToolPalette + ColorPanel), SourcesPanel, Canvas, AnimationsPanel, FramesStrip. Canvas layers: onion skin, frame canvas, pixel grid, rects overlay keyed on `renderCounter`, paint overlay. App-level error banner alongside the slice-error banner. NewBlankSource modal. `usePlayback` hook shared with PreviewBar.
- `src/app/` — composition root.
- KADs 001–008. Drift-log has 4 rows plus an audit-only entry (this pass).
- Detailed devlog: `docs/devlog/detailed/2026-04-23_2026-04-25.md`.
- Lessons: `docs/learning/lessons.md`.
- Threads: completed reviews live in `docs/threads/done/`; in-flight work goes in `docs/threads/current/`.

## Known follow-ups

- M6 (visual-test gate in ARCHITECTURE.md but not wired to CI) — needs CI wiring or doc demotion.
- M9 (Canvas.tsx still > 1000 lines) — own iteration.
- Playwright smoke at `test/smoke/drawing-smoke.mjs` (`npm run smoke`) is manual; pixel-diff harness still pending.
- HSV color picker (shipped hex + swatches for v2).
- v1.1 carry-overs: row-grouping UI for grid-sliced sheets, manual rect resize handles.
