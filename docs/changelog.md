# Changelog

External-facing record of changes between versions. See `docs/devlog/detailed/` for granular daily entries and `docs/architecture/decisions.md` for the architectural decisions behind each break.

## 0.2.0 — 2026-04-25

### Breaking

- **Export manifest schema bumped to v2.** Frame rect fields renamed `w`/`h` → `width`/`height` to match Aseprite/TexturePacker conventions. Animation timing collapsed to per-frame `durationMs` only — the `fps` field is gone from the exported manifest, and uniform-fps animations get `Math.round(1000 / fps)` per frame at export time. The version marker on the manifest itself is now `version: 2`. Consumers built against v1 manifests need to update; there is no v1 reader in the v2 codepath. See KAD-008.

### Added

- **`pixel_lab/manifest` package subpath.** The exported manifest output types (`Manifest`, `FrameInfo`, `AtlasInfo`, `ManifestAnimation`) are now consumable by sibling repos via `import type { Manifest } from 'pixel_lab/manifest'`. The subpath maps to `src/core/serialize/manifest-types.ts`, a pure module with zero imports — consumers do not transitively pull in pixel_lab's React/Pixi/codec dependencies. Mirrors the `file:` sibling-dep pattern used by tools like civ-engine.

### Internal

- Split `src/core/serialize/manifest.ts` into a pure-types module (`manifest-types.ts`) and a runtime module that defines `BuildManifestInput` + `buildManifest()` and re-exports the types for backward-compatible internal imports.
- KAD-008 added; ARCHITECTURE.md § Export pipeline updated; drift-log row appended.

## 0.1.0 — 2026-04-23

Initial pixel_lab release: PNG/GIF import, grid/auto/manual slicing, animation editor, atlas+manifest export, project save/load. v2 pixel-drawing feature followed on 2026-04-24 (12-tool palette, multi-frame editing, onion skin, Aseprite-style shortcut map). See `docs/devlog/detailed/2026-04-23_2026-04-25.md` for the full work history.
