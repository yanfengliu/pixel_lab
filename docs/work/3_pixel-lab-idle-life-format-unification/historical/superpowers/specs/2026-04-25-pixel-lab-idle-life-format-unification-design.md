# Pixel_lab ↔ idle-life format unification — design

**Date:** 2026-04-25
**Status:** Approved (brainstorm), pending implementation plan
**Spans repos:** `pixel_lab` (producer), `idle-life` (consumer). `civ-engine` is untouched.

## Problem

Pixel_lab exports a sprite atlas (`atlas.png`) and a `manifest.json` that describes frame rects and animations. Idle-life consumes character sprite sheets via a separate, hand-defined manifest type (`CharacterSpriteManifest` in `src/content/character-sprites.ts`). The two formats are ~80% aligned but disagree on field names (`w/h` vs `width/height`), timing model (`fps` vs `frameDurationMs`), and structure (top-level deduped frame table vs frames inlined per animation). Today, dropping a pixel_lab export into idle-life would require a hand-translation step or an adapter layer.

The user owns both repos and wants a clean, single-format pipeline from authoring to runtime, without duplicating type definitions or maintaining a translation layer.

## Goals

1. Pixel_lab's `manifest.json` is a clean, general-purpose interchange format that consumers can read with zero translation beyond an animation-name mapping.
2. Idle-life imports the manifest *type* directly from pixel_lab (single source of truth for the schema), so a schema change in pixel_lab fails idle-life's typecheck instead of silently drifting.
3. Authoring → runtime workflow is: export ZIP from pixel_lab → drop contents into `idle-life/assets/character/` → edit `src/game/character.ts` to point at the files and map animation names → run.
4. Pixel_lab stays engine-agnostic (no idle-life-specific concepts leak into it). Civ-engine stays headless and untouched.

## Non-goals

- Publishing pixel_lab to npm. The two-repo setup uses the `file:` protocol, mirroring how idle-life already depends on civ-engine.
- Supporting idle-life's `format: 'strip'` path. Pixel_lab only produces atlas-style output (MaxRects packing). The strip type is unused (`character.ts` is currently `null`) and is dropped from idle-life as part of this work.
- Pushing render-side concerns (anchor, mirroring, draw scale) into the manifest. Those stay on idle-life's runtime config.
- Backward compatibility with v1 manifests. Pixel_lab is recently shipped with no third-party consumers; a clean v2 cutover is cheaper than two-version support.

## Layering

```
authoring                        runtime
─────────────                    ────────────────
pixel_lab  ───manifest.json──▶  idle-life ◀──── civ-engine
(browser tool)  + atlas.png     (game)           (sim library)
```

Pixel_lab owns the asset format. Idle-life consumes it. Civ-engine is untouched by this work and never sees a sprite manifest.

## Pixel_lab manifest schema (v2)

Three breaking changes from v1, applied together. New `Manifest` shape (lives in `src/core/serialize/manifest-types.ts` after the file split described below):

```ts
export interface FrameInfo {
  x: number;
  y: number;
  width: number;   // was: w
  height: number;  // was: h
}

export interface AtlasInfo {
  image: string;
  width: number;
  height: number;
}

export interface ManifestAnimation {
  loop: boolean;
  /** One entry per frame, in playback order. */
  frames: Array<{
    name: string;       // key into Manifest.frames
    durationMs: number; // always present, never null
  }>;
}

export interface Manifest {
  version: 2;
  atlas: AtlasInfo;
  /** Deduped frame table; animations reference by name. */
  frames: Record<string, FrameInfo>;
  animations: Record<string, ManifestAnimation>;
}
```

Changes:

1. **Frame rect renames `w`/`h` → `width`/`height`.** Matches Aseprite, TexturePacker, and standard atlas conventions; what every other consumer in this domain expects.
2. **Timing collapses to per-frame `durationMs`.** v1 emitted either uniform `fps: number` *or* per-frame `{name, durationMs}`. v2 always emits per-frame `durationMs`. At export, `fps`-authored animations get `durationMs = Math.round(1000 / fps)` for every frame. Per-frame animations carry through unchanged. Consumers no longer have a "which mode is this" branch.
3. **`fps` field removed from the manifest.** Authoring-side `Animation.fps` in `Project` stays — it's authoring intent. The export pipeline collapses it to per-frame ms.
4. **`version: 1` → `version: 2`.** Loaders refuse mismatched versions with a clear error.

`loop` per animation stays. The deduped top-level `frames` table stays — it's correct: an animation can reference the same frame multiple times, and three animations can share a frame, without re-emitting pixel data or rect coords. Inlining frames per animation (idle-life's old shape) loses that.

## Pixel_lab as a consumable package

Pixel_lab today is `"private": true` with no `main`/`exports`. Add a public surface that exposes *only* the manifest output types. Idle-life never executes pixel_lab code at runtime — it reads the JSON dropped into `assets/`. The dep is purely so idle-life's `tsc` enforces the schema.

### File split

Today, `src/core/serialize/manifest.ts` mixes the *output* shape (`Manifest`, `FrameInfo`, `AtlasInfo`, `ManifestAnimation`) with the *authoring-side* `BuildManifestInput` (which references `Animation` and `FrameRef` from `src/core/types.ts`). Idle-life only needs the output shape and must not transitively pull in authoring types.

Split into two files:

- **`src/core/serialize/manifest-types.ts`** (new, pure): exports `Manifest`, `FrameInfo`, `AtlasInfo`, `ManifestAnimation`. Zero imports.
- **`src/core/serialize/manifest.ts`** (existing, slimmed): imports the output types from `./manifest-types`, adds `BuildManifestInput`, defines `buildManifest()`. Imports from `../types` stay here.

`manifest.ts` re-exports the output types from `./manifest-types` so existing internal callers (`src/core/export.ts` and tests) keep working with no import changes.

### Package surface

Changes to `pixel_lab/package.json`:

```json
{
  "exports": {
    "./manifest": "./src/core/serialize/manifest-types.ts"
  },
  "types": "./src/core/serialize/manifest-types.ts"
}
```

The `exports` map points directly at the `.ts` source. Idle-life's `tsc` (with `moduleResolution: "bundler"` or `"node16"`) and vite both handle `.ts` resolution across `file:` deps without a build step in pixel_lab. No `dist/` artifact, no `prepare` script, no risk of stale builds. Pixel_lab stays `"private": true`. The `file:` protocol works on private packages.

If a future consumer needs a published artifact (e.g. shipping pixel_lab to npm), an emit step can be added then. Until then, source-as-package is the simplest robust contract for two same-author repos linked by file path.

## Idle-life consumption

`src/content/character-sprites.ts` shrinks. Today it defines two format branches (`StripSpriteSheet`, `AtlasSpriteSheet`), the union, types, and the `defineCharacter` helper. After this work:

1. **Drop `StripSpriteSheet`, `StripAnimationDefinition`, and the strip code path entirely.** Unused (`character.ts` is null). Pixel_lab cannot produce strip layout, so the path has no consumer.
2. **Drop `AtlasSpriteSheet`, `AtlasFrame`, `AtlasAnimationDefinition`, `defineCharacter` (current shape).** Replaced by the new types below.
3. **Add a runtime-shape type** (what `pixi-scene.ts` actually wants):

```ts
import type { Manifest, FrameInfo } from 'pixel_lab/manifest';

export interface ResolvedAnimation {
  loop: boolean;
  frames: Array<{
    rect: FrameInfo;
    durationMs: number;
  }>;
}

export interface ResolvedCharacterManifest {
  atlasUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  animations: Record<AnimationKey, ResolvedAnimation>;
  anchorX: number;  // default 0.5
  anchorY: number;  // default 1.0
}
```

4. **Add a config type** (what `src/game/character.ts` declares):

```ts
export interface PixelLabCharacterConfig {
  manifestUrl: string;     // resolved via new URL('../../assets/character/manifest.json', import.meta.url).href
  atlasUrl: string;        // sibling, same pattern
  /** Map idle-life's required animation keys to manifest animation names. */
  animations: Record<AnimationKey, string>;
  anchorX?: number;
  anchorY?: number;
}
```

5. **Add a loader** that fetches the manifest, validates it, and resolves the runtime shape:

```ts
export async function loadCharacterFromPixelLab(
  cfg: PixelLabCharacterConfig
): Promise<ResolvedCharacterManifest>;
```

Loader behavior:
- `fetch(cfg.manifestUrl)`, parse as JSON, assert `version === 2` (throw `Error` with version info on mismatch).
- For each `key` in `ANIMATION_KEYS` (`idle | walk | interact | sleep`):
  - Look up `cfg.animations[key]` to get the manifest animation name.
  - Resolve `manifest.animations[manifestName]`. If missing, throw `Error("Animation '<manifestName>' not found in pixel_lab manifest. Available: <list>")`.
  - For each frame in that animation, look up `manifest.frames[frame.name]`. If missing, throw a similar specific error.
  - Build the `ResolvedAnimation`.
- Return `{ atlasUrl: cfg.atlasUrl, atlasWidth: manifest.atlas.width, atlasHeight: manifest.atlas.height, animations, anchorX: cfg.anchorX ?? 0.5, anchorY: cfg.anchorY ?? 1.0 }`.

The loader does not validate that `cfg.atlasUrl` actually exists (Pixi's `Assets.load` will surface that error in its own way).

6. **`src/game/character.ts`** becomes the user-edited config:

```ts
import type { PixelLabCharacterConfig } from '../content/character-sprites';

const config: PixelLabCharacterConfig | null = null;

// To use a sprite sheet:
//
// const config: PixelLabCharacterConfig = {
//   manifestUrl: new URL('../../assets/character/manifest.json', import.meta.url).href,
//   atlasUrl:    new URL('../../assets/character/atlas.png',    import.meta.url).href,
//   animations: { idle: 'idle', walk: 'walking', interact: 'use_furniture', sleep: 'sleep' },
// };

export default config;
```

7. **`src/client/scene/pixi-scene.ts`** changes from a sync read of the manifest to an async load. It already calls `Assets.load(...)` for textures, so adding `await loadCharacterFromPixelLab(config)` upstream is structurally cheap. The frame ticker in `src/client/scene/character-sprite.ts` updates to read the new `ResolvedAnimation` shape.

8. **`docs/guides/character-sprites.md`** is rewritten end-to-end: drop the strip option, drop the manual `format: 'atlas'` walkthrough, replace with the pixel_lab workflow (export ZIP, drop into `assets/character/`, edit `character.ts`, map animation names).

## Authoring → runtime workflow

End-state user experience:

1. In pixel_lab, build animations and click **Export**. Save the ZIP.
2. Unzip into `idle-life/assets/character/`. The directory ends up with `atlas.png` and `manifest.json` (drop `frames/` if you don't need standalone PNGs).
3. Open `idle-life/src/game/character.ts`, replace `null` with a `PixelLabCharacterConfig` literal pointing at the two files, and map each of `idle | walk | interact | sleep` to an animation name in your manifest.
4. `npm run dev`.

No build step in pixel_lab is required for idle-life to run — `manifest.json` is plain JSON, `atlas.png` is a plain PNG, both are static assets. The `file:../pixel_lab` dep is consulted by `tsc` only.

## Testing

### Pixel_lab

- Update existing manifest tests for the renamed fields and the always-`durationMs` timing.
- Add a test in `src/core/serialize/manifest.test.ts` that asserts `version === 2`, that uniform-fps inputs produce per-frame `durationMs`, and that per-frame inputs round-trip unchanged.
- `npx vitest run`, `npx tsc --noEmit`, `npx vite build` all green.

### Idle-life

- New test `src/content/character-sprites.test.ts` (or alongside the loader file):
  - happy path: small fixture manifest + correct config → returns a `ResolvedCharacterManifest` with the expected frame counts and durations.
  - version mismatch: `version: 1` manifest → throws with a version-specific error message.
  - missing animation: config maps `walk → "walking"` but manifest has no such animation → throws with the animation name and a list of available names.
  - missing frame: animation references a frame name not in the top-level table → throws with the frame name.
- Update `src/client/ui/hud-menu.test.ts` and any other test that touches the dropped types.
- `npx vitest run`, `npx tsc --noEmit`, `npx vite build` all green.

### Cross-repo integration check (manual, one-shot)

- In idle-life: `npm install` (resolves the new `file:../pixel_lab` link).
- `npx tsc --noEmit` in idle-life passes, importing types directly from `pixel_lab/manifest`.
- `npx vite build` in idle-life succeeds with the live link.

## Architecture & docs (pixel_lab)

- **KAD-008 (new)**: "Manifest schema v2: per-frame durationMs, width/height naming, top-level frame table." Supersedes KAD-003's v1 manifest description in spirit while keeping KAD-003 in place (decisions are append-only).
- **`docs/architecture/ARCHITECTURE.md` § Export pipeline**: update step 4 to reflect the v2 fields and timing model.
- **`docs/architecture/drift-log.md`**: append a row noting the v1→v2 schema change and that ARCHITECTURE.md was updated to match.
- **`docs/devlog/detailed/2026-04-23_2026-04-24.md` (or current active file)**: append the standard end-of-task entry.

## Architecture & docs (idle-life)

- **`docs/architecture/ARCHITECTURE.md`**: if the character sprite system is documented there, update the section to reflect the pixel_lab loader and the dropped strip path; otherwise no architecture change.
- **`docs/guides/character-sprites.md`**: rewrite per § Idle-life consumption above.
- **`docs/devlog/...`**: append the standard end-of-task entry, mention pixel_lab dep added.

## Migration cost summary

| Repo | Estimate | Surface |
|---|---|---|
| pixel_lab | ~50 LOC + test churn | manifest.ts/manifest-types.ts split, field renames, fps→ms collapse, version bump, package.json exports, KAD-008, drift row, docs |
| idle-life | ~80 LOC + tests | drop strip path, add loader + types, update character.ts/pixi-scene.ts/character-sprite.ts, rewrite guide, package.json sibling dep |
| civ-engine | 0 | untouched |

## Risks & how we manage them

- **Schema drift between repos.** Mitigated by idle-life importing types from `pixel_lab/manifest`. Any rename in pixel_lab fails idle-life's `tsc`.
- **Local `file:` dep staleness.** Source-as-package (no build step) sidesteps stale-build risk: idle-life's `tsc` reads the live `.ts` file from the linked pixel_lab. After pulling pixel_lab changes, idle-life sees the new types on the next typecheck.
- **Async character load.** Today's null-character path is sync; the new path is async. Pixi's scene construction already handles async asset loading, so this is integration cost, not a new architectural concern.
- **No backward compat for v1 manifests.** Acceptable: there are no third-party v1 manifests in existence. If someone has a saved `.pixellab.json` from before this change, project re-save will re-emit a v2 manifest on next export.

## Implementation order

A single plan can ship this. The dependencies between work items are:

1. Pixel_lab manifest v2 (file split + schema changes + tests + package.json exports) — must land first so idle-life has types to import.
2. Idle-life loader + type swap + guide rewrite — depends on pixel_lab being installable.
3. Cross-repo integration verification.

Each pixel_lab and idle-life change ships on its own short-lived branch per each repo's AGENTS.md, with merge to main after tests pass.
