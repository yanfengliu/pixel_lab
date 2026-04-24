# Key Architectural Decisions

Entries are append-only. Never delete a decision; add a newer one that
supersedes it.

---

## KAD-001 — Client-side SPA, no backend

**Date:** 2026-04-23
**Status:** Accepted

A pure browser SPA (Vite + TypeScript + React) over Electron or a CLI:
matches the stack hints in AGENTS.md, zero deploy infra, works offline,
sprite files never leave the user's machine. Electron's ~100MB tax is
unjustified for pixel-art-sized images; a CLI would kill the interactive
slicing experience required by the spec.

---

## KAD-002 — Strict one-way module dependency

**Date:** 2026-04-23
**Status:** Accepted

`app → ui → io → core`. `core/` is DOM-free so every slicing algorithm,
packer, and serializer is unit-testable under plain Node. Violations are
blockers in code review. Rationale: UI/logic separation is the single
biggest determinant of how testable and reviewable this project stays as
it grows.

---

## KAD-003 — Engine-agnostic export manifest v1

**Date:** 2026-04-23
**Status:** Accepted

Output is atlas PNG + `manifest.json` + optional per-frame PNGs. No
engine-specific formats (Phaser, Godot, Unity) in v1. The manifest is
rich enough that users or later exporters can transform it into any
target format. Locking to one engine would add maintenance surface for
users the tool is not yet serving.

---

## KAD-004 — Frames as references, not copies

**Date:** 2026-04-23
**Status:** Accepted

`FrameRef = {sourceId, rectIndex}` instead of copying pixel data into
each animation. Re-slicing a source updates every animation that uses
it, which is the behavior a user actually expects when they change a
grid size. Tradeoff: export must resolve refs → `ImageData` at bundle
time. Worth it.

---

## KAD-005 — MaxRects packing with no trim and 1px padding

**Date:** 2026-04-23
**Status:** Accepted

Atlas packing uses MaxRects with 1px transparent padding between frames
(prevents bleeding at non-integer scales). Tight-trim is disabled: each
frame's declared size stays equal to its slice rect so pivots are
predictable for consumers. If a future use case demands trimming, add it
as a per-frame opt-in rather than a default.
