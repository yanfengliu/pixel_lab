# Architecture drift log

Append a row any time the code drifts from ARCHITECTURE.md or a KAD. Each
row either explains the temporary drift and its cleanup plan, or is the
trigger to update ARCHITECTURE.md / decisions.md.

| Date | What drifted | Why | Remediation |
|------|--------------|-----|-------------|
| 2026-04-24 | Initial draft of ARCHITECTURE.md placed the Zustand store in `src/app/` and PNG decoding in `src/io/`, while the first implementation put the store in `src/app/store.ts` and PNG encode/decode in `src/core/png.ts`. | Code-reviewer feedback pointed out the resulting `ui → app` cycle. PNG codec belongs in `core` because it's a pure codec with no DOM dependency and is needed by `core/export` to produce atlas bytes. | Moved store to `src/ui/store.ts`; left PNG in `src/core/png.ts` and updated ARCHITECTURE.md to match. No outstanding drift. |
