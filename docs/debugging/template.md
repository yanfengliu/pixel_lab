# Debugging session — <short title>

Copy this file into `docs/debugging/<YYYY-MM-DD>-<slug>.md` at the start of a new
debugging session. Iterate on it as you investigate. Write learnings into
`docs/learning/lessons.md` when the session is resolved. Clean up any dump files
created during the session, but keep this `.md` file.

## Symptom
What the user or a test is observing. Include the exact error message, fixture
seed, command, or steps to reproduce.

## Expected vs actual
- Expected: ...
- Actual: ...

## Reproduction
- Commands / URL / seed used to reproduce reliably.
- Any temporary instrumentation added (remove before closing the session).

## Hypotheses
List candidate root causes in priority order. Note what would confirm or rule out
each one. Keep this list pruned as hypotheses are disproved.

- [ ] Hypothesis 1 — how to confirm, what it would imply.
- [ ] Hypothesis 2 — ...

## Investigation log
Chronological notes. Prefer concrete observations over guesses.

- YYYY-MM-DD HH:MM — ...

## Root cause
Single-sentence summary once you are confident.

## Fix
What changed, which files, and why this specific fix addresses the root cause
rather than the symptom.

## Verification
- Commands run (full gate: `npx vitest run`, `npx tsc --noEmit`, `npx vite build`).
- Browser tests if relevant: `npm run test:browser`.
- Any new regression tests added.

## Follow-ups
- Engine-level gaps worth flagging in `docs/engine-feedback/current.md`.
- Lessons to persist in `docs/learning/lessons.md`.
- Architecture implications, if any.
