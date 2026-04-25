# Implementation plan — Pixel drawing (Phase 1: Foundation)

Spec: `docs/superpowers/specs/2026-04-24-pixel-drawing-design.md` Branch: `agent/pixel-drawing` Phase: 1 of 3. Phase 2 (shapes + selection) and Phase 3 (polish) follow.

## Scope for this phase

- Data-model migration: `kind: 'gif' → 'sequence'`, `editedFrames`, `importedFrom`, `Project.swatches`, project version 1 → 2.
- Paint tools: pencil, eraser, eyedropper, bucket fill. Pure-function implementations in `core/drawing/`.
- Color system: primary/secondary colors, swatches, opacity.
- Undo/redo: per-source stroke-granular delta stack, session-only.
- New UI components: `ToolPalette`, `ColorPanel`, `FramesStrip`, `NewBlankSource` dialog.
- Canvas changes: tool-dispatched mouse handling + preview overlay
  + click-a-frame selection.
- TopBar: "New Blank" button.

Out of scope (later phases): line/rect/ellipse/marquee/move/slice-rect tools, onion skin, pixel grid overlay.

## Order of work (TDD throughout)

Each task: write affected tests first, make them pass, keep `npx tsc --noEmit` and affected `npx vitest run` green, commit when self-contained. Full suite runs at the end, before code review.

### Phase 1.A — types + data model

1. `src/core/types.ts` — extend:
   - Rename `SourceKind`: `'sheet' | 'sequence'` (remove `'gif'`).
   - Remove `GifSlicing`. Add `SequenceSlicing { kind: 'sequence' }` (fixed 1-to-1, used by `Source.slicing` whenever `Source.kind === 'sequence'`).
   - `Source.editedFrames?: RawImage[]`.
   - `Source.importedFrom?: 'gif' | 'blank' | 'png'`.
   - `Project.version: 2`.
   - `Project.swatches?: string[]` (hex strings like `#ff0080`).
   - New `RGBA { r: number; g: number; b: number; a: number }` exported from `core/image.ts`.
   - New `Tool` enum: `'pencil' | 'eraser' | 'eyedropper' | 'bucket'` for this phase.
   - **Test:** none — pure types.

2. `src/core/serialize/project.ts` — v1 → v2 migration.
   - Accept `version: 1` in load path, map `kind: 'gif'` → `'sequence'` + `importedFrom: 'gif'`, map `slicing.kind: 'gif'` → `'sequence'`.
   - Accept `version: 2` natively.
   - Write always emits v2 with `editedFrames` serialized as base64 PNG strings (use existing `encodePng` + `bytesToBase64`). Only write the field when the source has edited frames.
   - Write `Project.swatches` when non-empty.
   - **Tests** in `src/core/serialize/project.test.ts`:
     - `v1 gif source loads as sequence with importedFrom: 'gif'`.
     - `v2 round-trip preserves editedFrames (pixel-equal)`.
     - `v2 round-trip preserves swatches`.
     - `v1 file without editedFrames round-trips identically on re-save`.

3. `src/core/source.ts` — rename + editedFrames awareness.
   - Rename `prepareGif` → `prepareSequence`.
   - Signature: `prepareSequence(source, decoded: RawImage[])`. If `source.editedFrames` is set, return those (cloned); otherwise clone `decoded`.
   - `prepareSheet(source, sheet)` — if `source.editedFrames?.[0]` is set, use that as the bitmap instead of `sheet` before slicing.
   - **Tests** in `src/core/source.test.ts`:
     - `prepareSheet uses editedFrames[0] when present`.
     - `prepareSequence uses editedFrames when present`.
     - `prepareSequence falls back to decoded when editedFrames absent`.

4. `src/core/slicers/index.ts` — accept `slicing.kind === 'sequence'`, return the single full-bitmap rect if called on a sequence (but in practice sequence sources never call `slice` — the dispatcher guards).
   - Or: keep `slice()` throwing for `'sequence'` and fix callers to skip. Prefer the throw-and-guard approach for clarity.
   - Update any caller that branched on `'gif'`. Grep `'gif'` / `'sequence'` to find them.

5. `src/ui/store.ts` — update call sites.
   - `addSource`: set `kind: 'sequence'` + `importedFrom: 'gif'` on GIF import. PNG import: `importedFrom: 'png'`.
   - `loadProject`: call `prepareSequence` instead of `prepareGif`.
   - No new public actions yet (come in Phase 1.C).
   - **Tests:** existing tests must keep passing. Adjust assertions that checked `kind: 'gif'`.

6. **Commit:** `refactor(core,ui): rename gif kind to sequence, add editedFrames and v1→v2 migration`.

### Phase 1.B — drawing engine (core)

Live in `src/core/drawing/`, DOM-free, pure functions over `RawImage`.

7. `src/core/drawing/brush.ts` — dot + line primitives.

```ts
export interface Brush {
  size: number;   // 1..8, square
  color: RGBA;
  opacity: number; // 0..1
}

// Paints a filled square centered on (x,y) of side `size`. Blends // color with dst according to opacity and existing alpha. export function stampDot(dst: RawImage, x: number, y: number, brush: Brush): void;

// Bresenham line, stamped with the brush at every step. Used for // mouse-drag interpolation (prevents gaps on fast drags). export function stampLine( dst: RawImage, x0: number, y0: number, x1: number, y1: number, brush: Brush, ): void;

// Alpha-aware "clear" — sets pixels in a square centered on (x,y) to // transparent black, ignoring opacity. export function stampErase(dst: RawImage, x: number, y: number, size: number): void;

export function stampEraseLine(
  dst: RawImage, x0: number, y0: number, x1: number, y1: number, size: number,
): void;
```

**Tests** in `src/core/drawing/brush.test.ts`:
- `stampDot size=1 paints single pixel`.
- `stampDot size=3 paints 3×3`.
- `stampDot opacity=0.5 on opaque bg blends halfway`.
- `stampLine from (0,0) to (5,0) paints full row`.
- `stampLine from (0,0) to (0,5) paints full column`.
- `stampLine diagonal is continuous (no skipped pixels)`.
- `stampErase sets alpha to 0`.

8. `src/core/drawing/fill.ts` — iterative scanline flood fill.

```ts
export function floodFill(
  dst: RawImage, x: number, y: number, color: RGBA, opacity: number,
): void;
```

Match target color at (x,y) exactly (RGBA tuple). Fill all 4-connected pixels with the same target. Uses an explicit queue + `Uint8Array` visited buffer to avoid recursion stack overflow on large canvases.

**Tests** in `src/core/drawing/fill.test.ts`:
- `fill empty 3×3 canvas fills all 9 pixels`.
- `fill stops at color boundary`.
- `fill does not leak through 1-pixel gap`.
- `fill on 512×512 canvas does not stack-overflow`.
- `fill when seed color === target color is a no-op`.

9. `src/core/drawing/sample.ts` — eyedropper helper.

```ts
export function samplePixel(src: RawImage, x: number, y: number): RGBA;
```

Returns fully-transparent `{0,0,0,0}` for out-of-bounds. Trivial; one test.

10. `src/core/drawing/index.ts` — barrel export for the four helpers.

11. `src/core/index.ts` — re-export `RGBA`, `Brush`, `stampDot`, `stampLine`, `stampErase`, `stampEraseLine`, `floodFill`, `samplePixel`.

12. **Commit:** `feat(core/drawing): pencil/eraser/bucket/eyedropper primitives`.

### Phase 1.C — store: colors, tools, undo

13. `src/core/drawing/diff.ts` — stroke delta record.

```ts
export interface StrokeDelta {
  sourceId: string;
  frameIndex: number;   // 0 for sheet, 0..N-1 for sequence
  rect: Rect;           // bounding box of changed pixels
  before: Uint8ClampedArray; // RGBA pixels in rect (pre-stroke)
  after: Uint8ClampedArray;  // RGBA pixels in rect (post-stroke)
}

// Apply the `after` side of a delta to the frame. export function redoDelta(frame: RawImage, delta: StrokeDelta): void;

// Apply the `before` side of a delta to the frame. export function undoDelta(frame: RawImage, delta: StrokeDelta): void;

// Compute a delta from a pre-stroke snapshot and a post-stroke frame.
// Returns null if no pixels changed.
export function computeDelta(
  sourceId: string, frameIndex: number,
  before: RawImage, after: RawImage,
): StrokeDelta | null;
```

**Tests** in `src/core/drawing/diff.test.ts`:
- `computeDelta returns null for identical frames`.
- `computeDelta produces minimal bounding rect`.
- `redoDelta + undoDelta round-trip restores original`.
- `undo restores independent of redo ordering`.

14. `src/ui/store.ts` — expand state.

New fields:
- `activeTool: Tool` (default `'pencil'`).
- `primaryColor: RGBA` (default `{r:0,g:0,b:0,a:255}`).
- `secondaryColor: RGBA` (default `{r:255,g:255,b:255,a:255}`).
- `opacity: number` (0..1, default 1).
- `brushSize: number` (1..8, default 1).
- `selectedFrameIndex: Record<Id, number>` (default `{}`; `0` implied).
- `undoStacks: Record<Id, StrokeDelta[]>` (per source, per phase 1 simple).
- `redoStacks: Record<Id, StrokeDelta[]>`.

New actions:
- `setActiveTool(tool: Tool)`.
- `setPrimaryColor(c: RGBA)`, `setSecondaryColor(c: RGBA)`, `swapColors()`.
- `setOpacity(n: number)`, `setBrushSize(n: number)`.
- `addSwatch(hex: string)`, `removeSwatch(hex: string)`, `moveSwatch(from: number, to: number)`.
- `setSelectedFrameIndex(sourceId: Id, index: number)`.
- `createBlankSource({kind: 'sheet' | 'sequence', name, width, height, frameCount?}): Source` — adds to project, marks `importedFrom: 'blank'`, empty `imageBytes`, `editedFrames` seeded with transparent `RawImage`s. For sheets, `frameCount` ignored; for sequences, `frameCount` defaults to 1.
- `beginStroke(sourceId: Id, frameIndex: number): () => void` — snapshots current frame, returns a `commit` closure that computes + pushes the delta into the undo stack (clearing redo).
- `undo(sourceId: Id)` / `redo(sourceId: Id)` — apply delta via `undoDelta` / `redoDelta`.

`applyStroke` is not needed as a store action — the Canvas paints into the frame bitmap directly during mousemove, then calls the commit closure from `beginStroke` on mouseup. This keeps real-time painting fast; only stroke boundaries hit the store.

**Tests** in `src/ui/store.test.ts`:
- `createBlankSource('sheet', 32, 32) adds a sheet with transparent bitmap`.
- `createBlankSource('sequence', 32, 32, 4) creates 4 transparent frames`.
- `beginStroke + commit + undo round-trips`.
- `undo after redo restores pre-stroke state`.
- `new stroke after undo clears redo stack`.
- `addSwatch ignores duplicates`.
- `moveSwatch reorders correctly`.

15. `src/ui/store.ts` — mutations must preserve `Project.swatches` on `loadProject`, `newProject`, and in `projectToJson` (already covered in Phase 1.A).

16. **Commit:** `feat(ui/store): color, tool, undo, createBlankSource`.

### Phase 1.D — UI components

All components in `src/ui/`. Keep each in its own file, import the store directly.

17. `src/ui/ToolPalette.tsx` — vertical strip of tool buttons.
    - Props: none (reads store).
    - Renders four buttons for the Phase 1 tools: pencil (B), eraser (E), eyedropper (I), bucket (G). Each button shows a keyboard shortcut badge.
    - Active tool highlighted via `.active` class.
    - Clicking a button calls `setActiveTool`.
    - Keyboard listener on `window` for `B`, `E`, `I`, `G`, `[`, `]`, `X`, `Ctrl+Z`, `Ctrl+Shift+Z`. Ignore when focus is in an input/textarea.
    - **Test** (React Testing Library in `src/ui/ToolPalette.test.tsx`): `clicking pencil button sets activeTool='pencil'`; `pressing B sets activeTool='pencil'`; `pressing [ decrements brushSize, clamps at 1`.

18. `src/ui/ColorPanel.tsx` — primary/secondary + swatches + opacity.
    - Primary + secondary slot (color chips). Click chip → open HSV picker in a popover (use a minimal inline React HSV picker; keep ~80 lines or pull in a dep only if necessary — start inline).
    - Hex text input below each slot.
    - X button between slots → `swapColors`.
    - Swatch row: one button per swatch, `+` button at end to add current primary. Right-click removes. Drag-drop reorders (native HTML5 DnD).
    - Opacity slider (0–100%).
    - **Test** in `src/ui/ColorPanel.test.tsx`: `clicking swatch sets primary`; `add-swatch button captures primary`; `opacity slider updates store`.

19. `src/ui/FramesStrip.tsx` — horizontal row of frame thumbnails.
    - Replaces the "frames list" role currently implied by `PreviewBar`.
    - Each thumbnail is a 48-px-wide canvas rendering the frame bitmap.
    - Selected frame highlighted.
    - Click a thumbnail → `setSelectedFrameIndex`.
    - Small play/pause button keeps existing PreviewBar playback behavior — reuse the existing playback loop from `PreviewBar` by extracting into a shared `useAnimationPlayback` hook (`src/ui/usePlayback.ts`).
    - **Test** in `src/ui/FramesStrip.test.tsx`: `renders N thumbnails for a sequence of N frames`; `clicking thumbnail updates selection`.

20. `src/ui/NewBlankSource.tsx` — modal dialog.
    - Props: `{ open: boolean; onClose(): void }`.
    - Radio: **Sheet** | **Animation**.
    - Width / Height inputs (default 64/64 for Sheet, 32/32 for Animation).
    - Frame count input (Animation only, default 8).
    - Name input (default `Untitled Sheet` / `Untitled Animation`).
    - On Create: calls `createBlankSource`, closes.
    - **Test** in `src/ui/NewBlankSource.test.tsx`: `Sheet mode creates one-frame sheet`; `Animation mode creates N frames`.

21. `src/ui/Canvas.tsx` — tool-dispatched mouse handling.
    - Add `overlayCanvasRef` layered on top of the source canvas (same coordinates, `pointer-events: none`). The source canvas shows the committed bitmap; the overlay shows the in-progress stroke preview.
    - Replace the existing `ManualOverlay` with a switch on `activeTool`:
      - `pencil`: mousedown → `beginStroke`, snapshot start point, paint `stampDot` on source canvas + in-memory frame, drag → `stampLine` from last point to current point. On mouseup → commit.
      - `eraser`: same flow with `stampErase` / `stampEraseLine`.
      - `eyedropper`: mousedown only → `samplePixel` → set primary (alt → secondary). No stroke.
      - `bucket`: mousedown only → snapshot, `floodFill`, commit immediately.
    - When `activeTool === null` (shouldn't happen in Phase 1; reserve for future "no draw mode"), fall back to today's slicer overlays.
    - Redraw the source canvas from the currently-selected frame whenever `selectedSourceId`, `selectedFrameIndex`, or the underlying frame pixels change.
    - **Test** in `src/ui/Canvas.test.tsx`: `pencil click paints pixel and commits delta`; `undo after paint reverts pixel`; `eyedropper sets primary color to sampled pixel`.

22. `src/ui/TopBar.tsx` — add `+ New Blank` button next to `+ Import PNG/GIF`. Opens `NewBlankSource`.

23. `src/ui/Shell.tsx` — wire `ToolPalette` (left edge), `ColorPanel` (under ToolPalette or right side, pick simplest), and replace the old preview bar call with `FramesStrip`.

24. `src/app/styles.css` — styles for `ToolPalette`, `ColorPanel`, `FramesStrip`, `NewBlankSource`. Follow the existing dark theme (background, text, border colors already in the file).

25. **Commit:** `feat(ui): tool palette, color panel, frames strip, new-blank dialog, tool-dispatched canvas`.

### Phase 1.E — gates

26. Run `npx vitest run` — must be fully green.
27. Run `npx tsc --noEmit` — must be clean.
28. Run `npx vite build` — must produce a bundle without warnings that block (font-size-related warnings from CSS minification are OK).
29. Run `npm run dev` and manually exercise:
    - Import a PNG sheet. Pick pencil. Paint a pixel. See it appear.
    - Undo. Pixel reverts.
    - Import a GIF. Pick frame 2 in FramesStrip. Erase. See only frame 2 change.
    - Click "+ New Blank" → Animation → 32×32 × 4. Paint each frame with different colors. Scrub FramesStrip. Each frame retains its paint.
    - Export ZIP. Open atlas.png — the drawn pixels appear where expected.
    - Save `.pixellab.json`. Reopen. Drawings persist.
30. **Screenshots:** capture `before.png` (current UI) and `after.png` (with drawing tools) for the devlog. Diff is pixel-count material, not strict matching.
31. **Commit:** (if any follow-up fixes from 26-30).

After gates, proceed to multi-reviewer code review (outer Task #7 in the session plan).