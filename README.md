# pixel_lab

Browser-based tool for slicing 2D pixel-art sprite sheets and animated GIFs into game-ready animation frames. Engine-agnostic output: atlas PNG + JSON manifest + per-frame PNGs, all bundled as a single ZIP. Projects save to a self-contained `.pixellab.json` that you can reopen later.

Runs entirely in the browser — files never leave your machine.

## Requirements

- Node 20+ (tested on 22)
- A modern browser. Chromium (Chrome/Edge) gets native Save/Open dialogs via the File System Access API; Firefox/Safari fall back to a hidden file input + anchor-download and still work.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Opens at `http://localhost:5173`. Drag a PNG sheet or GIF onto the window, or click **+ Import PNG/GIF**.

## Build

```bash
npm run build      # type-check + production bundle into dist/
npm run preview    # serve dist/ locally
```

## Test

```bash
npm test           # vitest, single run
npm run test:watch
```

## Basic workflow

1. **Import** a PNG sheet or GIF (drop or Import button).
2. **Slice** the selected sheet:
   - **Grid** — enter cell width/height, rows, columns, offsets.
   - **Auto** — detect frames by non-transparent bounding boxes.
   - **Manual** — drag on the canvas to draw rects; right-click to delete.
   - **GIF** — sliced automatically, one frame per GIF frame (delays preserved).
3. **Add an animation**, then click **+ Frames from source** to append the slicer's rects. Rename, reorder, set fps, toggle loop.
4. **Preview** plays in the bottom bar. GIF imports default to per-frame timing that matches the original.
5. **Export** produces a ZIP containing:
   - `atlas.png` — packed atlas (MaxRects, 1 px padding)
   - `manifest.json` — frame coords and animation refs (see spec for schema)
   - `frames/<anim>_<i>.png` — one file per unique frame referenced by an animation
6. **Save** writes a `.pixellab.json` you can reopen to pick up where you left off (images are embedded as base64 so the file is portable).

## Extract frames from a GIF

To get a numbered PNG per frame from an imported GIF:

1. **Import the GIF.** Drop it on the window or use **+ Import PNG/GIF**. It lands as a `sequence` source — one editable bitmap per GIF frame, with the original per-frame delays preserved on the source.
2. **Reference the frames from an animation.** With the source selected in the Sources panel, go to the Animations panel and click **+ New** (or pick an existing animation), then **+ Frames from source**. This appends every frame in order. This step is required: `buildExport` only emits frames that an animation references, so without it the `frames/` directory in the ZIP will be empty.
3. **Export.** Click **Export** in the top bar. The resulting ZIP contains `frames/<animation_name>_<index>.png` (e.g. `walk_0.png`, `walk_1.png`, …) alongside the atlas and manifest.

If you only want the per-frame PNGs, ignore `atlas.png` and `manifest.json` — the files in `frames/` are standalone PNGs at the GIF's original pixel size, with no atlas padding or trim applied.

The same flow works for any source: imported PNG sheets sliced via grid/auto/manual produce one PNG per slice rect, named after the animation that references them.

## Keyboard shortcuts

Drawing tools follow Aseprite conventions. Shortcuts are bare keys (no modifiers) and are suppressed while focus is in a text input.

| Key | Action |
|---|---|
| `B` | Pencil |
| `E` | Eraser |
| `I` | Eyedropper |
| `G` | Bucket fill |
| `L` | Line |
| `U` | Rectangle outline |
| `M` | Marquee select |
| `V` | Move |
| `S` | Slice rect (only when slicing mode is Manual) |
| `[` / `]` | Decrease / increase brush size |
| `X` | Swap primary and secondary colors |
| `Esc` | Clear active marquee selection |
| `Ctrl+Z` | Undo (per-source history, capped at 200) |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |

## Canvas controls

- **Scroll wheel** — zoom, anchored at the cursor.
- **Middle-button drag** — pan the viewport.
- A **pixel grid** appears automatically at zoom ≥ 8.
- **Onion skin** is toggled from the button on the left of the Frames strip; it shows the previous frame underneath the current one as a drawing reference. Sequence sources only.

## Docs

- Design spec: `docs/superpowers/specs/2026-04-23-pixel-lab-design.md`
- Architecture: `docs/architecture/ARCHITECTURE.md`
- Devlog: `docs/devlog/summary.md`
