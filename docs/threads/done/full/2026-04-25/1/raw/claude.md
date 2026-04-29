I've gathered enough context. Now I'll produce the review.

# Review Summary

The codebase is in healthy shape: strong TDD discipline, `core/` is genuinely DOM-free, the one-way `app → ui → io → core` graph is honored, and devlog/architecture docs are kept current. KAD-006/007/008 are well-traced through code, drift-log, and lessons. The most concerning items are a few subtle reactivity / lifecycle issues that the test suite doesn't catch (rects-overlay staleness on first paint into empty sheet cells, `setSliceError` invoked during render), and a handful of unhandled-error paths in the UI shell (Open/Drop) that surface only in `console.error`. Test coverage is broad on `core/` and most UI flows, but has gaps around imported-GIF rehydration after save, error surfacing, and the smoke harness is still manual.

# Findings

## Design

- **[MINOR] Side-effecting `useMemo` calls store-update across components** — `src/ui/Canvas.tsx:99-108`
  - **Issue:** `rects = useMemo(...)` calls `onSliceError?.(msg)` inside its factory when the slicer throws. `onSliceError` is `handleSliceError` in `Shell.tsx:28` which calls `setSliceError`. That is a `setState` on a different component during this component's render phase.
  - **Why it matters:** React 18 logs "Cannot update a component while rendering a different component" warnings; under `StrictMode` (already enabled in `main.tsx:8`) the render runs twice, doubling the warning and any user-visible side effect. Also moves the slicing error path into render-loop territory.
  - **Suggestion:** Compute rects in `useMemo` without side effects (return `{rects, error}` discriminated tuple), then surface the error from a dedicated `useEffect` keyed on the result.

- **[MINOR] `Canvas` subscribes to entire `prepared` and `selectedFrameIndex` maps** — `src/ui/Canvas.tsx:58, 62`
  - **Issue:** `useStore((s) => s.prepared)` and `useStore((s) => s.selectedFrameIndex)` return whole records, so a paint or frame-switch on *any* source rerenders the Canvas of the currently-selected source.
  - **Why it matters:** Mostly cosmetic today (one source visible at a time), but the pattern compounds: `PreviewBar.tsx:16` does the same with `renderCounters`. As project size scales the reactivity surface grows quadratically.
  - **Suggestion:** Narrow selectors: `useStore((s) => s.prepared[source.id])`, `useStore((s) => s.selectedFrameIndex[source.id] ?? 0)`. Same fix in `PreviewBar`.

- **[MINOR] `Canvas.tsx` is approaching god-component** — `src/ui/Canvas.tsx:1-1082`
  - **Issue:** 1080 lines mixing tool dispatch, drag-state machine, three overlay layers, preview rasterizer, pointer-capture lifecycle, abandon/cancel reverts, and onion-skin layer. The "discriminated `DragState` union + giant switch" is fine but the file owns too many concerns.
  - **Why it matters:** Every drag-handling fix grows the file. The R2-B2 / R2-I12 / lost-mouseup history shows reviewer churn here is concentrated. Future tool additions (e.g., lasso) will deepen this.
  - **Suggestion:** Extract `PaintOverlay` into its own module and split the per-tool drag handlers into a small dispatch table (one function per `kind`). Onion skin and pixel grid already feel like leaf siblings — they could be sibling files.

- **[MINOR] `RawImage` vs DOM `ImageData` lookalike, used inconsistently** — `src/core/image.ts:7-11`
  - **Issue:** `RawImage` is a structural shim of `ImageData`. Some core consumers (`drawing/`, `packer.ts`) treat it identically; UI code in `Canvas.tsx:551` constructs DOM `ImageData` to feed `putImageData`. The conversion is implicit at boundaries.
  - **Why it matters:** Subtle: `Uint8ClampedArray` clamping is implicit; all code assumes 4 channels with no padding. If anyone ever adds an `ImageData` with `colorSpace: 'display-p3'`, the assumption breaks silently.
  - **Suggestion:** Add a one-line invariant comment on `RawImage` ("4-channel RGBA, no padding, sRGB"), or a `toDomImageData(raw)` helper to make the boundary explicit.

- **[NIT] `tsconfig.json` paths are unused** — `tsconfig.json:21-26`
  - **Issue:** `@core/*`, `@io/*`, `@ui/*`, `@app/*` aliases are defined and mirrored in `vite.config.ts` / `vitest.config.ts`. No source file uses them — every import is relative (`../core/...`).
  - **Why it matters:** Either commit to the convention (uniform aliases enforce the layer arrow at sight) or drop the configuration to reduce surface area.
  - **Suggestion:** Pick one. If you keep aliases, an ESLint rule for `import/no-relative-parent-imports` would enforce them.

- **[NIT] `loadProject` has parallel sheet/sequence branches mirroring `addSource`** — `src/ui/store.ts:215-251` vs `253-301`
  - **Issue:** Both build prepared+sheetBitmaps for sheet vs sequence with near-identical structure. Migration of one without the other is easy to miss.
  - **Suggestion:** Extract `(source) => { prepared, sheetBitmap? }` helper used by both.

## Test coverage

- **[MAJOR] No test for imported-GIF reload path that hits `decodeGif(imageBytes)`** — `src/ui/store.ts:230-236`
  - **Issue:** The `loadProject` branch that matters in production — a saved sequence source with no `editedFrames` and a real GIF in `imageBytes` — has no integration test. `test/integration/save-reload.test.ts:99-130` saves a GIF source but its `imageBytes` is `new Uint8Array()` (mock), and the round-trip relies on `editedFrames` short-circuiting the gif decode. `test/integration/load-project.test.ts:14-70` only covers PNG sheets.
  - **Why it matters:** This is the primary path for "user opens a v1 project file with an imported GIF". A regression here would corrupt every existing project file's GIF import on reload. The risk surface includes `decodeGif`, `prepareSequence` interaction with `decoded` array, and `frame.length` mismatches.
  - **Suggestion:** Add an integration test that synthesizes a real GIF (the existing `compositeGifFrames` tests build one in memory; piping through `gifuct-js`'s decoder requires real bytes — alternative is to inject through `decodeImport` and bypass that step). Or: add a unit test for `loadProject` with a stubbed `decodeGif` to verify the call shape.

- **[MAJOR] No test asserts `slice` rects refresh after painting opens up new cells** — `src/ui/Canvas.tsx:99`, `src/core/slicers/grid.ts:27`
  - **Issue:** Grid slicer skips fully-transparent cells (`isCellFullyTransparent`). If the user paints on a previously-empty cell of a sheet, the rect should reappear in the overlay. There is no test for this and the `useMemo` deps `[paintTarget, source.slicing, onSliceError]` are stable across in-place paints (sheet bitmap reference doesn't change). See the matching correctness finding below.
  - **Why it matters:** Real workflow: user creates a blank sheet (all transparent → 0 rects), paints in cell (1,0), expects to see the rect outline appear. They won't until they nudge the slicing config.
  - **Suggestion:** Add a UI test that paints into an empty grid cell and asserts the rect overlay renders at least one `.rect-outline` after the stroke.

- **[MAJOR] `onSliceError` path has no UI test** — `src/ui/Shell.tsx:27-28, 211-215`
  - **Issue:** The red-banner error surface for slicer failures is plumbed through `Canvas.tsx:104-106` → `Shell.tsx:handleSliceError`. There is no test that simulates an invalid slicing config and asserts the banner renders.
  - **Why it matters:** This was a Phase-1 reviewer-introduced feature ("Canvas swallowed slicer errors silently") — a regression would silently re-introduce the original bug.
  - **Suggestion:** Render Shell with a sheet whose slicing has e.g. `cellW: 0` (or use `updateSlicing` to inject a value the slicer rejects) and assert a `.empty[style*=danger]` element appears.

- **[MINOR] `loadProject` validator path is asserted, but only for sheet shapes** — `test/integration/load-project.test.ts:78-94`
  - **Issue:** Tests cover `missing imageBase64` and `invalid kind`. They don't cover: malformed `slicing` (e.g. grid `{kind:'grid'}` with missing `cellW`), missing `frames` on animation, swatches array of non-strings, v1 file with `kind:'gif'` paired with non-`{kind:'gif'}` slicing.
  - **Why it matters:** Listed in summary as deferred NIT (N2). New severity if combined with the next item: malformed slicing reaches `slice()` and throws on the first render (not a graceful import).
  - **Suggestion:** Tighten validator on slicing's discriminated union and add a test case per kind.

- **[MINOR] No test for `handleDrop` happy/sad path** — `src/ui/Shell.tsx:144-157`
  - **Issue:** Drop import (the primary entry point for sources) is covered only by the pure `filesFromDrop` helper. Errors are swallowed to `console.error`. No test asserts user-visible behavior on a non-image drop.
  - **Suggestion:** Render Shell, fire a `drop` event with a fake-file dataTransfer (PNG/JPG/garbage), assert source list updates / banner shows.

- **[MINOR] Smoke test is manual & not gated in CI** — `test/smoke/drawing-smoke.mjs`, `package.json:17`
  - **Issue:** Documented in `summary.md` as a follow-up. Without CI, the only "smoke" enforcement is human discipline; the file tells you to run `npm run dev` first.
  - **Why it matters:** Lessons file specifically calls out that 266 unit tests passed while a real-browser BLOCKER lurked. Without smoke-in-CI, that class of bug recurs.
  - **Suggestion:** Wire a GitHub Action that boots vite preview and runs the playwright script. Even without GH actions, a `preview & smoke` npm script that sequences both would lower the activation cost.

- **[MINOR] No test for `Buffer`-polyfill import path** — `src/core/png.ts:1-2`
  - **Issue:** The lesson "Node Buffer not polyfilled by Vite" was caught in a production build. No automated check verifies `dist/*.js` actually contains the buffer polyfill (or that it doesn't reference Node's global).
  - **Suggestion:** Add a build-output assertion (post-`vite build`, grep `dist/assets/*.js` for `"Buffer is not defined"` and for the polyfill banner).

- **[NIT] `pruneFreeRects` and `splitFreeRects` lack unit-level edge tests** — `src/core/packer.ts:150-208`
  - **Issue:** Only end-to-end packing tests exist. The internal helpers correctness for degenerate cases (zero-area split, fully-contained rectangles, `i >= free.length` post-splice race) is implicit.
  - **Suggestion:** Export them for tests (or test via packer with crafted inputs that exercise the prune-after-split path).

## Correctness

- **[MAJOR] Painting into empty grid-sliced cells doesn't refresh the rects overlay until slicing config changes** — `src/ui/Canvas.tsx:99-108`
  - **Issue:** `rects = useMemo(() => slice(paintTarget, source.slicing), [paintTarget, source.slicing, onSliceError])`. For a sheet, `paintTarget === bitmap === sheetBitmaps[id]`, mutated in place. `useMemo` doesn't re-run on in-place mutation. The `RectsOverlay` therefore shows stale rects — a previously-empty grid cell that's now opaque doesn't appear as a slice rect.
  - **Why it matters:** User-visible: paint on a blank sheet, no rects ever appear in the overlay until they edit `cellW` or another slicing input. Doesn't affect export (export uses fresh `prepared` rebuilt on commit) but the slicing UI is the user's mental model.
  - **Suggestion:** Add `renderCounter` to the `useMemo` deps so re-slice runs on every committed paint. Cost is one slice call per stroke commit, which the lessons file already assumes is cheap.

- **[MAJOR] `loadProject` for `sequence` sources crashes on empty `imageBytes` without `editedFrames`** — `src/ui/store.ts:230-236`
  - **Issue:** Branch is: `s.editedFrames && s.editedFrames.length > 0 ? [] : decodeGif(s.imageBytes).map(...)`. If a hypothetical (or hand-edited) v2 project file has `kind:'sequence'` but `imageBytes` is empty and no `editedFrames`, `decodeGif(empty)` throws inside `parseGIF`. The validator at `src/core/serialize/project.ts:155-189` doesn't enforce that sequence sources without `editedFrames` carry non-empty `imageBytes`.
  - **Why it matters:** A loadProject fail at this layer breaks the whole UI rather than reporting a clean validation error, because TopBar's `handleOpen` doesn't catch.
  - **Suggestion:** Either tighten the validator to enforce the invariant (sequence ⇒ either `editedFrames` or non-empty `imageBytes`), or wrap `decodeGif` here with a descriptive error.

- **[MAJOR] `TopBar.handleOpen` and `Shell.handleDrop` swallow / unhandle errors** — `src/ui/TopBar.tsx:38-45`, `src/ui/Shell.tsx:144-157`
  - **Issue:** `handleOpen` does no try/catch around `projectFromJson(text)`. A malformed JSON throws, the promise rejects unhandled, the user sees nothing. `handleDrop` catches but only `console.error`s.
  - **Why it matters:** Both are the primary entry points for ingesting external data. A user dragging the wrong file gets silent failure. Combined with the validator's improving-but-not-perfect coverage, "Open" becomes brittle.
  - **Suggestion:** Plumb errors through the existing `sliceError` banner (or a new `appError`) so the user sees what went wrong, and make the validator the canonical error boundary.

- **[MAJOR] `floodFill`'s seed-color guard fails for partially-transparent fills, leading to no-op when fill should still apply** — `src/core/drawing/fill.ts:35-43`
  - **Issue:** The guard "early-out if writeSample equals seed" computes `composite(seed, color@sa)` once at the seed pixel and bails if that equals seed. But the seed pixel may be the only pixel where target-color equals fill-color — neighbor pixels might still need filling if they share the seed's RGBA. Wait, no: the guard checks the seed only after computing what `compose(seed, color)` would write. If they're equal, the loop wouldn't write anything anyway. Actually correct in the strict sense, but the current guard is confusing because `composite(seed, color@sa)` only equals `seed` when alpha is fully opaque AND the color matches OR when the operator is a no-op. False alarm — the early exit IS sound. **Withdraw this finding.**
  - **(Not flagged.)**

- **[MAJOR] Bresenham `walkLine` infinite-loop risk on NaN/Infinity inputs** — `src/core/drawing/brush.ts:140-167`, `shapes.ts:9-37`
  - **Issue:** `eventToPixel` clamps to `[-overshoot, w-1+overshoot]` so cursor input is bounded. But `walkLine`'s loop condition is `while (true)` with `break` on `x === x1 && y === y1`. If a future caller passes `NaN`, the equality test never holds and the loop runs forever.
  - **Why it matters:** Currently safe (all callers pass clamped integers). It's a defensive concern, not an active bug.
  - **Suggestion:** Either guard with `if (!Number.isFinite(x0) || ...) return` or add an iteration cap of e.g. `dx + dy + 2` to fail-stop instead of hang.

- **[MINOR] `setSelectedFrameIndex` clears selection even on transition from "no previous index" to a real one** — `src/ui/store.ts:547-562`
  - **Issue:** `previous = s.selectedFrameIndex[sourceId]; frameChanged = previous !== index`. On the first call, `previous === undefined`, so `frameChanged === true`, and any selection in the same `sourceId` is wiped. The cleanup logic gates on `s.selection?.sourceId === sourceId`, but this still trips if the user marquee-selects on (sourceId, frame 0) and then explicitly picks frame 0 again via FramesStrip while the index map had no prior entry for that source.
  - **Why it matters:** Edge case but produces "I clicked the frame I'm already on and lost my selection."
  - **Suggestion:** `frameChanged = previous !== undefined && previous !== index`. The "keep selection on no-op same-index" test (`store.test.ts:405`) only covers the second-call case.

- **[MINOR] `compositeGifFrames` snapshot for disposal type 3 holds full-canvas memory across frames** — `src/core/gif.ts:33-39`
  - **Issue:** Each disposal-3 frame snapshots the entire canvas (`new Uint8ClampedArray(canvas.data)`) before drawing. For a 1024×1024 GIF with many disposal-3 frames, peak memory grows by `frames × w × h × 4`.
  - **Why it matters:** GIFs at pixel-art sizes are tiny so this is basically free in practice. Worth flagging because the comment claims the snapshot only happens "when needed" but it happens once per such frame, and the snapshot is held until the next frame's restore.
  - **Suggestion:** No code change — but if this is later applied to larger GIFs, consider re-decoding the previous frame into a temp canvas instead of snapshotting.

- **[MINOR] `addSource` builds `gifFrames` for any sequence import, even if `delaysMs` is empty** — `src/ui/store.ts:277-285`
  - **Issue:** `gifFrames: imported.frames.map((_, i) => ({index: i, delayMs: imported.delaysMs[i] ?? 0}))`. PNG imports never reach the sequence branch (they're sheets) so the only callers are GIFs (with delays) — current behavior is correct. But it conflates "imported with delay metadata" with the source `kind === 'sequence'`, which since KAD-006 is no longer the same thing.
  - **Why it matters:** A future caller that constructs a sequence import with empty delaysMs (e.g., importing a frame-by-frame multi-PNG) gets `gifFrames` with all-zero delays — possibly confusing downstream readers that interpret presence of `gifFrames` as "from a real GIF".
  - **Suggestion:** Only set `gifFrames` when `imported.format === 'gif'`. Mirrors the existing convention `importedFrom: imported.format`.

- **[MINOR] `encodePng` exposes `Uint8ClampedArray` buffer to `pngjs.write` without copy** — `src/core/png.ts:13`
  - **Issue:** `png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)` aliases. If `pngjs/browser` ever mutates the input (unlikely but not asserted in their docs), the user's `RawImage` would corrupt.
  - **Why it matters:** Defensive concern. Round-trip tests would catch a real corruption, but on-the-fly canvas painting wouldn't.
  - **Suggestion:** Pass a copy: `Buffer.from(img.data)` (which copies). One alloc per export, not per stroke, so the cost is negligible.

- **[NIT] `Canvas.handleCancel` calls `clearPreview()` and then `drawPreview()`** — `src/ui/Canvas.tsx:823-825`
  - **Issue:** After `dragRef.current = null`, `drawPreview()` runs through every `if (drag?.kind === ...)` branch and matches none, then handles the marquee-only branch (if `selection`). The first `clearPreview()` is therefore redundant; or `drawPreview()` is, if no selection.
  - **Suggestion:** Drop the `clearPreview()` — `drawPreview` already does `ctx.clearRect(0, 0, c.width, c.height)`.

- **[NIT] `prepareSequence` always copies frames even when `editedFrames` is the input** — `src/core/source.ts:38-46`
  - **Issue:** `frames.map((img) => ({...img, data: new Uint8ClampedArray(img.data)}))` clones every frame. When the input is `editedFrames` already owned by the source, those clones are immediately mutable shells. Saves an aliasing bug class but at the cost of an extra full-buffer copy on every load and on every `addSource`.
  - **Why it matters:** Not perf-critical at pixel-art sizes; cited as the deferred N5 in summary.
  - **Suggestion:** Document the rationale in the function header or accept the cost for safety.

## Cleanliness

- **[MINOR] Dead CSS** — `src/app/styles.css:439-448, 534-543`
  - **Issue:** `.rect-outline.selected` (RectsOverlay never sets a `selected` class — Canvas comment at line 268 explicitly notes the click handler was removed), `.rect-outline .handle` (no resize handles in v1), `.row-grouping`/`.row-input` (deferred v1.1 feature). All present in `styles.css`.
  - **Suggestion:** Remove or annotate as `/* TODO: row-grouping (v1.1) */` so future readers know it's intentional placeholder.

- **[MINOR] `.preview { grid-area: preview }` references a name not in any parent grid template** — `src/app/styles.css:463`
  - **Issue:** The `.shell` grid defines `top|rail|sources|canvas|anims|frames`. `.preview` is a child of `.frames-zone` (which has no named areas). The `grid-area: preview` resolves to no parent, falling back silently to row-2 of `.frames-zone`'s implicit grid. Works, but the rule is misleading.
  - **Suggestion:** Drop the `grid-area: preview` line, or actually wire it through `.frames-zone`'s `grid-template-areas`.

- **[MINOR] Repeated `Object.fromEntries(Object.entries(...).filter(...))` in `removeSource`** — `src/ui/store.ts:303-339`
  - **Issue:** Six near-identical filter blocks, one per per-source map. Easy to miss adding a seventh when a future per-source map is introduced (e.g., a "tool history" map).
  - **Suggestion:** Extract `omitKey<T>(rec: Record<Id, T>, id: Id): Record<Id, T>` helper. Eliminates the repetition and makes the "every per-source map cleared on removeSource" invariant explicit.

- **[MINOR] `shiftRef` updated by reading `ev.shiftKey` on every mouse event** — `src/ui/Canvas.tsx:610, 755, 830`
  - **Issue:** Three sites set `shiftRef.current = ev.shiftKey`. Works, but the data flow is harder to follow than a `useEffect` mirroring `shiftKey` from React state.
  - **Suggestion:** Consider either a `keydown`/`keyup` listener that owns shift state, or a tiny helper `function captureShift(ev) { shiftRef.current = ev.shiftKey; }`.

- **[NIT] `_drop` underscore-rename pattern in store** — `src/ui/store.ts:626-627`
  - **Issue:** `const { [sourceId]: _drop, ...restRedo } = cur.redoStacks; void _drop;`. Idiomatic but slightly noisy. The `void _drop;` is a workaround for `noUnusedLocals`.
  - **Suggestion:** Either use `Object.keys(cur.redoStacks).filter(k => k !== sourceId).reduce(...)` or extract the omit helper above.

- **[NIT] `TopBar.handleSave` doesn't handle the user-cancel case** — `src/ui/TopBar.tsx:28-36`
  - **Issue:** If the File System Access save picker is cancelled, the rejection isn't caught. Users may see DevTools-only errors but no UI feedback.
  - **Suggestion:** `try/catch` with a no-op on user cancellation (via name `AbortError`) and a banner on real errors.

- **[NIT] `ColorPanel.onDragStart` returns a closure receiving `_e`** — `src/ui/ColorPanel.tsx:56-58`
  - **Issue:** Cited as deferred N6. Unused-param.
  - **Suggestion:** Inline `(idx) => () => setDragFromIdx(idx)`. Removes the unused parameter and shortens the dance.

- **[NIT] Two ESC handlers fire on Escape** — `src/ui/ToolPalette.tsx:124-127`, `src/ui/NewBlankSource.tsx:27-34`
  - **Issue:** Cited as deferred N7. Both `clearSelection()` and `onClose()` run when the dialog is open with a selection.
  - **Suggestion:** When the dialog is open, the `keydown` should `stopImmediatePropagation` after closing, or hold the dialog mount conditional on `open` (already done) but track which handler "wins" via a doc-order convention.

- **[NIT] `bash.exe.stackdump` in repo root** — `bash.exe.stackdump`
  - **Issue:** Untracked but not deleted. `.gitignore:147` excludes it from VCS, but the file itself sits in the working tree from a previous shell crash.
  - **Suggestion:** Delete it. (Side-effect free.)

## Documentation

- **[MINOR] `README` Slice section claims "GIF — sliced automatically, one frame per GIF frame" but slicer no longer dispatches `'gif'`** — `README.md:47`
  - **Issue:** Per KAD-006 the kind is `'sequence'` and the slicer is bypassed entirely (`prepareSequence`). The README still uses GIF-as-a-slicing-mode framing.
  - **Why it matters:** A new contributor reading this would expect a `'gif'` slicer to exist and be confused by `slicers/index.ts:19-21` throwing on `'sequence'`.
  - **Suggestion:** Reword to "GIF / sequence — one frame per source bitmap, sliced implicitly".

- **[MINOR] Eyedropper Alt-modifier behavior is not documented** — `README.md:68-87`, `src/ui/Canvas.tsx:174-176`
  - **Issue:** `Alt+click` with eyedropper sets the secondary color. The README's "Keyboard shortcuts" table lists no eyedropper modifier; the Aseprite convention is right-click for secondary, but right-click in pixel_lab is consumed by slice/contextmenu. Result: a documented eyedropper-alt behavior that nobody knows about.
  - **Suggestion:** Add a short "tool modifiers" subsection in the README listing Alt+click for secondary sample, Shift on rect/ellipse mouseup for filled variant.

- **[MINOR] `docs/superpowers/specs/2026-04-23-pixel-lab-design.md` likely still references `kind: 'gif'`** — based on it being a v1 spec from KAD-006 era
  - **Issue:** Per drift-log row 2, KAD-006 superseded the `'gif'` kind. The original spec was not amended.
  - **Why it matters:** Future readers compare spec to code and see drift. AGENTS.md says "References to code should be up to date".
  - **Suggestion:** Either annotate the spec with a "superseded by KAD-006/007" header pointing to the v2 spec, or fold the migration notes into a new top-of-file callout.

- **[NIT] `ARCHITECTURE.md` § Data model says "(KAD-006)" and "(KAD-007)" but the export pipeline § doesn't link KAD-008 by anchor** — `docs/architecture/ARCHITECTURE.md:48-55`
  - **Issue:** Inconsistent citation style. KAD-008 is referenced once at the bottom of the export pipeline section.
  - **Suggestion:** Add `(KAD-008)` next to the v2-bumping bullets for parity.

- **[NIT] `docs/devlog/summary.md` known follow-ups list duplicates lessons-file content** — `summary.md:24-27`
  - **Issue:** Items "N11 computeDelta perf", "N12 ToolPalette listener re-attach" appear in both the summary and as referenced from devlog detail. Maintenance burden as the list moves.
  - **Suggestion:** Treat summary's follow-ups as canonical and drop duplicates from devlog detailed entries (or vice versa).

- **[NIT] `docs/changelog.md` does not mention `Buffer` polyfill / `pointer-events: none` regressions explicitly** — `docs/changelog.md`
  - **Issue:** v0.1.0 entry only says "v2 pixel-drawing feature followed". The two real production-affecting fixes (Buffer polyfill, canvas-image pointer-events, lost-mouseup) aren't in the user-facing changelog.
  - **Suggestion:** Backfill a "0.1.x — fixes" section. Useful for downstream consumers to know they need to be on a recent build.

# Cross-cutting observations

- **The renderCounter pattern is load-bearing but not enforced uniformly.** `Canvas.tsx`, `OnionSkinLayer`, `FramesStrip`, `PreviewBar` all couple "in-place mutation refresh" to a per-source counter wired through props. The `useMemo` for `rects` in Canvas (above) is the one place that *should* use it but doesn't. Consider a `useMutableImage(img, sourceId)` hook that internally subscribes to `renderCounters[sourceId]` and returns a stable reference + dirty token — would centralize the pattern and eliminate the eslint-disable comments scattered through the canvas effects.

- **Pointer-capture migration was a real win but left dead `buttons === 0` defenses.** Lessons-file rule is now technically obsolete inside the codebase (pointer capture guarantees pointerup); the guards remain as defense-in-depth. That's fine, but the lesson should be re-titled "if you remove pointer capture, the buttons===0 guard is mandatory" so future agents don't think the lesson is gone.

- **Test data builders are duplicated across files.** `test/integration/save-reload.test.ts:6`, `test/ui/Canvas.test.tsx`, `test/ui/canvas-drag-edge.test.tsx` each have their own `mountForSheet` / `mockSheetImport`. A `test/helpers/builders.ts` (or similar) would cut ~50 lines and make changes to the source-construction shape (e.g., when a future field is added to `Source`) a one-file edit.

- **`exactOptionalPropertyTypes: false` lets the codebase mix optional + undefined.** `editedFrames?: RawImage[]` is checked variously as `s.editedFrames ?? ...` and `s.editedFrames && s.editedFrames.length > 0`. The mix works but is a foot-gun. Consider flipping the flag as a one-time cleanup — the resulting compile errors would surface every place "missing vs explicitly undefined" matters.

- **No bench / no perf assertions.** Several "documented as fast enough" claims (`computeDelta` O(w·h), `floodFill` 512×512) lack a regression guard. A `vitest --bench` lane that runs the worst-case stroke commit and packer pass would catch a slowdown before users do.
