# Changelog

External-facing record of changes between versions. See `docs/devlog/detailed/` for granular daily entries and `docs/architecture/decisions.md` for the architectural decisions behind each break.

## 0.2.1 — 2026-04-25

### Fixed

- **Re-slicing no longer leaves stale `FrameRef`s.** `updateSlicing` now drops animation frames whose `rectIndex` falls outside the new slicing's frame count, restoring the KAD-004 invariant. Previously, shrinking a sheet's grid past an animation's frame index broke `buildExport` with a "no frame N" error on the next save (B1).
- **FPS validation at the store boundary.** `setAnimationFps` clamps non-finite, zero, and negative input to the default 12 FPS, and rounds-and-clamps positives to `[1, 240]`. Without this, `Math.round(1000 / fps)` produced `Infinity` in playback and JSON-serialized as `null` in the manifest, silently corrupting downstream consumers (M1). Manifest emit also defends against the same case for tampered project files.
- **Slice tool no longer authors out-of-bounds rects.** Drags that exit the canvas now clip to the bitmap bounds, and gestures wholly outside the canvas are dropped instead of pushed as degenerate manual slices that would later crash `prepareSheet`'s crop (M2).
- **Painting into a previously-empty grid cell now refreshes the rects overlay.** Canvas's slice memo now keys on the per-source `renderCounter`, so in-place paint mutations show up in the overlay without nudging the slicing config (M3).
- **`projectFromJson` rejects sequence sources lacking both `editedFrames` and `imageBase64`.** Catches the case `loadProject` would otherwise turn into a `parseGIF(empty)` crash (M4).
- **Open / Drop / Save / Export errors now surface in a clickable error banner.** Previously they were `console.error`-only or unhandled rejections; the user got silent failure on a dropped non-image file or a malformed project JSON. `AbortError` (user cancellation) is silenced (M5).
- **Brush opacity no longer double-composites the join between drag segments.** Chained `stampLine` calls previously re-painted the start of every segment, visibly darkening the join when `opacity < 1`. The new `stampLineFrom` skips the start; mousedown still places the first dot via `stampDot` (M7).
- **Ctrl+Z / Ctrl+Y mid-drag is a no-op.** A new `isDragging` flag in the store gates undo/redo so a mid-drag shortcut can't mutate pixels under the in-flight stroke and corrupt the delta the commit closure is about to record (M8).
- **`updateSlicing` is now best-effort.** A bad in-progress slicing config (cellW=0, etc.) no longer crashes the SlicerControls input; the slicing is recorded, prepared frames hold their old shape, and the slicing-error banner surfaces the underlying message via Canvas's useMemo. Lets the user iterate on slicing values without the app dying.

### Internal

- Side-effecting `useMemo` in `Canvas.tsx` removed: errors are now returned from the memo and surfaced via `useEffect`, eliminating the StrictMode "setState during render" warning.
- Test count: 279 → 308 (review-driven regressions across the M-series and the post-review RC iteration: B1 FrameRef reconcile, M1 FPS validation at the boundary, M2 slice clamp, M3 rects refresh, M4/RC2.2 sequence + sheet completeness, M5 Drop banner, M7 brush opacity at joins, M8 Ctrl+Z mid-drag, M10 GIF reload, M11 slicing-error banner, RC1 banner contract, RC2 loadProject best-effort + fps sanitize, RC2.3 paint-after-bad-slicing, RC2.6 Open/Save/Export error banner, RC3 manifest 1ms floor, RC4 v1 'gif' validator).
- Dead CSS removed (`.rect-outline.selected`, `.rect-outline .handle`, `.row-grouping`, `.row-input`, dangling `grid-area: preview`).
- `bash.exe.stackdump` cleaned from the working tree.
- AGENTS.md updated for codex-cli ≥ 0.121: `--model-reasoning-effort` and `--ask-for-approval` moved into `-c` config overrides, claude `--allowedTools` documented as comma-separated.

## 0.2.0 — 2026-04-25

### Breaking

- **Export manifest schema bumped to v2.** Frame rect fields renamed `w`/`h` → `width`/`height` to match Aseprite/TexturePacker conventions. Animation timing collapsed to per-frame `durationMs` only — the `fps` field is gone from the exported manifest, and uniform-fps animations get `Math.round(1000 / fps)` per frame at export time. The version marker on the manifest itself is now `version: 2`. Consumers built against v1 manifests need to update; there is no v1 reader in the v2 codepath. See KAD-008.

### Added

- **`pixel_lab/manifest` package subpath.** The exported manifest output types (`Manifest`, `FrameInfo`, `AtlasInfo`, `ManifestAnimation`) are now consumable by sibling repos via `import type { Manifest } from 'pixel_lab/manifest'`. The subpath maps to `src/core/serialize/manifest-types.ts`, a pure module with zero imports — consumers do not transitively pull in pixel_lab's React/Pixi/codec dependencies. Mirrors the `file:` sibling-dep pattern used by tools like civ-engine.

### Internal

- Split `src/core/serialize/manifest.ts` into a pure-types module (`manifest-types.ts`) and a runtime module that defines `BuildManifestInput` + `buildManifest()` and re-exports the types for backward-compatible internal imports.
- KAD-008 added; ARCHITECTURE.md § Export pipeline updated; drift-log row appended.

## 0.1.0 — 2026-04-23

Initial pixel_lab release: PNG/GIF import, grid/auto/manual slicing, animation editor, atlas+manifest export, project save/load. v2 pixel-drawing feature followed on 2026-04-24 (12-tool palette, multi-frame editing, onion skin, Aseprite-style shortcut map). See `docs/devlog/detailed/2026-04-23_2026-04-25.md` for the full work history.
