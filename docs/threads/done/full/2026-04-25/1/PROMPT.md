You are a senior code reviewer conducting a FULL-REPO audit of the pixel_lab pixel-art editor (TypeScript / React / Vite / Vitest, browser-only).

Read the source tree (`src/`), architecture docs (`docs/architecture/ARCHITECTURE.md`, `docs/architecture/decisions.md`, `docs/architecture/drift-log.md`), the latest devlogs (`docs/devlog/summary.md` plus the most recent file under `docs/devlog/detailed/`), `docs/learning/lessons.md`, the design specs in `docs/superpowers/specs/`, and `package.json`. Data model and one-way module boundaries (`app → ui → io → core`) are documented in ARCHITECTURE.md.

This is iteration 1 of a multi-iteration review — no prior `REVIEW.md` to consider.

Flag findings under these themes:

1. **Design** — scalability, debuggability, modularity, leanness, layer-boundary violations, god classes, premature abstractions.
2. **Test coverage** — gaps, weak assertions, missing coverage on critical paths (slicing, packing, manifest, drawing tools, undo/redo, FrameRef integrity).
3. **Correctness** — bugs, race conditions, edge cases, error handling, off-by-ones, lifecycle issues, event handler leaks.
4. **Cleanliness** — typing (`any`, unsafe casts), dead code, duplicated logic, memory leaks (canvases, listeners, large bitmaps), naming, prefer composition over inheritance.
5. **Documentation** — drift between code and docs, outdated comments, missing rationale for non-obvious decisions, stale KAD references.

Constraints:

- **DO NOT** modify any files. **DO NOT** propose unified-diff patches. Output findings only — explanations and non-prescriptive suggestions in plain text/markdown.
- Be concrete: cite `path/to/file.ts:LINE` whenever you can.
- Distinguish *real* issues from style preferences. If unsure, mark as NIT.
- Don't rehash items already listed under "Known follow-ups" in `docs/devlog/summary.md` unless you have a sharper take or new severity.

Output strict Markdown in this shape:

```
# Review Summary

(2–4 sentence overall impression: what's healthy, what's most concerning.)

# Findings

- **[SEVERITY] Short title** — `relative/path.ts:LINE`
  - **Issue:** what is wrong (one or two sentences)
  - **Why it matters:** concrete impact (correctness, perf, maintainability, etc.)
  - **Suggestion:** direction, not a patch

…repeat per finding, ordered by severity within each theme heading…

## Design
## Test coverage
## Correctness
## Cleanliness
## Documentation

# Cross-cutting observations

(Optional. Patterns that span multiple files.)
```

Severity bins: **BLOCKER** (broken or unsafe — must fix), **MAJOR** (should fix soon), **MINOR** (worth fixing), **NIT** (cosmetic).

Be thorough. Be honest. Disagreement with current implementation choices is welcome if you can justify it.
