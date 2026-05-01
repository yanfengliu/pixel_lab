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
- Commands run (full gate: `npm test`, `npm run typecheck`, `npm run build`).
- Manual browser smoke if the bug touches the drawing flow: `npm run dev` in one terminal, then `npm run smoke` (Playwright; expects the dev server at 127.0.0.1:5173).
- Any new regression tests added.

## Follow-ups
- Lessons to persist in `docs/learning/lessons.md`.
- Architecture implications, if any (update `docs/architecture/ARCHITECTURE.md` and append to `docs/architecture/drift-log.md`).
