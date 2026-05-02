# Architecture

## Module boundaries

The source tree enforces a one-way dependency graph:

```
app ──> ui ──> io ──> core
```

Violations are blockers in code review.

### `src/core/` — pure domain

- Zero DOM dependencies. Runs under Node / vitest without jsdom.
- Owns: domain types (`Project`, `Source`, `Animation`, `FrameRef`), slicing algorithms (grid, auto, manual), GIF decoder adapter (calls `gifuct-js` behind a thin interface), atlas packer (MaxRects), serializers (`.pixellab.json`, export manifest), PNG encode/decode via the pure `pngjs/browser` codec (no DOM required; works under Node and the Vite bundle via the `buffer` polyfill).
- **Never** imports from `io`, `ui`, or `app`.
- Public entry: `src/core/index.ts`.

### `src/io/` — browser adapters

- Owns: magic-byte PNG/GIF detection, drag-drop handlers, File System Access API wrapper (with anchor-download fallback for unsupporting browsers), ZIP bundling via `fflate`. Calls into `core/png` and `core/gif` for actual decoding — io is pure plumbing of browser APIs.
- Depends on `core` types and codecs only; never imports from `ui` or `app`.

### `src/ui/` — React components + UI state

- React components, Zustand store (`src/ui/store.ts`). UI components import from `./store` within the same layer — no cross-layer cycle.
- All domain logic delegated to `core`. Components are thin: props in, DOM out. No slicing math in components; where a derived view needs a pure helper (e.g. `slice(bitmap, config)`) it calls directly into `core`.

### `src/app/` — composition root

- `src/main.tsx` + `src/app/App.tsx`. Mounts `ui/Shell` into `#root` and loads styles. No business logic; no state ownership.

## Data model

See `docs/superpowers/specs/2026-04-23-pixel-lab-design.md` for the v1 schema and `docs/superpowers/specs/2026-04-24-pixel-drawing-design.md` for the v2 extensions. Key invariants:

- A `Project` owns a list of `Source`s and a list of `Animation`s. Project file format is v2 since 2026-04-24 (KAD-006 + KAD-007).
- `Source.kind` describes *structure* (KAD-006):
  - `'sheet'` — single bitmap, sliced into frames by grid / auto / manual.
  - `'sequence'` — N editable bitmaps. Imported GIFs and new blank animations both land here; provenance rides on `Source.importedFrom`.
- `Source.imageBytes` holds the original imported bytes (or empty for blank sources). `Source.editedFrames?: RawImage[]` (KAD-007) is the authoritative pixel data once the user has drawn anything; absent = decode from `imageBytes` (the v1 code path).
- Each `Source` exposes `preparedFrames: RawImage[]` (`prepareSheet` / `prepareSequence`) as the uniform frame-level view downstream code consumes. `prepareSheet` respects `editedFrames[0]` when present; `prepareSequence` respects `editedFrames` when present.
- A `FrameRef` points into `preparedFrames` by `(sourceId, rectIndex)`. Re-slicing updates every animation that references that source.
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
- Visual — `ui/` golden PNG pixel diffs.

See `docs/superpowers/specs/2026-04-23-pixel-lab-design.md` § Testing.

## Drift Log

Structural drift detected during a doc-audit pass that is out of scope to fix in
the same pass. Each row should either be repaid or migrated to
`docs/architecture/drift-log.md` with a remediation plan. Per-KAD drift (data
model, manifest schema, store layer placement) lives in `drift-log.md`.

| Date | What drifted | Why it's recorded here |
|------|--------------|------------------------|
| 2026-05-02 | `src/ui/Canvas.tsx` is 1146 LOC; `src/ui/store.ts` is 929 LOC. AGENTS.md § Code review caps individual files at 500 LOC. | Known follow-up M9 in `docs/devlog/summary.md`. Refactor is its own task — fixing it requires splitting Canvas (drag handlers, render layers, slicing overlay) and store (drawing slice vs. project slice) along stable seams, not a rename. |
| 2026-05-02 | `docs/devlog/detailed/2026-04-23_2026-04-25.md` is 463 lines (cap is 500). Approaching the archive trigger documented in AGENTS.md § Devlog. | Will need a `git mv` to update its `END_DATE` and a fresh active file before the next devlog entry. |