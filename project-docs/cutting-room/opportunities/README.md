# The Cutting Room Feedback Loop — opportunity tracker

Friction log entries from FEATURE-OPPORTUNITIES.md, worked case by case:
rich summary → user collaboration → implementation (full compiler
lifecycle, docs first) → series update ("What this project taught the
language" closing sections + in-place sample upgrades) → one commit per
item. Process defined in ../plan-v2-feedback-loop-approved.md.

Each item gets a folder `NN-<slug>/` holding `summary.md` (the rich
deep-dive delivered for review), `decision.md` (the agreed design), and
iteration artifacts (drafts preserved, never overwritten).

## Status

| Item | Log entries | Title | State |
|------|-------------|-------|-------|
| A | #11 | offset() direction flip on cut pieces' curves | next up |
| B | #1, #12 | ProjectedPath in-place draw() / anchor footgun | queued |
| C | #10 | text-if-in-loop discard bug | queued |
| D | #2 | pieces.seams() group query | queued |
| E | #3 | Material-side outwardNormal on seams | queued |
| F | #7 | Cutter label propagation (per-stroke seam identity) | queued |
| G | #8 | Unmerged-runs escape hatch | queued |
| H | #6 | Multi-knife composition (cut([k1, k2]) / concat) | queued |
| I | #4, #5 | Parser ergonomics: member path args, pi in calc | queued |
| J | #9 | Dynamic layer styling / routing | queued |
| K | #13 | Document string ternaries + if-reassignment | queued |

Working order: A → K as listed (bugs → cut-API → ergonomics → docs).
Each item may be re-scoped, deferred, or rejected during collaboration.
