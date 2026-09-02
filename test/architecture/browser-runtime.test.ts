import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `Buffer` is a Node global. Vite does not polyfill it, so code that reaches for the global
 * runs fine under vitest and throws `ReferenceError: Buffer is not defined` in the production
 * bundle — a failure the entire unit suite is structurally blind to, because the suite is the
 * Node runtime the code is accidentally depending on. Green tests are not evidence here.
 *
 * So: any module under `src/` that names `Buffer` must either import it from the `buffer`
 * npm package (which bundles for the browser), or feature-detect it with `typeof Buffer` and
 * carry a real fallback. And `buffer` must stay a runtime dependency — demoting it to
 * devDependencies breaks the bundle while every test still passes.
 *
 * This is a source rule, not a runtime one: it proves nothing about the built bundle, only
 * that no module depends on the global. Stubbing the global away at runtime is not available
 * as a check — vitest's own worker uses `Buffer`, so removing it takes down the harness.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcRoot = join(repoRoot, 'src');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function rel(full: string): string {
  return relative(repoRoot, full).split('\\').join('/');
}

/**
 * Blank out comments — and, when asked, string/template bodies too — so prose mentioning
 * `Buffer` (of which this repo has plenty) is not read as a usage. Replaces with spaces
 * rather than deleting, so nothing downstream depends on offsets shifting.
 *
 * The two modes exist because the import specifier `'buffer'` is itself a string: blanking
 * strings before looking for the import makes every compliant file look like an offender.
 */
function strip(text: string, blankStrings: boolean): string {
  const out = text.split('');
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };
  while (i < text.length) {
    const c = text[i]!;
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === "'" || c === '"' || c === '`') {
      let k = i + 1;
      while (k < text.length) {
        if (text[k] === '\\') k += 2;
        else if (text[k] === c) break;
        else k++;
      }
      if (blankStrings) blank(i + 1, k);
      i = k + 1;
    } else {
      i++;
    }
  }
  return out.join('');
}

/** Code with comments and string bodies gone — for finding real `Buffer` usages. */
function stripCommentsAndStrings(text: string): string {
  return strip(text, true);
}

/** Code with comments gone but strings intact — for finding import specifiers. */
function stripComments(text: string): string {
  return strip(text, false);
}

/** `Buffer` as its own identifier — not `ArrayBuffer`, `previewBuffer`, or `x.buffer`. */
const BUFFER_IDENT = /(?<![\w.$])Buffer\b/;

function importsBufferPackage(code: string): boolean {
  return /import\s*\{[^}]*\bBuffer\b[^}]*\}\s*from\s*['"]buffer['"]/.test(code);
}

function featureDetectsBuffer(code: string): boolean {
  return /typeof\s+Buffer\s*(!==|===)\s*['"]undefined['"]/.test(code);
}

describe('browser runtime: no reliance on the Node Buffer global', () => {
  /**
   * Verify the instrument. The scan below is a "no offenders" check; a stripper that blanked
   * the whole file, or a regex that matched nothing, would report health forever.
   */
  it('tells a real Buffer usage apart from prose and lookalike identifiers', () => {
    const prose = stripCommentsAndStrings(
      `// Native Node Buffer cannot be assumed in the browser.\nconst s = "Buffer.from is nice";\n/* Blob's types require ArrayBuffer */\n`,
    );
    expect(BUFFER_IDENT.test(prose)).toBe(false);

    const lookalikes = stripCommentsAndStrings(
      `const b = new ArrayBuffer(4);\nconst v = img.data.buffer;\nfunction ensurePreviewBuffer() {}\n`,
    );
    expect(BUFFER_IDENT.test(lookalikes)).toBe(false);

    const real = stripCommentsAndStrings(`const b = Buffer.from(bytes);\n`);
    expect(BUFFER_IDENT.test(real)).toBe(true);

    expect(importsBufferPackage(`import { Buffer } from 'buffer';`)).toBe(true);
    expect(importsBufferPackage(`import { Buffer } from 'node:buffer';`)).toBe(false);
    expect(featureDetectsBuffer(`if (typeof Buffer !== 'undefined') {}`)).toBe(true);

    // The two strip modes have to cooperate: a compliant file must read as *using* Buffer
    // and as *importing* it, which fails if one specifier-bearing string got blanked.
    const compliant = `import { Buffer } from 'buffer';\nconst b = Buffer.from(x);\n`;
    expect(BUFFER_IDENT.test(stripCommentsAndStrings(compliant))).toBe(true);
    expect(importsBufferPackage(stripComments(compliant))).toBe(true);
  });

  it('scans a non-empty set of source files', () => {
    expect(sourceFiles(srcRoot).length).toBeGreaterThan(20);
  });

  it('sources Buffer from the buffer package or guards on its absence', () => {
    const offenders: string[] = [];
    for (const full of sourceFiles(srcRoot)) {
      const text = readFileSync(full, 'utf8');
      if (!BUFFER_IDENT.test(stripCommentsAndStrings(text))) continue;
      const withStrings = stripComments(text);
      if (importsBufferPackage(withStrings) || featureDetectsBuffer(withStrings)) continue;
      offenders.push(rel(full));
    }
    expect(
      offenders.sort(),
      "Buffer is a Node global Vite does not polyfill: import it from 'buffer', or guard on typeof Buffer",
    ).toEqual([]);
  });

  it('keeps the buffer polyfill a runtime dependency, not a dev one', () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(
      Object.keys(pkg.dependencies ?? {}),
      'the browser bundle imports `buffer` at runtime; in devDependencies it is missing from the build',
    ).toContain('buffer');
  });
});
