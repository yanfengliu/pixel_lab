# Architecture

## Module boundaries

The source tree enforces a one-way dependency graph:

```
app ──> ui ──> io ──> core
```

Violations are blockers in code review.

### `src/core/` — pure domain

- Zero DOM dependencies. Runs under Node / vitest without jsdom.
- Owns: domain types (`Project`, `Source`, `Animation`, `FrameRef`), slicing
  algorithms (grid, auto, manual), GIF decoder adapter (calls `gifuct-js`
  behind a thin interface), atlas packer (MaxRects), serializers
  (`.pixellab.json`, export manifest), PNG encode/decode via the pure
  `pngjs/browser` codec (no DOM required; works under Node and the Vite
  bundle via the `buffer` polyfill).
- **Never** imports from `io`, `ui`, or `app`.
- Public entry: `src/core/index.ts`.

### `src/io/` — browser adapters

- Owns: magic-byte PNG/GIF detection, drag-drop handlers, File System
  Access API wrapper (with anchor-download fallback for unsupporting
  browsers), ZIP bundling via `fflate`. Calls into `core/png` and
  `core/gif` for actual decoding — io is pure plumbing of browser APIs.
- Depends on `core` types and codecs only; never imports from `ui` or `app`.

### `src/ui/` — React components + UI state

- React components, Zustand store (`src/ui/store.ts`). UI components import
  from `./store` within the same layer — no cross-layer cycle.
- All domain logic delegated to `core`. Components are thin: props in,
  DOM out. No slicing math in components; where a derived view needs a
  pure helper (e.g. `slice(bitmap, config)`) it calls directly into
  `core`.

### `src/app/` — composition root

- `src/main.tsx` + `src/app/App.tsx`. Mounts `ui/Shell` into `#root` and
  loads styles. No business logic; no state ownership.

## Data model

See `docs/superpowers/specs/2026-04-23-pixel-lab-design.md` for the full
schema. Key invariants:

- A `Project` owns a list of `Source`s and a list of `Animation`s.
- Each `Source` exposes `preparedFrames: ImageData[]` regardless of kind
  (sheet or gif), produced by its slicer.
- A `FrameRef` points into `preparedFrames` by `(sourceId, rectIndex)`.
  Re-slicing updates every animation that references that source.
- GIF sources fix slicing to `{kind: 'gif'}` and derive frames from the
  decoded GIF directly.

## Export pipeline

1. Resolve `FrameRef` → `ImageData`.
2. Dedupe identical frame refs.
3. Pack into atlas via MaxRects, 1px transparent padding, no trim.
4. Emit `manifest.json` + atlas PNG + optional per-frame PNGs.
5. ZIP via `fflate` and hand to `io` to write.

## Testing layers

- Unit — `core/` algorithms.
- Integration — `core/` + `io/` round-trips via jsdom.
- Visual — `ui/` golden PNG pixel diffs.

See `docs/superpowers/specs/2026-04-23-pixel-lab-design.md` § Testing.
