# Writing Voice & Audience Positioning

Generalizing the audience/voice positioning authored for the stdlib primers
(`project-docs/stdlib-primers/README.md`) into the project's shared writing
guidelines, and leaning the website's copy surfaces into that positioning.

## Provenance

The stdlib primer series (hash01 → noise2, 2026-08) was written for
"experienced programmers **without** a formal CS background or deep math",
with jargon translated into mechanical sentences on first use and examples
that climb from a bare picture to a finished composition. That positioning
lived only in the primer collection's internal README — invisible to authors
and reviewers, who had independently flagged the missing-audience gap on at
least four posts (textblock and pathblock review rounds).

An older internal framing ("Pathogen targets designers and SVG authors, not
systems programmers", `project-docs/enums-and-booleans/primer-v1.md:148`) was
reconciled with the primer framing into a single statement: **people who
build things with code — working developers, designers who code, creative
coders — with no formal CS background or deep math assumed.**

## Artifacts

- [01-implementation-plan.md](01-implementation-plan.md) — the approved plan (2026-08-08)
- [02-agentic-review-synthesis.md](02-agentic-review-synthesis.md) — 4-persona review of the guideline + copy, with per-finding dispositions (2026-08-08)
- [deferred-opportunities.md](deferred-opportunities.md) — website surfaces identified but deliberately not changed yet
- Canonical guideline (shipped): `website/guidelines/voice-and-audience.md`

## Decisions of record

- **Scope**: user-facing writing only (`docs/`, `website/blog/`, website
  SSR/marketing copy). `project-docs/` and internal writing are explicitly
  out of scope.
- **New writing only**: no retroactive rewrite of existing docs or posts;
  the guideline carries an adjacency caveat for tonal seams.
- **Root `.claude/CLAUDE.md` deliberately not edited**: it carries no
  guideline links today; the author-facing load paths (`docs/CLAUDE.md`,
  `website/CLAUDE.md`, `website/blog/CLAUDE.md`) are wired instead, avoiding
  a fourth drift-prone link list.
