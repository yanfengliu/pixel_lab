# Architecture

## Module boundaries

The source tree enforces a one-way dependency graph:

```
app ──> ui ──> io ──> core
```

Violations are blockers in code review.

### `src/core/` — pure domain

- Zero DOM dependencies. Runs under Node / vitest without jsdom.
- Owns: domain types (`Project`, `Source`, `Animation`, `FrameRef`, `Tool`), `RawImage`/`RGBA` shims (`image.ts`), slicing algorithms (`slicers/grid.ts`, `slicers/auto.ts`, `slicers/manual.ts` + a `slicers/index.ts` dispatcher; sequence sources bypass the dispatcher), GIF decoder adapter (`gif.ts` calls `gifuct-js` behind a thin interface; `compositeGifFrames` is pure for testing), atlas packer (`packer.ts`, MaxRects), drawing primitives (`drawing/` — brush stamps with `stampLineFrom` for chained-segment opacity, flood fill, sample, line/rect/ellipse shapes, marquee selection extract/paste, undo/redo deltas), serializers (`serialize/project.ts` v1↔v2 with structural validation, `serialize/manifest.ts` runtime + `serialize/manifest-types.ts` pure types, `serialize/base64.ts`), PNG encode/decode via the pure `pngjs/browser` codec (no DOM required; works under Node and the Vite bundle via the `buffer` polyfill), export pipeline (`export.ts`).
- **Never** imports from `io`, `ui`, or `app`.
- Public entry: `src/core/index.ts` (re-export barrel). External consumers import the manifest types via the `pixel_lab/manifest` package subpath, mapped to `serialize/manifest-types.ts`.

### `src/io/` — browser adapters

- Owns: magic-byte PNG/GIF detection (`file.ts:detectFormat`, full 6-byte magic), `decodeImport` that returns a uniform `DecodedImport` ({kind, format, frames, delaysMs, bytes}), drag-drop helpers (`drag-drop.ts:filesFromDrop`), File System Access API wrapper (`persist.ts:saveBytes`/`openBytes` with anchor-download + hidden `<input type=file>` fallback for non-Chromium browsers), ZIP bundling via `fflate` (`zip.ts:buildZip`/`parseZip`). Calls into `core/png` and `core/gif` for actual decoding — io is pure plumbing of browser APIs.
- Depends on `core` types and codecs only; never imports from `ui` or `app`.

### `src/ui/` — React components + UI state

- React components and the Zustand store (`src/ui/store.ts`) — the store carries project + drawing state (active tool, primary/secondary colors, opacity, brush size, per-source `selectedFrameIndex`, per-source undo/redo stacks capped at `UNDO_CAP=200`, marquee `selection`, global `onionSkin`, per-source `renderCounters`, transient `isDragging`). UI components import from `./store` within the same layer — no cross-layer cycle.
- Top-level Shell (`Shell.tsx`) lays out a 5-zone grid: `TopBar` (project name + New/+New Blank/Open/Save/Export), left rail (`ToolPalette` + `ColorPanel`), `SourcesPanel`, canvas zone (`Canvas` + `SlicerControls` + slice-error and app-error banners), `AnimationsPanel`, frames zone (`FramesStrip` + `PreviewBar`). The `NewBlankSource` modal is mounted inside `TopBar`. `usePlayback` is a hook shared between the canvas preview and `PreviewBar`.
- All domain logic delegated to `core`. Components are thin: props in, DOM out. No slicing math in components; where a derived view needs a pure helper (e.g. `slice(bitmap, config)`) it calls directly into `core`.

### `src/app/` — composition root

- `src/main.tsx` mounts `<App>` (from `src/app/App.tsx`) into `#root` under `<StrictMode>`. `App.tsx` renders `<Shell>` and imports `./styles.css`. No business logic; no state ownership.

## Data model

See `docs/superpowers/specs/2026-04-23-pixel-lab-design.md` for the v1 schema and `docs/superpowers/specs/2026-04-24-pixel-drawing-design.md` for the v2 extensions. Key invariants:

- A `Project` owns a list of `Source`s and a list of `Animation`s. The in-memory `Project.version` is the literal `2`. `projectToJson` always writes v2; `projectFromJson` accepts both v1 and v2 (v1 is migrated in-flight via `migrateV1ToV2`, mapping legacy `kind:'gif'` → `'sequence'` with `importedFrom:'gif'`). v2 was introduced 2026-04-24 (KAD-006 + KAD-007).
- `Source.kind` describes *structure* (KAD-006):
  - `'sheet'` — single bitmap, sliced into frames by grid / auto / manual.
  - `'sequence'` — N editable bitmaps. Imported GIFs and new blank animations both land here; provenance rides on `Source.importedFrom`.
- `Source.imageBytes` holds the original imported bytes (or empty for blank sources). `Source.editedFrames?: RawImage[]` (KAD-007) is the authoritative pixel data once the user has drawn anything; absent = decode from `imageBytes` (the v1 code path).
- Each `Source` is materialized into a `PreparedSource = { sourceId, frames: RawImage[] }` (via `prepareSheet` / `prepareSequence`) as the uniform frame-level view downstream code consumes. `prepareSheet` respects `editedFrames[0]` when present; `prepareSequence` respects `editedFrames` when present. `PreparedSource` is runtime-only and never serialized.
- A `FrameRef` points into `PreparedSource.frames` by `(sourceId, rectIndex)`. Re-slicing updates every animation that references that source — `updateSlicing` drops `FrameRef`s whose `rectIndex` falls outside the new frame count (KAD-004 invariant enforcement).
- `sequence` sources fix slicing to `{kind: 'sequence'}` and derive one frame per bitmap directly.

## Export pipeline

1. Resolve `FrameRef` → `ImageData`.
2. Dedupe identical frame refs.
3. Pack into atlas via MaxRects, 1px transparent padding, no trim.
4. Emit `manifest.json` (v2: `width/height` field naming, per-frame `durationMs` for every animation, deduped top-level `frames` table) + atlas PNG + optional per-frame PNGs.
5. ZIP via `fflate` and hand to `io` to write.

The manifest schema is exposed as a public package subpath: external consumers (e.g. idle-life) import `Manifest` and related types from `pixel_lab/manifest` (mapped to `src/core/serialize/manifest-types.ts`) via a `file:` sibling dep. See KAD-008.

## Testing layers

- Unit — `core/` algorithms.
- Integration — `core/` + `io/` round-trips via jsdom.
- Visual — `ui/` golden PNG pixel diffs (gate exists in spec but not yet wired in CI; see Drift Log).

See `docs/superpowers/specs/2026-04-23-pixel-lab-design.md` § Testing.

## Drift Log

Structural drift detected during audits but not fixed in the same pass. Per-row architectural drift (with cleanup plans) lives in `docs/architecture/drift-log.md`; this section captures audit-time observations.

| Date | Observation | Status |
|------|-------------|--------|
| 2026-05-01 | `Canvas.tsx` is ~1080 lines and absorbs slice-rect overlay, paint overlay, onion-skin layer, and tool dispatch. ARCHITECTURE.md says UI components are "thin: props in, DOM out" — this one isn't. Tracked as M9 in the iter-1 review. | Deferred — owns its own decomposition iteration. |
| 2026-05-01 | `Visual — ui/ golden PNG pixel diffs` testing layer is described in the spec and ARCHITECTURE.md but no automated harness or CI step exists. The only visual gate is the manual Playwright smoke at `test/smoke/drawing-smoke.mjs` (runnable via `npm run smoke`, requires a separate `npm run dev`). Tracked as M6. | Deferred — needs CI wiring or doc demotion. |