# Devlog summary

**Last updated:** 2026-04-24

## Current state

v1 shipped on `main`. Branch `agent/pixel-drawing` carries Phases 1–3
of the pixel-drawing feature: data-model v1→v2 migration, paint +
shape + selection primitives, tool-dispatched Canvas, 12-button
ToolPalette, onion-skin toggle, pixel grid at zoom ≥ 8, full
Aseprite-style shortcut map. 232/232 tests pass, `npx tsc --noEmit`
clean, `npx vite build` green (~143 kB gz).

## What exists

- `src/core/` — DOM-free domain: types (v2: `SequenceSlicing`,
  `Source.editedFrames`, `Source.importedFrom`, `Project.swatches`),
  `RawImage`/`RGBA`, slicers + sequence dispatcher, GIF adapter,
  MaxRects packer, v1→v2 serializers with base64-PNG `editedFrames`
  round-trip, PNG codec, export orchestrator, `core/drawing/`:
  brush stamping, flood fill, sample, shapes (line/rect/ellipse),
  selection extract/paste, stroke deltas.
- `src/io/` — `detectFormat`, `decodeImport`, ZIP via fflate, FS
  Access API + anchor-download fallback, drag-drop helper.
- `src/ui/` — Zustand store with drawing state (activeTool,
  primary/secondaryColor, opacity, brushSize, selectedFrameIndex,
  undo/redo stacks, per-frame marquee selection, **onionSkin**);
  actions include `createBlankSource`, `beginStroke`, `undo`,
  `redo`, `setSelection`/`clearSelection`, swatch actions,
  `setOnionSkin`. Shell: 5-zone grid (left rail = ToolPalette +
  ColorPanel, SourcesPanel, Canvas, AnimationsPanel, frames zone).
  Canvas layers bottom-up: onion-skin (sequences only), frame
  canvas, pixel grid at zoom ≥ 8, rects overlay, paint overlay
  with shape/marquee/move/slice preview. ToolPalette owns the full
  shortcut map (B/E/I/G/L/U/M/V/S/X/`[`/`]`/Ctrl+Z/Ctrl+Shift+Z/
  ESC). `FramesStrip` includes the onion-skin toggle.
  `NewBlankSource` modal wired to TopBar. `usePlayback` hook shared
  with PreviewBar.
- `src/app/` — composition root.
- KADs 001–005 + one drift-log entry. KAD-006 / KAD-007 still
  pending a doc pass.
- Detailed devlog: `docs/devlog/detailed/2026-04-23_2026-04-24.md`.
- Lessons: `docs/learning/lessons.md`.

## Known follow-ups

- In-browser smoke test of `npm run dev` — still blocked by sandbox.
- Canvas visual pixel-diff harness (jsdom has no 2D context).
- KAD-006 / KAD-007 entries + drift-log rows.
- HSV color picker (Phase 1 shipped hex + swatches).
- Multi-reviewer code review for the branch.
- v1.1 carry-overs: row-grouping UI, manual rect resize handles.
