# full

Status: legacy
Owner: Unknown (historical record; original ownership remains in the imported records)
Created: Unknown (historical record; the allocated ID records migration order)
Updated: 2026-10-28

## Problem and outcome

This entry groups the existing records for full. The imported documents retain the authored plans, findings and outcomes. This migration makes no new implementation or approval claim.

## Scope

- [docs/threads/done/full/2026-04-25/1/PROMPT.md](historical/threads/done/full/2026-04-25/1/PROMPT.md)
- [docs/threads/done/full/2026-04-25/1/raw/claude.md](historical/threads/done/full/2026-04-25/1/raw/claude-report.md)
- [docs/threads/done/full/2026-04-25/1/raw/codex.md](historical/threads/done/full/2026-04-25/1/raw/codex.md)
- [docs/threads/done/full/2026-04-25/1/raw/gemini.md](historical/threads/done/full/2026-04-25/1/raw/gemini.md)
- [docs/threads/done/full/2026-04-25/1/REVIEW.md](reviews/0_legacy.md)

## Approach

Preserve existing work-unit grouping and every imported source. Review numbers use deterministic natural source-path order; the original paths retain the previous dates, stages and round identities. Unknown cross-stage timing is not presented as chronology.

## Acceptance criteria

- Preserve substantive source text and dissent.
- Record source provenance and verify imported file digests.
- Repair local Markdown link targets whose location changed.

## Implementation steps

The original planning documents linked above contain the historical implementation steps. This migration imported and checked their files; it did not repeat or approve the original work.

## Outcome

Historical records imported. Their completion, reviewer coverage, verification and unresolved findings remain as originally stated. No new review occurred.

2026-10-28: the imported `raw/claude.md` is renamed `raw/claude-report.md`, its bytes and digest unchanged. On a case-insensitive disk the old name is `CLAUDE.md`, which Claude Code loads as project instructions for any session that reads a file in that folder (fleet work unit 21). The link targets in Scope and in `reviews/0_legacy.md` follow the rename and the link texts keep the original names. The registry's digest for `reviews/0_legacy.md` is now that of its edited bytes; it was `eb78a2688d95cd63a0cf64894dbfd2aea46269db1545cb660baea17c5fe762b0`.
