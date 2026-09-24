# 03 — The model we should have had

One model, argued. Revised 2026-09-24 after review: the first version claimed a single root
cause and its own evidence contradicted it. See "Two causes, not one" below.

## Start from what already works

Two ideas in the current surface are stated consistently and are worth keeping.

**Ink vs. pen.** `draw()` seats the ink at the pen; `drawTo(x, y)` seats the ink at `(x, y)`.
Stated on four pages with no contradiction (`path-blocks.md:88`, `variable-offset.md:154`,
`path-queries.md:278`, `subscriptions.md:137`).

**The receiver decides.** A PathBlock has no position; a ProjectedPath does; the result
follows the receiver. Stated three times (`path-queries.md:36`, `variable-offset.md:169`,
`path-blocks.md:316`).

Nothing below replaces either.

## The mechanism: one argument decides the whole matrix

`buildPathBlockFromCommands(cmds, origin?)` (`src/evaluator/index.ts:1196`):

```ts
const originX = origin ? origin.x : cmds[0].start.x;   // :1206
```

- **omit** `origin` → subtracts `cmds[0].start` → **re-based, placement destroyed**
- **pass `{x:0, y:0}`** → subtracts nothing → **frame preserved**

So `buildPathBlockFromCommands(cmds, { x: 0, y: 0 })` *preserves* the frame. Reading it as
"put it at the origin" gets it exactly backwards, and that misreading is one character away
from a silent placement bug. Every derived PathBlock in the language is one of these two
spellings; `offset` omits the argument, `dash`/`outline`/`startAt`/`chamfer`/`contours`/
`fromGlyph`/`toPathBlock` pass it. **Nothing enforces a convention** — each new method picks
by hand, and the matrix in `02` is the accumulated result of those coin flips.

This is the most actionable finding in the audit and it is a five-line internal change:
split it into two named constructors, `fromCommandsRebased` and `fromCommandsKeepingFrame`,
so the choice is stated at every call site. See `04-violations.md` V8.

## Two causes, not one

The first draft of this note claimed every placement bug traced to a single unnamed state.
That was wrong, and measurably so. There are **two opposite causes**.

### Cause A — the presence of a leading `m`: cursor dependence

A PathBlock whose command list starts with `m dx dy` *does* have a position — expressed as an
offset from wherever the pen happens to be. Call it a **positioned block**. It is correct
when drawn from `(0,0)` and shifts silently otherwise:

```
box.cut(knife)[0]  drawn from M 0 0   → lands at (250, 300)   correct
                   drawn from M 40 40 → lands at (290, 340)   silently wrong
```

Measured: `dash`, `cut` and `.contours` **inject** this state even from a receiver that has
no leading move — on `@{ h 100 }`, `dash[2].d` is `m 30 0 l 20 0` and `cut[1].d` is
`m 50 0 l 50 0`. So they are producers of it, not merely preservers. `@{ m … }` literals are
the authored case.

Cause A explains: the cut-piece shift, and the `drawTo` split (it anchors the *frame* on a
block and the *ink* on a projection — the same point only when the block is not positioned).

### Cause B — the absence of a leading `m`: invalid SVG

Command lists are not self-contained SVG, and **each serializer independently decides whether
to synthesize a moveto**. `ProjectedPath.d` synthesizes one (`index.ts:6420`);
`PathBlock.draw()` passes no `moveTo` (`:2810`); the four defs appenders call
`commandsToAbsoluteD` (`:4882`, `:4911`, `:4935`, `:4965`), which never synthesizes. So a
block with no leading move serializes to path data with no moveto — invalid SVG, discarded by
the browser.

Measured, and it is the **inverse** of Cause A:

```
m.append(@{ h 40 v 40 h -40 z })     → <path d="H 40 V 40 H 0 Z"/>        invalid
m.append(@{ m 0 0 h 40 v 40 h -40 z })→ <path d="M 0 0 H 40 V 40 H 0 Z"/>  valid
```

The leading `m` is what makes serialization *correct*. That is also why the six defs
byte-snapshot fixtures are clean — `snapshots/03-mask.pathogen:3` authors `@{ m 0 0 … }`.

Cause B explains: D1 (every defs producer) and ISSUE-015 (invisible layers).

### The unifier

**Position is encoded as the presence or absence of a first command, rather than as data.**
Both failure modes follow from that one representation choice: with the move you get cursor
dependence, without it you get invalid output, and nothing about the value's *type* tells you
which case you are in.

The remaining defects (D2, D5, D7, D8, D9) are space and unit bugs with unrelated causes.
They belong in the audit; they do not belong under this heading.

Ryan named the underlying problem in `project-docs/cutting-room/` on 2026-08-24 — "PathBlocks
are entirely relative, so users have no easy way to return to the origin … a mechanism for the
user to re-orient themselves within the context of the current PathBlock" — and the fix was
recorded as "RESOLVED-BY-BYPASS".

## The principles

### P1 — A value's type answers "does this have a position?"

Today it does not: two PathBlocks, one positioned and one not, have the same type and behave
differently under `draw()` and under every serializer. That is the unifier restated as a
requirement.

This deliberately does **not** say "there is no third state". An `@{ m … }` literal carrying a
leading move is authored intent and should stay. What must change is that its position stops
being inferable only by inspecting its first command.

### P2 — Position is never silently discarded.

Any operation that re-bases exposes the removed translation on its result, so

```
let a = result.anchor;
result.drawTo(a.x, a.y);      // drawTo takes two numbers
```

is an identity. `variableOffset` satisfies this; `subPath`, `segment` and `reverse` do not.

**Caveat, which is real design content:** `anchor` does not compose. The runtime error says
so — "Composing or transforming a result produces a new block without it; read anchor before
composing". So P2's identity law is **one hop only**;
`p.subPath(0.1, 0.5).offset(5).anchor` throws. Making it compose is a larger change than
adding the member, and this note does not assume it.

### P3 — The receiver decides the result type.

ProjectedPath in → ProjectedPath out, unless changing the kind is the method's whole purpose
(`draw`, `drawTo`, `project`, `toPathBlock`). Violated by `subPath`, `union`, `difference`,
`intersection`, `xor` and `cut` — all six *declared* as returning a ProjectedPath.

### P4 — A cross-space value is rejected with a message naming both spaces.

Scoped so it can be failed by a concrete change: where no conversion exists (spaces 3–6 in
`01-spaces.md`), passing a value across the boundary must produce an error that names the
space it is in and the space that was expected. Today a page-space path appended to a `Marker`
is reinterpreted as marker-viewBox coordinates and renders nothing, with no diagnostic.

Writing the missing conversions is a separate, larger question — `04`'s V7.

### P5a — Invalid path data is never emitted silently.

Path data with no leading moveto is invalid SVG and the browser discards the whole path.
Every serializer should synthesize the moveto or warn. This is Cause B, it is user-visible
breakage, and the project already has `warn()` plus `--strict`.

### P5b — Cursor-dependent placement is diagnosable.

This is Cause A, and it is **weaker than P5a on purpose**. `M 10 10; block.draw();` with a
positioned block is ordinary, correct relative drawing — a warning keyed on "first command is
a move and the cursor is not the origin" would fire on exactly the authored intent P1
protects. So this is not a free warning; it needs a narrower signal (for example, only for
blocks *produced* by `dash`/`cut`/`contours`, which is where the state is injected rather
than authored). Treat the design of that signal as open.

## How the conventions grade

| Convention | P1 | P2 | P3 | Verdict |
|---|---|---|---|---|
| Keeps page position (most ProjectedPath transforms) | ✅ | n/a | ✅ | **conformant** — the target |
| Discards, recoverable via `anchor` (`variableOffset`) | ✅ | ✅ (one hop) | ✅ | **conformant** |
| Discards, recoverable via receiver (`toPathBlock`) | ✅ | ✅ | exempt | **conformant** |
| Discards, **unrecoverable** (`subPath`, `segment`, `reverse`) | ✅ | ❌ | ❌ on a projection | **violating** |
| Position as a leading `m` (`dash`, `cut`, `contours`) | ❌ | — | ❌ on a projection | **violating (Cause A)** |
| `@{ m … }` literal | ❌ | — | n/a | **exempt** — authored intent; P1 asks only that the type say so |
| Serializers that don't synthesize a moveto (defs, `PathBlock.draw`) | — | — | — | **violating (Cause B)** |

## What is not covered

**Text.** `TextBlock` and `ProjectedText` are measured in `02` but are not graded here, and no
`04` row addresses them — except that **D8 is already a P2 violation on the text side**
(`ProjectedText.polarProject` stores a delta as `origin`, discarding the prior one). Space 5
has no named conversion, `TextBlock` has no `draw`, `ProjectedText` has no `toPathBlock`, and
`anchor` is a *method* there with an unrelated meaning. Adopting P1–P5 and landing V1–V8 would
leave the text side untouched. That is a known gap, not an oversight.

## What adopting this costs

P2 and P4 are additive. P5a is additive and fixes user-visible breakage. P5b needs design
before it needs code. P3 is the breaking one — six methods change their return type — and
P1 follows from P3 for the derived cases. `04-violations.md` costs each individually.
