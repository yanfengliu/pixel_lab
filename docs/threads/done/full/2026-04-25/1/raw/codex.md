# Review Summary

The repo has a solid core/domain split, a broad unit/integration suite, and unusually good internal documentation for a small editor. The biggest concern is that a few key invariants are documented but not actually enforced at runtime: `FrameRef` validity after re-slicing, bounds-safety for manual slice rects, and the visual/hit-test guarantees around the canvas stack. Those gaps matter because they sit directly on the editor’s primary workflows.

# Findings

## Design

- **[MAJOR] `Canvas.tsx` has become a UI god-object around the editor’s riskiest behavior** — `docs/architecture/ARCHITECTURE.md:28`, `src/ui/Canvas.tsx:343`, `src/ui/Canvas.tsx:498`, `src/ui/Canvas.tsx:606`, `src/ui/Canvas.tsx:742`, `src/ui/Canvas.tsx:827`
  - **Issue:** The architecture doc says UI components should be “thin,” but `Canvas.tsx` now owns multiple gesture state machines, preview-buffer lifecycle, selection semantics, move/cut/revert rules, pointer-capture cleanup, and slice authoring in one file.
  - **Why it matters:** This is already the file where several drag-state regressions were fixed, and the current shape makes new tool work hard to reason about, hard to test in isolation, and easy to regress.
  - **Suggestion:** Split gesture control from presentation; at minimum, isolate per-tool controllers or a dedicated editor-interaction layer so `Canvas` stops being the only place where editor semantics live.

## Test coverage

- **[MAJOR] The promised visual gate still does not exist, even though the repo has already been burned by jsdom-only confidence** — `package.json:10`, `package.json:17`, `docs/architecture/ARCHITECTURE.md:57`, `docs/architecture/ARCHITECTURE.md:61`, `docs/devlog/summary.md:22`, `docs/learning/lessons.md:21`
  - **Issue:** Architecture still describes “golden PNG pixel diffs” as a test layer, but the actual test surface is `vitest` plus a manual Playwright smoke script. The z-order/pointer-events regression documented in `lessons.md` is exactly the class of issue that slips past jsdom.
  - **Why it matters:** This is a pixel-art editor; rendering and hit-testing are not secondary concerns. Right now the highest-risk surface still lacks the automated regression gate the docs claim exists.
  - **Suggestion:** Treat pixel-diff/hit-test automation as a near-term correctness gate, not a polish item. The repo already has `pixelmatch` installed, so the missing piece is enforcement, not tooling availability.

- **[MINOR] Critical state-transition paths are still effectively untested** — `test/ui/store.test.ts:62`, `test/integration/round-trip.test.ts:35`, `test/ui/Canvas.test.tsx:362`, `test/io/persist.test.ts:21`, `test/io/persist.test.ts:60`
  - **Issue:** The suite covers happy-path `updateSlicing`, in-bounds manual slice creation, and File System Access API persistence, but there is no regression coverage for re-slicing a source that already feeds animations, dragging a manual slice out of bounds, or fallback open/save behavior.
  - **Why it matters:** Those missing tests line up with real bugs in the current code, which means the suite is broad but still not guarding some of the editor’s most fragile transitions.
  - **Suggestion:** Add regressions around invariant-breaking transitions, not just feature-happy paths.

## Correctness

- **[BLOCKER] Re-slicing can leave stale `FrameRef`s behind and make export fail** — `docs/architecture/ARCHITECTURE.md:44`, `src/ui/store.ts:341`, `src/ui/store.ts:353`, `src/core/export.ts:70`
  - **Issue:** `updateSlicing` rebuilds `prepared[sourceId]` but never reconciles animations that still reference old `rectIndex` values. If the new slice set is smaller, existing `FrameRef`s can point past the end of `preparedFrames`, and export then throws `buildExport: no frame ...`.
  - **Why it matters:** This breaks the core “refs, not copies” model on a normal user workflow: build animation, tweak slicing, export. The architecture doc explicitly says re-slicing updates every animation referencing that source, but the runtime does not preserve that invariant.
  - **Suggestion:** Make `updateSlicing` repair or reject invalid refs immediately so the store cannot enter a broken state.

- **[MAJOR] The slice tool can create out-of-bounds manual rects and crash slicing immediately** — `src/ui/Canvas.tsx:417`, `src/ui/Canvas.tsx:427`, `src/ui/Canvas.tsx:875`, `src/ui/store.ts:353`, `src/core/source.ts:23`, `src/core/image.ts:49`
  - **Issue:** `eventToPixel` deliberately allows overshoot beyond the bitmap edge for shape tools, but the slice tool reuses that same coordinate path and writes the resulting rect directly into manual slicing. `prepareSheet` then tries to `crop(...)` those rects and throws if they cross the bitmap boundary.
  - **Why it matters:** Dragging slightly outside the canvas edge is a common gesture. In manual slicing mode, that can turn into an immediate editor error instead of a clipped rect.
  - **Suggestion:** Clamp slice rects to image bounds before they enter `source.slicing`.

- **[MAJOR] FPS can become `0`/invalid through the UI, which poisons both preview timing and exported manifests** — `src/ui/AnimationsPanel.tsx:111`, `src/ui/AnimationsPanel.tsx:116`, `src/ui/usePlayback.ts:33`, `src/core/serialize/manifest.ts:36`
  - **Issue:** The FPS input uses `Number(e.target.value)` directly and the store does not validate it. That allows `0`, empty-string coercions, and other invalid values to flow into `computeFrameDelay()` and `Math.round(1000 / fps)`.
  - **Why it matters:** In preview, that can produce effectively stuck playback (`setTimeout(Infinity)` behavior). In export, `Infinity` durations become invalid JSON values (`null` after stringify), which silently corrupts manifest timing.
  - **Suggestion:** Validate/clamp animation FPS at the state boundary, not just via HTML input attributes.

- **[MINOR] Preview playback state is not clamped when frame count shrinks, so the preview can display removed frames and impossible counters** — `src/ui/usePlayback.ts:28`, `src/ui/usePlayback.ts:42`, `src/ui/PreviewBar.tsx:80`, `src/ui/PreviewBar.tsx:110`
  - **Issue:** `useAnimationPlayback` resets on `animation.id` changes only, not on `framesLength` shrinkage. If frames are deleted while the current preview index is high, `frameIdx` can remain out of range; `PlayBox` then keeps the old canvas contents because it only redraws when `img` exists.
  - **Why it matters:** The user can end up seeing stale pixels from a removed frame while the counter reports nonsense like `4 / 1`.
  - **Suggestion:** Clamp `frameIdx` whenever `framesLength` changes and explicitly clear the preview canvas when no frame exists.

## Cleanliness

- **[MINOR] The fallback file-open path knowingly leaves a never-settling promise on cancel in some browsers** — `src/io/persist.ts:110`, `src/io/persist.ts:144`, `src/io/persist.ts:151`
  - **Issue:** `fallbackOpen()` documents that older browsers may never fire a `cancel` event, in which case the promise stays pending forever.
  - **Why it matters:** That makes the adapter’s lifecycle asymmetric and can wedge UI flows in exactly the browsers that rely on the fallback path.
  - **Suggestion:** Ensure the fallback path resolves deterministically on user dismissal, even when native cancel events are missing.

- **[MINOR] Picker imports and drag-drop imports do not preserve provenance consistently** — `src/ui/SourcesPanel.tsx:24`, `src/ui/Shell.tsx:151`
  - **Issue:** Drag-drop keeps `file.name`, but picker imports rename everything to `source-N`.
  - **Why it matters:** That inconsistency makes the source list harder to reason about and drifts away from the filename-based workflow described in the original spec.
  - **Suggestion:** Preserve the real filename on both import paths unless the user explicitly renames it.

## Documentation

- **[MINOR] The architecture docs overstate current visual-test coverage** — `docs/architecture/ARCHITECTURE.md:61`, `docs/devlog/summary.md:22`
  - **Issue:** `ARCHITECTURE.md` describes visual golden PNG diffs as an existing test layer, while the current devlog summary says the pixel-diff harness is still pending.
  - **Why it matters:** Reviewers and future contributors reading the architecture doc will assume a regression net exists where it currently does not.
  - **Suggestion:** Either mark the visual layer as planned in `ARCHITECTURE.md` or land the harness and make the statement true.

- **[MINOR] The shipped undo behavior no longer matches the drawing spec** — `docs/superpowers/specs/2026-04-24-pixel-drawing-design.md:20`, `src/ui/store.ts:168`
  - **Issue:** The approved drawing spec still says undo/redo is “unlimited depth,” but the store now hard-caps history at 200 deltas.
  - **Why it matters:** This is the kind of non-obvious product constraint that should live in the spec/docs, especially because it affects long drawing sessions and memory tradeoffs.
  - **Suggestion:** Update the spec/devlog to reflect the actual memory-bounded behavior and rationale.

# Cross-cutting observations

The recurring pattern is “documented invariant, but not enforced invariant.” The architecture/specs describe `FrameRef` stability, thin UI components, inert tools during playback, and visual regression coverage as if they are settled contracts; the code and tests are strongest on happy paths, but several edge transitions still rely on convention rather than enforcement.
