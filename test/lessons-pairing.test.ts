import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `docs/learning/lessons.md` is a staging area, not a destination. A lesson lands there the
 * session it is learned and leaves the moment it becomes a gate — the prose is deleted in the
 * same commit as the test, lint rule, or fixed command that replaces it, because knowledge
 * enforced by a machine does not need a reader to remember it. An index that only grows is a
 * list of things that failed to graduate, charged to every session as reading.
 *
 * So empty is the healthy steady state here, and these checks are shaped for that: the split
 * between the one-line index and its evidence entries has to hold whenever it is populated,
 * without an empty file reading as broken.
 */

const learning = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'learning');
const indexPath = join(learning, 'lessons.md');
const evidencePath = join(learning, 'lessons-evidence.md');

/**
 * GitHub's heading-anchor algorithm: lowercase, drop punctuation, and each space becomes its
 * own hyphen so `a - b` yields `a---b`. Matching it exactly is the point — an anchor this
 * accepts but GitHub renders differently is a dead link the test would call healthy.
 */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-');
}

function indexAnchors(text: string): string[] {
  return [...text.matchAll(/\[evidence\]\(lessons-evidence\.md#([^)]+)\)/g)].map((m) => m[1]!);
}

function evidenceSlugs(text: string): string[] {
  // The preamble carries a fenced entry template whose heading is not an entry.
  const body = text.replace(/^```[\s\S]*?^```/gm, '');
  return [...body.matchAll(/^## (.+)$/gm)].map((m) => slug(m[1]!));
}

const readIndex = () => readFileSync(indexPath, 'utf8');
const readEvidence = () => readFileSync(evidencePath, 'utf8');

describe('lessons index and evidence stay in step', () => {
  /**
   * Verify the instrument before trusting the measurement. Every check below is a set
   * difference or an emptiness comparison, and all of them pass trivially against a parser
   * that reads nothing — which is exactly what a parser silently broken by a formatting
   * change looks like. Pin the parsers to a fixture instead of to the live files, so they
   * stay proved once the staging area is empty.
   */
  it('parses rules and entries out of a well-formed sample', () => {
    const sampleIndex = [
      '## Rules',
      '',
      '- Some durable rule ([evidence](lessons-evidence.md#some-durable-rule--2026-01-01))',
      '',
    ].join('\n');
    const sampleEvidence = [
      '```',
      '## <short title> — YYYY-MM-DD',
      '```',
      '',
      '## Some durable rule — 2026-01-01',
      'Context: something happened.',
      '',
    ].join('\n');

    expect(indexAnchors(sampleIndex)).toEqual(['some-durable-rule--2026-01-01']);
    // The fenced template heading must not be read as an entry.
    expect(evidenceSlugs(sampleEvidence)).toEqual(['some-durable-rule--2026-01-01']);
    expect(indexAnchors('no rules here')).toEqual([]);
  });

  it('points every rule at an evidence entry that exists', () => {
    const known = new Set(evidenceSlugs(readEvidence()));
    const dangling = [...new Set(indexAnchors(readIndex()))].filter((a) => !known.has(a)).sort();
    expect(dangling, 'lessons.md links to headings that do not exist in the evidence file').toEqual([]);
  });

  it('points at least one rule at every evidence entry', () => {
    const linked = new Set(indexAnchors(readIndex()));
    const stranded = [...new Set(evidenceSlugs(readEvidence()))].filter((s) => !linked.has(s)).sort();
    expect(stranded, 'evidence entries no rule points at will never be read').toEqual([]);
  });

  /**
   * A lesson is one rule plus one entry, added together and deleted together. Both files
   * empty is the healthy end state; both populated is work in progress. One of each is a
   * half-finished edit — and the two set-difference checks above cannot see it, since an
   * empty side strands nothing and dangles nothing.
   */
  it('empties or populates the two halves together', () => {
    const rules = indexAnchors(readIndex()).length;
    const entries = evidenceSlugs(readEvidence()).length;
    expect(
      rules === 0,
      `lessons.md holds ${rules} rule(s) and lessons-evidence.md ${entries} entry(ies); a lesson is both halves or neither`,
    ).toBe(entries === 0);
  });

  it('keeps the index short enough to actually read at session start', () => {
    const lines = readIndex().split('\n').length;
    // Length is the thing that decides whether a session-start file gets read at all. Retire
    // lessons that have become gates rather than raising this ceiling.
    expect(lines).toBeLessThanOrEqual(120);
  });
});
