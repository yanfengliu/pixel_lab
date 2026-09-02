# Devlog summary

**Last updated:** 2026-09-02

## Sessions

- 2026-09-02: `npm run smoke` could not reach a dev server that was running. Its readiness probe hardcoded `http://127.0.0.1:5173/`, but Vite binds the name `localhost`, which resolves to `::1` on this machine — so `fetch` took ECONNREFUSED on the v4 literal while `http://localhost:5173/` returned 200, and the gate reported "dev server not running" while it was running. The probe now tries `localhost`, `127.0.0.1`, and `[::1]` in turn and uses whichever answers; `SMOKE_URL` still overrides and `SMOKE_PORT` was added. The failure message now lists every address tried and what each one did, because "Probe error: fetch failed" names neither the host that refused nor what would satisfy it. Verified with no env override: all 13 steps green in a real browser.
- 2026-09-02: All 12 lessons retired from `lessons.md` / `lessons-evidence.md` into enforced gates, prose deleted in the same commit. 9 already had gates, 2 got new ones (`test/architecture/browser-runtime.test.ts` for the Vite `Buffer` trap, `test/architecture/layering.test.ts` for the `app → ui → io → core` arrow), 1 promoted to `docs/learning/canon-candidates.md`; none dropped. Every gate was mutation-proved red against the real defect and reverted green — 18 proofs recorded in `docs/learning/gate-proofs.md`. Three gates believed to cover their lesson did not, and were strengthened: the `stampLineFrom` unit test never reached the drag call site (the full 325-test suite passed with the defect live), the onion-skin I7 test was satisfied by the main canvas redrawing, and the re-decode cache was caught only by a fixture accident. Suite 40 → 42 files, 314 → 327 tests; typecheck, build, and real-browser smoke green.
- 2026-08-07: Lessons split into a 26-line index and `docs/learning/lessons-evidence.md` (12 entries, verbatim). The entry titles were already claim-shaped, so index lines are those titles with their trailing dates stripped — no paraphrasing, so nothing can drift from what the evidence says. `test/lessons-pairing.test.ts` pins both directions plus its own non-vacuity; suite green at 40 files / 314 tests. Note for a later session: this file is a status document, which the canon says a devlog must not be — it is history, not status.

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
