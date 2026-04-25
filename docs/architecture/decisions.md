# Key Architectural Decisions

Entries are append-only. Never delete a decision; add a newer one that supersedes it.

---

## KAD-001 — Client-side SPA, no backend

**Date:** 2026-04-23 **Status:** Accepted

A pure browser SPA (Vite + TypeScript + React) over Electron or a CLI: matches the stack hints in AGENTS.md, zero deploy infra, works offline, sprite files never leave the user's machine. Electron's ~100MB tax is unjustified for pixel-art-sized images; a CLI would kill the interactive slicing experience required by the spec.

---

## KAD-002 — Strict one-way module dependency

**Date:** 2026-04-23 **Status:** Accepted

`app → ui → io → core`. `core/` is DOM-free so every slicing algorithm, packer, and serializer is unit-testable under plain Node. Violations are blockers in code review. Rationale: UI/logic separation is the single biggest determinant of how testable and reviewable this project stays as it grows.

---

## KAD-003 — Engine-agnostic export manifest v1

**Date:** 2026-04-23 **Status:** Accepted

Output is atlas PNG + `manifest.json` + optional per-frame PNGs. No engine-specific formats (Phaser, Godot, Unity) in v1. The manifest is rich enough that users or later exporters can transform it into any target format. Locking to one engine would add maintenance surface for users the tool is not yet serving.

---

## KAD-004 — Frames as references, not copies

**Date:** 2026-04-23 **Status:** Accepted

`FrameRef = {sourceId, rectIndex}` instead of copying pixel data into each animation. Re-slicing a source updates every animation that uses it, which is the behavior a user actually expects when they change a grid size. Tradeoff: export must resolve refs → `ImageData` at bundle time. Worth it.

---

## KAD-005 — MaxRects packing with no trim and 1px padding

**Date:** 2026-04-23 **Status:** Accepted

Atlas packing uses MaxRects with 1px transparent padding between frames (prevents bleeding at non-integer scales). Tight-trim is disabled: each frame's declared size stays equal to its slice rect so pivots are predictable for consumers. If a future use case demands trimming, add it as a per-frame opt-in rather than a default.

---

## KAD-006 — Source.kind renamed `'gif'` → `'sequence'`; provenance carried separately

**Date:** 2026-04-24 **Status:** Accepted

`Source.kind` now describes *structure* (`'sheet'` = single mutable bitmap; `'sequence'` = N mutable bitmaps) rather than *provenance*. An imported GIF becomes `{kind: 'sequence', importedFrom: 'gif', gifFrames: [...]}`; a user-created blank animation becomes `{kind: 'sequence', importedFrom: 'blank'}`.

Rationale: once blank animations are editable and GIF frames are individually editable, the runtime semantics of both are identical — a sequence of `RawImage` frames the user can paint on. Keeping the kind tied to the file format it came from forced sprinkled `if kind === 'gif'` branches for behavior that should key on "is this multi-frame?" instead. Provenance is still needed for two reasons: displaying "imported from X" in the UI, and preserving per-frame delay metadata for GIFs. Both ride on the source as separate fields (`importedFrom`, `gifFrames`), not conflated into the kind.

`DecodedImport` gains `format: 'png' | 'gif'` for the same reason — the file-format detection stays distinct from the resulting source kind.

---

## KAD-007 — `editedFrames` alongside `imageBytes` (don't overwrite the original)

**Date:** 2026-04-24 **Status:** Accepted

When a user draws on an imported asset, the edited pixels are stored as `Source.editedFrames: RawImage[]` while the original `imageBytes` stays untouched. On reload, if `editedFrames` is present it is authoritative; otherwise behavior falls back to decoding `imageBytes` (v1 semantics).

Rationale: (1) editing can never corrupt an imported asset — the user can always see / inspect what they brought in; (2) provenance survives in the project file even after extensive editing; (3) the v1 file format stays forward-compatible: a v2 file with no edits serializes identically to its v1 equivalent aside from the version bump.

Tradeoff: `.pixellab.json` grows when frames are edited, because each edited frame is a base64-encoded PNG in addition to the original `imageBytes`. Accepted: project files are not bandwidth-sensitive, and the alternative (re-encoding + losing the original) is unrecoverable.

---

## KAD-008 — Manifest schema v2: width/height naming, per-frame durationMs only, top-level frame table

**Date:** 2026-04-25 **Status:** Accepted

The exported `manifest.json` moves to v2: frame rects use `width`/`height` (not `w`/`h`) to match Aseprite/TexturePacker conventions; animation timing is always per-frame `durationMs` (uniform-fps animations get `Math.round(1000 / fps)` per frame at export); `version: 1` becomes `version: 2`. The deduped top-level `frames` table stays — it lets multiple animations and repeated references share frame data without re-emitting coords.

This supersedes KAD-003's v1 manifest description in spirit while leaving KAD-003 in place per the append-only rule.

Rationale: pixel_lab now has an in-house consumer (idle-life) that imports the manifest type directly via `file:` sibling dep. A clean schema with one timing model and standard field names eliminates a translation layer in every consumer. The cost is a one-time breaking change for any in-flight v1 manifest, which is zero given pixel_lab has no third-party consumers yet.