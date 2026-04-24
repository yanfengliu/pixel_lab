# Implementation plan — pixel_lab v1

Spec: `docs/superpowers/specs/2026-04-23-pixel-lab-design.md`
Branch: `agent/initial-tool`

## Order of work (TDD throughout)

Each phase: write tests first, make them pass, keep `npx tsc --noEmit` and
affected `npx vitest run` green, commit when self-contained.

### Phase 1 — core types & shared utilities
1. `src/core/types.ts` — all domain types from the spec. Non-behavioral.
2. `src/core/ids.ts` — stable ID helper (`crypto.randomUUID()` fallback).
3. `src/core/image.ts` — pure ImageData helpers (new-blank, crop, equals).
   - **Test:** crop-and-equals fixture ImageData.

### Phase 2 — slicers
4. `src/core/slicers/grid.ts` + test fixtures.
   - Uniform cells, offsets, transparent-cell skipping, odd sizes.
5. `src/core/slicers/auto.ts` + test fixtures.
   - Single frame, grid, touching-with-gap merge, alpha threshold edge.
6. `src/core/slicers/manual.ts` + test.
   - Round-trips user rects verbatim.
7. `src/core/slicers/index.ts` — dispatcher `slice(source) => Rect[]`.

### Phase 3 — sources & preparation
8. `src/core/source.ts` — `prepareSheet(source) => preparedFrames[]`
   and `prepareGif(gifFrames) => preparedFrames[]`.
   - **Test:** grid-sliced sheet produces N ImageData frames of correct
     dimensions and pixel contents.

### Phase 4 — GIF decoder adapter
9. `src/core/gif.ts` — wraps `gifuct-js` behind a thin interface
   `decodeGif(bytes: Uint8Array) => {imageData, delayMs}[]`.
   - **Test:** fixed-delay GIF round-trips delay; variable-delay GIF
     preserves per-frame values. Build a tiny GIF in the test harness
     using a hand-authored LZW buffer fixture.

### Phase 5 — atlas packer
10. `src/core/packer.ts` — MaxRects; `packFrames(frames, opts) =>
    { atlas: ImageData, placements: {w,h,x,y}[] }`. 1px transparent
    padding, no trim.
    - **Test:** no overlaps, padding enforced, placements cover every
      frame, deterministic ordering.

### Phase 6 — serializers
11. `src/core/serialize/project.ts` — `toJson / fromJson` for
    `.pixellab.json`, images as base64.
    - **Test:** round-trip a project, byte-equal JSON.
12. `src/core/serialize/manifest.ts` — build `manifest.json` from
    `{animations, placements, frameNames}`. Uniform-fps => string frame
    list; variable-fps => `{name, durationMs}`.
    - **Test:** golden-fixture manifests for both fps modes.
13. `src/core/export.ts` — orchestrates: resolve refs → pack → emit
    atlas PNG + manifest + optional per-frame PNGs; returns files map.
    - **Test:** integration through the full pipeline, inspect outputs.

### Phase 7 — io layer
14. `src/io/file.ts` — decode PNG `File` → `ImageData`; detect gif vs png.
15. `src/io/zip.ts` — wrap `fflate` for ZIP build.
    - **Test:** zip then unzip returns identical bytes.
16. `src/io/persist.ts` — `saveProject`, `loadProject`, `saveExport` using
    File System Access API with anchor-download fallback. Feature detect.
17. `src/io/drag-drop.ts` — pure handlers returning `File[]`.

### Phase 8 — state store
18. `src/app/store.ts` — Zustand slice: project, selectedSourceId,
    selectedAnimationId, actions for add/remove/update/slicing.
    - **Test:** actions mutate state correctly; reducers are pure.

### Phase 9 — UI
19. `src/ui/Shell.tsx` — layout zones.
20. `src/ui/Canvas.tsx` — zoomable canvas with slicer overlay.
21. `src/ui/SlicerControls.tsx` — kind dropdown + reactive inputs.
22. `src/ui/SourcesPanel.tsx` — import + list + select.
23. `src/ui/AnimationsPanel.tsx` — animations list, row grouping UI.
24. `src/ui/PreviewBar.tsx` — frame strip, play/pause, fps input.
25. `src/ui/TopBar.tsx` — Open/Save/Export buttons.
26. `src/app/App.tsx` + `src/main.tsx` — composition root.

UI tests:
- Component unit tests with `@testing-library/react` for Canvas overlay
  math and PreviewBar playback state.
- Visual pixel diff: snapshot of Shell render at 1280×720, snapshot of
  Canvas at 1x / 4x / 16x with a fixture sprite; fail on diff > 0.

### Phase 10 — end-to-end
27. `test/integration/export.test.ts` — in jsdom: load fixture PNG, set
    grid slicing, add two animations, export, parse returned ZIP,
    assert manifest + atlas PNG.
28. Full suite: `npm test && npx tsc --noEmit && npm run build`.

### Phase 11 — review
29. Dispatch Codex, Gemini, and Claude reviewers on `git diff main`.
    Collect comments under `code_review/`.
30. Address findings; iterate until reviewers nit-pick. Summarize into
    devlog, delete `code_review/` temp files.

### Phase 12 — merge
31. Final gates green. Fast-forward merge `agent/initial-tool` → `main`.
    Delete branch. Update `docs/devlog/summary.md`.

## Risk register

- **GIF fixture authoring** — building valid GIF bytes in a test is
  fiddly. Mitigation: ship a tiny hand-encoded GIF (already done in
  several OSS repos) as a binary fixture, not generated inline.
- **MaxRects correctness** — off-by-one in padding is common. Mitigation:
  overlap-check invariant, padding-size invariant in every test.
- **File System Access API feature flags** — test the fallback path
  explicitly by stubbing `window.showSaveFilePicker`.
- **jsdom canvas** — `<canvas>` is stubbed in jsdom. Use `node-canvas`
  shim or mock the 2D context for UI tests. For visual tests run the
  actual renderer under headless-chromium via Vite preview if a true
  canvas is required.
