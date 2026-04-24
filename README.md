# pixel_lab

Browser-based tool for slicing 2D pixel-art sprite sheets and animated GIFs
into game-ready animation frames. Engine-agnostic output: atlas PNG +
JSON manifest + optional per-frame PNGs, all bundled as a single ZIP.
Projects save to a self-contained `.pixellab.json` that you can reopen
later.

Runs entirely in the browser — files never leave your machine.

## Requirements

- Node 20+ (tested on 22)
- A modern browser. Chromium (Chrome/Edge) gets native Save/Open dialogs
  via the File System Access API; Firefox/Safari fall back to a hidden
  file input + anchor-download and still work.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Opens at `http://localhost:5173`. Drag a PNG sheet or GIF onto the window,
or click **+ Import PNG/GIF**.

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

## How to use

1. **Import** a PNG sheet or GIF (drop or Import button).
2. **Slice** the selected sheet:
   - **Grid** — enter cell width/height, rows, columns, offsets.
   - **Auto** — detect frames by non-transparent bounding boxes.
   - **Manual** — drag on the canvas to draw rects; right-click to delete.
   - **GIF** — sliced automatically, one frame per GIF frame (delays preserved).
3. **Add an animation**, then click **+ Frames from source** to append
   the slicer's rects. Rename, reorder, set fps, toggle loop.
4. **Preview** plays in the bottom bar. GIF imports default to
   per-frame timing that matches the original.
5. **Export** produces a ZIP containing:
   - `atlas.png` — packed atlas (MaxRects, 1 px padding)
   - `manifest.json` — frame coords and animation refs (see spec for schema)
   - `frames/*.png` — one file per unique frame (optional)
6. **Save** writes a `.pixellab.json` you can reopen to pick up where you
   left off (images are embedded as base64 so the file is portable).

## Docs

- Design spec: `docs/superpowers/specs/2026-04-23-pixel-lab-design.md`
- Architecture: `docs/architecture/ARCHITECTURE.md`
- Devlog: `docs/devlog/summary.md`
