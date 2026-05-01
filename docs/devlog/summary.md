# Devlog summary

**Last updated:** 2026-05-01

## Current state

0.2.1 shipped (2026-04-25): full-repo review iter-1 fix cluster (1 BLOCKER + 11 MAJOR + M-series follow-ups). Manifest v2 from 0.2.0 unchanged. 310 tests pass, `npx tsc --noEmit` clean.

## What exists

- `src/core/` — DOM-free: types (v2: `SequenceSlicing`, `editedFrames`, `importedFrom`, `swatches`), `RawImage`/`RGBA`, slicers (`grid`/`auto`/`manual`), GIF adapter, MaxRects packer, v1↔v2 project serializer + manifest builder + pure `manifest-types.ts`, PNG codec, export, `core/drawing/` (brush + `stampLineFrom` for chained-segment opacity, flood fill, sample, shapes, selection extract/paste, deltas).
- `src/io/` — `detectFormat`, `decodeImport`, ZIP via `fflate`, FS Access API + anchor-download fallback, drag-drop helpers.
- `src/ui/` — Zustand store with drawing state (`activeTool`, primary/secondary colors, opacity, brushSize, `selectedFrameIndex`, undo/redo `UNDO_CAP=200`, `selection`, `onionSkin`, `renderCounters`, `isDragging`). 5-zone Shell: TopBar, left rail (ToolPalette + ColorPanel), SourcesPanel, Canvas zone (Canvas + SlicerControls + slice/app error banners), AnimationsPanel, frames zone (FramesStrip + PreviewBar). NewBlankSource modal. `usePlayback` hook shared with PreviewBar.
- `src/app/` — composition root (`main.tsx` mounts `App`, which renders `Shell` and loads `styles.css`).
- KADs 001–008. Drift-log has 4 historical rows plus the 2026-05-01 doc-audit row.
- Detailed devlog: `docs/devlog/detailed/2026-04-23_2026-04-25.md`.
- Lessons: `docs/learning/lessons.md`.
- Threads: `docs/threads/done/full/2026-04-25/1/` (synthesized REVIEW.md + raw historical CLI outputs).

## Known follow-ups

- **M6**: visual-test gate exists in ARCHITECTURE.md but not in CI — needs CI wiring or doc demotion.
- **M9**: Canvas.tsx still 1080+ lines — owns its own decomposition iteration.
- Playwright smoke at `test/smoke/drawing-smoke.mjs` is manual (M6 sub-task); pixel-diff harness still pending.
- HSV color picker (v2 shipped hex + swatches only).
- v1.1 carry-overs: row-grouping UI for grid-sliced sheets, manual rect resize handles.
