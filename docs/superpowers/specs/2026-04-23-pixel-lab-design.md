# pixel_lab — Design Spec

Date: 2026-04-23
Status: Approved (brainstorming complete)

## Purpose

A browser-based tool for turning 2D pixel-art sprite sheets and animated GIFs
into individual animation frames that can be imported into a game. The tool
is engine-agnostic and produces a self-contained bundle (atlas PNG + JSON
manifest + optional per-frame PNGs) plus a re-openable project file.

## Users & scope

- Single-user, local desktop browser usage.
- No backend, no account, no cloud. Files never leave the machine.
- Primary platform: Windows 11 with a modern Chromium browser; Firefox/Safari
  work via file-download fallbacks.

## Inputs

- **Sprite sheet** — PNG, single image containing many frames. Supports four
  slicing strategies: uniform grid, alpha-based auto-detect, manual rectangle
  drawing, and row-grouping.
- **GIF** — animated GIF. Each frame is decoded; original per-frame delay (ms)
  is preserved. Filename stem becomes the initial animation name.

## Outputs

A single ZIP bundle containing:

```
<project>/
├── atlas.png              # packed sprite atlas (MaxRects, 1px padding)
├── manifest.json          # schema below
└── frames/                # optional; toggle on export
    └── <animation>_<n>.png
```

### `manifest.json` (schema version 1)

```json
{
  "version": 1,
  "atlas": { "image": "atlas.png", "width": 512, "height": 512 },
  "frames": {
    "<frame_name>": { "x": 0, "y": 0, "w": 32, "h": 32 }
  },
  "animations": {
    "<anim_name>": {
      "fps": 12,
      "loop": true,
      "frames": ["<frame_name>", "..."]
    },
    "<variable_timing_anim>": {
      "fps": null,
      "loop": true,
      "frames": [
        { "name": "walk_0", "durationMs": 100 },
        { "name": "walk_1", "durationMs": 80 }
      ]
    }
  }
}
```

- Uniform-fps animations list frames as strings.
- Variable-timing animations (e.g. GIFs with changing delays) list frames as
  objects with `durationMs` overriding `fps: null`.

### `.pixellab.json` (project save)

Self-contained (images embedded as base64) so the file round-trips on any
machine. Schema version 1.

```json
{
  "version": 1,
  "name": "hero",
  "sources": [{
    "id": "<uuid>",
    "name": "walk.png",
    "kind": "sheet",
    "imageBase64": "<png-bytes>",
    "width": 256, "height": 32,
    "slicing": { "kind": "grid", "cellW": 32, "cellH": 32,
                 "offsetX": 0, "offsetY": 0, "rows": 1, "cols": 8 }
  }],
  "animations": [{
    "id": "<uuid>", "name": "walk", "fps": 12, "loop": true,
    "frames": [{ "sourceId": "<uuid>", "rectIndex": 0 }]
  }]
}
```

## Architecture (module boundaries)

Strict layering, enforced by `src/` subdirectory structure:

- **`src/core/`** — Pure TypeScript, zero DOM. Domain types, slicing
  algorithms, GIF-decoder adapter (library call only), atlas packer,
  serializers. Fully unit-testable under Node/vitest.
- **`src/io/`** — Browser adapters: File System Access API (with
  download-blob fallback), ZIP bundling (`fflate`), drag-drop helpers.
  Depends on `core` only.
- **`src/ui/`** — React components. Thin views; all logic lives in `core`.
- **`src/app/`** — Composition root, global state (Zustand), top-level wiring.

Dependency direction: `app → ui → io → core`. Violations caught in review.

## Slicing engine

All slicers are pure functions `(ImageData, config) => Rect[]`.

- **Grid** — iterate rows × cols from (offsetX, offsetY); skip fully
  transparent cells.
- **Auto** — two-pass connected-components on `alpha > threshold`, merge
  bounding boxes closer than `minGapPx`, sort top-to-bottom then
  left-to-right.
- **Manual** — verbatim user-drawn rects.
- **Row grouping** — post-processing over any slicer's output: user maps
  row-band → animation name; rects whose bbox center-y falls in the band
  join that animation.
- **GIF decoder adapter** — `gifuct-js` → array of `{imageData, delayMs}`.

All slicers deterministic; tested with fixtures for single-frame, grid,
touching frames, off-by-one edges.

### Source frame uniformization

Sheets and GIFs are unified through a derived `preparedFrames: ImageData[]`
on every source:

- **Sheet source** — `preparedFrames[i]` = the pixels of `rects[i]` cut from
  the decoded sheet bitmap. Recomputed whenever slicing changes.
- **GIF source** — `preparedFrames[i]` = the i-th decoded GIF frame bitmap.
  `rects[i]` equals the full GIF dimensions; slicing type is fixed to
  `{kind: 'gif'}`.

`FrameRef.rectIndex` always indexes into `preparedFrames`. This makes the
rest of the pipeline (preview, export, packing) identical for both source
kinds.

## Animation & preview

- `Animation` = `{name, fps | 'per-frame', loop, frames: FrameRef[]}`.
- `FrameRef = {sourceId, rectIndex, durationMs?}` — frames are references,
  not copies. Re-slicing a source updates every animation using it.
- Light editing only: preview playback, delete frame, reorder frames,
  rename animation, change fps/loop. No per-frame pixel editing. No pivot
  handling (out of scope for engine-agnostic v1).

## Export pipeline

1. Resolve every `FrameRef` to an `ImageData` (from its source bitmap + rect).
2. Pack all unique frames into atlas via MaxRects, 1px transparent padding,
   no trim (preserves declared frame size).
3. Render atlas PNG.
4. Emit `manifest.json` with frame coordinates + animation references.
5. Optional: emit per-frame PNGs to `frames/`.
6. Bundle all outputs into ZIP via `fflate`.
7. Write ZIP via File System Access API `showSaveFilePicker`
   (Chrome/Edge) or anchor download fallback.

## UI

Single page, four zones:

```
┌──────────────────────────────────────────────────────────────┐
│ [Project name]   [Open] [Save] [Export]                      │
├──────────┬──────────────────────────────────┬────────────────┤
│ Sources  │  Canvas (zoom 1x–16x, nearest)  │  Animations    │
│ + sheet  │  slicer overlay + manual rects  │  + new anim    │
│ + gif    │  slicer controls below          │  inline rename │
├──────────┴──────────────────────────────────┴────────────────┤
│  ▶ play  fps [12]  ☑loop   [frame strip thumbnails]          │
└──────────────────────────────────────────────────────────────┘
```

- Dark theme, nearest-neighbor image rendering throughout (pixel art must
  never blur).
- Canvas zoom 1x–16x, pixel grid visible at ≥8x.
- Manual mode: drag to draw rects, handles to resize, Delete to remove.
- Slicer controls: dropdown + reactive inputs; re-slices live.
- Drag-reorder frames in preview strip; right-click delete.

## Non-goals (v1)

- Per-frame pixel editing.
- Pivot / anchor points.
- Tight-trim packing (changes declared frame size; breaks predictable pivots).
- Cloud sync, accounts, sharing.
- Batch export of multiple projects.
- Engine-specific export formats (Phaser/Godot/Unity). Revisit post-MVP if
  wanted; the manifest is rich enough to transform into those formats.

## Testing strategy

- **Unit (vitest)** — all of `core/`:
  - grid/auto/manual slicers against fixture ImageData
  - GIF decoder adapter round-trips delays
  - atlas packer: no overlaps, padding, bounds ≤ max size, determinism
  - serializer: project JSON round-trips; manifest matches golden fixtures
- **Integration (vitest + jsdom)** — end-to-end in-memory: load PNG → slice
  → build animation → export → parse ZIP → assert manifest + atlas.
- **Visual (pixel diff)** — golden PNGs under `test/fixtures/`:
  - canvas render at 1x / 4x / 16x (nearest-neighbor integrity)
  - atlas output for a fixed project (packer determinism)
- **Gates** — `npx vitest run`, `npx tsc --noEmit`, `npx vite build` all
  green before merge.

## Stack

- TypeScript + Vite + React 18.
- Zustand for app state.
- `gifuct-js` for GIF decoding.
- `fflate` for ZIP.
- `vitest` + `@testing-library/react` + `jsdom` for tests.
- `pngjs` + `pixelmatch` for pixel-diff tests.
