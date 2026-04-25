# Implementation plan — Pixel drawing (Phase 3: Polish)

Spec: `docs/superpowers/specs/2026-04-24-pixel-drawing-design.md` Branch: `agent/pixel-drawing` Depends on: Phases 1 + 2.

## Scope

- Onion skin: toggle in FramesStrip, renders previous frame at ~30% alpha underneath the current frame.
- Pixel grid overlay: 1-px lines at zoom ≥ 8×.
- Keyboard shortcut map completeness (the remaining Aseprite-standard bindings not wired in Phases 1+2).
- Opacity slider final wiring if anything from Phase 1 is still TODO.

## Order of work (TDD throughout)

### Phase 3.A — onion skin

1. `src/ui/FramesStrip.tsx` — add an onion-skin toggle button (off by default). When on, the Canvas renders the previous frame of the selected source beneath the current frame at ~30% alpha.

2. `src/ui/store.ts` — new state:
   - `onionSkin: boolean` (default `false`). Global toggle, not per-source.
   - `setOnionSkin(b: boolean)`.

3. `src/ui/Canvas.tsx` — new "under-canvas" layer. For a sequence source with `selectedFrameIndex > 0` and `onionSkin === true`, draw `prevFrame` at `globalAlpha = 0.3` below the current-frame canvas. Sheets have no "previous frame" in the same sense, so onion skin is a no-op for `kind === 'sheet'`.

**Tests** in `test/ui/onion-skin.test.tsx`:
- `onion skin off renders only the current frame`;
- `onion skin on renders the previous frame at reduced alpha underneath` (check rendered pixel alpha via a small canvas assertion);
- `onion skin on frame 0 does nothing` (no previous frame to show).

4. **Commit:** `feat(ui): onion skin overlay in FramesStrip`.

### Phase 3.B — pixel grid overlay

5. `src/ui/Canvas.tsx` — at zoom ≥ 8, render 1-pixel grid lines (dark, semi-transparent). Could be a third canvas layer or a CSS `linear-gradient` background pattern — prefer canvas for zoom math correctness.

6. **Tests** in `test/ui/pixel-grid.test.tsx`:
   - `zoom=4 renders no grid`;
   - `zoom=8 renders grid at every Nth pixel`;
   - `zoom=16 scales grid accordingly`.

7. **Commit:** `feat(ui): pixel grid overlay at zoom >= 8`.

### Phase 3.C — shortcut completeness

Review the shortcut table in the spec (section 12 equivalent / the "Keyboard shortcut map" table). Anything not wired in Phase 1/2 gets wired now.

8. `src/ui/ToolPalette.tsx` — ensure every shortcut in the spec works: B, E, I, G, L, U, M, V, S, X, `[`, `]`, Ctrl+Z, Ctrl+Shift+Z, ESC.

9. ESC specifically clears selection. Add to the keydown handler if not already present from Phase 2.C.

10. **Tests** in `test/ui/shortcuts.test.tsx`:
    - for each shortcut, a focused jsdom test that fires a keydown and asserts the corresponding store state change.

11. **Commit:** `feat(ui): Aseprite-style shortcut completeness`.

### Phase 3.D — gates

12. `npx vitest run` — full suite green.
13. `npx tsc --noEmit` — clean.
14. `npx vite build` — succeeds.
15. Smoke test: onion skin visible on multi-frame, pixel grid appears at 8× zoom, shortcuts all work.

After gates, proceed to multi-reviewer code review.