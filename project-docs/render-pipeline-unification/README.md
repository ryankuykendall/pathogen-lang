# Render Pipeline Unification

Internal feature directory for the work that collapses Pathogen's three independent SVG rendering implementations into a shared module with thin adapters. Started 2026-04-21 in response to repeated drift incidents in the Marker feature.

This directory is **internal** (per `.claude/CLAUDE.md` → [`docs/` vs `project-docs/`](../../.claude/CLAUDE.md#docs-vs-project-docs)). User-facing documentation about the architecture — if it ends up warranting any — would live in `docs/`. Everything here is for contributors working on the refactor.

## Contents

- [`PLAN.md`](./PLAN.md) — the phased implementation plan (authoritative)
- [`DESIGN.md`](./DESIGN.md) — `VNode` shape, `src/render/` API surface, GPU gradient decoration pattern, `data-*` attribute preservation table
- [`RATIONALE.md`](./RATIONALE.md) — why this refactor exists: the Marker incident chain, the Three-Surface Parity policy, and what the failure modes have been historically
- [`snapshots/`](./snapshots/) — representative `.pathogen` fixture programs consumed by `tests/render-snapshots.test.ts` and `tests/render-dom-snapshots.test.ts` to pin output across the refactor

## Status

Planning complete; Phase 0 work not yet started. Track progress in the PLAN.md phase headers and in the git log (commits in this feature area will reference the phase in the message).

## Related artifacts

- `.claude/CLAUDE.md` → **Three Surfaces: CLI, Playground, VS Code** section (commit `c4d38dc`) — policy this refactor enforces structurally
- `project-docs/developer-experience/cross-system-feature-lifecycle.md` → **Three-Surface Parity Principle** + **Adding a New Constructor Type** checklist — gets simplified once the parity test exists
- `project-docs/svg-markers/` — the feature whose drift incidents prompted this refactor
