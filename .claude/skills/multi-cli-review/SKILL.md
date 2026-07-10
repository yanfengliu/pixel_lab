---
name: multi-cli-review
description: Use when running the multi-CLI (Codex + Claude) adversarial code review on high-risk changes or full-codebase audits — routes to the fleet-canonical runbook (pins, commands, output extraction, failure modes) plus pixel_lab-specific notes.
---

# Multi-CLI review — pixel_lab stub

**Read the fleet-canonical runbook now:** `../loop-ops/docs/skills/multi-cli-review.md` — current review model pins (the fleet's single bump site), exact CLI commands, `-o` output extraction, Windows gotchas, and failure modes. Do not act from memory of an older per-repo copy of this skill.

pixel_lab-specific notes:

- Reviewer pin sites in scripts: NONE (verified 2026-07-10 — the repo has no `scripts/` directory and its `package.json` scripts carry no reviewer CLI invocations; replace this bullet if a grep ever finds hard-coded reviewer models).
- Capture home: fleet default `tmp/review-runs/<objective>/<date>/<iteration_number>/` (never staged; cleaned up after synthesis) — no repo override.
