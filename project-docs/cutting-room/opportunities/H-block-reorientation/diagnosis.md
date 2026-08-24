# Item H (log #6) — reframed by user diagnosis (2026-08-24)

User's diagnosis, recorded verbatim in intent: PathBlocks are entirely
relative, so users have no easy way to return to the origin or to other
specific points in coordinate space without manually tracking the pen
position. What we are seeking is a mechanism for the user to
**re-orient themselves within the context of the current PathBlock**.
Candidate shapes the user floated: `returnToOrigin()`, or exposing the
delta on the block's ctx (`m ctx.origin.dx ctx.origin.dy`).

Assessment (agreed, with one refinement): the diagnosis names the true
root of log #6 — the knife-chaining arithmetic bugs were pen-position
bookkeeping that the language forced onto the author. Item B
(draw/startPoint) shares the same deeper root (the relative model plus
origin bookkeeping) but lives OUTSIDE the block — its minimal fix
(ProjectedPath.draw()) is orthogonal and stays scoped as Item B.

Implementation facts gathered:
- Uppercase commands inside @{} are explicitly rejected today with
  "Absolute path command 'M' is not allowed inside path blocks. Use
  lowercase 'm'" — the syntax slot is cleanly reserved, so block-local
  absolute `M` (absolute in the block's own frame) is available without
  ambiguity.
- In-block `ctx.position` is deliberately frozen at (0,0) (cursor
  gotchas memory), so the ctx-based variant requires unfreezing /
  adding a block-local ctx with a live cursor — a bigger semantic step.
- `cut([k1, k2, ...])` remains complementary (composition rather than
  re-orientation) and is a 7-line validation-site change per the
  implementation-site report.

Mechanism candidates for the collaboration round (side-by-side in the
summary to come): block-local absolute M/L/etc; returnToOrigin() /
moveToOrigin(); live block ctx with origin/position deltas; cut(array)
composition. Not mutually exclusive.
