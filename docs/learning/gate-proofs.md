# Gate proofs

A gate nobody has seen fail is a claim, not a check. Every entry below records a gate that was made to go red by reintroducing — in product code, never in the test — the exact defect its lesson describes, then reverted and confirmed green. A lesson whose prose was deleted without one of these entries would be knowledge silently thrown away.

All proofs on this page were run on 2026-09-02, when the twelve standing lessons in `lessons.md` were retired into gates. Node 24.18.1, vitest 2.1.9. Each gate is run by `npm test`.

Three of the gates named here did **not** catch their defect on the first attempt and had to be strengthened; those are called out in place, because a gate that was once blind is the most useful thing on this page.

---

## `useMemo` that depends on an in-place-mutated buffer needs a render counter in its deps

- **Gate:** `test/ui/Canvas.test.tsx` :: `rects overlay refreshes when paint opens a previously-empty grid cell (M3)` — run by `npm test`
- **Mutation:** `src/ui/Canvas.tsx`, slice memo deps `[paintTarget, source.slicing, renderCounter]` → `[paintTarget, source.slicing]`
- **Red:** `AssertionError: expected +0 to be 1` — the rects overlay stayed empty after paint opened a new grid cell
- **Green after revert:** yes

## Chained `stampLine` calls double-composite the join when opacity < 1 — use a start-excluded variant

- **Gate:** `test/core/drawing/brush.test.ts` :: `stampLineFrom (M7: chained-segment opacity)` **and** `test/ui/Canvas.test.tsx` :: `a multi-segment pencil drag at opacity < 1 composites every join exactly once (M7)` — run by `npm test`
- **Mutation (primitive):** `src/core/drawing/brush.ts`, `walkLine` → `onPoint(x, y)` unconditionally, dropping the `includeStart` skip
- **Red:** `AssertionError: expected 192 to be 128` — the join pixel composited twice
- **Mutation (call site):** `src/ui/Canvas.tsx` `handleMove` → `stampLine(bitmap, d.lastX, d.lastY, p.x, p.y, d.brush)` in place of `stampLineFrom`
- **Red:** `every pixel of a 1px stroke composites once; darker joins mean the chained segments re-painted their start pixel: expected [ 192, 128 ] to have a length of 1 but got 2`
- **Green after revert:** yes
- **Had to be strengthened.** The brush unit test proves the start-excluded walk is *correct*; it cannot prove the drag handler *calls* it. The call-site mutation passed the entire suite — 42 files, 325 tests, all green — which is the shape of the original defect: a correct primitive invoked the wrong way. The Canvas-level drag test was added to close it.

## Mid-drag global shortcuts must guard on a drag flag

- **Gate:** `test/ui/Canvas.test.tsx` :: `Ctrl+Z mid-drag is a no-op (isDragging gates undo) (M8)` — run by `npm test`
- **Mutation:** `src/ui/store.ts`, removed `if (cur.isDragging) return;` from `undo` (the guard in `redo` left in place, so the mutation is minimal)
- **Red:** `AssertionError: expected +0 to be 255` — the mid-drag undo cleared pixels the in-flight stroke still owned
- **Green after revert:** yes

## Browsers drop mouseup when the cursor leaves the window — guard onMove with `ev.buttons === 0`

- **Gate:** `test/ui/Canvas.test.tsx` :: `lost mouseup mid-drag: a later button-less mousemove does not stretch the stroke across the canvas` — run by `npm test`
- **Mutation:** `src/ui/Canvas.tsx` `handleMove`, deleted the `if (ev.buttons === 0) { handleUp(ev); return; }` guard
- **Red:** `AssertionError: expected 255 to be +0` — a button-free move painted the phantom line across the canvas
- **Green after revert:** yes

## jsdom + fireEvent bypasses z-order, so visual layout bugs look green

- **Gate:** `test/ui/Canvas.test.tsx` :: `canvas-image does not capture mouse events (lets clicks reach paint-overlay)` — run by `npm test`
- **Mutation:** `src/ui/Canvas.tsx`, `canvas-image` style `pointerEvents: 'none'` → `'auto'`
- **Red:** `AssertionError: expected 'auto' to be 'none'`
- **Green after revert:** yes
- **Scope, stated honestly:** this gates the *invariant* (a purely visual layer declares `pointer-events: none`), which is all a jsdom suite can hold. It does not and cannot gate the *methodological* half — that synthesized events are blind to hit testing, so real-browser coverage is needed. That half is enforced elsewhere: the fleet constitution requires looking at the rendered result, and `npm run smoke` (`test/smoke/drawing-smoke.mjs`) is the real-browser pass that originally caught this defect.

## Serialized state must be refreshed on every mutation, not just the first

- **Gate:** `test/integration/save-reload.test.ts` :: `save/reload after multiple strokes — B1 regression` (all four source kinds) — run by `npm test`
- **Mutation:** `src/ui/store.ts` `syncEditedFrames`, replaced the refresh branch with `return src;` so `editedFrames` materializes on first edit and never updates again
- **Red:** `AssertionError: expected +0 to be 200` and `expected +0 to be 111`, across the imported-PNG-sheet, imported-GIF-sequence and blank-sequence cases — the second stroke was dropped on save
- **Green after revert:** yes

## In-place mutations need an explicit render signal for React

- **Gate:** `test/ui/canvas-reactivity.test.tsx` :: `Canvas — reactivity (I2 regression)` — run by `npm test`
- **Mutation (main canvas):** `src/ui/Canvas.tsx`, draw effect deps `[paintTarget, renderCounter]` → `[paintTarget]`
- **Red:** `AssertionError: expected 2 to be greater than 2` — undo never repainted the DOM canvas
- **Mutation (onion-skin layer):** `src/ui/Canvas.tsx`, `dirty={renderCounter}` → `dirty={0}`
- **Red:** `the onion-skin ghost must redraw when the frame it displays is edited in place: expected 1 to be greater than 1`
- **Green after revert:** yes
- **Had to be strengthened.** The I7 test asserted on the total `drawImageToCanvas` call count, which the *main* canvas satisfies on its own — it consumes the same counter — so the onion-skin layer's dep could be wired to a constant and the test stayed green. It now counts only draws whose image argument is the ghost frame.

## Node `Buffer` is not polyfilled by Vite; pngjs/browser needs the `buffer` shim

- **Gate:** `test/architecture/browser-runtime.test.ts` :: `sources Buffer from the buffer package or guards on its absence` and `keeps the buffer polyfill a runtime dependency, not a dev one` — run by `npm test`
- **Mutation A:** `src/core/png.ts`, deleted `import { Buffer } from 'buffer';`
- **Red:** `Buffer is a Node global Vite does not polyfill: import it from 'buffer', or guard on typeof Buffer: expected [ 'src/core/png.ts' ] to deeply equal []`
- **Mutation B:** `src/core/serialize/base64.ts`, replaced both `typeof Buffer !== 'undefined' && typeof Buffer.from === 'function'` feature detects with `true`
- **Red:** same assertion, naming `src/core/serialize/base64.ts`
- **Mutation C:** `package.json`, moved `buffer` from `dependencies` to `devDependencies`
- **Red:** ``the browser bundle imports `buffer` at runtime; in devDependencies it is missing from the build: expected [ Array(5) ] to include 'buffer'``
- **Green after revert:** yes
- **Known gap.** This is a source rule: it proves no module depends on the global, not that the built bundle runs. The stronger check — delete `globalThis.Buffer`, re-import the module, round-trip a PNG — is not available, because vitest's own worker uses `Buffer` and removing it takes down the harness (observed: 116,032 errors, no test results). `npm run build` plus `npm run smoke` remain the only real browser-path evidence.

## Don't put a global state store in `app/` if UI imports from it

- **Gate:** `test/architecture/layering.test.ts` :: `never imports upward through app → ui → io → core` and `keeps app/ a composition root that owns no state store` — run by `npm test`
- **Mutation A:** `src/ui/Shell.tsx`, added `import { App } from '../app/App';`
- **Red:** `imports must run main → app → ui → io → core; an upward import reverses the documented arrow: expected [ Array(1) ] to deeply equal []`
- **Mutation B:** created `src/app/store.ts` holding a zustand `create<{ n: number }>(...)`
- **Red:** `a store UI components call belongs under ui/; app/ composes, it does not own state: expected [ 'src/app/store.ts' ] to deeply equal []`
- **Green after revert:** yes
- The gate covers the class rather than the instance: any upward import between layers fails it, not only a store.

## Cache decoded sheet bitmaps; never re-decode on every slicing change

- **Gate:** `test/ui/store.test.ts` :: `updateSlicing re-crops the cached bitmap and never re-decodes imageBytes` — run by `npm test`
- **Mutation:** `src/ui/store.ts` `updateSlicing`, `const bitmap = s.sheetBitmaps[id];` → `const bitmap = decodePng(source.imageBytes);`
- **Red:** ``re-slicing to 2 cols must re-crop the cached bitmap, not decode imageBytes: expected [Function] to not throw an error but 'Error: unrecognised content at end of…' was thrown``
- **Green after revert:** yes
- **Had to be strengthened.** The pre-existing coverage did fail under this mutation, but only by accident: its fixture passes `bytes: new Uint8Array()`, so a re-decode happened to throw. Its message was `There are some read requests waitng on finished stream` — a pngjs internal that names nothing about the defect, and a gate that disappears the moment someone "fixes" the fixture to use real bytes. The new test encodes a real PNG, poisons the bytes in place on purpose, and says why.

## Keep GIF compositing pure so tests avoid fixture GIFs

- **Gate:** `test/core/gif.test.ts` :: `does not write back into the caller's patches` and `composites the same patches to the same pixels on a second call` — run by `npm test`
- **Mutation A:** `src/core/gif.ts`, `export function compositeGifFrames(` → `function compositeGifFrames(`, folding the compositor back behind `decodeGif`
- **Red:** `compositeGifFrames is not a function` across every disposal-mode and delay test — i.e. all of them go back to needing real GIF bytes
- **Mutation B:** `src/core/gif.ts` `blitPatch`, appended `patch.fill(0);` so compositing consumes the caller's patch
- **Red:** `compositing must not consume or clear the patch it was handed: expected [ Array(16) ] to deeply equal [ 255, +0, +0, 255, … ]`, and `a second run over the same input must land on the same pixels`
- **Green after revert:** yes
- **Had to be strengthened.** The pre-existing tests only demonstrated that a fixture-free test *was possible*; nothing asserted purity, so a compositor that consumed its input passed. The two assertions above were added.

---

## The staging area itself: a lesson is both halves or neither

Not one of the twelve, but rewritten in the same commit, so it is proved here too. `test/lessons-pairing.test.ts` previously asserted that both live files parsed at least one entry — which is a correct check right up until the staging area is legitimately empty, at which point it fails on healthy files. Its non-vacuity guard moved onto a fixture, so the parsers stay proved once the real files are empty, and a half-emptied staging area became its own check.

- **Gate:** `test/lessons-pairing.test.ts` :: `points every rule at an evidence entry that exists` and `empties or populates the two halves together` — run by `npm test`
- **Mutation:** added a rule line to the emptied `docs/learning/lessons.md` with no matching entry in `lessons-evidence.md`
- **Red:** `lessons.md links to headings that do not exist in the evidence file: expected [ 'a-rule-someone-added--2026-09-02' ] to deeply equal []`, and `lessons.md holds 1 rule(s) and lessons-evidence.md 0 entry(ies); a lesson is both halves or neither: expected false to be true`
- **Green after revert:** yes

---

## Not gated: promoted instead

`Documented invariants must be enforced at the state boundary, not at the consumer` has no mechanical trigger — it is a rule about where to put a check, not a check. Its three concrete instances in this repo are gated (`test/ui/store.test.ts`: FrameRef reconcile on re-slice, `validateFps` clamping, `loadProject` sequence completeness), but those gate the instances, not the class. The transferring claim is staged in `canon-candidates.md` for promotion into the fleet constitution.
