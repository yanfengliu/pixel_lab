# Pixel drawing on sources — Design Spec

Date: 2026-04-24 Status: Approved (brainstorming complete) Supersedes: n/a Parent spec: `2026-04-23-pixel-lab-design.md` (this is an additive feature on top of v1)

## Purpose

Turn pixel_lab from a slicer-only tool into a lightweight animation authoring tool. Any frame of any source can be edited with pixel-drawing tools; new sources (sheets or animations) can be created blank and painted from scratch.

The stated end-product priority is **animations** (90% of usage), with occasional single-image pixel art for hobby (10%). Drawing is a means to authoring animation frames, not a standalone paint-program feature.

## Sub-project context

This is sub-project #1 of a 2-part rollout. Sub-project #2, **Annotation overlay** (vector notes/arrows over the canvas), is deferred.

## Guiding philosophy

Aseprite mental model, simplified UI. Specifically:

- Tools are mouse-behavior modes. Selecting Pencil means the mouse paints; selecting Slice Rect means it creates rects. No separate "edit vs slice" toggle.
- Session-scoped undo/redo (not persisted), unlimited depth.
- Swatches over palettes. No indexed-color mode.
- Keyboard shortcuts match Aseprite where they exist.

## Goals

1. Any frame of any source is editable with pixel tools.
2. "New Blank" spawns either a single sheet or a multi-frame animation.
3. GIF sources' frames are individually editable; no GIF re-encode on save.
4. Existing slice-and-organize workflow keeps working unchanged for users who never draw.
5. Data model migrates cleanly from v1 projects to v2 without user action.

## Non-goals

- Layers (stay single-layer)
- Indexed-color mode / palette import/export (.gpl, .hex)
- Canvas resize after source creation
- Selection clipboard across sources
- Textured brushes (stay square, 1–8 px)
- GIF re-encoding (edited frames persist as PNGs, not as re-encoded GIF bytes)
- Frame-delay editing from the drawing UI (use existing animation fps / per-frame delay controls)
- Vector annotations (sub-project #2)

## Source model changes

Current data model (v1):

```ts
Source.kind: 'sheet' | 'gif'
Source.imageBytes: Uint8Array  // PNG or GIF bytes — source of truth
```

v2 data model:

```ts
Source.kind: 'sheet' | 'sequence'   // 'gif' renamed to 'sequence'
Source.imageBytes: Uint8Array       // preserved for provenance / v1 round-trip
Source.editedFrames?: RawImage[]    // when present, authoritative
Source.importedFrom?: 'gif' | 'blank'  // metadata only
```

**Semantics:**

| `kind` | Frame count | Slicing applies | Example origins |
|---|---|---|---|
| `sheet` | 1 bitmap | grid / auto / manual | imported PNG, new blank sheet |
| `sequence` | N bitmaps | fixed 1-to-1 | imported GIF, new blank animation |

**Source-of-truth rule:**

- If `editedFrames` is present, it is authoritative. `imageBytes` is kept for provenance (lets the user inspect the original) but is not re-decoded.
- If `editedFrames` is absent, behavior is identical to v1: `imageBytes` is decoded into `preparedFrames` on load.

**First-edit materialization:** the first draw action against a source without `editedFrames` populates `editedFrames` from the currently-decoded frames, then applies the edit. Subsequent edits mutate `editedFrames` directly.

**Migration:** project file `version` bumps from `1` to `2`. Load path accepts both. Save always writes v2. v1 `kind: 'gif'` maps to v2 `kind: 'sequence'` with `importedFrom: 'gif'`.

**KAD entries required:**
- KAD-006: Rename `Source.kind: 'gif'` → `'sequence'`. Rationale: the kind should describe structure (multi-frame bitmap container), not provenance (the GIF file it came from). Blank animations and imported GIFs share identical runtime semantics; the only difference is the optional delay metadata, carried separately on the source.
- KAD-007: `editedFrames` alongside `imageBytes` vs. overwriting `imageBytes`. Rationale: keep the original bytes for provenance; editing can never corrupt an imported asset.
- Drift-log entries for both KADs.

## Drawing engine (`src/core/drawing/`)

All tool implementations are pure functions over `RawImage`. DOM-free, unit-testable, live in the `core` layer per the one-way dep graph.

Public interface (illustrative):

```ts
interface StrokeContext {
  bitmap: RawImage           // mutable target
  primary: RGBA
  secondary: RGBA
  opacity: number            // 0–1, applied to primary when writing
  brushSize: number          // 1–8, square
  prevPoint?: Point          // for line interpolation during drags
}

// Each tool exposes (down, move, up) → pixel mutations.
// UI layer calls these and gets back a new RawImage (or a delta patch).
```

Tools:

| Tool | Key | Behavior | Notes |
|---|---|---|---|
| Pencil | B | Drag paints pixels with primary at brush size | Line-interpolate between consecutive mouse samples so fast drags don't leave gaps |
| Eraser | E | Drag clears to fully transparent | Same line-interpolation |
| Eyedropper | I | Click sets primary color to sampled pixel | Alt-click sets secondary |
| Bucket fill | G | 4-connected flood fill | Alpha-aware; tolerance = exact RGBA match at MVP |
| Line | L | Bresenham line from down-point to current | Preview overlay during drag; commit on up |
| Rectangle | U | Outline (default) or filled (Shift) | Preview overlay during drag |
| Ellipse | — | Midpoint-circle outline or filled (Shift) | Preview overlay during drag |
| Marquee select | M | Rectangular region; marching-ants overlay; ESC clears | Selection is per-frame, not persisted across frame switches |
| Move | V | Drag moves selection contents within same frame | No cross-source clipboard; moving leaves transparent under the moved region |
| Slice rect | S | Today's manual-slicing drag, promoted to a first-class tool | Enabled only when source's slicing kind is `manual`; ghosted otherwise with tooltip "Switch slicing to Manual to use" |

**Opacity** (0–100%, default 100%) scales primary-color writes. Eraser ignores opacity (always fully clears).

**Undo/redo:**

- One undo entry per stroke (mousedown → mouseup is atomic).
- Per-source undo stack (not per-frame). Switching frames doesn't clear history.
- Unbounded depth; memory cost scales with frames × stroke count. (Revisit if RSS becomes a concern in practice.)
- Stored as {frame index, bounding rect, before-pixels, after-pixels} deltas so big canvases with small strokes don't cost much.
- Session-only; not serialized to `.pixellab.json`.

## Color system

- Primary + secondary color slots. `X` swaps.
- HSV picker + hex input.
- Swatch row: user-editable. Click = set primary. Right-click = delete. Drag = reorder. Double-click a slot = open picker.
- Swatches saved with the project (`Project.swatches?: string[]`, hex strings).
- Default: empty swatches. No preset palettes at MVP.

## UI changes

### Canvas (`src/ui/Canvas.tsx`)

- Mouse handling becomes tool-dispatched. Active tool's handler runs on mousedown; move/up listeners attach to `window` (already done for manual slicing — same pattern generalizes).
- Stroke preview rendered as a transparent overlay canvas on top of the source canvas; committed to the source canvas on mouseup.
- Rects overlay unchanged for grid/auto slicing; Slice Rect tool replaces the current ManualOverlay.
- Pixel-grid overlay (1-px grid lines) appears at zoom ≥ 8×. Already on the v1.1 roadmap.

### New: `src/ui/ToolPalette.tsx`

Vertical strip of tool buttons on the left of the canvas. Active tool highlighted. Keyboard shortcut shown on hover. Grouped: paint (pencil, eraser, eyedropper, bucket), shapes (line, rect, ellipse), selection (marquee, move), slice (slice rect).

### New: `src/ui/ColorPanel.tsx`

Below or beside the tool palette. Primary/secondary slots (X to swap), opacity slider, HSV picker, hex input, swatch row. Picker hidden behind click-to-open to reduce visual clutter.

### Updated: PreviewBar → `src/ui/FramesStrip.tsx`

Today's PreviewBar shows animation playback. New behavior: when a source is selected, the strip shows a horizontal row of frame thumbnails.

- Click a thumbnail = select that frame for editing.
- Selected frame highlighted with a border.
- For `sheet` sources, thumbnails show each slice rect. For `sequence` sources, each editable bitmap.
- Painting is unclipped for sheets (paint anywhere on the sheet canvas); the selected frame is just what's highlighted and what thumbnails refresh.
- Playback button stays; during playback, editing is paused (tools inert).
- **Onion skin toggle** lives here: off by default, when on, previous frame renders at ~30% alpha underneath current.

### New dialog: `src/ui/NewBlankSource.tsx`

Triggered by "New Blank" button. Radio: **Sheet | Animation**.

- Sheet: width × height inputs, default 64×64.
- Animation: frame width × height × frame count inputs, default 32×32 × 8.

Name input defaults to "Untitled Sheet" / "Untitled Animation" with a uniqueness suffix.

### SlicerControls

Unchanged. Grid / auto / manual forms stay in the side panel. Manual slicing's mouse behavior moves to the Slice Rect tool (the form still owns the rect list, just like today).

### TopBar

No changes to existing actions. The "New Blank" button is added next to "+ Import PNG/GIF".

## Persistence (`.pixellab.json` v2)

Version bump `1 → 2`. v1 files load; save always writes v2.

New/changed fields:

```json
{
  "version": 2,
  "name": "...",
  "swatches": ["#ff0000", "#00ff00"],
  "sources": [
    {
      "id": "...",
      "name": "...",
      "kind": "sheet" | "sequence",
      "width": 64,
      "height": 64,
      "slicing": { ... },
      "imageBytes": "base64...",
      "editedFrames": ["base64-png-frame-0", "base64-png-frame-1"],
      "importedFrom": "gif" | "blank",
      "gifFrames": [ ... ]
    }
  ],
  "animations": [ ... ]
}
```

`editedFrames` only written when present. Each entry is a base64-encoded PNG of that frame's pixels — reuses the existing PNG codec. For sheet sources with edits, `editedFrames` has length 1 and holds the full edited sheet bitmap.

## Export pipeline

No changes to `manifest.json` schema. The atlas packer already consumes `preparedFrames`; we just plumb `editedFrames` into `preparedFrames` when present.

## Boundary check

- `src/core/drawing/` — pure pixel algorithms (tools, flood fill, line, ellipse, alpha compositing). DOM-free, fully unit-testable.
- `src/core/types.ts` — extended with `editedFrames`, `'sequence'` kind, `importedFrom`, project `swatches`.
- `src/core/source.ts` — `prepareSheet` / `prepareSequence` respect `editedFrames` when present.
- `src/core/serialize.ts` (or wherever the project JSON lives) — v1→v2 migration, base64 PNG round-trip for `editedFrames`.
- `src/ui/ToolPalette.tsx`, `src/ui/ColorPanel.tsx`, `src/ui/FramesStrip.tsx`, `src/ui/NewBlankSource.tsx` — new React components. Consume the store.
- `src/ui/store.ts` — new actions: `setActiveTool`, `setPrimaryColor`, `setSecondaryColor`, `addSwatch`, `removeSwatch`, `setActiveFrame`, `applyStroke`, `undo`, `redo`, `createBlankSource`.
- `src/ui/Canvas.tsx` — tool-dispatched mouse handling, overlay canvas for preview strokes.
- `src/io/` — unchanged (file I/O untouched; all new persistence flows through existing ZIP / PNG utilities).

The one-way dep graph (`app → ui → io → core`) is respected.

## Testing strategy

### Unit (`core/drawing/`)

Per-tool fixture-based tests:

- Pencil: single click paints one pixel; drag paints interpolated line; brush size 3 paints 3×3 square.
- Eraser: clears alpha to 0; respects brush size.
- Bucket: fills connected region; stops at alpha boundary; handles 1-pixel gap (does not leak).
- Line: every Bresenham octant; zero-length == single point.
- Rectangle (outline): corners present, interior untouched. Filled: all pixels covered.
- Ellipse: symmetry across both axes; radii 1/2/3 look correct vs. fixture.
- Move: shifted region appears at destination; source region cleared.
- Opacity: 50% write blends correctly with existing alpha.

### Unit (migration)

v1 project JSON round-trips through load → save → load without loss. v1 `kind: 'gif'` sources come back as `'sequence'` with `importedFrom: 'gif'`.

### Integration

- Draw on a sheet source; export atlas; assert atlas pixels at the frame coordinates match the drawn strokes.
- Edit frame 2 of a GIF source; export atlas; assert the edited frame appears at its packed location.
- Create a blank animation (4 frames), paint each, export; assert manifest has 4 frames and each frame's pixels match.
- Save → close → reopen a project with edited frames; verify edits persist.

### UI (visual pixel-diff)

- Tool palette renders at expected layout.
- Pencil stroke at zoom 8× matches golden PNG.
- Onion skin renders previous frame at ~30% alpha.
- FramesStrip thumbnails update within one frame after a paint stroke commits.

### Before / after capture discipline

Per `AGENTS.md`: capture before/after screenshots for every visual change, generate pixel diffs, use them as verification alongside `npx vitest run` / `npx tsc --noEmit` / `npx vite build`.

## Open risks

1. **Undo memory.** Unbounded stroke history on a multi-frame project could pile up. Mitigation: store deltas, not full bitmaps. Revisit if real-world usage shows RSS issues.
2. **Bucket fill perf on big sheets.** A 2048×2048 sheet fill is ~4M pixels. Naive recursion overflows the call stack; implement iteratively with an explicit queue (scanline flood fill).
3. **Edited-GIF provenance.** Once a GIF is edited, original bytes are no longer authoritative. Keep them, but mark the source "edited" in the UI so the user knows re-export won't reproduce the original GIF.
4. **Scope for a single plan.** This spec covers 10 tools, a color system, multi-frame editing, onion skin, migration, and a new dialog. The plan may split it into:

   - Plan 1: Foundation — data model + migration + pencil / eraser / eyedropper / bucket + color + undo/redo + frame strip + new-blank dialog.
   - Plan 2: Shapes + selection — line, rect, ellipse, marquee, move.
   - Plan 3: Polish — onion skin, pixel grid overlay, shortcut map completeness, Slice Rect tool finalization.

Keep the spec unified; let `writing-plans` carve it up.

## Keyboard shortcut map

| Keys | Action |
|---|---|
| B | Pencil |
| E | Eraser |
| I | Eyedropper |
| G | Bucket fill |
| L | Line |
| U | Rectangle (Shift = filled) |
| M | Marquee select |
| V | Move |
| S | Slice rect (when slicing = manual) |
| X | Swap primary/secondary color |
| `[` / `]` | Decrease / increase brush size |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| ESC | Clear selection |

## Success criteria

- A user can open pixel_lab, click "New Blank → Animation", choose `32×32, 8 frames`, draw each frame with pencil + color swatches, scrub through with the preview strip, toggle onion skin while drawing, and export a ZIP containing an 8-frame animation. No manual slicing involved.
- A user can import an existing GIF, open frame 3, erase a pixel, paint over it, and export an atlas that reflects the edit.
- A user who never draws sees pixel_lab's existing behavior unchanged.
- `npx vitest run`, `npx tsc --noEmit`, `npx vite build` all pass.