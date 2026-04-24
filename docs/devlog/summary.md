# Devlog summary

**Last updated:** 2026-04-24

## Current state

v2 pixel drawing feature merged to `main` (Phases 1–3 + rounds 1/2/3
review follow-up). v1→v2 data-model migration, 12-tool palette
(pencil/eraser/eyedropper/bucket + line/rect/ellipse/marquee/move/slice),
undo/redo capped at 200/source, color swatches, multi-frame editing,
onion skin, pixel grid at zoom ≥ 8, full Aseprite-style shortcut map.
266/266 tests pass, `npx tsc --noEmit` clean, `npx vite build` green
(~144 kB gz). Two reviewers (Gemini, Claude CLI) signed off as
mergeable in round 3.

## What exists

- `src/core/` — DOM-free: types (v2: `SequenceSlicing`, `editedFrames`,
  `importedFrom`, `swatches`), `RawImage`/`RGBA`, slicers, GIF adapter,
  MaxRects packer, v1→v2 serializers, PNG codec, export, `core/drawing/`
  (brush, flood fill, sample, shapes, selection extract/paste, deltas).
- `src/io/` — `detectFormat`, `decodeImport`, ZIP, FS Access API +
  anchor fallback, drag-drop.
- `src/ui/` — Zustand store with drawing state (`activeTool`, colors,
  opacity, brushSize, `selectedFrameIndex`, undo/redo, `selection`,
  `onionSkin`, `renderCounters`). 5-zone Shell: left rail
  (ToolPalette + ColorPanel), SourcesPanel, Canvas, AnimationsPanel,
  FramesStrip. Canvas layers: onion skin, frame canvas, pixel grid,
  rects overlay, paint overlay (shape/marquee/move/slice preview).
  DOM canvases key on `renderCounters[sourceId]` so in-place mutations
  refresh without identity changes. NewBlankSource modal.
  `usePlayback` hook shared with PreviewBar.
- `src/app/` — composition root.
- KADs 001–007 (005 added MaxRects padding; 006 renamed `kind:'gif'`
  to `'sequence'`; 007 added `editedFrames` alongside `imageBytes`).
  Drift-log has 3 rows.
- Detailed devlog: `docs/devlog/detailed/2026-04-23_2026-04-24.md`.
- Lessons: `docs/learning/lessons.md`.

## Known follow-ups

- In-browser smoke test of `npm run dev` — blocked by sandbox port.
- Canvas visual pixel-diff harness (jsdom has no 2D context — needs
  Playwright or the optional `canvas` npm package).
- HSV color picker (shipped hex + swatches for v2).
- **Deferred round-1 NITs:** N2 (migrate-kind validation), N11
  (`computeDelta` O(w·h) on very large canvases), N12 (ToolPalette
  listener re-attach).
- **Deferred round-2 NITs:** pre-existing brush-opacity double-paint on
  drag endpoints, Ctrl+Z/Y mid-drag corrupting current stroke delta
  (needs cross-component `isDragging` signal), sequence commit shell-
  copy symmetry, and a few cosmetic bits.
- **Round-3 NITs:** brush-config capture inconsistent between pencil
  (closure) and eraser (ref); context menu flashes briefly after
  right-click delete of a manual slice rect.
- Screen-resolution overlay rewrite (round-1 I11 follow-up).
- v1.1 carry-overs: row-grouping UI for grid-sliced sheets, manual
  rect resize handles.
- Codex reviewer: `~/.codex/config.toml` points at `gpt-5.5` which
  isn't available on the user's ChatGPT plan. Replace with a supported
  model before the next review round.
