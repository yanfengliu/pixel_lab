# Review Summary

The pixel_lab codebase is in an excellent state with a strong, clean separation of concerns (core vs ui vs io) and an impressive test suite covering everything from pure algorithms to React component integrations. The most concerning issues are lingering race conditions and state desyncs in the canvas interaction loop (specifically related to mid-drag undo/redo and double-painting on opacity), along with the `Canvas.tsx` component growing into a monolithic god class.

# Findings

## Design

- **[MINOR] Canvas growing into a monolithic God Class** — `src/ui/Canvas.tsx:29`
  - **Issue:** The file handles coordinate math, six different visual overlays, pointer capture semantics, and the discrete logic for seven different drawing/selection tools in a single 900+ line component.
  - **Why it matters:** Readability is suffering and testing becomes heavily integration-bound because specific tool logic is entangled with React lifecycle and hit-testing quirks.
  - **Suggestion:** Extract the `handleDown`/`Move`/`Up`/`Cancel` switch statements into custom hooks (e.g., `useBrushTool`, `useMoveTool`) and move the display-only overlays (`PixelGridOverlay`, `OnionSkinLayer`) into their own files.

## Test coverage

- **[MINOR] Missing export collision / zero fps handling** — `src/core/serialize/manifest.ts:33`
  - **Issue:** If a user somehow authors an animation with `fps: 0`, `Math.round(1000 / a.fps)` computes to `Infinity` inside `buildManifest`.
  - **Why it matters:** Generating `Infinity` as a `durationMs` breaks the JSON output and downstream consumers like `idle-life`.
  - **Suggestion:** Add a test covering zero/NaN FPS during export, and either clamp it to a minimum > 0 or default to 100ms.

## Correctness

- **[MAJOR] Brush opacity double-paint on drag endpoints** — `src/core/drawing/brush.ts:60`
  - **Issue:** `stampLine` calls `walkLine`, which invokes `onPoint` on every pixel including the start point `(x0, y0)`. But `(x0, y0)` was already painted during `mousedown` (or the previous `stampLine` call).
  - **Why it matters:** When `opacity < 1`, compositing the exact same pixel twice visually darkens the stroke's connection points, breaking the illusion of a smooth stroke (this is the deferred N2 bug).
  - **Suggestion:** Modify `walkLine` to optionally skip the first point, or skip it inside `stampLine` if `(x, y) === (x0, y0)`.

- **[MAJOR] Ctrl+Z / Ctrl+Y mid-drag delta corruption** — `src/ui/ToolPalette.tsx:90`
  - **Issue:** `ToolPalette`'s global `keydown` listener fires `undo()`/`redo()` immediately without knowing if a canvas drag is currently active.
  - **Why it matters:** If the user presses Ctrl+Z mid-drag, it mutates `sheetBitmaps` or `prepared.frames` underneath the drag, causing the drag's final `commit()` to record a corrupted delta (this is deferred N3).
  - **Suggestion:** Expose an `isDragging` boolean from the store (managed by `beginStroke` / commit), and use it to block global undo/redo shortcuts while a tool is actively dragging.

- **[MINOR] Context menu flashes on slice right-click delete** — `src/ui/Canvas.tsx:406` & `689`
  - **Issue:** Right-click delete happens in `onPointerDown`, which removes the manual rect synchronously. By the time `onContextMenu` fires, the hit-test fails on the now-deleted rect, skipping `e.preventDefault()`.
  - **Why it matters:** Causes a jarring UX where the browser's native context menu flashes immediately after deleting a rect.
  - **Suggestion:** Move the rect-deletion logic entirely into `onContextMenu` alongside `preventDefault()`, or store a ref tracking that a right-click just deleted a rect and prevent default based on that ref.

## Cleanliness

- **[MINOR] Sequence beginStroke does not push downstream re-read** — `src/ui/store.ts:401`
  - **Issue:** In the `beginStroke` commit closure, `prepared` is cloned and updated for `sheet` sources, but lacks the shell replacement (`if (p) prepared = { ...prepared, [sourceId]: { ...p } };`) that `undo` and `redo` have for sequences.
  - **Why it matters:** Breaks symmetry with undo/redo. React components depending on `prepared[sourceId]` might not re-render synchronously on commit for sequences, even if `renderCounters` happens to mask the issue visually on the canvas (Deferred N5).
  - **Suggestion:** Add the shell-replacement fallback for sequences inside `beginStroke`.

- **[MINOR] Inconsistent brush configuration capture between tools** — `src/ui/Canvas.tsx:442` & `498`
  - **Issue:** In `handleDown`, the pencil captures its `brush` state into `dragRef.current`. In `handleMove`, pencil uses the captured `d.brush`, but the eraser uses the live `brushSizeRef.current`.
  - **Why it matters:** If a user presses `[` or `]` mid-drag, the eraser changes size immediately, but the pencil ignores it until the next stroke.
  - **Suggestion:** Store the eraser's size in `DragState` alongside the pencil's brush, and consistently read from the captured state during `handleMove`.

- **[NIT] Unnecessary full-frame mask allocation on marquee** — `src/ui/Canvas.tsx:571`
  - **Issue:** Marquee selection creates a mask via `new Uint8Array(rect.w * rect.h).fill(1)` which is entirely 1s.
  - **Why it matters:** For large selections on large sheets, this needlessly allocates and iterates memory when the marquee is structurally just a solid rectangle.
  - **Suggestion:** `extractSelection` and `pasteSelection` could offer an optimized fast-path for solid-rect selections (e.g., if mask is null or omitted).

- **[NIT] Unused parameter in ColorPanel dragstart** — `src/ui/ColorPanel.tsx:38`
  - **Issue:** `function onDragStart(idx: number) { return (_e: DragEvent) => setDragFromIdx(idx); }` takes `_e` but never uses it.
  - **Why it matters:** Minor noise (Deferred N6).
  - **Suggestion:** Remove the `_e` parameter.

## Documentation

- **[NIT] Outdated Codex reviewer reference in devlog** — `docs/devlog/summary.md`
  - **Issue:** The devlog summary includes a "Known follow-up" instructing the user to update `~/.codex/config.toml` from `gpt-5.5`.
  - **Why it matters:** This is a personal/local developer environment instruction, not a codebase follow-up, and pollutes the project-level drift/summary logs.
  - **Suggestion:** Move local environment fixes to a personal checklist rather than checking them into the repository's permanent documentation.

# Cross-cutting observations

- **Strong architecture enforcement:** The strict boundary of `app -> ui -> io -> core` is highly successful. Decoupling the slicing logic and drawing algorithms from the DOM guarantees that the core engine logic remains testable in a pure Node environment, which clearly paid off given the 275+ tests passing locally.
- **Render Counter pattern:** The use of `renderCounters` to signal React when a mutable `Uint8ClampedArray` changes without generating new reference wrappers is very pragmatic, effectively balancing React's reactive paradigm with the high-performance realities of pixel buffers.
