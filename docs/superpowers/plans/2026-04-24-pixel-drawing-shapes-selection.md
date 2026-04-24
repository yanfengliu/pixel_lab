# Implementation plan — Pixel drawing (Phase 2: Shapes + Selection)

Spec: `docs/superpowers/specs/2026-04-24-pixel-drawing-design.md`
Branch: `agent/pixel-drawing`
Depends on: Phase 1 (Foundation) merged or on-branch.

## Scope for this phase

- Shape tools: line, rectangle (outline / filled), ellipse (outline / filled).
- Selection: rectangular marquee.
- Move: drag selection contents within the same frame.
- Slice Rect tool: today's manual-slice drag, promoted to a first-class tool.

Out of scope (Phase 3): onion skin, pixel grid overlay, shortcut completeness
for every tool.

## Order of work (TDD throughout)

Each task: failing test → minimal impl → passing → commit. Affected tests +
`npx tsc --noEmit` green at every step. Full suite at end.

### Phase 2.A — shape primitives (core)

1. `src/core/drawing/shapes.ts` — pure functions.

```ts
import type { RawImage } from '../image';
import type { Brush } from './brush';

// Bresenham line; delegates to stampDot at each stepped integer point,
// so brush size + opacity propagate.
export function drawLine(
  dst: RawImage, x0: number, y0: number, x1: number, y1: number, brush: Brush,
): void;

// Axis-aligned rectangle outlined at brush thickness.
export function drawRectOutline(
  dst: RawImage, x0: number, y0: number, x1: number, y1: number, brush: Brush,
): void;

export function drawRectFilled(
  dst: RawImage, x0: number, y0: number, x1: number, y1: number, brush: Brush,
): void;

// Midpoint-ellipse algorithm inscribed in the axis-aligned bbox
// (x0,y0)-(x1,y1). Outline uses brush thickness via stampDot; filled
// scanlines with no brush thickness (just the color+opacity).
export function drawEllipseOutline(
  dst: RawImage, x0: number, y0: number, x1: number, y1: number, brush: Brush,
): void;

export function drawEllipseFilled(
  dst: RawImage, x0: number, y0: number, x1: number, y1: number, brush: Brush,
): void;
```

**Tests** in `test/core/shapes.test.ts`:
- `drawLine from (0,0) to (4,4) paints the diagonal`.
- `drawRectOutline 5×5 has 16 painted perimeter pixels with brush size 1`.
- `drawRectFilled 3×3 covers all 9 pixels`.
- `drawEllipseOutline symmetric across both axes`.
- `drawEllipseFilled radius=2 paints the expected 12-pixel disk fixture`.
- `drawLine where (x0,y0) == (x1,y1) is a single stampDot`.

2. `src/core/drawing/index.ts` — re-export shape functions.
3. `src/core/index.ts` — re-export `drawLine`, `drawRectOutline`, etc.
4. **Commit:** `feat(core/drawing): line, rect, ellipse primitives`.

### Phase 2.B — selection data + move

5. `src/core/drawing/selection.ts` — selection + blit for move.

```ts
export interface Selection {
  rect: Rect;            // bounding box within frame
  mask: Uint8Array;      // rect.w * rect.h, 1 = selected
}

// Copies pixels inside the selection rect out of the source frame. The
// "cut" path zeroes those pixels in the source (to clear-on-move).
export function extractSelection(
  frame: RawImage, sel: Selection,
): { pixels: RawImage; cleared: RawImage };

// Pastes a previously-extracted selection into `frame` at (dx, dy) using
// the mask. Does NOT clear anywhere else. Returns a new RawImage.
export function pasteSelection(
  frame: RawImage, dx: number, dy: number,
  pixels: RawImage, mask: Uint8Array,
): RawImage;
```

**Tests** in `test/core/selection.test.ts`:
- `extractSelection returns pixels at rect and cleared bitmap with those
  pixels zeroed`.
- `pasteSelection at offset (dx,dy) places pixels in destination`.
- `pasteSelection respects mask (only pixels where mask=1 are copied)`.
- `pasteSelection is a no-op when dx,dy put the paste fully out of bounds`.

6. `src/core/index.ts` — re-export selection helpers.
7. **Commit:** `feat(core/drawing): selection extract/paste`.

### Phase 2.C — tools: line, rect, ellipse, marquee, move, slice-rect

Extend the `Tool` union in `src/core/types.ts` to add:
`'line' | 'rectOutline' | 'rectFilled' | 'ellipseOutline' | 'ellipseFilled' | 'marquee' | 'move' | 'slice'`.

Shift-modifier UX note: when `'rectOutline'` is active and the user holds
Shift, the tool becomes `'rectFilled'` for that stroke. Same for ellipse.
Implement in the Canvas-layer handler, not by mutating `activeTool`.

8. `src/ui/store.ts` — new state:
   - `selection: { sourceId: Id; frameIndex: number; sel: Selection } | null`.
   - `clearSelection()`, `setSelection(...)`.
   - Selection is cleared whenever `selectedFrameIndex` changes (mirrors
     the spec: selection is per-frame, not persisted across switches).

   **Tests** extend `test/ui/store.test.ts`:
   - `setSelection stores the selection`;
   - `setSelectedFrameIndex clears the selection`.

9. `src/ui/Canvas.tsx` — extend the tool dispatcher:
   - **Line:** mousedown snapshots start, mousemove renders a preview
     line on the overlay canvas between start and current, mouseup commits
     via `drawLine` + `beginStroke/commit` flow.
   - **Rect / Ellipse:** same pattern. Preview on overlay; on mouseup,
     pick `Filled` vs `Outline` based on the tool AND whether Shift was
     held at mouseup.
   - **Marquee:** mousedown clears any existing selection, mousemove shows
     a dashed rect on the overlay, mouseup calls `setSelection` with a
     solid-rect mask.
   - **Move:** mousedown inside the current selection → capture the
     selection pixels (via `extractSelection`) and begin a stroke (the
     "cleared" bitmap becomes the new frame state). Mousemove updates an
     overlay ghost of the moving pixels at the current offset. Mouseup
     commits: `pasteSelection` at the final offset, commit the stroke.
     Mousedown outside the selection while the Move tool is active →
     no-op (could also fall through to "drag the whole selection"; keep
     it strict for MVP).
   - **Slice rect:** behaves like today's `ManualOverlay` mousedown/drag/
     mouseup; on mouseup, calls `onSlicingChange` with the new rect
     appended to `slicing.rects`. Right-click on a rect deletes it
     (already present in the old ManualOverlay; port that behavior to
     the new tool handler).

   **Tests** in `test/ui/Canvas.test.tsx` (extending the Phase 1 file):
   - `line tool mousedown-drag-mouseup paints a line and commits one
     undo entry`;
   - `rect tool with Shift on mouseup fills the rect`;
   - `marquee selection followed by move translates pixels`;
   - `slice-rect tool adds a rect to manual slicing on mouseup`.

10. `src/ui/ToolPalette.tsx` — add buttons for the 8 new tools (keep the
    Phase 1 four). Organize into groups with CSS dividers: paint,
    shapes, selection, slice. Keyboard shortcuts:
    - `L` → line, `U` → rect (outline; Shift toggles at paint-time),
      `M` → marquee, `V` → move, `S` → slice (only when
      `slicing.kind === 'manual'`, else ghosted + tooltip explaining).

    Aseprite has no shortcut for ellipse; leave it click-only.

11. `src/ui/Canvas.tsx` — remove the old `ManualOverlay` component (its
    behavior moves to the Slice-rect tool). Keep `RectsOverlay` for
    grid/auto display.

12. **Commit:** `feat(ui,core): shape/selection/move/slice tools`.

### Phase 2.D — gates

13. Run `npx vitest run` — green.
14. Run `npx tsc --noEmit` — clean.
15. Run `npx vite build` — succeeds.
16. Smoke test (if dev server available): draw a line, rectangle, filled
    ellipse on a sheet; marquee+move a region; use slice-rect to add a
    manual slice.

After gates, proceed to Phase 3 (Polish).
