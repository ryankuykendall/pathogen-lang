# BACKLOGGED (2026-08-01): contour.startPoint fix-plus-audit

Deferred by Ryan before the final design decision. The `offset.anchor` feature from this plan file's earlier version shipped in commit `8c766a8`. Everything below preserves the completed audit so this can be picked up without re-exploration.

## Problem

`PathBlockValue.startPoint` is hardcoded `{x:0,y:0}` at ~49 construction sites while commands may keep off-origin coordinates. Git archaeology (`172a50b`, Feb 2026): the day-one type comment `types.ts:580` — `// origin (always 0,0 unless path begins with m)` — specified an `m` exception that was never implemented, then the idiom was copied forward. Not a deliberate invariant.

## Correct definition (settled by audit)

**startPoint = first inked point**: walk the leading run of `m` commands, take the last one's `.end`; otherwise `commands[0].start`. This is the only definition that:
- fixes `.contours` (contour N's leading `m` has a STALE `start` = contour N−1's last point; `commands[0].start` would be a different lie),
- matches the serializer's pen-landing math (`walkRelative` + `bridgeOriginGap`, path-data.ts:189-260),
- matches the original spec comment, and makes "get(0) returns startPoint" (path-blocks.test.ts:517) true.

## Audit results (two Explore agents, complete)

**Lying producers** (all pass `{x:0,y:0}` to `buildPathBlockFromCommands`, index.ts:957 / annotated.ts:419; the no-arg auto-rebase branch is dead code): `.contours` (index 5546 / annotated 3691 — the reported bug), `fromGlyph` (5128 / 2949), `TextBlock.toPathBlock` (3793), boolean ops (2958, 3450 — clipper emits leading `m` with `start:(0,0)`, `end:first vertex`), fillet/chamfer family + `<<` + `scale` inherit input space. `@{}` literals with leading `m` also lie under the first-inked-point definition (index 1806 / annotated 3481). Honest (self-rebasing): reverse, offset, mirror, rotateAtVertexIndex, subPath, segment/segmentAll, variableOffset/compound.

**Readers that are load-bearing GEOMETRY** (emitted d changes for off-origin blocks): `ProjectedPath.drawTo` offset (index 3043-3044 / annotated 1868-1869), `PPV.mirror` pivot (3247 / 1416), `PPV.scale` anchor (3282 / 1499). Everything else is metadata (draw/drawTo/project propagate `obj.startPoint + origin` — auto-corrected by upstream fix; property access index 5526; formatValue 5409).

**OPEN DECISION (blocked here)**: should the truthful startPoint flow into PPV drawTo/mirror/scale (recommended: one coherent rule, matches documented "mirror line through startPoint"; changes emitted d only for off-origin blocks), or should a separate internal origin field preserve today's output exactly?

**Zero existing tests break** (all fixtures on-origin; only `m 0 0` literals in suite). **Zero tests cover the flipping blocks** — must add: `.contours[i].startPoint` (glyph space), `@{ m 10 10 ... }.startPoint == (10,10)`, boolean-op result, fillet-shifted closed path, PPV.drawTo off-origin semantics. Rename six "startPoint is always (0,0)" test names (path-blocks.test.ts:98, 979, 1253, 1377, 1477, 1608).

**Doc/type fixes**: docs/path-blocks.md:92 ("Always `Point(0, 0)`" — the one wrong line), types.ts:580 comment. pathogen-api.ts:667/1036 already say "First point" — become true, no edit.

**Adjacent pre-existing bugs found**: (1) copy-paste `endPoint: {...original.startPoint}` in empty-commands ProjectedPath builder (index 993-994 / annotated 1716-1717) — should be `original.endPoint`. (2) annotated draw/drawTo omit `bridgeOriginGap` (annotated 1768, 1797) unlike main (index 2294, 2328). (3) annotated boolean ops rebase to origin while main keeps world coords (buildAnnotatedResult 1728-1729 vs index 2958) — evaluator divergence.

**Suggested implementation**: `firstPointOf(cmds)` helper next to `buildPathBlockFromCommands` in both evaluators; use it in `buildPathBlockFromCommands`, `@{}` literal, `<<`, `scale`, and `buildProjectedPathFromCommands`; self-rebasing constructors provably yield (0,0) and can stay or route through the helper for uniformity.
