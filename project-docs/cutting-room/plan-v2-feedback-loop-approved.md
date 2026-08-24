# The Cutting Room Feedback Loop — friction log → language improvements → series updates

## Context

The Cutting Room series (4 posts, 21 samples, reviewed and ready, not yet
committed) produced a 13-entry friction log at
`project-docs/cutting-room/FEATURE-OPPORTUNITIES.md` — bugs, footguns,
missing APIs, and ergonomics gaps hit while applying Pathogen to four real
domains. The user wants to close the loop: address each entry case by
case, and extend the series to tell that story — real-world use exposing
opportunities, the language improving in response. User-approved forks:
**bugs first**, and **each post gains one recurring closing section**
("What this project taught the language") that grows an entry per landed
improvement, with **existing samples upgraded in place** to the new APIs
(before/after shown in the section prose). The user called out the
friction-log methodology itself as valuable — treat it as a repeatable
practice, not a one-off.

## The per-item loop (repeated for every work item)

1. **Rich summary** — I write a deep dive of what was encountered:
   the friction in context (which sample, which domain), the exact code
   path in the language that causes it (anchors from the mapper report),
   the workaround the samples currently use, design options with
   trade-offs, and a recommendation. Delivered in chat AND preserved at
   `project-docs/cutting-room/opportunities/NN-<slug>/summary.md`.
2. **Collaboration** — user reviews; we settle the design (AskUserQuestion
   for genuine forks). Decisions recorded in the same folder
   (`decision.md`), old drafts preserved per artifact convention.
3. **Implementation** — full compiler lifecycle per CLAUDE.md:
   user-facing docs first (`docs/<feature>.md` or section + DOC_FILES if
   new), failing tests, both evaluators (main + annotated parity),
   `pathogen-api.ts` + `generate:completions` where API surface changes,
   three-surface verification, full test suite, code-reviewer agent.
4. **Series update** — upgrade the affected samples in place to the new
   API (recompile, validate, format:samples, BBWP refresh), add/extend
   the post's closing section: what we hit, what we changed, the
   before/after idiom. Content-review the changed prose. check-links.
5. **Commit** — one commit per work item (feature + samples + post
   sections + opportunity artifacts), CHANGELOG entry; push after user
   confirms the item. FEATURE-OPPORTUNITIES.md entry marked resolved
   with the commit hash.

## Work items and order (bugs → cut-API features → ergonomics → docs)

Bundles: A=#11, B=#1+#12, C=#10, D=#2, E=#3, F=#7, G=#8, H=#6, I=#4+#5,
J=#9, K=#13.

| # | Item | What lands (subject to per-item collaboration) | Primary post(s) |
|---|------|-----------------------------------------------|-----------------|
| A | #11 offset direction bug | Fix offsetCommands per-command normal orientation on cut pieces' bowed curves; regression tests from the preserved repro; **lift the published caveat from the garment post** and restore the yoke allowance in the pattern sheet | Garment |
| B | #1+#12 in-place draw / anchor footgun | ProjectedPath gets in-place `draw()` (emits at its own absolute coords); settle drawTo anchor semantics (frame vs first command) with a documented contract; series idiom collapses to `seam.draw()` | All four (core idiom) |
| C | #10 text-if discard | Fix the pre-existing text-statement-inside-if-inside-loop drop (three walkers); tests | Garment (conditional captions become natural) |
| D | #2 pieces.seams() | Group-level seam query on cut results — each physical seam once; kills the ownership-dedupe dance | Papercraft (folds, kit), Stained glass (came) |
| E | #3 outwardNormal | Material-side normal on seam runs (cut knows its winding); kills the flip-by-dot-product dance | Papercraft (tabs) |
| F | #7 cutter label propagation | Opt-in per-stroke seam identity (design TBD: labeled cutter edges → compound labels, or cut option) | Papercraft (mountain/valley folds) |
| G | #8 unmerged runs | Escape hatch for run merging (design TBD: options arg or per-edge iteration) | Papercraft (kit V-run) |
| H | #6 multi-knife composition | `cut([k1, k2, ...])` and/or block concat; kills chained-relative-move knife arithmetic | Papercraft (hex), Jigsaw (grid) |
| I | #4+#5 parser ergonomics | Member access in path args without calc(); `pi` usable in calc (or documented story) | All (code fences simplify) |
| J | #9 dynamic styling | Computed style values / dynamic layer routing (design TBD — largest scope, style-block parser constraints apply) | Jigsaw, Stained glass (round-robin dies) |
| K | #13 docs | Document string ternaries in `${}` + string reassignment in if | Garment cross-ref |

Order within the table is the working order. Each item may be re-scoped,
deferred, or rejected during its collaboration step — the log is a menu,
not a contract.

## Post-section convention

- One `## What this project taught the language` section at the end of
  each post (before "Where to go next"), entries in the order items land.
- Entry shape: 2-3 sentences of the friction as experienced in this
  project → the change made (linked to docs) → before/after fenced
  snippet where the idiom changed. Keep primer voice; state the lesson
  bluntly.
- Series part 1 introduces the convention with one sentence framing the
  series as a working friction log.
- The Cutting Paths post (part 5 of PathBlock series) gets a pointer only
  if an item changes something it documents (e.g. B's draw()).

## Standing infrastructure (first work session, before item A)

- Create `project-docs/cutting-room/opportunities/` with a README
  describing the loop + status table (mirrors FEATURE-OPPORTUNITIES
  entries → item letters → state).
- Commit the current series work first (it is reviewed and ready; the
  improvement commits need a clean base). Staging excludes the
  incidentally-regenerated post13/14/31 SVGs. User already signaled
  intent to review posts; confirm commit readiness at execution start.

## Key implementation anchors

(From the opportunity-mapper exploration — to be appended to each item's
summary.md; headline anchors:)
- ProjectedPath method switch (no 'draw' case) ~src/evaluator/index.ts:3078+;
  drawTo emission via serializeRelativeAndTrack with moveTo.
- offsetCommands in src/evaluator/path-transforms.ts; repro at
  project-docs/cutting-room/repro-offset-direction-bug.pathogen.
- Run merging in src/evaluator/segments.ts; seam stamping + winding
  canonicalization in src/evaluator/boolean-ops.ts.
- Path-arg tokenization in src/parser/path-args-tokenizer.ts + grammar.
- Style-value evaluation (lenient-build/strict-eval) per style-block
  memory; layer() call evaluation for dynamic routing.
- Tests: tests/path-blocks.test.ts, tests/segment-labels.test.ts,
  tests/boolean-ops.test.ts, tests/path-cut.test.ts, tests/annotated.test.ts.
(Full mapper report stored in opportunities/README on execution.)

## Verification (every item)

- Failing test first; full suite green (baseline 4808) before commit.
- `npm run build` + three-surface check for any evaluator/API change.
- Samples: compile:samples → format:samples → validate-samples (0 new
  warnings) → BBWP refresh → build:blog → public sync → check-links.
- Content review (content-reviewer agent) for changed post prose per
  item, batched where items land close together.
- Annotated-evaluator parity tests for any evaluator change.

## First deliverable after approval

Item A (#11 offset direction bug): the rich summary — reproduction
walkthrough, offsetCommands root-cause analysis, fix options (normal
orientation from contour winding vs per-segment side test), test plan,
and the garment-post payoff — delivered for user review before any code.
