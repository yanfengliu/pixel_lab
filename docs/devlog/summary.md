# Devlog summary

**Last updated:** 2026-04-25

## Current state

0.2.1 in progress on `agent/full-review-iter1-fixes`: full-repo review iteration 1 complete (1 BLOCKER, 11 MAJOR, 23 MINOR, 19 NIT in `docs/reviews/full/2026-04-25/1/REVIEW.md`); fix cluster landed. Manifest v2 from 0.2.0 unchanged. 296/296 tests pass, `npx tsc --noEmit` clean.

## What exists

- `src/core/` — DOM-free: types (v2: `SequenceSlicing`, `editedFrames`, `importedFrom`, `swatches`), `RawImage`/`RGBA`, slicers, GIF adapter, MaxRects packer, v1→v2 serializers, PNG codec, export, `core/drawing/` (brush + `stampLineFrom` for chained-segment opacity, flood fill, sample, shapes, selection extract/paste, deltas).
- `src/io/` — `detectFormat`, `decodeImport`, ZIP, FS Access API + anchor fallback, drag-drop.
- `src/ui/` — Zustand store with drawing state (`activeTool`, colors, opacity, brushSize, `selectedFrameIndex`, undo/redo, `selection`, `onionSkin`, `renderCounters`, `isDragging`). 5-zone Shell: left rail (ToolPalette + ColorPanel), SourcesPanel, Canvas, AnimationsPanel, FramesStrip. Canvas layers: onion skin, frame canvas, pixel grid, rects overlay (now keyed on `renderCounter` so paint refreshes the overlay), paint overlay. App-level error banner alongside the slice-error banner. NewBlankSource modal. `usePlayback` hook shared with PreviewBar.
- `src/app/` — composition root.
- KADs 001–008 (005 added MaxRects padding; 006 renamed `kind:'gif'` to `'sequence'`; 007 added `editedFrames` alongside `imageBytes`; 008 bumped manifest to v2 schema). Drift-log has 4 rows.
- Detailed devlog: `docs/devlog/detailed/2026-04-23_2026-04-25.md`.
- Lessons: `docs/learning/lessons.md` (added 4 entries from the iter-1 review).
- Reviews: `docs/reviews/full/2026-04-25/1/` (raw outputs + synthesized REVIEW.md).

## Known follow-ups

- **From REVIEW.md iter 1, deferred:** **M6** (visual-test gate exists in ARCHITECTURE.md but not in CI — needs CI wiring or doc demotion); **M9** (Canvas.tsx still 1080+ lines — owns its own iteration); plus the MINORs/NITs the report classified as low-priority.
- Playwright smoke at `test/smoke/drawing-smoke.mjs` is manual (M6 sub-task); pixel-diff harness still pending.
- HSV color picker (shipped hex + swatches for v2).
- v1.1 carry-overs: row-grouping UI for grid-sliced sheets, manual rect resize handles.
