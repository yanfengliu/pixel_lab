# AGENTS.md — pixel_lab

## What this is

Browser-based tool for slicing 2D pixel-art sprite sheets and animated GIFs into game-ready animation frames, with built-in pixel drawing tools.

Engine-agnostic export: atlas PNG + JSON manifest + per-frame PNGs bundled as a ZIP; projects save and reopen as self-contained `.pixellab.json`. Runs entirely in the browser — files never leave the machine.

Stack: Vite + TypeScript + React + Zustand + Vitest.

<!-- FLEET-CANON:BEGIN sha=66d32a789510 generated from ../fleet/FLEET.md by `npm run sync-canon` — do not edit inside this block; this repo's own rules go in docs/policies/local-rules.md -->
## Fleet constitution

- Work headlessly by default. If only a browser or GUI can finish or verify the task, say why.
- You are not the only writer in the worktree: your own subagents commit, and a stash may predate you. Commit by explicit pathspec (`git commit -- <files>`), never `git commit -a`, `git add -A`, or `git add .` followed by a bare commit, and never `git stash pop` — the stash on top is often not yours. (voxel c024b33.)
- Commit each verified unit of change to `main` without being asked, and push. Gates pass before any commit that touches code; a dependency change re-runs the audit gate.
- Toolchain baseline is Node 24. A repo that must keep an older major says so in its Gates section and keeps a CI job proving it.
- Runtime model calls are authorized and already paid for — this fleet has one user, with Claude Code and Codex subscriptions — so a program here may call a model at runtime, vision included.
- The top reasoning tier is rationed: spend it only on the hardest problem, or on directing the workhorse tier that does the work — and only at maximum effort or orchestration.
- High-risk work — persistence/migrations, security/auth, concurrency, money, supply chain, edits that reach sibling repos — escalates to the multi-cli-review skill. That is a review you run yourself, not permission you ask the user for; nothing in this canon requires asking.
- Error messages are a product surface: audit them as a class, including paths the task did not touch. Each names what happened, which input caused it, and what would satisfy it — context the throw site holds for free and a reader can only buy back by running it again. That detail is what closes the loop: a bare `Validation failed` turns an already-diagnosed failure into a debugging session.
- When blocked, hand over the raw artifact — screenshot, rendered page, log line, data row — as soon as the blocker is named rather than after the analysis: your description of it is filtered through the misunderstanding that caused the block, so it cannot contain what you failed to notice.
- Task-run evidence lives only under ignored paths and is deleted once nothing active needs it; it enters Git only when review promotes it into a repository input — a fixture, golden, snapshot, or contract. Tracked docs keep conclusions and provenance only. Blob ceilings for anything promoted: over 256 KiB needs a stated reason, over 512 KiB binary or 1 MiB of anything never enters ordinary Git, and an asset store or LFS needs the user's approval.
- Write prose one line per paragraph (no hard wrapping).
- Keep a devlog: one short dated line per behaviour-changing session in `docs/devlog/summary.md`, newest first, and a section in `docs/devlog/detailed/` for anything a later session could trip over — what was believed and proved false, what a reviewer caught that the author missed, what number moved and from what. Both shapes are in `../fleet/docs/devlog-template.md`. It is history, not status: the repo's design docs hold the current position. Write it because the alternative is rediscovering your own dead ends.
- Read `docs/learning/lessons.md` at session start: the one-line index of what this repo has already paid to learn, short by construction, with each entry's war story and anchor in `lessons-evidence.md` — opened only when a rule is in doubt or the work is in that area. A lesson lands the session it is learned, as an entry there plus one line here, anchored to a measurement, commit, or test id; unanchored, it is folklore. When a lesson becomes a gate — a test, a lint rule, a fixed command — delete both halves, because the machine enforces it now and every line that stays spends the attention that keeps the rest read. Shape: `../fleet/docs/lessons-template.md`.
- Steering compounds: a direction that outlives the immediate task lands that same session — `../fleet/FLEET.md` if fleet-wide, else this repo's `docs/policies/local-rules.md` — and you say where it went.
- Reviewer model pins live only in `../fleet/docs/skills/multi-cli-review.md`; a model a product itself calls is pinned in the repo that calls it. Never hardcode a model ID anywhere else.
<!-- FLEET-CANON:END -->

## Gates

`npm test` · `npm run typecheck` · `npm run build` — all three before every code commit; only affected tests while iterating. There is no lint script; `npm run smoke` (drawing smoke test) exists as an extra check. Dependency audit gate: `npm audit --audit-level=high` (full tree and `--omit=dev`).

## Session start

Read `docs/devlog/summary.md` and `docs/architecture/ARCHITECTURE.md` before starting work.

## Invariants & boundaries

- TDD for behavior changes: tests first, testing the contract (app experience and mechanisms), not the code.
- File size: keep every file under 500 LOC (hard ceiling 1000) — split god-objects by lifecycle/role.

## Conventions

- Devlog: `docs/devlog/summary.md` (one line per task; compact past 50 lines) + `docs/devlog/detailed/START_DATE_END_DATE.md` (per-task entry; archive via `git mv` when the active file passes 500 lines, starting a new file dated today).
- Changelog `docs/changelog.md` + `package.json` version (external audience, migration focus): bump `c` per non-breaking change, `b` (reset `c`) per breaking change, `a` only when the user says so; one bump per coherent shipped change; pure refactors/doc sweeps bump nothing.
- Architecture: structural changes update `docs/architecture/ARCHITECTURE.md` and append a row to `docs/architecture/drift-log.md`; non-obvious tradeoffs append to `docs/architecture/decisions.md` (append-only — supersede, never delete); non-structural fixes touch none of these.
- Lessons: `docs/learning/lessons.md` per the fleet evidence-anchor rule; code lessons need a real test node id.
- Review threads: syntheses land in `docs/threads/current/<objective>/<date>/<n>/REVIEW.md` (synthesis only — no raw CLI output; temp captures go to gitignored `tmp/review-runs/`; the legacy iteration under `docs/threads/done/full/` keeps its `raw/` files); move the objective to `docs/threads/done/` when closed.
- Design specs and plans live under `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- README updates when public surface or user-visible features change.
