# Lessons

The one-line form of every lesson this repo has paid for. Read this file at session start; it is short by construction.

Each rule links into [lessons-evidence.md](lessons-evidence.md), which holds the context, the durable rule, and the pointer to the code or test. Open that only when a rule is in doubt, or the work is in that area — it is not session-start reading.

A new lesson is an entry there plus one line here. `test/lessons-pairing.test.ts` keeps the two in step: a rule always has an entry, and an entry always has a rule.

When a lesson becomes a gate — a test, a lint rule, a fixed command — delete both halves. The machine enforces it, so nobody needs to read it.

## Rules

- Documented invariants must be enforced at the state boundary, not at the consumer ([evidence](lessons-evidence.md#documented-invariants-must-be-enforced-at-the-state-boundary-not-at-the-consumer--2026-04-25))
- `useMemo` that depends on an in-place-mutated buffer needs a render counter in its deps ([evidence](lessons-evidence.md#usememo-that-depends-on-an-in-place-mutated-buffer-needs-a-render-counter-in-its-deps--2026-04-25))
- Chained `stampLine` calls double-composite the join when opacity < 1 — use a start-excluded variant ([evidence](lessons-evidence.md#chained-stampline-calls-double-composite-the-join-when-opacity--1--use-a-start-excluded-variant--2026-04-25))
- Mid-drag global shortcuts must guard on a drag flag ([evidence](lessons-evidence.md#mid-drag-global-shortcuts-must-guard-on-a-drag-flag--2026-04-25))
- Browsers drop mouseup when the cursor leaves the window — guard onMove with ev.buttons === 0 ([evidence](lessons-evidence.md#browsers-drop-mouseup-when-the-cursor-leaves-the-window--guard-onmove-with-evbuttons--0--2026-04-24))
- jsdom + fireEvent bypasses z-order, so visual layout bugs look green ([evidence](lessons-evidence.md#jsdom--fireevent-bypasses-z-order-so-visual-layout-bugs-look-green--2026-04-24))
- Serialized state must be refreshed on every mutation, not just the first ([evidence](lessons-evidence.md#serialized-state-must-be-refreshed-on-every-mutation-not-just-the-first--2026-04-24))
- In-place mutations need an explicit render signal for React ([evidence](lessons-evidence.md#in-place-mutations-need-an-explicit-render-signal-for-react--2026-04-24))
- Node `Buffer` is not polyfilled by Vite; pngjs/browser needs the `buffer` shim ([evidence](lessons-evidence.md#node-buffer-is-not-polyfilled-by-vite-pngjsbrowser-needs-the-buffer-shim--2026-04-24))
- Don't put a global state store in `app/` if UI imports from it ([evidence](lessons-evidence.md#dont-put-a-global-state-store-in-app-if-ui-imports-from-it--2026-04-24))
- Cache decoded sheet bitmaps; never re-decode on every slicing change ([evidence](lessons-evidence.md#cache-decoded-sheet-bitmaps-never-re-decode-on-every-slicing-change--2026-04-24))
- Keep GIF compositing pure so tests avoid fixture GIFs ([evidence](lessons-evidence.md#keep-gif-compositing-pure-so-tests-avoid-fixture-gifs--2026-04-23))
