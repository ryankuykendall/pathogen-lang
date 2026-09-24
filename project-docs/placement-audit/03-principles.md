# 03 — The model we should have had

One model, argued. Alternatives are noted where they were rejected and why.

## Start from what already works

Two ideas in the current surface are stated consistently and are worth keeping. They are the
grain to build with, not against.

**Ink vs. pen.** `draw()` seats the ink at the pen; `drawTo(x, y)` seats the ink at `(x, y)`.
Stated on four pages with no contradiction (`path-blocks.md:88`, `variable-offset.md:154`,
`path-queries.md:278`, `subscriptions.md:137`).

**The receiver decides.** A PathBlock has no position; a ProjectedPath does; the result
follows the receiver. Stated three times (`path-queries.md:36`, `variable-offset.md:169`,
`path-blocks.md:316`).

Nothing below replaces either. The failure is not that these are wrong — it is that a third
state was smuggled in underneath them and never named.

## The root cause: the unnamed third state

"A PathBlock has no position" is false. A PathBlock whose command list starts with `m dx dy`
**does** have a position — it just expresses it as an offset from wherever the pen happens
to be. Call it a **positioned block**.

Positioned blocks are produced by `cut`, `dash`, `.contours`, `fromGlyph`, and by any
`@{ m … }` literal. They behave correctly when drawn from `(0,0)` and silently shift by the
cursor otherwise:

```
box.cut(knife)[0]  drawn from M 0 0   → lands at (250, 300)   correct
                   drawn from M 40 40 → lands at (290, 340)   silently wrong
```

Every placement bug in `05-defects.md` traces back to this state being unnamed:
- D1 (defs emit invalid SVG) — a normalized block has no `m` to serialize, so `d` has no moveto.
- ISSUE-015 (invisible layers) — same cause, in layers instead of defs.
- The cut-piece shift — a positioned block drawn from a non-origin cursor.
- The `drawTo` split — it anchors the *frame* on a block and the *ink* on a projection,
  which are the same point only when the block is not positioned.

Ryan named this in `project-docs/cutting-room/` on 2026-08-24 — "PathBlocks are entirely
relative, so users have no easy way to return to the origin … a mechanism for the user to
re-orient themselves within the context of the current PathBlock" — and the fix was recorded
as "RESOLVED-BY-BYPASS". The bypass added `ProjectedPath.draw()` and left the state unnamed.

## The principles

### P1 — A value either has a position or it does not. There is no third state.

The positioned block must be either promoted or eliminated:

- **Promote:** a block that carries a leading `m` is really a projection with an implicit
  origin of `(0,0)`. Make `cut`/`dash`/`contours` on a projected receiver return
  ProjectedPaths (which is what P3 says anyway), and the state disappears for those.
- **Eliminate:** for the `@{ m … }` literal, the leading move is authored intent and should
  stay — but then `draw()` on such a block is cursor-dependent *by construction* and P5
  applies.

The point is that "does this value have a position?" must be answerable by looking at its
type, not at whether its first command happens to be a move.

### P2 — Position is never silently discarded.

Any operation that re-bases exposes the removed translation on its result, so

```
result.drawTo(result.anchor.x, result.anchor.y)
```

is always an identity. `variableOffset` already satisfies this. `subPath`, `segment` and
`reverse` do not: they discard the position with no way back from the returned value.

This is the cheapest principle to adopt — it is additive, it breaks nothing, and it turns
ISSUE-025 from a question about return types into a one-line answer: **`subPath` may keep
returning a PathBlock, provided it carries `anchor`.**

*Rejected alternative:* "re-basing operations should just not re-base." That would be a
larger break and would lose the genuinely useful free-floating result — the thing
`toPathBlock` exists to provide.

### P3 — The receiver decides the result type.

ProjectedPath in → ProjectedPath out, unless changing the kind is the method's whole purpose
(`draw`, `drawTo`, `project`, `toPathBlock`). Violated today by `subPath`, `union`,
`difference` and `cut`, all four of which are *declared* as returning a ProjectedPath.

This is the principle that makes the surface learnable: one rule replaces four exceptions,
and the declarations become true instead of aspirational.

### P4 — A space conversion is explicit, or it is an error.

Today, handing a value to something that expects a different space silently reinterprets the
numbers. A page-space path appended to a `Marker` is read as marker-viewBox coordinates and
renders nothing. A query on a transformed layer answers in a space that is not on screen.

Where a conversion exists, require it. Where none exists (spaces 3–6 in `01-spaces.md`),
either write one or reject the value with a message that names both spaces. Silence is the
one option that should be off the table.

### P5 — Accidental placement is an error, not a shift.

Drawing an origin-dependent value from a non-origin cursor should warn. Emitting path data
with no leading moveto should warn — it is invalid SVG and the browser discards it. Both are
currently silent, and both have cost real debugging time (ISSUE-015: "48 halo-stroke layers
compiled cleanly and were invisible").

The project already has the mechanism: `warn()` with a code, and `--strict` to promote it.

## How the five conventions grade

| Convention | P1 | P2 | P3 | Verdict |
|---|---|---|---|---|
| Keeps page position (most ProjectedPath transforms) | ✅ | n/a | ✅ | **conformant** — this is the target |
| Discards, recoverable via `anchor` (`variableOffset`) | ✅ | ✅ | ✅ | **conformant** |
| Discards, recoverable via receiver (`toPathBlock`) | ✅ | ✅ | exempt | **conformant** — the kind change is the point |
| Discards, **unrecoverable** (`subPath`, `segment`, `reverse`) | ✅ | ❌ | ❌ on a projection | **violating** |
| Position as a leading `m` (`cut`, `dash`, `contours`) | ❌ | — | ❌ on a projection | **violating — the root cause** |

## What adopting this costs

Nothing in P2 or P5 is breaking: both are additive (a new member, a new warning). P3 is the
breaking one — four methods would change their return type — and P1 follows from P3 for the
derived cases. `04-violations.md` costs each individually against published samples, byte
snapshots and tests.

The honest summary: **most of the value is in P2 and P5, and neither breaks anything.**
P3 is the one that makes the surface teachable, and it is the one that needs a version
decision.
