# Pixel_lab ↔ idle-life format unification — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify pixel_lab's export manifest with idle-life's consumer such that pixel_lab emits a clean v2 schema and idle-life imports the manifest type directly via a `file:` sibling dep, with no translation layer.

**Architecture:** Pixel_lab owns the manifest format (v2: `width/height` instead of `w/h`, always per-frame `durationMs`, `version: 2`). Idle-life's `src/content/character-sprites.ts` shrinks to a thin loader that fetches the manifest, validates it, and resolves the runtime shape consumed by `character-sprite.ts` and `pixi-scene.ts`. Strip-format support is removed (unused, and pixel_lab can't produce it). Civ-engine is untouched.

**Tech Stack:** TypeScript (`Bundler` module resolution in both repos), Vite, Vitest, React (pixel_lab only), Pixi.js (idle-life only). Cross-repo wiring via `file:../pixel_lab` in idle-life's `package.json`, mirroring its existing `civ-engine` dep.

**Spec:** `docs/superpowers/specs/2026-04-25-pixel-lab-idle-life-format-unification-design.md`

---

## File map

### Pixel_lab (`C:/Users/38909/Documents/github/pixel_lab`)

- **Create:** `src/core/serialize/manifest-types.ts` — pure output types (`Manifest`, `FrameInfo`, `AtlasInfo`, `ManifestAnimation`), zero imports.
- **Modify:** `src/core/serialize/manifest.ts` — re-exports types from `./manifest-types`; updates `buildManifest()` to emit v2 shape (always per-frame `durationMs`, no `fps` field).
- **Modify:** `test/core/manifest-collision.test.ts` — rename `w/h` → `width/height` in fixture.
- **Modify:** `test/core/export.test.ts` — update timing assertions (drop `fps`, expect per-frame `durationMs` + `version: 2`).
- **Modify:** `package.json` — add `"types"` and `"exports"` fields pointing at the .ts source.
- **Modify:** `docs/architecture/decisions.md` — append KAD-008.
- **Modify:** `docs/architecture/ARCHITECTURE.md` § Export pipeline — reflect v2 shape.
- **Modify:** `docs/architecture/drift-log.md` — append row for v1→v2 schema change.
- **Modify/Rename:** `docs/devlog/detailed/2026-04-23_2026-04-24.md` → `2026-04-23_2026-04-25.md` and append entry; update `docs/devlog/summary.md`.

### Idle-life (`C:/Users/38909/Documents/github/idle-life`)

- **Modify:** `package.json` — add `"pixel_lab": "file:../pixel_lab"` to dependencies.
- **Modify:** `src/content/character-sprites.ts` — drop `StripSpriteSheet`, `AtlasSpriteSheet`, `defineCharacter`, related types; add `ResolvedAnimation`, `ResolvedCharacterManifest`, `PixelLabCharacterConfig`, `loadCharacterFromPixelLab()`. Keep `AnimationKey`, `ANIMATION_KEYS`, `animationKeyForStatus()`.
- **Create:** `src/content/character-sprites.test.ts` — tests for `loadCharacterFromPixelLab`.
- **Modify:** `src/client/scene/character-animation.ts` — drop `compileSpriteSheet`, `compileAnimationFrames`, `CompiledFrame`, `CompiledSpriteSheet`; keep `frameIndexForElapsed` but rewrite for variable per-frame durations.
- **Modify:** `src/client/scene/character-animation.test.ts` — drop `compileSpriteSheet` tests; update `frameIndexForElapsed` tests for the new `ResolvedAnimation` shape with per-frame durations.
- **Modify:** `src/client/scene/character-sprite.ts` — accept `ResolvedCharacterManifest` directly (no compile step).
- **Modify:** `src/client/scene/character-sprite.test.ts` — fixture switches to `ResolvedCharacterManifest`.
- **Modify:** `src/client/scene/pixi-scene.ts` — `PixiSceneOptions` gains `character?: ResolvedCharacterManifest | null`; sync construction reads from options instead of importing the game manifest directly.
- **Modify:** `src/client/scene/pixi-scene-character.test.ts` — pass a `ResolvedCharacterManifest` via options instead of mocking `../../game/character`.
- **Modify:** `src/client/app.ts` — `bootstrapIdleLifeApp` becomes async; preloads character via `loadCharacterFromPixelLab` before constructing the scene.
- **Modify:** `src/client/app.test.ts` — update if it asserts on bootstrap return shape.
- **Modify:** `src/main.ts` — await `bootstrapIdleLifeApp` if it's invoked there.
- **Modify:** `src/game/character.ts` — replace strip-comment example with `PixelLabCharacterConfig`; default stays `null`.
- **Modify:** `docs/guides/character-sprites.md` — rewrite end-to-end for the pixel_lab workflow.
- **Modify:** `docs/devlog/detailed/2026-04-23_2026-04-23.md` (or rename to extend) — append entry.

### Civ-engine

Untouched.

---

## Branches

- pixel_lab: `agent/manifest-v2`
- idle-life: `agent/pixel-lab-loader`

Each ships independently. Pixel_lab merges first so idle-life has a stable type to import against.

---

# Phase A — Pixel_lab manifest v2

Working directory: `C:/Users/38909/Documents/github/pixel_lab`

## Task A1: Create branch and split manifest types into pure module

**Files:**
- Create: `src/core/serialize/manifest-types.ts`
- Modify: `src/core/serialize/manifest.ts`

- [ ] **Step 1: Create branch**

```bash
cd "C:/Users/38909/Documents/github/pixel_lab"
git checkout -b agent/manifest-v2
```

- [ ] **Step 2: Create `src/core/serialize/manifest-types.ts`** with the v2 output types

```ts
/**
 * Output shape of pixel_lab's exported manifest.json. Pure types only —
 * zero imports — so external consumers can depend on this module without
 * pulling in pixel_lab's authoring-side types.
 */

export interface FrameInfo {
  x: number;
  y: number;
  width: number;
  height: number;
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
    name: string;
    durationMs: number;
  }>;
}

export interface Manifest {
  version: 2;
  atlas: AtlasInfo;
  /** Deduped frame table; animations reference frames by name. */
  frames: Record<string, FrameInfo>;
  animations: Record<string, ManifestAnimation>;
}
```

- [ ] **Step 3: Slim `src/core/serialize/manifest.ts`** to import the types and update `buildManifest`

```ts
import type { Animation, FrameRef } from '../types';
import type {
  AtlasInfo,
  FrameInfo,
  Manifest,
  ManifestAnimation,
} from './manifest-types';

export type { AtlasInfo, FrameInfo, Manifest, ManifestAnimation };

export interface BuildManifestInput {
  atlas: AtlasInfo;
  /** Map from frame-key (e.g. "walk_0") to its atlas coords. */
  frames: Record<string, FrameInfo>;
  animations: Animation[];
  /** Given a FrameRef, return the frame-key it resolves to in `frames`. */
  refToKey: (ref: FrameRef) => string;
}

export function buildManifest(input: BuildManifestInput): Manifest {
  const animations: Record<string, ManifestAnimation> = {};
  const seen = new Set<string>();
  for (const a of input.animations) {
    if (seen.has(a.name)) {
      throw new Error(
        `buildManifest: duplicate animation name "${a.name}" would overwrite in manifest.json; rename before export`,
      );
    }
    seen.add(a.name);

    const frames = a.frames.map((f) => {
      const name = input.refToKey(f);
      const durationMs =
        a.fps === 'per-frame'
          ? (f.durationMs ?? 100)
          : Math.round(1000 / (a.fps as number));
      return { name, durationMs };
    });

    animations[a.name] = { loop: a.loop, frames };
  }
  return {
    version: 2,
    atlas: input.atlas,
    frames: input.frames,
    animations,
  };
}
```

- [ ] **Step 4: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. (Existing internal callers — `src/core/export.ts`, tests — keep importing from `./manifest`; the re-export in step 3 covers them. `FrameInfo`'s field rename `w/h → width/height` will cause one type error in `src/core/export.ts` where it constructs the `frameCoords` map. That's the *next* step.)

- [ ] **Step 5: Update `src/core/export.ts`** to write `width/height`

Replace lines 78–80 (the `frameCoords` construction) — current:

```ts
  const frameCoords: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const p of pack.placements) {
    frameCoords[p.id] = { x: p.x, y: p.y, w: p.w, h: p.h };
  }
```

with:

```ts
  const frameCoords: Record<string, FrameInfo> = {};
  for (const p of pack.placements) {
    frameCoords[p.id] = { x: p.x, y: p.y, width: p.w, height: p.h };
  }
```

And add the import at the top of `src/core/export.ts`:

```ts
import type { FrameInfo } from './serialize/manifest';
```

- [ ] **Step 6: Verify typecheck again**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/core/serialize/manifest-types.ts src/core/serialize/manifest.ts src/core/export.ts
git commit -m "refactor(core): split manifest output types into pure module + v2 shape"
```

---

## Task A2: Update existing tests for v2 schema

**Files:**
- Modify: `test/core/manifest-collision.test.ts`
- Modify: `test/core/export.test.ts`
- Modify: `test/core/export-collision.test.ts`

- [ ] **Step 1: Update `test/core/manifest-collision.test.ts`**

Replace line 16 (the `frames` fixture):

```ts
        frames: { f_0: { x: 0, y: 0, w: 4, h: 4 }, f_1: { x: 4, y: 0, w: 4, h: 4 } },
```

with:

```ts
        frames: { f_0: { x: 0, y: 0, width: 4, height: 4 }, f_1: { x: 4, y: 0, width: 4, height: 4 } },
```

- [ ] **Step 2: Update `test/core/export.test.ts`**

Replace the test at lines 78–82 ("manifest animation lists names…"):

```ts
  it('manifest animation lists names in animation order (including repeats)', () => {
    const bundle = buildExport(project, prepared);
    const anim = bundle.manifest.animations.walk!;
    expect(anim.frames).toEqual(['walk_0', 'walk_1', 'walk_2', 'walk_0']);
  });
```

with:

```ts
  it('manifest animation lists frames with names + per-frame durationMs', () => {
    const bundle = buildExport(project, prepared);
    const anim = bundle.manifest.animations.walk!;
    expect(anim.loop).toBe(true);
    // fps: 12 -> 1000/12 = 83.33 -> rounded to 83 ms
    expect(anim.frames).toEqual([
      { name: 'walk_0', durationMs: 83 },
      { name: 'walk_1', durationMs: 83 },
      { name: 'walk_2', durationMs: 83 },
      { name: 'walk_0', durationMs: 83 },
    ]);
  });
```

Replace the test at lines 94–102 ("packs uniform-fps animation frames as strings"):

```ts
  it('packs uniform-fps animation frames as strings', () => {
    const bundle = buildExport(project, prepared);
    expect(bundle.manifest.animations.walk!.fps).toBe(12);
    expect(Array.isArray(bundle.manifest.animations.walk!.frames)).toBe(true);
    // strings, not objects
    for (const f of bundle.manifest.animations.walk!.frames) {
      expect(typeof f).toBe('string');
    }
  });
```

with:

```ts
  it('manifest is v2 and has no fps field on animations', () => {
    const bundle = buildExport(project, prepared);
    expect(bundle.manifest.version).toBe(2);
    expect((bundle.manifest.animations.walk as Record<string, unknown>).fps).toBeUndefined();
  });
```

Replace the test at lines 104–124 ("packs per-frame timing animations…"):

```ts
  it('packs per-frame timing animations with durationMs preserved per frame', () => {
    const perFrame: Project = {
      ...project,
      animations: [
        {
          id: 'a',
          name: 'walk',
          fps: 'per-frame',
          loop: true,
          frames: [
            { sourceId: 'src', rectIndex: 0, durationMs: 100 },
            { sourceId: 'src', rectIndex: 1, durationMs: 50 },
          ],
        },
      ],
    };
    const bundle = buildExport(perFrame, prepared);
    const anim = bundle.manifest.animations.walk!;
    expect(anim.frames).toEqual([
      { name: 'walk_0', durationMs: 100 },
      { name: 'walk_1', durationMs: 50 },
    ]);
  });
```

Also update the frame-coord assertion in "atlas.png decodes…" if needed. Verify `bundle.manifest.frames["walk_0"]` shape now uses `width/height` — re-read after edit if it asserts on frame fields.

- [ ] **Step 3: Update `test/core/export-collision.test.ts`**

Replace the assertion at lines 51–52 (animation `frames` was previously a `string[]`):

```ts
    const animA = bundle.manifest.animations['walk!']!.frames as string[];
    const animB = bundle.manifest.animations['walk_']!.frames as string[];
    expect(animA[0]).not.toEqual(animB[0]);
    expect(bundle.manifest.frames[animA[0]!]).toBeDefined();
    expect(bundle.manifest.frames[animB[0]!]).toBeDefined();
```

with:

```ts
    const animA = bundle.manifest.animations['walk!']!.frames;
    const animB = bundle.manifest.animations['walk_']!.frames;
    expect(animA[0]!.name).not.toEqual(animB[0]!.name);
    expect(bundle.manifest.frames[animA[0]!.name]).toBeDefined();
    expect(bundle.manifest.frames[animB[0]!.name]).toBeDefined();
```

- [ ] **Step 4: Run affected tests**

```bash
npx vitest run test/core/manifest-collision.test.ts test/core/export.test.ts test/core/export-collision.test.ts
```

Expected: all three files pass.

- [ ] **Step 5: Commit**

```bash
git add test/core/manifest-collision.test.ts test/core/export.test.ts test/core/export-collision.test.ts
git commit -m "test(core): update manifest tests for v2 schema (width/height + durationMs)"
```

---

## Task A3: Add v2-specific manifest test

**Files:**
- Create: `test/core/manifest-v2.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { buildManifest } from '../../src/core/serialize/manifest';

describe('manifest v2', () => {
  it('emits version: 2', () => {
    const m = buildManifest({
      atlas: { image: 'atlas.png', width: 16, height: 16 },
      frames: { f_0: { x: 0, y: 0, width: 4, height: 4 } },
      refToKey: () => 'f_0',
      animations: [
        {
          id: 'a',
          name: 'idle',
          fps: 10,
          loop: true,
          frames: [{ sourceId: 's', rectIndex: 0 }],
        },
      ],
    });
    expect(m.version).toBe(2);
  });

  it('converts uniform fps to per-frame durationMs (rounded)', () => {
    const m = buildManifest({
      atlas: { image: 'atlas.png', width: 16, height: 16 },
      frames: { f_0: { x: 0, y: 0, width: 4, height: 4 }, f_1: { x: 4, y: 0, width: 4, height: 4 } },
      refToKey: (r) => `f_${r.rectIndex}`,
      animations: [
        {
          id: 'a',
          name: 'walk',
          fps: 24,
          loop: true,
          frames: [
            { sourceId: 's', rectIndex: 0 },
            { sourceId: 's', rectIndex: 1 },
          ],
        },
      ],
    });
    // 1000/24 = 41.666... -> rounded to 42
    expect(m.animations.walk!.frames).toEqual([
      { name: 'f_0', durationMs: 42 },
      { name: 'f_1', durationMs: 42 },
    ]);
  });

  it('preserves per-frame durationMs verbatim for per-frame animations', () => {
    const m = buildManifest({
      atlas: { image: 'atlas.png', width: 16, height: 16 },
      frames: { f_0: { x: 0, y: 0, width: 4, height: 4 }, f_1: { x: 4, y: 0, width: 4, height: 4 } },
      refToKey: (r) => `f_${r.rectIndex}`,
      animations: [
        {
          id: 'a',
          name: 'idle',
          fps: 'per-frame',
          loop: false,
          frames: [
            { sourceId: 's', rectIndex: 0, durationMs: 250 },
            { sourceId: 's', rectIndex: 1, durationMs: 75 },
          ],
        },
      ],
    });
    expect(m.animations.idle!.frames).toEqual([
      { name: 'f_0', durationMs: 250 },
      { name: 'f_1', durationMs: 75 },
    ]);
    expect(m.animations.idle!.loop).toBe(false);
  });

  it('defaults missing per-frame durationMs to 100ms', () => {
    const m = buildManifest({
      atlas: { image: 'atlas.png', width: 16, height: 16 },
      frames: { f_0: { x: 0, y: 0, width: 4, height: 4 } },
      refToKey: () => 'f_0',
      animations: [
        {
          id: 'a',
          name: 'wave',
          fps: 'per-frame',
          loop: true,
          frames: [{ sourceId: 's', rectIndex: 0 }],
        },
      ],
    });
    expect(m.animations.wave!.frames[0]!.durationMs).toBe(100);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run test/core/manifest-v2.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add test/core/manifest-v2.test.ts
git commit -m "test(core): cover manifest v2 fps→ms conversion and version field"
```

---

## Task A4: Add package.json exports for `pixel_lab/manifest`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update `package.json`**

Insert these top-level fields immediately after `"version": "0.1.0",`:

```json
  "types": "./src/core/serialize/manifest-types.ts",
  "exports": {
    "./manifest": "./src/core/serialize/manifest-types.ts"
  },
```

The block now reads:

```json
{
  "name": "pixel_lab",
  "private": true,
  "version": "0.1.0",
  "types": "./src/core/serialize/manifest-types.ts",
  "exports": {
    "./manifest": "./src/core/serialize/manifest-types.ts"
  },
  "type": "module",
  ...
}
```

- [ ] **Step 2: Verify pixel_lab still typechecks and builds**

```bash
npx tsc --noEmit
npx vite build
```

Expected: both green. The `exports` field is informational for consumers; it doesn't affect pixel_lab's own build.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat(pkg): expose manifest types via 'pixel_lab/manifest' subpath"
```

---

## Task A5: KAD-008 + ARCHITECTURE update + drift-log row

**Files:**
- Modify: `docs/architecture/decisions.md`
- Modify: `docs/architecture/ARCHITECTURE.md`
- Modify: `docs/architecture/drift-log.md`

- [ ] **Step 1: Append KAD-008 to `docs/architecture/decisions.md`**

After the existing KAD-007, append:

```markdown

---

## KAD-008 — Manifest schema v2: width/height naming, per-frame durationMs only, top-level frame table

**Date:** 2026-04-25 **Status:** Accepted

The exported `manifest.json` moves to v2: frame rects use `width`/`height` (not `w`/`h`) to match Aseprite/TexturePacker conventions; animation timing is always per-frame `durationMs` (uniform-fps animations get `Math.round(1000 / fps)` per frame at export); `version: 1` becomes `version: 2`. The deduped top-level `frames` table stays — it lets multiple animations and repeated references share frame data without re-emitting coords.

This supersedes KAD-003's v1 manifest description in spirit while leaving KAD-003 in place per the append-only rule.

Rationale: pixel_lab now has an in-house consumer (idle-life) that imports the manifest type directly via `file:` sibling dep. A clean schema with one timing model and standard field names eliminates a translation layer in every consumer. The cost is a one-time breaking change for any in-flight v1 manifest, which is zero given pixel_lab has no third-party consumers yet.
```

- [ ] **Step 2: Update `docs/architecture/ARCHITECTURE.md` § Export pipeline**

Replace the existing § Export pipeline section with:

```markdown
## Export pipeline

1. Resolve `FrameRef` → `ImageData`.
2. Dedupe identical frame refs.
3. Pack into atlas via MaxRects, 1px transparent padding, no trim.
4. Emit `manifest.json` (v2: `width/height` field naming, per-frame `durationMs` for every animation, deduped top-level `frames` table) + atlas PNG + optional per-frame PNGs.
5. ZIP via `fflate` and hand to `io` to write.

The manifest schema is exposed as a public package subpath: external consumers (e.g. idle-life) import `Manifest` and related types from `pixel_lab/manifest` (mapped to `src/core/serialize/manifest-types.ts`) via a `file:` sibling dep. See KAD-008.
```

- [ ] **Step 3: Append a row to `docs/architecture/drift-log.md`**

Append after the last existing row:

```markdown
| 2026-04-25 | `manifest.json` v1 emitted `w/h` for frame rects and `fps` (or per-frame `durationMs`) on animations. ARCHITECTURE.md § Export pipeline described v1 fields. | Cross-repo unification with idle-life made the field-name and timing-mode mismatches load-bearing: every consumer would otherwise need a translation layer. | KAD-008 bumps the schema to v2 (`width/height`, always per-frame `durationMs`, `version: 2`). ARCHITECTURE.md § Export pipeline updated. No outstanding drift. |
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/decisions.md docs/architecture/ARCHITECTURE.md docs/architecture/drift-log.md
git commit -m "docs(arch): KAD-008 manifest v2 + architecture/drift updates"
```

---

## Task A6: Devlog entry

**Files:**
- Rename + modify: `docs/devlog/detailed/2026-04-23_2026-04-24.md` → `docs/devlog/detailed/2026-04-23_2026-04-25.md`
- Modify: `docs/devlog/summary.md`

- [ ] **Step 1: Rename the active detailed devlog file**

```bash
git mv docs/devlog/detailed/2026-04-23_2026-04-24.md docs/devlog/detailed/2026-04-23_2026-04-25.md
```

- [ ] **Step 2: Append an entry** to the renamed file (`docs/devlog/detailed/2026-04-23_2026-04-25.md`)

```markdown

---

## 2026-04-25 — Manifest schema v2 + cross-repo type export

**Action:** Bumped `manifest.json` to v2: split output types into `src/core/serialize/manifest-types.ts` (zero imports), renamed frame rect fields `w/h → width/height`, collapsed timing to always per-frame `durationMs` (uniform fps converts at export via `Math.round(1000/fps)`). Added `package.json` `exports` pointing `pixel_lab/manifest` at the new types module so idle-life can `import type { Manifest } from 'pixel_lab/manifest'` via a `file:` sibling dep.

**Code reviewer comments:**
- Pending — review happens after idle-life integration lands.

**Result:** `npx vitest run` green (266+ tests including the new v2 coverage), `npx tsc --noEmit` clean, `npx vite build` green.

**Reasoning:** Idle-life is the first in-house consumer of the manifest. A clean schema with one timing model and standard field names removes a translation layer permanently; the v1→v2 break is cheap because no third-party v1 consumers exist.

**Notes:** KAD-008 added; ARCHITECTURE.md § Export pipeline updated; drift-log row appended. The package surface is types-only — idle-life never executes pixel_lab code at runtime, only reads the JSON the user drops into `assets/`.
```

- [ ] **Step 3: Update `docs/devlog/summary.md`**

Replace the "Last updated" line and the "Current state" paragraph. The file's existing structure is short — read it, then update both the timestamp and the state summary so the latest fact is "manifest v2 + types-only public surface" while keeping the Phase 1–3 v2 drawing summary intact. End-state of the relevant lines:

```markdown
**Last updated:** 2026-04-25

## Current state

Manifest schema v2 shipped: `width/height` naming, always per-frame `durationMs`, `version: 2`, types exposed at `pixel_lab/manifest` for sibling-dep consumers. v2 pixel drawing remains merged. 266+/266+ tests pass, `npx tsc --noEmit` clean, `npx vite build` green.
```

(Adjust the test count and other surrounding lines as needed; keep "What exists", "Known follow-ups" stable.)

- [ ] **Step 4: Commit**

```bash
git add docs/devlog/detailed/2026-04-23_2026-04-25.md docs/devlog/summary.md
git commit -m "docs(devlog): record manifest v2 + types-only public surface"
```

---

## Task A7: Full test suite + merge

- [ ] **Step 1: Run full pixel_lab gate**

```bash
npx vitest run
npx tsc --noEmit
npx vite build
```

Expected: all three green.

- [ ] **Step 2: Merge to main**

```bash
git checkout main
git merge --ff-only agent/manifest-v2
git branch -d agent/manifest-v2
```

Expected: fast-forward merge, branch deleted.

---

# Phase B — Idle-life consumption

Working directory: `C:/Users/38909/Documents/github/idle-life`

## Task B1: Create branch + add pixel_lab dep

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Create branch**

```bash
cd "C:/Users/38909/Documents/github/idle-life"
git checkout -b agent/pixel-lab-loader
```

- [ ] **Step 2: Add pixel_lab to dependencies**

Edit `package.json` to add `pixel_lab` alongside the existing `civ-engine` line:

```json
  "dependencies": {
    "civ-engine": "file:../civ-engine",
    "pixel_lab": "file:../pixel_lab",
    "pixi.js": "^7.4.3"
  },
```

- [ ] **Step 3: Install**

```bash
npm install
```

Expected: `pixel_lab` link created under `node_modules/pixel_lab` pointing at the sibling repo.

- [ ] **Step 4: Verify the type import resolves**

Create a temporary scratch file `src/__scratch__.ts` (will be deleted in step 5):

```ts
import type { Manifest } from 'pixel_lab/manifest';
const m: Manifest = { version: 2, atlas: { image: '', width: 0, height: 0 }, frames: {}, animations: {} };
void m;
```

Run:

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Delete scratch and commit**

```bash
rm src/__scratch__.ts
git add package.json package-lock.json
git commit -m "deps: add pixel_lab as file:../pixel_lab sibling dep"
```

---

## Task B2: Replace character-sprites types and add loader

**Files:**
- Modify: `src/content/character-sprites.ts`

- [ ] **Step 1: Rewrite `src/content/character-sprites.ts`**

Replace the entire file contents with:

```ts
import type { Manifest, FrameInfo } from 'pixel_lab/manifest';
import type { ResidentStatus } from '../shared/game-types';

export type AnimationKey = 'idle' | 'walk' | 'interact' | 'sleep';

export const ANIMATION_KEYS: readonly AnimationKey[] = ['idle', 'walk', 'interact', 'sleep'];

export function animationKeyForStatus(status: ResidentStatus): AnimationKey {
  if (status === 'idle') return 'idle';
  if (status === 'walking') return 'walk';
  if (status === 'resting') return 'sleep';
  return 'interact';
}

/** A single frame's render-ready data. */
export interface ResolvedFrame {
  rect: FrameInfo;
  durationMs: number;
}

export interface ResolvedAnimation {
  loop: boolean;
  frames: ResolvedFrame[];
  /** Sum of all frame durations. Cached for the frame-index ticker. */
  totalDurationMs: number;
}

export interface ResolvedCharacterManifest {
  atlasUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  animations: Record<AnimationKey, ResolvedAnimation>;
  anchorX: number;
  anchorY: number;
}

/**
 * User-edited config in `src/game/character.ts`. Maps the four idle-life
 * animation keys to free-form animation names from a pixel_lab manifest.
 */
export interface PixelLabCharacterConfig {
  manifestUrl: string;
  atlasUrl: string;
  animations: Record<AnimationKey, string>;
  anchorX?: number;
  anchorY?: number;
}

const SUPPORTED_VERSION = 2;

export async function loadCharacterFromPixelLab(
  cfg: PixelLabCharacterConfig,
): Promise<ResolvedCharacterManifest> {
  const response = await fetch(cfg.manifestUrl);
  if (!response.ok) {
    throw new Error(`loadCharacterFromPixelLab: fetch failed (${response.status}) for ${cfg.manifestUrl}`);
  }
  const manifest = (await response.json()) as Manifest;
  return resolveManifest(manifest, cfg);
}

/** Pure resolver, exported for testing. */
export function resolveManifest(
  manifest: Manifest,
  cfg: PixelLabCharacterConfig,
): ResolvedCharacterManifest {
  if (manifest.version !== SUPPORTED_VERSION) {
    throw new Error(
      `loadCharacterFromPixelLab: manifest version ${manifest.version} not supported (expected ${SUPPORTED_VERSION})`,
    );
  }

  const animations = {} as Record<AnimationKey, ResolvedAnimation>;
  const availableNames = Object.keys(manifest.animations).join(', ') || '(none)';

  for (const key of ANIMATION_KEYS) {
    const manifestName = cfg.animations[key];
    const anim = manifest.animations[manifestName];
    if (!anim) {
      throw new Error(
        `loadCharacterFromPixelLab: animation "${manifestName}" (mapped from "${key}") not found in manifest. Available: ${availableNames}`,
      );
    }
    if (anim.frames.length === 0) {
      throw new Error(`loadCharacterFromPixelLab: animation "${manifestName}" has no frames`);
    }
    const frames: ResolvedFrame[] = [];
    let total = 0;
    for (const frame of anim.frames) {
      const rect = manifest.frames[frame.name];
      if (!rect) {
        throw new Error(
          `loadCharacterFromPixelLab: frame "${frame.name}" in animation "${manifestName}" not found in manifest.frames`,
        );
      }
      frames.push({ rect, durationMs: frame.durationMs });
      total += frame.durationMs;
    }
    animations[key] = { loop: anim.loop, frames, totalDurationMs: total };
  }

  return {
    atlasUrl: cfg.atlasUrl,
    atlasWidth: manifest.atlas.width,
    atlasHeight: manifest.atlas.height,
    animations,
    anchorX: cfg.anchorX ?? 0.5,
    anchorY: cfg.anchorY ?? 1.0,
  };
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: many errors elsewhere — `character-animation.ts`, `character-sprite.ts`, `pixi-scene.ts`, and tests still reference dropped types. Continue to next task; this is an in-progress refactor.

- [ ] **Step 3: Commit (partial)**

We commit even though tsc is broken, because the next tasks complete the refactor on a tight schedule. (If you prefer to keep main green at every commit, defer this commit until task B6 lands.) Recommendation: defer the commit. Skip step 3 here and combine with later commits.

---

## Task B3: Loader tests

**Files:**
- Create: `src/content/character-sprites.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, expect, it } from 'vitest';
import type { Manifest } from 'pixel_lab/manifest';
import {
  resolveManifest,
  type PixelLabCharacterConfig,
} from './character-sprites';

function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    version: 2,
    atlas: { image: 'atlas.png', width: 64, height: 64 },
    frames: {
      f_0: { x: 0, y: 0, width: 16, height: 24 },
      f_1: { x: 16, y: 0, width: 16, height: 24 },
    },
    animations: {
      stand: { loop: true, frames: [{ name: 'f_0', durationMs: 120 }] },
      walking: {
        loop: true,
        frames: [
          { name: 'f_0', durationMs: 100 },
          { name: 'f_1', durationMs: 100 },
        ],
      },
      use: { loop: false, frames: [{ name: 'f_0', durationMs: 200 }] },
      lay_down: { loop: true, frames: [{ name: 'f_1', durationMs: 400 }] },
    },
    ...overrides,
  };
}

const config: PixelLabCharacterConfig = {
  manifestUrl: 'unused',
  atlasUrl: 'atlas.png',
  animations: { idle: 'stand', walk: 'walking', interact: 'use', sleep: 'lay_down' },
};

describe('resolveManifest', () => {
  it('resolves all four animations and computes total durations', () => {
    const resolved = resolveManifest(makeManifest(), config);
    expect(resolved.atlasUrl).toBe('atlas.png');
    expect(resolved.atlasWidth).toBe(64);
    expect(resolved.animations.idle.frames).toEqual([
      { rect: { x: 0, y: 0, width: 16, height: 24 }, durationMs: 120 },
    ]);
    expect(resolved.animations.walk.totalDurationMs).toBe(200);
    expect(resolved.animations.interact.loop).toBe(false);
  });

  it('uses default anchors when config omits them', () => {
    const resolved = resolveManifest(makeManifest(), config);
    expect(resolved.anchorX).toBe(0.5);
    expect(resolved.anchorY).toBe(1.0);
  });

  it('respects anchor overrides from the config', () => {
    const resolved = resolveManifest(makeManifest(), { ...config, anchorX: 0.25, anchorY: 0.75 });
    expect(resolved.anchorX).toBe(0.25);
    expect(resolved.anchorY).toBe(0.75);
  });

  it('throws on unsupported manifest version', () => {
    const m = { ...makeManifest(), version: 1 } as unknown as Manifest;
    expect(() => resolveManifest(m, config)).toThrow(/version 1 not supported/);
  });

  it('throws with a list of available animation names when a mapping target is missing', () => {
    const cfg = { ...config, animations: { ...config.animations, walk: 'sprint' } };
    expect(() => resolveManifest(makeManifest(), cfg)).toThrow(/sprint/);
    expect(() => resolveManifest(makeManifest(), cfg)).toThrow(/Available: stand, walking, use, lay_down/);
  });

  it('throws when an animation references a frame not in the top-level frame table', () => {
    const m = makeManifest({
      animations: {
        ...makeManifest().animations,
        walking: { loop: true, frames: [{ name: 'missing_frame', durationMs: 50 }] },
      },
    });
    expect(() => resolveManifest(m, config)).toThrow(/frame "missing_frame".*not found/);
  });

  it('throws when an animation has zero frames', () => {
    const m = makeManifest({
      animations: { ...makeManifest().animations, walking: { loop: true, frames: [] } },
    });
    expect(() => resolveManifest(m, config)).toThrow(/walking" has no frames/);
  });
});
```

- [ ] **Step 2: Run loader tests in isolation**

```bash
npx vitest run src/content/character-sprites.test.ts
```

Expected: 7 tests pass. (Other tests still broken from the in-progress refactor; that's fine for this task.)

---

## Task B4: Rewrite `character-animation.ts` for variable per-frame durations

**Files:**
- Modify: `src/client/scene/character-animation.ts`

- [ ] **Step 1: Rewrite the file**

Replace the entire contents with:

```ts
import type { ResolvedAnimation } from '../../content/character-sprites';

/**
 * Pick the frame index for a given elapsed time. Walks the per-frame
 * `durationMs` array. Loops by mod-ing `elapsedMs` by `totalDurationMs`
 * before walking; clamps to the last frame for non-looping animations
 * once `elapsedMs` exceeds `totalDurationMs`.
 */
export function frameIndexForElapsed(
  animation: ResolvedAnimation,
  elapsedMs: number,
): number {
  if (animation.frames.length <= 1) return 0;
  if (elapsedMs < 0) return 0;

  const total = animation.totalDurationMs;
  let t = elapsedMs;
  if (animation.loop) {
    if (total === 0) return 0;
    t = ((elapsedMs % total) + total) % total;
  } else if (t >= total) {
    return animation.frames.length - 1;
  }

  let acc = 0;
  for (let i = 0; i < animation.frames.length; i++) {
    acc += animation.frames[i]!.durationMs;
    if (t < acc) return i;
  }
  // Floating-point edge: t equals total exactly. Return last frame.
  return animation.frames.length - 1;
}
```

- [ ] **Step 2: Verify typecheck and that `character-animation.ts` self-consistent**

```bash
npx tsc --noEmit
```

Expected: errors in dependent files only (next task fixes them); no new errors in `character-animation.ts` itself.

---

## Task B5: Update `character-animation.test.ts`

**Files:**
- Modify: `src/client/scene/character-animation.test.ts`

- [ ] **Step 1: Replace the entire test file**

```ts
import { describe, expect, it } from 'vitest';

import { animationKeyForStatus, type ResolvedAnimation } from '../../content/character-sprites';
import { frameIndexForElapsed } from './character-animation';

describe('animationKeyForStatus', () => {
  it('maps resident status to the consolidated four-animation set', () => {
    expect(animationKeyForStatus('idle')).toBe('idle');
    expect(animationKeyForStatus('walking')).toBe('walk');
    expect(animationKeyForStatus('resting')).toBe('sleep');
    expect(animationKeyForStatus('eating')).toBe('interact');
    expect(animationKeyForStatus('washing')).toBe('interact');
    expect(animationKeyForStatus('having-fun')).toBe('interact');
    expect(animationKeyForStatus('working')).toBe('interact');
  });
});

describe('frameIndexForElapsed', () => {
  function uniformAnim(frameDurationMs: number, frameCount: number, loop: boolean): ResolvedAnimation {
    const frames = Array.from({ length: frameCount }, () => ({
      rect: { x: 0, y: 0, width: 16, height: 16 },
      durationMs: frameDurationMs,
    }));
    return { loop, frames, totalDurationMs: frameDurationMs * frameCount };
  }

  function variableAnim(durations: number[], loop: boolean): ResolvedAnimation {
    return {
      loop,
      frames: durations.map((d) => ({ rect: { x: 0, y: 0, width: 16, height: 16 }, durationMs: d })),
      totalDurationMs: durations.reduce((a, b) => a + b, 0),
    };
  }

  it('advances through uniform-duration frames and wraps when looping', () => {
    const a = uniformAnim(100, 4, true);
    expect(frameIndexForElapsed(a, 0)).toBe(0);
    expect(frameIndexForElapsed(a, 99)).toBe(0);
    expect(frameIndexForElapsed(a, 100)).toBe(1);
    expect(frameIndexForElapsed(a, 399)).toBe(3);
    expect(frameIndexForElapsed(a, 400)).toBe(0);
    expect(frameIndexForElapsed(a, 850)).toBe(0);
    expect(frameIndexForElapsed(a, 950)).toBe(1);
  });

  it('advances correctly through variable-duration frames', () => {
    // [50, 200, 100] -> total 350. Cumulative: 50, 250, 350.
    const a = variableAnim([50, 200, 100], true);
    expect(frameIndexForElapsed(a, 0)).toBe(0);
    expect(frameIndexForElapsed(a, 49)).toBe(0);
    expect(frameIndexForElapsed(a, 50)).toBe(1);
    expect(frameIndexForElapsed(a, 249)).toBe(1);
    expect(frameIndexForElapsed(a, 250)).toBe(2);
    expect(frameIndexForElapsed(a, 349)).toBe(2);
    expect(frameIndexForElapsed(a, 350)).toBe(0); // wrap
    expect(frameIndexForElapsed(a, 400)).toBe(1); // 400 mod 350 = 50 → frame 1
  });

  it('clamps at the final frame for non-looping animations', () => {
    const a = uniformAnim(100, 4, false);
    expect(frameIndexForElapsed(a, 0)).toBe(0);
    expect(frameIndexForElapsed(a, 350)).toBe(3);
    expect(frameIndexForElapsed(a, 999)).toBe(3);
    expect(frameIndexForElapsed(a, 99999)).toBe(3);
  });

  it('clamps negative elapsed times to frame 0', () => {
    const a = uniformAnim(100, 4, true);
    expect(frameIndexForElapsed(a, -1)).toBe(0);
    expect(frameIndexForElapsed(a, -9999)).toBe(0);
  });

  it('returns 0 for single-frame animations', () => {
    const a = uniformAnim(100, 1, true);
    expect(frameIndexForElapsed(a, 0)).toBe(0);
    expect(frameIndexForElapsed(a, 5000)).toBe(0);
  });
});
```

- [ ] **Step 2: Run animation tests**

```bash
npx vitest run src/client/scene/character-animation.test.ts
```

Expected: 5 tests pass.

---

## Task B6: Update `character-sprite.ts` and its tests

**Files:**
- Modify: `src/client/scene/character-sprite.ts`
- Modify: `src/client/scene/character-sprite.test.ts`

- [ ] **Step 1: Rewrite `src/client/scene/character-sprite.ts`**

Replace the whole file with:

```ts
import { BaseTexture, Rectangle, Sprite, Texture } from 'pixi.js';

import {
  ANIMATION_KEYS,
  type AnimationKey,
  type ResolvedCharacterManifest,
} from '../../content/character-sprites';
import type { Facing } from '../../shared/game-types';
import { frameIndexForElapsed } from './character-animation';

export interface CharacterSpriteController {
  readonly sprite: Sprite;
  setAnimation(key: AnimationKey): void;
  setFacing(facing: Facing): void;
  setPosition(x: number, y: number): void;
  setDisplaySize(widthPx: number, heightPx: number): void;
  tick(deltaMs: number): void;
  destroy(): void;
}

export function createCharacterSprite(
  manifest: ResolvedCharacterManifest,
): CharacterSpriteController {
  const baseTexture = BaseTexture.from(manifest.atlasUrl);
  const frameTextures = buildFrameTextures(baseTexture, manifest);

  const sprite = new Sprite(frameTextures.idle[0]);
  sprite.anchor.set(manifest.anchorX, manifest.anchorY);

  let currentKey: AnimationKey = 'idle';
  let elapsedMs = 0;
  let currentFacing: Facing = 'right';

  function applyCurrentFrame(): void {
    const animation = manifest.animations[currentKey];
    const index = frameIndexForElapsed(animation, elapsedMs);
    sprite.texture = frameTextures[currentKey][index]!;
  }

  return {
    sprite,
    setAnimation(key) {
      if (key === currentKey) return;
      currentKey = key;
      elapsedMs = 0;
      applyCurrentFrame();
    },
    setFacing(facing) {
      if (facing === currentFacing) return;
      currentFacing = facing;
      sprite.scale.x = facing === 'left' ? -Math.abs(sprite.scale.x) : Math.abs(sprite.scale.x);
    },
    setPosition(x, y) {
      sprite.position.set(x, y);
    },
    setDisplaySize(widthPx, heightPx) {
      sprite.width = widthPx;
      sprite.height = heightPx;
    },
    tick(deltaMs) {
      elapsedMs += deltaMs;
      applyCurrentFrame();
    },
    destroy() {
      sprite.destroy();
      for (const key of ANIMATION_KEYS) {
        for (const texture of frameTextures[key]) {
          texture.destroy(false);
        }
      }
    },
  };
}

function buildFrameTextures(
  baseTexture: BaseTexture,
  manifest: ResolvedCharacterManifest,
): Record<AnimationKey, Texture[]> {
  const result = {} as Record<AnimationKey, Texture[]>;
  for (const key of ANIMATION_KEYS) {
    result[key] = manifest.animations[key].frames.map(
      (frame) =>
        new Texture(baseTexture, new Rectangle(frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height)),
    );
  }
  return result;
}
```

- [ ] **Step 2: Update `src/client/scene/character-sprite.test.ts`**

Replace the imports and `makeStripManifest` helper (lines 97–117) with:

```ts
import type { ResolvedCharacterManifest } from '../../content/character-sprites';
import { createCharacterSprite } from './character-sprite';

function makeManifest(overrides: Partial<ResolvedCharacterManifest> = {}): ResolvedCharacterManifest {
  function frames(durationMs: number, count: number, yRow: number) {
    return Array.from({ length: count }, (_, i) => ({
      rect: { x: i * 32, y: yRow * 48, width: 32, height: 48 },
      durationMs,
    }));
  }
  return {
    atlasUrl: 'sheet.png',
    atlasWidth: 128,
    atlasHeight: 192,
    animations: {
      idle: { loop: true, frames: frames(100, 2, 0), totalDurationMs: 200 },
      walk: { loop: true, frames: frames(100, 4, 1), totalDurationMs: 400 },
      interact: { loop: true, frames: frames(100, 3, 2), totalDurationMs: 300 },
      sleep: { loop: true, frames: frames(100, 2, 3), totalDurationMs: 200 },
    },
    anchorX: 0.5,
    anchorY: 1,
    ...overrides,
  };
}
```

Replace the test bodies that previously used `makeStripManifest(...)` with `makeManifest(...)`. The behavior assertions (anchor, frame switching, scale flip, ticker advance, destroy fan-out) all stay valid because they only depend on `ResolvedCharacterManifest` shape now. The "destroys 11 per-frame textures" assertion holds: 2 + 4 + 3 + 2 = 11.

For the test "starts on the first idle frame with the configured anchor", change:

```ts
const controller = createCharacterSprite(makeStripManifest({ anchorX: 0.25, anchorY: 0.8 }));
```

to:

```ts
const controller = createCharacterSprite(makeManifest({ anchorX: 0.25, anchorY: 0.8 }));
```

Apply the same swap to every other test in the file. The `frame.x === 0` / `frame.y === 48` / etc. assertions still hold because the helper preserves the strip-equivalent layout (column = frame index × 32, row × 48).

- [ ] **Step 3: Run sprite tests**

```bash
npx vitest run src/client/scene/character-sprite.test.ts
```

Expected: 6 tests pass.

---

## Task B7: Update `pixi-scene.ts` to take resolved character via options

**Files:**
- Modify: `src/client/scene/pixi-scene.ts`
- Modify: `src/client/scene/pixi-scene-character.test.ts`

- [ ] **Step 1: Edit `src/client/scene/pixi-scene.ts`**

Remove the import of `characterManifest` from `../../game/character` (line 5) and change `PixiSceneOptions` and the character construction.

At the top of the file, replace the `characterManifest` import with:

```ts
import type { ResolvedCharacterManifest } from '../../content/character-sprites';
```

(`animationKeyForStatus` import on line 4 stays.)

Update `PixiSceneOptions`:

```ts
export interface PixiSceneOptions {
  onEntitySelect: (ref: EntityRef) => void;
  onItemMove: (item: EntityRef, x: number) => void;
  onFloorSelect: (x: number) => void;
  /** Pre-loaded character data; null means render the fallback. */
  character: ResolvedCharacterManifest | null;
}
```

Update the character construction at the existing site (was lines 107–108):

```ts
  const character: CharacterSpriteController | null =
    options.character !== null ? createCharacterSprite(options.character) : null;
```

- [ ] **Step 2: Edit `src/client/scene/pixi-scene-character.test.ts`**

Drop the mock at lines 150–164 (`vi.mock('../../game/character', ...)`).

In the test setup where `createPixiScene(host, { onEntitySelect, onItemMove, onFloorSelect })` is called, add a `character: ResolvedCharacterManifest` option built inline. Add this helper near the top of the test file (after the mocks):

```ts
import type { ResolvedCharacterManifest } from '../../content/character-sprites';

function characterManifestFixture(): ResolvedCharacterManifest {
  function frames(durationMs: number, count: number, yRow: number) {
    return Array.from({ length: count }, (_, i) => ({
      rect: { x: i * 32, y: yRow * 48, width: 32, height: 48 },
      durationMs,
    }));
  }
  return {
    atlasUrl: 'character.png',
    atlasWidth: 128,
    atlasHeight: 192,
    animations: {
      idle: { loop: true, frames: frames(100, 2, 0), totalDurationMs: 200 },
      walk: { loop: true, frames: frames(100, 4, 1), totalDurationMs: 400 },
      interact: { loop: true, frames: frames(100, 3, 2), totalDurationMs: 300 },
      sleep: { loop: true, frames: frames(100, 2, 3), totalDurationMs: 200 },
    },
    anchorX: 0.5,
    anchorY: 1,
  };
}
```

Update the two `createPixiScene(...)` calls in this file to pass `character: characterManifestFixture()`:

```ts
const scene = createPixiScene(host, {
  onEntitySelect: () => undefined,
  onItemMove: () => undefined,
  onFloorSelect: () => undefined,
  character: characterManifestFixture(),
});
```

- [ ] **Step 3: Update other `createPixiScene` call sites that don't supply character**

Search for other test files / source files calling `createPixiScene` without a `character` option:

```bash
grep -rn "createPixiScene" src/
```

Expected: `src/client/app.ts`, `src/client/scene/pixi-scene.test.ts` need `character: null` (no character mock there). Add it to each call.

For `src/client/scene/pixi-scene.test.ts`, search the file for `createPixiScene(` and append `character: null,` to each options object.

- [ ] **Step 4: Run pixi-scene tests**

```bash
npx vitest run src/client/scene/pixi-scene.test.ts src/client/scene/pixi-scene-character.test.ts
```

Expected: all pass.

---

## Task B8: Update `app.ts` to async-preload character

**Files:**
- Modify: `src/client/app.ts`
- Modify: `src/main.ts` (if it invokes `bootstrapIdleLifeApp`)
- Modify: `src/client/app.test.ts` (if it asserts shape)
- Modify: `src/game/character.ts`

- [ ] **Step 1: Update `src/game/character.ts`**

Replace the entire file with:

```ts
import type { PixelLabCharacterConfig } from '../content/character-sprites';

/**
 * Resident character config. Set to `null` to render the fallback circle.
 *
 * To use a sprite sheet exported from pixel_lab:
 *   1. Export from pixel_lab and unzip into `assets/character/`.
 *   2. Replace `null` with a `PixelLabCharacterConfig` literal pointing
 *      at `assets/character/manifest.json` and `assets/character/atlas.png`.
 *   3. Map each idle-life animation key (idle | walk | interact | sleep)
 *      to the matching animation name in your manifest.
 *
 * Example:
 *
 *   const config: PixelLabCharacterConfig = {
 *     manifestUrl: new URL('../../assets/character/manifest.json', import.meta.url).href,
 *     atlasUrl:    new URL('../../assets/character/atlas.png',    import.meta.url).href,
 *     animations:  { idle: 'idle', walk: 'walking', interact: 'use_furniture', sleep: 'sleep' },
 *   };
 */
const config: PixelLabCharacterConfig | null = null;

export default config;
```

- [ ] **Step 2: Update `src/client/app.ts`**

Replace the imports (lines 1–18 region) — keep all existing imports, then add:

```ts
import {
  loadCharacterFromPixelLab,
  type ResolvedCharacterManifest,
} from '../content/character-sprites';
import characterConfig from '../game/character';
```

(Replace the existing `import characterManifest from '../../game/character'` line with the import shown — note path adjustments; `app.ts` is at `src/client/app.ts`, so the path is `../game/character`.)

Change the function signature from sync to async. Replace:

```ts
export function bootstrapIdleLifeApp(root: HTMLElement): () => void {
```

with:

```ts
export async function bootstrapIdleLifeApp(root: HTMLElement): Promise<() => void> {
```

Just before `const scene = createPixiScene(...)`, add:

```ts
  const character: ResolvedCharacterManifest | null =
    characterConfig !== null ? await loadCharacterFromPixelLab(characterConfig) : null;
```

And add `character,` to the options passed to `createPixiScene`:

```ts
  const scene = createPixiScene(shell.sceneHost, {
    onEntitySelect(ref) { ... },
    onItemMove(item, x) { ... },
    onFloorSelect(x) { ... },
    character,
  });
```

- [ ] **Step 3: Update `src/main.ts`**

Find the call to `bootstrapIdleLifeApp` and prefix it with `await` (top-level `await` works because `package.json` has `"type": "module"` and tsconfig targets ES2022). If `main.ts` runs synchronously, wrap in:

```ts
void bootstrapIdleLifeApp(root).then((teardown) => {
  // existing teardown wiring
});
```

Read `src/main.ts` first to see the current shape, then apply the smallest async-compatible change.

- [ ] **Step 4: Update `src/client/app.test.ts`**

If the test calls `bootstrapIdleLifeApp(root)`, change to `await bootstrapIdleLifeApp(root)`. If a test expects a sync return type, switch to `await`.

- [ ] **Step 5: Verify the whole repo typechecks**

```bash
npx tsc --noEmit
```

Expected: clean.

---

## Task B9: Full test suite + verify

- [ ] **Step 1: Run idle-life full gate**

```bash
npx vitest run
npx tsc --noEmit
npx vite build
```

Expected: all green. If not, fix and retry. Common issues:
- Missing `character: null` in a `createPixiScene` call — add it.
- A test imports a dropped type (e.g. `CharacterSpriteManifest`) — replace with `ResolvedCharacterManifest` or remove the unused import.

- [ ] **Step 2: Commit the entire idle-life refactor**

(If Task B2 step 3 was deferred, this is the first commit. Otherwise this is a single rollup commit on top.)

```bash
git add src/content/character-sprites.ts src/content/character-sprites.test.ts \
        src/client/scene/character-animation.ts src/client/scene/character-animation.test.ts \
        src/client/scene/character-sprite.ts src/client/scene/character-sprite.test.ts \
        src/client/scene/pixi-scene.ts src/client/scene/pixi-scene-character.test.ts src/client/scene/pixi-scene.test.ts \
        src/client/app.ts src/client/app.test.ts src/main.ts src/game/character.ts
git commit -m "refactor: consume pixel_lab manifest v2 directly via async loader"
```

---

## Task B10: Rewrite character sprite guide

**Files:**
- Modify: `docs/guides/character-sprites.md`

- [ ] **Step 1: Replace the file content**

Replace the entire file with:

```markdown
# Character sprite sheets

How to put your resident character on screen using a sprite sheet exported from [pixel_lab](https://github.com/yanfengliu/pixel_lab).

## TL;DR

1. In pixel_lab, build your animations and click **Export**. Save the ZIP.
2. Unzip into `assets/character/`. The directory should end up with `assets/character/atlas.png` and `assets/character/manifest.json` (drop `frames/` if you don't need standalone PNGs).
3. Edit `src/game/character.ts` — replace `null` with a `PixelLabCharacterConfig` literal pointing at the two files and mapping each idle-life animation key to the animation name in your manifest.
4. Run `npm run dev`.

## How it wires together

```
assets/character/manifest.json          <- pixel_lab export (atlas coords + per-frame durations)
assets/character/atlas.png              <- pixel_lab export (packed atlas image)
src/game/character.ts                   <- you edit this: declares the PixelLabCharacterConfig
src/content/character-sprites.ts        <- framework: types + loadCharacterFromPixelLab()
src/client/scene/character-sprite.ts    <- framework: Pixi sprite + per-frame ticker
src/client/scene/pixi-scene.ts          <- framework: receives ResolvedCharacterManifest via options
src/client/app.ts                       <- framework: awaits the loader before constructing the scene
```

The user-edited file is `src/game/character.ts` — everything under `src/content/` and `src/client/scene/` is framework code that shouldn't need changes for new sheets.

## Required animations

Idle-life maps seven `ResidentStatus` values down to four animation keys: `idle | walk | interact | sleep`. Your pixel_lab manifest can have any animation names; the config in `src/game/character.ts` maps each idle-life key to whatever you named the animation.

| Idle-life key | When it plays |
|---|---|
| `idle` | Standing, breathing |
| `walk` | Walking right (left is mirrored at render time) |
| `interact` | Eating, washing, having fun, working — collapsed by `animationKeyForStatus` |
| `sleep` | Resting |

## Authoring rules

- Draw the character right-facing. Left-facing is mirrored automatically.
- The character's feet should sit at the bottom edge of each frame. The sprite anchor defaults to `(0.5, 1.0)`.
- Frame sizes can vary across animations (pixel_lab packs irregular rects). A "big pose" frame next to a "small pose" frame is fine.

## Edit `src/game/character.ts`

The file ships as:

```ts
import type { PixelLabCharacterConfig } from '../content/character-sprites';

const config: PixelLabCharacterConfig | null = null;

export default config;
```

Replace `null` with a config literal:

```ts
import type { PixelLabCharacterConfig } from '../content/character-sprites';

const config: PixelLabCharacterConfig = {
  manifestUrl: new URL('../../assets/character/manifest.json', import.meta.url).href,
  atlasUrl:    new URL('../../assets/character/atlas.png',    import.meta.url).href,
  animations:  { idle: 'idle', walk: 'walking', interact: 'use_furniture', sleep: 'sleep' },
  // anchorX: 0.5,  // override if your art doesn't sit feet-on-floor
  // anchorY: 1.0,
};

export default config;
```

To disable the sprite and fall back to the placeholder circle: `export default null;` with the type alias preserved.

## Config reference

| Field | Type | Default | Purpose |
|---|---|---|---|
| `manifestUrl` | `string` | required | Resolved URL of `manifest.json` (use `new URL('...', import.meta.url).href`) |
| `atlasUrl` | `string` | required | Resolved URL of `atlas.png` |
| `animations.idle` | `string` | required | Manifest animation name to use for the `idle` state |
| `animations.walk` | `string` | required | Manifest animation name to use for the `walk` state |
| `animations.interact` | `string` | required | Manifest animation name to use for the `interact` state |
| `animations.sleep` | `string` | required | Manifest animation name to use for the `sleep` state |
| `anchorX` | `number` | `0.5` | Horizontal sprite anchor (0 = left, 1 = right) |
| `anchorY` | `number` | `1.0` | Vertical sprite anchor (0 = top, 1 = bottom). 1.0 lands feet on the floor. |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Console error: `manifest version 1 not supported` | Manifest exported from a pre-v2 pixel_lab | Re-export from a current pixel_lab build |
| Console error: `animation "X" not found in manifest. Available: …` | The string in `animations.X` doesn't match a name in the manifest | Either rename the animation in pixel_lab and re-export, or update the mapping in `character.ts` |
| Feet floating above the floor | Frame has transparent space below feet | Trim the frame in pixel_lab, or set `anchorY: 0.9` to lower the anchor |
| Animation never advances | Per-frame `durationMs` may be huge or animation has only 1 frame | Inspect `manifest.json` |
| Wrong PNG path / 404 | `atlasUrl` doesn't resolve | Check the `new URL('...', import.meta.url)` path is relative to `src/game/character.ts` |

## Verification

After editing the config:

```bash
npx vitest run
npx tsc --noEmit
npx vite build
npm run dev
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/guides/character-sprites.md
git commit -m "docs(guides): rewrite character-sprites guide for pixel_lab v2 workflow"
```

---

## Task B11: Devlog entry

**Files:**
- Rename + modify: `docs/devlog/detailed/2026-04-23_2026-04-23.md` → `docs/devlog/detailed/2026-04-23_2026-04-25.md`

- [ ] **Step 1: Rename and append entry**

```bash
git mv docs/devlog/detailed/2026-04-23_2026-04-23.md docs/devlog/detailed/2026-04-23_2026-04-25.md
```

Append:

```markdown

---

## 2026-04-25 — Pixel_lab manifest loader integration

**Action:** Added `pixel_lab` as a `file:../pixel_lab` sibling dep. Replaced `CharacterSpriteManifest` (strip + atlas branches) with a thin `loadCharacterFromPixelLab(config)` loader in `src/content/character-sprites.ts` that fetches a v2 manifest, validates the version, dereferences the deduped `frames` table, and returns a `ResolvedCharacterManifest` consumed directly by `character-sprite.ts`. Strip format dropped. `bootstrapIdleLifeApp` is async and pre-loads the character before `createPixiScene`. Per-frame `frameIndexForElapsed` rewritten to handle variable per-frame durations.

**Code reviewer comments:**
- Pending — review after this lands.

**Result:** `npx vitest run` green, `npx tsc --noEmit` clean, `npx vite build` green.

**Reasoning:** Pixel_lab is now the single authoring path for character art in this game. Importing the manifest type directly (no duplicated schema) means a pixel_lab schema change fails idle-life's typecheck immediately, instead of silently drifting. Strip format was unused (`character.ts` was null) and unsupported by pixel_lab's MaxRects packer; keeping it would have meant maintaining dead code paths.
```

- [ ] **Step 2: Commit**

```bash
git add docs/devlog/detailed/2026-04-23_2026-04-25.md
git commit -m "docs(devlog): record pixel_lab manifest loader integration"
```

---

## Task B12: Merge to main

- [ ] **Step 1: Final full gate**

```bash
npx vitest run
npx tsc --noEmit
npx vite build
```

Expected: all green.

- [ ] **Step 2: Merge**

```bash
git checkout main
git merge --ff-only agent/pixel-lab-loader
git branch -d agent/pixel-lab-loader
```

---

# Phase C — Cross-repo integration verification

Working directory: either repo, but commands span both.

## Task C1: End-to-end sanity check

- [ ] **Step 1: Confirm pixel_lab and idle-life are both on main**

```bash
git -C "C:/Users/38909/Documents/github/pixel_lab" log --oneline -1
git -C "C:/Users/38909/Documents/github/idle-life" log --oneline -1
```

Both should show the merged work from Phases A and B.

- [ ] **Step 2: Reinstall idle-life dep to refresh the link**

```bash
cd "C:/Users/38909/Documents/github/idle-life"
npm install
```

- [ ] **Step 3: Cross-repo typecheck**

```bash
npx tsc --noEmit
```

Expected: clean. Idle-life's typechecker reads the live `manifest-types.ts` from pixel_lab via the `file:` link — schema names match, no errors.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Hand-author a tiny v2 manifest fixture under `assets/character/manifest.json` and a 1×1 atlas PNG, populate `src/game/character.ts` with the config, run `npm run dev`, and confirm the resident renders without errors. The actual end-user art workflow exercises the same path.

(If you don't have art handy, this step can be deferred until you actually export from pixel_lab — Task B11's tests already cover the loader's behavior with synthetic fixtures.)

---

## Notes for the executor

- After each commit, run only the affected tests (`npx vitest run path/to/test`) until the final task in each phase, where the full gate runs.
- Don't skip the `git mv` step on devlog renames — losing file history makes future archaeology painful.
- If a commit is large enough to feel uncomfortable, split it. Each numbered task in this plan corresponds to one logical commit; sub-splits within a task are fine.
- The `defer the commit` note in Task B2 is deliberate — the idle-life refactor is too tangled to commit mid-flight cleanly. Either commit per file as you go (and accept several intermediate commits with broken typecheck) or commit the whole refactor at Task B9.
- If `npm install` in idle-life fails with a peer-dep complaint about pixel_lab, run `npm install --legacy-peer-deps` once to unblock; pixel_lab's React peer-dep is a non-issue since idle-life imports types only and never bundles pixel_lab code.
