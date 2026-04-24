# Lessons learned

Append durable engineering lessons here. Each entry should teach a future agent something that is not obvious from the current code — a trap, a non-obvious invariant, or a rule that keeps biting if ignored. One entry per lesson, newest at the top. Keep entries short; link to code or devlog rather than restating.

Format:

```
## <short title> — YYYY-MM-DD
Context: when this came up.
Lesson: the durable rule or trap, phrased so it transfers to future work.
Pointer: devlog entry, file, or test that illustrates it.
```

---

## Serialized state must be refreshed on every mutation, not just the first — 2026-04-24
Context: `Source.editedFrames` was the only serialized per-source pixel buffer, but the store only materialized it on the first stroke and then silently diverged from the live `sheetBitmaps[id]` / `prepared.frames[i]` on every subsequent paint. Save/reload dropped strokes 2..N; sheet exports showed stale pixels on any re-slice.
Lesson: if a buffer is both "the authoritative serialization source" and "the thing the user edits through a different handle," keep them in sync on every commit — don't rely on first-edit materialization plus implicit aliasing. Explicit `syncEditedFrames(target)` on stroke commit, undo, and redo removes the whole class of bug and is trivial to test.
Pointer: `src/ui/store.ts:syncEditedFrames`, `test/integration/save-reload.test.ts`.

## In-place mutations need an explicit render signal for React — 2026-04-24
Context: Canvas, OnionSkinLayer, and frame thumbnails all painted their DOM canvases inside `useEffect(..., [img])`. Strokes mutate `img.data` in place, so the `img` identity never changes, so the effect never fires — undo/redo left the canvas stuck on the pre-op pixels until an unrelated re-render refreshed it.
Lesson: for any React effect that consumes a mutable buffer, include a monotonic counter in the deps that bumps on every in-place mutation. The counter lives in the store where the mutation happens and can be wired through props to child canvases. Don't rely on reference equality for a buffer whose whole point is mutation.
Pointer: `src/ui/store.ts:renderCounters`, `test/ui/canvas-reactivity.test.tsx`.

## Node `Buffer` is not polyfilled by Vite; pngjs/browser needs the `buffer` shim — 2026-04-24
Context: `src/core/png.ts` used `Buffer.from(...)` directly. This runs fine under vitest (Node) but throws `ReferenceError: Buffer is not defined` in the Vite production bundle. The tests never caught it because they never exercised the browser path.
Lesson: any code that runs in both Node and the browser must source `Buffer` from the `buffer` npm package (not Node's global). Always smoke-check the production bundle for `"Buffer is not defined"` literals if you touch encoder/decoder code.
Pointer: `src/core/png.ts`, `docs/architecture/drift-log.md` (2026-04-24 row).

## Don't put a global state store in `app/` if UI imports from it — 2026-04-24
Context: the Zustand store initially lived at `src/app/store.ts`. Every UI component imported it, which reversed the documented `app → ui → io → core` arrow: `ui → app`. This was flagged by three independent reviewers in the first review pass.
Lesson: a Zustand/Redux/etc. store that UI components call is structurally a UI concern. Put it under `ui/` so UI imports stay within the same layer, and keep `app/` as a composition root with zero state ownership.
Pointer: `src/ui/store.ts`, `docs/architecture/ARCHITECTURE.md`.

## Cache decoded sheet bitmaps; never re-decode on every slicing change — 2026-04-24
Context: initial `updateSlicing` in the Zustand store re-decoded PNG bytes through `decodePng` every time the user tweaked cellW/cellH. That breaks tests passing mock bytes and burns CPU on every input.
Lesson: when a derived value depends on a one-time decode, cache the decoded form alongside the source id (see `sheetBitmaps` in the store) so downstream edits re-crop without re-decoding.
Pointer: `src/app/store.ts:sheetBitmaps`, `test/app/store.test.ts`.

## Keep GIF compositing pure so tests avoid fixture GIFs — 2026-04-23
Context: unit-testing disposal modes and delay preservation for the GIF decoder needed fixtures, but hand-encoding a valid LZW-compressed GIF is tedious and brittle.
Lesson: extract the compositing logic into a pure function over a small patch struct (width, height, delay, disposal) and let the thin `decodeGif` glue `gifuct-js` onto it. Disposal/delay tests then need no real GIF bytes.
Pointer: `src/core/gif.ts` — `compositeGifFrames`; `test/core/gif.test.ts`.