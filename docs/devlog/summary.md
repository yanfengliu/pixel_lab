# Devlog summary

**Last updated:** 2026-04-24

## Current state

v1 shipped on `main`. Multi-reviewer review done (Codex, Gemini, Claude
CLI + subagent); all high-priority findings fixed. 74/74 tests pass,
`npx tsc --noEmit` clean, `npx vite build` green (~135 kB gz with
`buffer` polyfill). Branch `agent/initial-tool` merged fast-forward and
deleted.

## What exists

- `src/core/` — DOM-free domain: types, `RawImage` utilities, grid/auto/
  manual slicers, GIF compositing adapter (disposal modes 0–3), MaxRects
  packer, project + manifest serializers (with schema check), PNG
  encode/decode via `pngjs/browser` + `buffer` shim, export orchestrator
  with sanitize-collapse disambiguation.
- `src/io/` — full PNG/GIF magic-byte detection, ZIP via fflate, FS
  Access API with DOM-mounted-input anchor-download fallback, drag-drop
  helper.
- `src/ui/` — Zustand store (at this layer to respect the one-way dep
  graph); 4-zone Shell, zoomable Canvas with slicer overlays
  (window-level drag), Sources/Animations panels, PreviewBar with
  delay-aware playback, TopBar with filename-sanitized save/export.
- `src/app/` — composition root only: `main.tsx` + `App.tsx`.
- KADs 001–005 + one drift-log entry covering the store relocation.
- Detailed devlog at `docs/devlog/detailed/2026-04-23_2026-04-24.md`.
- Lessons at `docs/learning/lessons.md`: Buffer polyfill in Vite;
  store placement vs one-way deps; cache decoded bitmaps.

## Known follow-ups (v1.1)

- Row-grouping UI for grid-sliced sheets (split by row → animations).
- Manual rect resize handles; pixel grid overlay at ≥8x zoom.
- React Testing Library component tests + visual pixel-diff fixtures.
- In-browser smoke test of `npm run dev` (blocked in this session by
  sandbox port binding).
