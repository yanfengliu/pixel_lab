# Canon candidates

Lessons retired from `lessons.md` that have no mechanical trigger and are not specific to this repo. The parent promotes these into `fleet/FLEET.md` and then deletes this file. Until then this is the only copy, so it carries its own provenance.

---

## Encode a documented invariant next to the mutation that could break it, not in the readers that suffer when it does. A contract stated in a design doc and enforced nowhere is a convention, and convention is what the state gets into when nobody is looking: an action that touches several entities validates at the action site, so no downstream consumer has to defend itself against a state the system promised could not exist. Writing "the user shouldn't get into this state" in a comment is the tell — validate at the boundary instead.

**From:** pixel_lab / `Documented invariants must be enforced at the state boundary, not at the consumer`

**Why it has no gate:** it is a rule about *where* a check belongs, not a check — the class it covers is every future invariant, which no test can enumerate. Each concrete instance is gateable and gated; the principle that produces them is not.

**Anchor:** `ARCHITECTURE.md` / KAD-004 promised "re-slicing updates every animation that references that source" while the runtime relied on convention, leaving animation `FrameRef`s pointing past the new prepared-frames count after a re-slice. Three of four reviewers in the full-repo audit (`docs/threads/done/full/2026-04-25/1/REVIEW.md`) independently flagged the same shape in three separate places — `FrameRef` integrity, FPS validation, and `loadProject` sequence completeness. Fixed at the mutation sites: `src/ui/store.ts:updateSlicing`, `src/ui/store.ts:validateFps`, `src/core/serialize/project.ts:validateProjectJson`; gated by `test/ui/store.test.ts` (`updateSlicing drops Animation FrameRefs whose rectIndex is now out of range (B1)`, `loadProject sanitizes loaded animation fps through validateFps (RC2)`, `setAnimationFps clamps invalid numeric input to a sane default (M1)`).
