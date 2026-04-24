# Devlog summary

**Last updated:** 2026-04-24

## Current state

v1 shipped on `main`. Branch `agent/pixel-drawing` carries the Phase 1
foundation + Phase 2 (shapes + selection) of the pixel-drawing feature
(data-model migration v1 → v2, paint primitives, shape primitives
(line/rect/ellipse), selection extract/paste, tool-dispatched Canvas
with shape previews and marquee/move/slice drag flows, 12-button
ToolPalette grouped by function). 200/200 tests pass, `npx tsc
--noEmit` clean, `npx vite build` green (~143 kB gz).

## What exists

- `src/core/` — DOM-free domain: types (now with `SequenceSlicing`,
  `Source.editedFrames`, `Source.importedFrom`, `Project.swatches`,
  `Project.version: 2`), `RawImage` + `RGBA` utilities, grid/auto/
  manual slicers + sequence dispatcher guard, GIF compositing adapter,
  MaxRects packer, project + manifest serializers with v1 → v2
  migration and base64-PNG `editedFrames` round-trip, PNG
  encode/decode, export orchestrator, and `core/drawing/`:
  `stampDot` / `stampLine` / `stampErase` / `stampEraseLine`,
  `floodFill`, `samplePixel`, `StrokeDelta` with
  `computeDelta` / `undoDelta` / `redoDelta`, `drawLine` /
  `drawRectOutline` / `drawRectFilled` / `drawEllipseOutline` /
  `drawEllipseFilled` (Zingl midpoint ellipse), `Selection` +
  `extractSelection` / `pasteSelection`.
- `src/io/` — `detectFormat` (PNG/GIF magic-byte), `decodeImport`
  (returns `{kind, format, frames, delaysMs, bytes}`), ZIP via fflate,
  FS Access API with anchor-download fallback, drag-drop helper.
- `src/ui/` — Zustand store with drawing state (activeTool,
  primary/secondaryColor, opacity, brushSize, selectedFrameIndex,
  undo/redo stacks, per-frame marquee selection) plus
  `createBlankSource`, `beginStroke`, `undo`, `redo`,
  `setSelection` / `clearSelection`, swatch actions. Shell is a
  5-zone grid with a left rail (ToolPalette + ColorPanel),
  SourcesPanel, tool-dispatched Canvas (with an overlay preview
  canvas for shape drags, marquee, move ghost, and slice drag),
  AnimationsPanel, and the frames zone (FramesStrip + PreviewBar).
  ToolPalette offers 12 tools grouped into paint / shapes /
  selection / slice with the slice button ghosted when slicing is
  not `manual`. `NewBlankSource` modal dialog wired to TopBar.
  `usePlayback` hook shared between PreviewBar and any future
  animation consumer.
- `src/app/` — composition root: `main.tsx` + `App.tsx` + styles.
- KADs 001–005 + one drift-log entry. Phase 1 KAD-006 / KAD-007
  pending a doc pass.
- Detailed devlog at `docs/devlog/detailed/2026-04-23_2026-04-24.md`.
- Lessons at `docs/learning/lessons.md`: Buffer polyfill in Vite;
  store placement vs one-way deps; cache decoded bitmaps.

## Known follow-ups

- In-browser smoke test of `npm run dev` — still blocked by sandbox.
- Canvas visual pixel-diff harness (jsdom has no 2D context).
- KAD-006 / KAD-007 entries in `docs/architecture/decisions.md` +
  drift-log rows.
- HSV color picker (Phase 1 ships hex + swatches).
- Phase 3 (onion skin, pixel grid, shortcut map completeness).
- v1.1 carry-overs: row-grouping UI, manual rect resize handles.
