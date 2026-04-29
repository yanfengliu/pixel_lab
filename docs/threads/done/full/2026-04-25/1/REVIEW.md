# Full-repo review — 2026-04-25 / iteration 1

**Reviewers:** Codex (gpt-5.4, xhigh) · Gemini (gemini-3.1-pro-preview) · Claude Code (opus, xhigh) — all run agentically over the full workspace.

**Raw outputs:** [`raw/codex.md`](raw/codex.md) · [`raw/gemini.md`](raw/gemini.md) · [`raw/claude.md`](raw/claude.md). Shared input prompt at [`PROMPT.md`](PROMPT.md).

## Overall

The codebase is in healthy shape: `core/` is genuinely DOM-free, the `app → ui → io → core` arrow is honored, KAD-006/007/008 are well-traced through code + drift-log + lessons, and TDD discipline is visible across 38 test files / 279 passing tests. The most concerning class of issues across all three reviewers is **documented invariants that are not actually enforced at runtime** — `FrameRef` validity after re-slicing, manual-slice rect bounds, FPS validation, and the visual-test layer that ARCHITECTURE.md claims exists. A second cluster is **silent error paths in the UI shell** (Open / Drop / Save) that surface only in `console.error`. `Canvas.tsx` (1080 lines) is independently flagged by all three reviewers as approaching god-component. Tests are broad on `core/` algorithms but thin on cross-layer state transitions and cross-format reload paths.

## Reviewer agreement on the highest-severity items

| Finding | Codex | Gemini | Claude |
|---|---|---|---|
| Stale `FrameRef`s after re-slicing crash export | **BLOCKER** | — | — |
| FPS=0 / NaN poisons preview + manifest | MAJOR | MINOR (manifest only) | — |
| Slice tool out-of-bounds rects crash slicing | MAJOR | — | — |
| Painting empty grid cells doesn't refresh rects overlay | — | — | MAJOR |
| Open/Drop/Save errors swallowed | — | — | MAJOR |
| `Canvas.tsx` god class | MAJOR | MINOR | MINOR |
| Brush opacity double-paint on drag endpoints | — | MAJOR | — |
| Ctrl+Z mid-drag corrupts stroke delta | — | MAJOR | — |
| Visual-diff gate exists in docs but not in code | MAJOR | — | (referenced) |

The four single-reviewer MAJORs above were spot-checked against the source and all reproduce on inspection.

---

## Findings

### BLOCKER

#### B1 — Re-slicing a source can leave stale `FrameRef`s and break export
- **Source:** Codex — `src/ui/store.ts:341-356`, `src/core/export.ts:67-73`, ARCHITECTURE.md:44.
- **Issue:** `updateSlicing` rebuilds `prepared[sourceId]` but never reconciles `Animation.frames[].rectIndex`. When the new slicing yields fewer rects than the old (e.g. user shrinks the grid), refs that pointed at higher indices are now dangling. `buildExport` then throws `buildExport: no frame N in source ...`.
- **Why it matters:** Architecture explicitly promises "re-slicing updates every animation that references that source" (KAD-004). The runtime violates that. The trigger is the standard workflow: build animation → tweak slicing → export.
- **Suggestion:** Make `updateSlicing` repair (clamp to last valid index) or reject (drop) refs whose `rectIndex >= prepared.frames.length` at the same instant the slicing is applied — so the store cannot enter the broken state. Add a unit test for the shrink case.

---

### MAJOR

#### M1 — FPS=0 / NaN poisons both preview playback and exported manifests
- **Source:** Codex (MAJOR) + Gemini (MINOR, manifest-only). `src/ui/AnimationsPanel.tsx:111-117`, `src/ui/usePlayback.ts:47-52`, `src/core/serialize/manifest.ts:33-37`.
- **Issue:** The fps `<input>` uses bare `Number(e.target.value)`; the store's `setAnimationFps` does no validation. `0`, empty string (→ `0`), `NaN` (→ `Number("")` is `0`, but a deleted-then-typed value can be `NaN`), and absurd values all flow through. In playback, `Math.max(10, Math.floor(1000 / 0))` = `Infinity` → `setTimeout(Infinity)` clamps to ~24 days. In export, `Math.round(1000 / 0)` = `Infinity` → JSON.stringify emits `null`, silently corrupting `durationMs` for downstream consumers (idle-life).
- **Why it matters:** Animation timing is a manifest contract per KAD-008; corrupting it breaks every downstream consumer. Locally, the preview hangs.
- **Suggestion:** Validate at the store boundary (`setAnimationFps` clamps to `[1, 240]`, rejects non-finite, falls back to 12). Add a unit test covering `0`, `NaN`, negative, and the manifest-emit path.

#### M2 — Slice tool can author out-of-bounds rects, crashing slicing on the next render
- **Source:** Codex. `src/ui/Canvas.tsx:417-432, 873-878`, `src/core/source.ts:15-25`, `src/core/image.ts:49-55`.
- **Issue:** `eventToPixel` deliberately allows overshoot up to `max(8, w, h)` past the bitmap edge so shape tools paint to the boundary on a slightly off-canvas drag. The `slice` case in `handleUp` reuses that coordinate path verbatim (`dragToRect(d.x0, d.y0, d.x1, d.y1)`) and pushes the rect straight into manual slicing. `prepareSheet` calls `crop()`, which throws on any rect that crosses bounds — `Canvas.tsx:99-108`'s `try/catch` then surfaces it as a slice-error banner, but the error itself is created by code that shouldn't have been allowed to author the rect.
- **Why it matters:** A common gesture — the user sweeps slightly outside the canvas to define a rect at the edge — turns into an editor error instead of a clipped rect.
- **Suggestion:** Clamp the rect to image bounds (`Math.max(0, …)`, `Math.min(bitmap.width − x, …)`) inside the slice case before calling `onSlicingChange`. Add a regression test that drags from inside to outside the bitmap and asserts a clipped rect lands.

#### M3 — Painting into a previously-empty grid cell never refreshes the rects overlay
- **Source:** Claude. `src/ui/Canvas.tsx:99-108`, `src/core/slicers/grid.ts` (uses `isCellFullyTransparent`).
- **Issue:** `rects = useMemo(() => slice(paintTarget, source.slicing), [paintTarget, source.slicing, onSliceError])`. For a sheet, `paintTarget === bitmap === sheetBitmaps[id]`, mutated *in place* on every stroke — its reference is stable. `useMemo` only re-runs on dep identity change, so the cached `rects` array goes stale. Grid slicing skips fully-transparent cells, so a paint that opens a new cell is invisible to the overlay until the user nudges another slicing input.
- **Why it matters:** Real workflow: user creates a 4×4-celled blank sheet (0 rects), paints inside cell (1,0), expects the rect outline to appear. It doesn't.
- **Suggestion:** Add `renderCounter` to the `useMemo` deps. Cost is one `slice()` call per stroke commit, which the lessons file already treats as cheap.

#### M4 — `loadProject` for `kind:'sequence'` crashes on empty `imageBytes` without `editedFrames`
- **Source:** Claude. `src/ui/store.ts:230-236`, `src/core/serialize/project.ts:155-189`.
- **Issue:** `decoded = s.editedFrames?.length > 0 ? [] : decodeGif(s.imageBytes).map(...)`. If a v2 file (crafted, hand-edited, or written before `editedFrames` was guaranteed) has `kind:'sequence'`, no `editedFrames`, and an empty `imageBytes`, `decodeGif(empty)` throws inside `parseGIF`. The validator at `validateProjectJson` doesn't enforce the `sequence ⇒ editedFrames || non-empty imageBytes` invariant.
- **Why it matters:** A `loadProject` failure at this layer takes down the whole UI rather than reporting a clean error, because `TopBar.handleOpen` doesn't catch (see M5).
- **Suggestion:** Tighten `validateProjectJson` to enforce the invariant, OR wrap the `decodeGif` call with a descriptive error (e.g. `"sequence source <name> has no edited frames and no imageBytes"`). Add a validator test.

#### M5 — `TopBar.handleOpen` / `Shell.handleDrop` / `TopBar.handleSave` swallow errors silently
- **Source:** Claude. `src/ui/TopBar.tsx:38-45, 28-36`, `src/ui/Shell.tsx:144-157`.
- **Issue:** `handleOpen` wraps no try/catch around `projectFromJson(text)` — malformed JSON rejects the promise unhandled. `handleDrop` catches but only `console.error`s. `handleSave` doesn't catch the cancel-rejection from `showSaveFilePicker`. All three are primary entry points for ingesting external data or completing a save.
- **Why it matters:** The user dragging the wrong file or hitting cancel sees nothing in the UI; only DevTools reveals the failure. Combined with M4, "Open" becomes brittle on any non-trivial input.
- **Suggestion:** Plumb errors through the existing `sliceError` banner (or a new `appError`) so the user sees what went wrong; treat `AbortError` as a no-op for cancellation. Validator becomes the single canonical error boundary.

#### M6 — Visual-test gate exists in docs but not in code
- **Source:** Codex. `docs/architecture/ARCHITECTURE.md:57-62`, `docs/devlog/summary.md:22`, `docs/learning/lessons.md:21`, `package.json:10-17`, `pixelmatch` already in devDependencies.
- **Issue:** ARCHITECTURE.md describes "Visual — `ui/` golden PNG pixel diffs" as one of the test layers. The actual `npm test` is vitest only; the visual layer is `npm run smoke` against a Playwright script that requires manual `npm run dev` first. The lessons file documents a real BLOCKER (`canvas-image` z-order) that only the manual smoke caught — exactly the class of bug a CI-gated visual layer is supposed to prevent.
- **Why it matters:** Reviewers and future contributors reading the architecture doc assume a regression net exists where one currently does not.
- **Suggestion:** Either land the harness (`pixelmatch` is already there; the missing piece is enforcement) or mark the visual layer as planned in ARCHITECTURE.md. Treat the smoke-in-CI work as a near-term correctness gate.

#### M7 — Brush opacity double-paint at drag endpoints
- **Source:** Gemini (also tracked as deferred round-1 NIT). `src/core/drawing/brush.ts:50-60, 140-167`.
- **Issue:** `stampLine` calls `walkLine`, which always invokes `onPoint` on `(x0, y0)`. But `(x0, y0)` was already painted by either `mousedown` (first segment) or the previous `stampLine` call (subsequent segments). When `opacity < 1`, the same pixel is composited twice → visibly darker connection points, breaking the illusion of a smooth stroke.
- **Why it matters:** A core drawing-tool defect; visible on any opacity-blended drag.
- **Suggestion:** Have `walkLine` accept an "include-start" flag (default true), and have `stampLine` set it to false when chaining. Add a unit test that walks N segments and asserts the start pixel is composited exactly once across the whole drag.

#### M8 — Ctrl+Z / Ctrl+Y mid-drag corrupts the in-flight stroke delta
- **Source:** Gemini (deferred round-1 NIT). `src/ui/ToolPalette.tsx:101-120`, `src/ui/store.ts:569-636`.
- **Issue:** The global keydown listener in `ToolPalette` fires `undo()` / `redo()` immediately without checking for an active drag. Mid-drag undo mutates `sheetBitmaps[id]` (or `prepared.frames[i]`) underneath the still-running drag. When the drag's `commit()` closure runs, `computeDelta(before, after)` sees a corrupted "after" that includes both the abandoned undo and the in-flight stroke pixels.
- **Why it matters:** Silent data-correctness bug in the undo history. Reproducible by Ctrl+Z during any pencil/eraser drag.
- **Suggestion:** Expose an `isDragging` flag on the store, set/cleared by `Canvas.handleDown` / `handleUp` / `handleCancel` / abandoned-drag cleanup. Guard the undo/redo shortcuts on `!isDragging`. Add a unit test for "ctrl+Z mid-drag is a no-op".

#### M9 — `Canvas.tsx` is approaching god-component (1080 lines, 7+ concerns)
- **Source:** Codex (MAJOR), Gemini (MINOR), Claude (MINOR) — three-reviewer consensus, escalated. `src/ui/Canvas.tsx:1-1082`.
- **Issue:** One file owns: tool dispatch, drag-state machine (5 kinds), preview rasterizer with bbox-cached redraws, pointer-capture lifecycle, abandon/cancel revert rules, three overlay layers, onion-skin layer, slice authoring, hit-testing for slice deletion. Reviewer churn is concentrated here (R2-B2, R2-I12, lost-mouseup, canvas-image z-order).
- **Why it matters:** Each new tool adds a switch arm and a drag-state variant. The shape makes new work hard to reason about and easy to regress; the lessons file already shows two production-affecting fixes that originated here.
- **Suggestion:** Lift `PaintOverlay` into its own module; split per-tool drag logic into a dispatch table (one `(handleDown, handleMove, handleUp, handleCancel)` per tool kind). `OnionSkinLayer`, `PixelGridOverlay`, and `RectsOverlay` are already leaf siblings — move them out. Aim for `Canvas.tsx < 200` lines acting as composition glue.

#### M10 — No integration test for the imported-GIF reload path
- **Source:** Claude. `src/ui/store.ts:230-236`, `test/integration/save-reload.test.ts:99-130`, `test/integration/load-project.test.ts:14-70`.
- **Issue:** The `loadProject` branch that matters in production — a saved sequence with no `editedFrames` and a real GIF in `imageBytes` — has no test. `save-reload.test.ts:99` saves a GIF source but its `imageBytes` is `new Uint8Array()` (mock), so `decodeGif` is short-circuited via `editedFrames`. `load-project.test.ts` covers PNG sheets only.
- **Why it matters:** This is the primary reload path for any v1 project containing a GIF. A regression here corrupts every existing project file's GIF on reload.
- **Suggestion:** Add a unit test for `loadProject` with a stubbed `decodeGif` to verify the call shape, OR a real GIF round-trip (use the same fixture-construction trick `compositeGifFrames` uses, then encode → decode → assert frames preserved).

#### M11 — `onSliceError` UI banner has no test
- **Source:** Claude. `src/ui/Shell.tsx:27-28, 211-215`, `src/ui/Canvas.tsx:99-108`.
- **Issue:** The red-banner error surface for slicer failures is plumbed through `Canvas.tsx` → `Shell.handleSliceError`. No test simulates an invalid slicing config and asserts the banner renders.
- **Why it matters:** This banner was added in response to a phase-1 reviewer finding ("Canvas swallowed slicer errors silently"). A regression would silently re-introduce the original bug.
- **Suggestion:** Render `Shell` with a sheet whose slicing has e.g. `cellW: 0`, assert the danger element appears.

---

### MINOR

#### Design / structure

- **m1 — Side-effecting `useMemo` calls `setState` across components.** Claude, `src/ui/Canvas.tsx:99-108`. The `rects` memo calls `onSliceError(msg)` inside its factory, which is `setState` on `Shell` during `Canvas`'s render. Under StrictMode it doubles. → Compute `{rects, error}` in the memo, surface via a `useEffect`.
- **m2 — `Canvas` subscribes to entire `prepared` and `selectedFrameIndex` maps.** Claude, `src/ui/Canvas.tsx:58, 62`; same pattern in `PreviewBar.tsx:16` for `renderCounters`. → Narrow selectors: `useStore((s) => s.prepared[source.id])`, `useStore((s) => s.selectedFrameIndex[source.id] ?? 0)`.
- **m3 — `RawImage` vs DOM `ImageData` boundary is implicit.** Claude, `src/core/image.ts:7-11`. → Add an invariant comment ("4-channel RGBA, no padding, sRGB") or a `toDomImageData(raw)` helper.
- **m4 — Inconsistent brush configuration capture between pencil and eraser.** Gemini (also deferred round-3 NIT), `src/ui/Canvas.tsx:660-668, 762-766`. Pencil captures `brush` at mousedown into `dragRef`, eraser reads `brushSizeRef.current` live. Mid-drag `[`/`]` resizes the eraser but not the pencil. → Capture both sizes into `DragState`.
- **m5 — `beginStroke` commit closure for sequences misses the shell-replacement that undo/redo do.** Gemini (deferred round-2 NIT), `src/ui/store.ts:587-636` vs `638-684, 686-727`. → Add the `prepared[sourceId] = {...p}` shell replacement for sequences in commit, parallel to undo/redo.

#### Correctness

- **m6 — Preview playback isn't clamped when `framesLength` shrinks.** Codex, `src/ui/usePlayback.ts:20-44`, `src/ui/PreviewBar.tsx`. Frame deletion mid-playback can leave `frameIdx` past the new end; the canvas keeps showing stale pixels and the `n / N` counter reports nonsense like `4 / 1`. → Clamp `frameIdx` whenever `framesLength` changes, and clear the canvas when no frame exists.
- **m7 — `setSelectedFrameIndex` clears selection on the very first call from `undefined`.** Claude, `src/ui/store.ts:547-562`. `previous = undefined` → `frameChanged = true` → selection wiped. The "no-op same-index keeps selection" test (`store.test.ts:405`) only covers the second call. → `frameChanged = previous !== undefined && previous !== index`.
- **m8 — Bresenham `walkLine` infinite-loop risk on NaN/Infinity.** Claude (defensive), `src/core/drawing/brush.ts:140-167`. Currently safe (callers clamp), but a future caller passing `NaN` never hits the equality break. → Guard with `Number.isFinite` or cap iterations at `dx + dy + 2`.
- **m9 — Right-click delete on slice rect causes context-menu flash.** Gemini (deferred round-3 NIT), `src/ui/Canvas.tsx:625-635, 998-1010`. Synchronous delete in `onPointerDown` deletes the rect; `onContextMenu`'s hit-test then fails and skips `preventDefault`. → Move deletion into `onContextMenu` alongside `preventDefault`, or track "just deleted" in a ref.
- **m10 — `compositeGifFrames` disposal-3 snapshot holds full-canvas memory.** Claude, `src/core/gif.ts:33-39`. For a 1024×1024 GIF with many disposal-3 frames, peak memory grows by `frames × w × h × 4`. Pixel-art-sized GIFs are fine in practice. → Note in code comment; if applied to bigger GIFs later, reconstruct previous frame on demand instead of snapshotting.
- **m11 — `addSource` builds `gifFrames` for any sequence import regardless of format.** Claude, `src/ui/store.ts:277-285`. PNG never reaches this branch today, but `gifFrames` should key on `imported.format === 'gif'`, not `imported.kind === 'sequence'` (KAD-006 split those). → Gate `gifFrames` on `format === 'gif'`.
- **m12 — `encodePng` aliases the user's `Uint8ClampedArray` into `Buffer` without copy.** Claude, `src/core/png.ts:13`. If `pngjs/browser` ever mutates the input, the user's `RawImage` corrupts. Defensive. → `Buffer.from(img.data)` copies; cost is one alloc per export, not per stroke.
- **m13 — Fallback file-open never resolves on cancel in older browsers.** Codex, `src/io/persist.ts:144-150`. Comment acknowledges it but ships it. The promise stays pending forever in browsers that don't fire `cancel`. → Resolve deterministically on user dismissal (e.g. focus-back-to-window timer fallback).

#### Tests

- **m14 — Critical state-transition tests missing.** Codex, `test/ui/store.test.ts:62`, `test/integration/round-trip.test.ts:35`, `test/ui/Canvas.test.tsx:362`, `test/io/persist.test.ts:21,60`. No coverage for re-slicing a source already feeding animations (B1), out-of-bounds manual slice drags (M2), or fallback open/save behavior. → Targeted tests on each of those transitions.
- **m15 — `loadProject` validator is asserted only for sheet shapes.** Claude, `test/integration/load-project.test.ts:78-94`. Missing: malformed `slicing` (e.g. `grid` without `cellW`), missing `frames` on animation, swatches array of non-strings, v1 file with `kind:'gif'` paired with non-`{kind:'gif'}` slicing. → Tighten validator on slicing's discriminated union and add one test per kind.
- **m16 — No drop-import test.** Claude, `src/ui/Shell.tsx:144-157`. Drop is the primary entry point for adding sources; only `filesFromDrop` is unit-tested; errors are `console.error`'d. → Render `Shell`, fire `drop` with fake-file dataTransfer (PNG, JPG, garbage), assert source-list / banner.
- **m17 — Smoke test is manual and not gated in CI.** Claude, `test/smoke/drawing-smoke.mjs`, `package.json:17`. → Wire a CI step (or local `preview & smoke` npm script) that boots vite preview and runs the Playwright smoke. Lessons file already documents how this gap fired once.
- **m18 — No build-output assertion for the `Buffer` polyfill.** Claude, `src/core/png.ts:1-2`. The polyfill drift was previously caught only by a production-bundle smoke. → Post-`vite build`, grep `dist/assets/*.js` for `"Buffer is not defined"` and a polyfill banner.

#### Documentation

- **m19 — README slice section still describes `'gif'` as a slicing mode.** Claude, `README.md:47`. Per KAD-006 the kind is `'sequence'`; the slicer doesn't dispatch on `'gif'` anymore (`src/core/slicers/index.ts:19-21` throws on `'sequence'`). → Reword to "GIF / sequence — one frame per source bitmap, sliced implicitly".
- **m20 — Eyedropper Alt-modifier behavior is not documented.** Claude, `README.md:68-87`, `src/ui/Canvas.tsx:174-176`. Alt+click sets the secondary color but no docs say so. → Add a short "tool modifiers" subsection (Alt+click for secondary sample, Shift on rect/ellipse mouseup for filled variant).
- **m21 — `docs/superpowers/specs/2026-04-23-pixel-lab-design.md` predates KAD-006 and is not annotated.** Claude. → Add a "superseded by KAD-006/007" header pointing to the v2 spec.
- **m22 — ARCHITECTURE.md overstates current visual coverage.** Codex, `docs/architecture/ARCHITECTURE.md:61`. Tied to M6.
- **m23 — Drawing spec says undo "unlimited", code caps at 200.** Codex, `docs/superpowers/specs/2026-04-24-pixel-drawing-design.md:20`, `src/ui/store.ts:168`. → Update the spec to reflect the actual memory-bounded behavior and rationale.

---

### NIT

- **n1 — `tsconfig.json` aliases (`@core/*` etc.) are configured but unused.** Claude, `tsconfig.json:21-26`. → Pick one: drop them, or commit to alias imports + add `import/no-relative-parent-imports`.
- **n2 — Picker imports rename to `source-N`; drag-drop preserves `file.name`.** Codex, `src/ui/SourcesPanel.tsx:24`, `src/ui/Shell.tsx:151`. → Preserve filename on both paths.
- **n3 — `loadProject` parallel sheet/sequence branches mirror `addSource`.** Claude, `src/ui/store.ts:215-251` vs `253-301`. → Extract `(source) => { prepared, sheetBitmap? }` helper.
- **n4 — `removeSource` repeats `Object.fromEntries(Object.entries(...).filter(...))` six times.** Claude, `src/ui/store.ts:303-339`. → Extract `omitKey<T>(rec, id)` helper.
- **n5 — `_drop` underscore-rename + `void _drop;` in store.** Claude, `src/ui/store.ts:626-627`. → Use the `omitKey` helper from n4.
- **n6 — `shiftRef` updated by reading `ev.shiftKey` at three sites.** Claude, `src/ui/Canvas.tsx:610, 755, 830`. → Tiny helper `captureShift(ev)` or a window keydown/keyup listener that owns shift state.
- **n7 — `Canvas.handleCancel` calls `clearPreview()` then `drawPreview()`.** Claude, `src/ui/Canvas.tsx:823-825`. The first is redundant; `drawPreview` already clears. → Drop `clearPreview()`.
- **n8 — `prepareSequence` always copies frames.** Claude (also deferred N5), `src/core/source.ts:38-46`. Defensive; document or accept.
- **n9 — `pruneFreeRects` / `splitFreeRects` lack unit-level edge tests.** Claude, `src/core/packer.ts:150-208`. Only end-to-end packing tests exist. → Either export them for tests or craft inputs that exercise the prune-after-split path.
- **n10 — `_e: DragEvent` unused parameter.** Gemini + Claude (deferred N6), `src/ui/ColorPanel.tsx:38, 56-58`. → `(idx) => () => setDragFromIdx(idx)`.
- **n11 — Two ESC handlers fire on Escape.** Claude (deferred N7), `src/ui/ToolPalette.tsx:124-127`, `src/ui/NewBlankSource.tsx:27-34`. Both `clearSelection()` and `onClose()` run when the dialog is open with a selection. → `stopImmediatePropagation` after closing the dialog.
- **n12 — Marquee stores a `Uint8Array.fill(1)` mask for what is structurally a solid rect.** Gemini, `src/ui/Canvas.tsx:854`. → Optional fast-path in `extractSelection` / `pasteSelection` for null/omitted mask.
- **n13 — Dead CSS rules: `.rect-outline.selected`, `.rect-outline .handle`, `.row-grouping`, `.row-input`.** Claude, `src/app/styles.css:439-448, 534-543`. → Delete or annotate as v1.1 placeholder.
- **n14 — `.preview { grid-area: preview }` references a name not in any parent grid template.** Claude, `src/app/styles.css:463`. Resolves to nothing; layout works by accident. → Drop the line.
- **n15 — `bash.exe.stackdump` sits in repo root from a previous shell crash.** Claude. Already in `.gitignore`. → Delete the file.
- **n16 — KAD anchor citation style is inconsistent in ARCHITECTURE.md.** Claude, `docs/architecture/ARCHITECTURE.md:48-55`. → Add `(KAD-008)` next to the v2 export-pipeline bullets.
- **n17 — `docs/devlog/summary.md` Known follow-ups duplicate detail-log content.** Claude. → Treat summary as canonical; remove dups from detail.
- **n18 — `docs/changelog.md` doesn't mention the Buffer-polyfill / `pointer-events: none` regressions.** Claude. → Backfill a "0.1.x — fixes" section so downstream consumers know they need a recent build.
- **n19 — Codex reviewer config reference (`gpt-5.5` not on user's plan) is in summary.md as a project follow-up.** Gemini, `docs/devlog/summary.md` last bullet. Local-environment instruction shouldn't pollute the project devlog. → Move to a personal checklist; AGENTS.md was updated this iteration so this entry is now stale anyway.

---

## Cross-cutting observations

1. **"Documented invariant ≠ enforced invariant" recurs.** B1 (FrameRef stability), M2 (slice rect bounds), M1 (FPS validation), M4 (sequence-source completeness), and M6 (visual-test layer) all share the same shape: ARCHITECTURE.md or a KAD declares a contract; the runtime relies on convention. Consider adopting a "validator at the state boundary" rule for store actions that touch multi-entity invariants (slicing, animation refs, FPS).
2. **The `renderCounter` pattern is load-bearing but applied unevenly.** `Canvas`, `OnionSkinLayer`, `FramesStrip`, `PreviewBar` all couple "in-place mutation refresh" to a per-source counter. The `useMemo` for `rects` (M3) is the one place that *should* use it but doesn't. Extracting a `useMutableImage(img, sourceId)` hook would centralize the pattern and remove scattered `eslint-disable` comments. (Claude.)
3. **Pointer-capture migration was a real win, but the lessons-file rule about `buttons === 0` is technically obsolete now.** The guards remain as defense-in-depth, which is fine — but the lesson title should be re-framed as "if you remove pointer capture, the `buttons === 0` guard is mandatory" so future agents don't think the bug class has disappeared. (Claude.)
4. **Test data builders are duplicated.** `mockSheetImport` / `mountForSheet` recur across `test/integration/save-reload.test.ts`, `test/ui/Canvas.test.tsx`, `test/ui/canvas-drag-edge.test.tsx`. A `test/helpers/builders.ts` would shrink ~50 lines and make `Source`-shape changes a one-file edit. (Claude.)
5. **No perf assertions / benches.** Several "documented as fast enough" claims (`computeDelta` O(w·h), `floodFill` 512×512, MaxRects packer) lack a regression guard. A vitest-bench lane on the worst-case stroke commit + packer pass would catch slowdowns before users do. (Claude.)
6. **`exactOptionalPropertyTypes: false`** lets the codebase mix `editedFrames?:` checks (`?? …` vs `&& length > 0`). Flipping the flag would surface every "missing vs explicitly undefined" site once. (Claude.)

---

## Disagreements / withdrawn findings

- **Claude initially flagged `floodFill`'s seed-color guard as a MAJOR no-op-on-fills bug, then withdrew it after re-deriving the math** ("the early exit IS sound"). The guard at `src/core/drawing/fill.ts:35-43` correctly compares the *write sample* to the seed under the actual blend equation, so it short-circuits exactly when the loop body would also be a no-op. No action needed.
- **No disagreement on `Canvas.tsx` god-class severity** — Codex tagged it MAJOR, Gemini and Claude MINOR; the synthesis escalates to MAJOR because all three flagged it independently with the same suggested split. If reviewers disagree on the next iteration, Claude/Gemini's MINOR framing should win.

---

## Suggested follow-up plan (non-binding)

A reasonable iteration order for the next round:

1. Land **B1** (re-slicing FrameRef invariant) — bug is on a normal user path and the fix is a reconciliation step in `updateSlicing`.
2. Land **M1, M2, M3, M4, M5** as a "input/state validation" cluster — they share a fix shape (validate at boundary, surface error through the existing banner).
3. Land **M7** (brush opacity double-paint) and **M8** (Ctrl+Z mid-drag) — small, well-isolated drawing-tool fixes.
4. Land **M10, M11** (missing tests) before any further refactor.
5. **M9** (Canvas split) is the largest item; defer to its own iteration — but seriously, defer it, don't drop it.
6. **M6** (visual-test gate) is a docs-vs-CI policy choice; resolve before next review round so reviewers know which way the layer is going.

NITs (n1–n19) are individual ~5-minute fixes that can be batched into a single cleanup PR or rolled into the relevant cluster above.
