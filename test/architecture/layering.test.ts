import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Imports point one way: `main → app → ui → io → core`, never back up.
 *
 * A global state store that UI components call is structurally a UI concern, not an
 * application concern. Put it under `ui/` so UI imports stay inside their own layer, and
 * keep `app/` a composition root that owns no state. The moment a store sits in `app/` and
 * every component reaches up into it, the documented arrow is reversed and the layering is
 * decoration rather than structure — which is how it stays until someone re-derives the whole
 * dependency graph by hand. The direction is only real while a machine checks it, because
 * every individual upward import looks locally harmless.
 *
 * Same-layer imports are fine (`ui/Shell` → `ui/store`). Downward is fine (`ui` → `core`).
 * Upward is the defect.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcRoot = join(repoRoot, 'src');

/** Higher rank may import lower or equal rank; never the reverse. */
const RANK: Record<string, number> = { core: 0, io: 1, ui: 2, app: 3, root: 4 };

/** Path aliases from vite.config.ts / vitest.config.ts, mapped to their layer directory. */
const ALIASES: Record<string, string> = {
  '@core': 'core',
  '@io': 'io',
  '@ui': 'ui',
  '@app': 'app',
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Repo-relative, forward-slashed — the form the failure messages print. */
function rel(full: string): string {
  return relative(repoRoot, full).split('\\').join('/');
}

/**
 * Layer of a path below `src/`. A file sitting directly in `src/` (main.tsx) is the entry
 * point and outranks everything.
 */
function layerOf(srcRelative: string): string {
  const [head, ...rest] = srcRelative.split('/');
  if (rest.length === 0) return 'root';
  return head! in RANK ? head! : 'root';
}

/**
 * The specifier of every static/dynamic import in a module, comments and strings excluded by
 * construction (an import specifier is itself a string literal in a fixed grammatical slot).
 */
function importSpecifiers(text: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) out.push(m[1]!);
  }
  return out;
}

/**
 * Resolve an import to a layer, or null when it leaves `src/` entirely (npm packages, node
 * builtins) — those carry no layering claim.
 */
function importedLayer(importerSrcRelative: string, specifier: string): string | null {
  const aliasHead = specifier.split('/')[0]!;
  if (aliasHead in ALIASES) return ALIASES[aliasHead]!;
  if (!specifier.startsWith('.')) return null;
  const resolved = posix.normalize(
    posix.join(posix.dirname(importerSrcRelative), specifier),
  );
  if (resolved.startsWith('..')) return null;
  return layerOf(resolved);
}

describe('architecture: layer import direction', () => {
  /**
   * Verify the instrument before trusting the measurement. Both assertions below are "no
   * offenders found" checks, which a parser that reads nothing would satisfy forever.
   */
  it('recognizes an upward import in a known-bad sample', () => {
    const sample = `import { App } from '../app/App';\nimport { slice } from '@core/slicers';\n`;
    const specs = importSpecifiers(sample);
    expect(specs).toEqual(['../app/App', '@core/slicers']);
    expect(importedLayer('ui/Shell.tsx', specs[0]!)).toBe('app');
    expect(importedLayer('ui/Shell.tsx', specs[1]!)).toBe('core');
    expect(RANK.ui!).toBeLessThan(RANK.app!);
  });

  it('scans a non-empty set of source files', () => {
    expect(sourceFiles(srcRoot).length).toBeGreaterThan(20);
  });

  it('never imports upward through app → ui → io → core', () => {
    const violations: string[] = [];
    for (const full of sourceFiles(srcRoot)) {
      const srcRelative = rel(full).replace(/^src\//, '');
      const from = layerOf(srcRelative);
      for (const spec of importSpecifiers(readFileSync(full, 'utf8'))) {
        const to = importedLayer(srcRelative, spec);
        if (to === null) continue;
        if (RANK[to]! > RANK[from]!) {
          violations.push(`src/${srcRelative} (${from}) imports ${spec} (${to})`);
        }
      }
    }
    expect(
      violations.sort(),
      'imports must run main → app → ui → io → core; an upward import reverses the documented arrow',
    ).toEqual([]);
  });

  it('keeps app/ a composition root that owns no state store', () => {
    const owning: string[] = [];
    for (const full of sourceFiles(join(srcRoot, 'app'))) {
      const text = readFileSync(full, 'utf8');
      if (/from\s*['"]zustand/.test(text) || /\bcreate(WithEqualityFn)?\s*</.test(text)) {
        owning.push(rel(full));
      }
    }
    expect(
      owning.sort(),
      'a store UI components call belongs under ui/; app/ composes, it does not own state',
    ).toEqual([]);
  });
});
