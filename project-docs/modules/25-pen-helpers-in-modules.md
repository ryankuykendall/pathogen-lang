# Phase 1a, after step 5e: pen helpers are an error at a module's top level

2026-11-05. A follow-up to step 5e (`24-phase-1a-step5e.md`), before step 6.

## Why

Step 5e made reading `ctx` at a module's top level an error, but left the stdlib functions that work from the pen allowed there. The user asked for an example. The probe (`tmp/phase1/probe-pen-helpers.ts`) showed:

| At a module's top level | Before |
|---|---|
| `export const tip = polarPoint(0deg, 10);` | (10, 0), measured silently from (0, 0); `main` drawing `M 50 50 L tip.x tip.y` goes to (10, 0), not (60, 50) |
| `export const here = ctx.position;` | an error (step 5e) |
| `const seg = polarLine(0deg, 10);` then `polarPoint(0deg, 10)` | (20, 0): the polarLine kept as a value moved a pen that can never draw |
| the same through a helper fn the module calls at its top level | the same (it runs in the module's state) |
| inside an exported fn called from `main` | `main`'s pen: `M 50 50; tick(10);` gives `L 60 50`, as in one file |

So a module's top-level `polarPoint` reads the same pen that `ctx` reads, and only `ctx` was an error. The user chose to make the pen helpers an error too ("Let's go with option 1 and make them an error. Then we can move onto step 6.").

## The rule

At a module's top level, these are errors: `polarPoint`, `polarMove`, `polarLine`, `arcFromCenter`, `arcFromPolarOffset`, `heading`, `turn`, `tangentLine`, `tangentArc`. That is every name in `contextAwareFunctions` (src/stdlib/index.ts) except `polarOffset`, which only computes a step and never reads the pen.

Still fine: the same calls inside a path block (its own pen), inside an exported fn that another file calls (that file's pen), and anywhere in a program without `module;`. `Point(x, y).polarTranslate(angle, distance)` is the way to measure from a chosen spot.

The message, word for word in docs/modules.md's Errors table:

> A module has no pen while it loads, so polarPoint can't be called here. Call it inside a path block (@{ … }), which has its own pen, or in an exported fn, which uses the pen of the place that calls it. For a point at an angle and distance from a spot you choose, use Point(x, y).polarTranslate(angle, distance).

Only `polarPoint` gets the last sentence: it is the one used to compute a point.

## Docs

Content-reviewed (four findings; 1–3 taken, and 4's "the pen of the place that calls it" wording):
- docs/modules.md "Exporting": a new bullet in "A module doesn't draw at its top level". The `ctx`/`viewbox` bullet before it now ends in `;`.
- docs/modules.md Errors table: a new row after the `ctx`/`viewbox` row, with "also through a fn it calls".
- docs/stdlib.md "Context-Aware Functions": the intro said every function there uses the path context, which the intersection functions don't. Rewritten to say which use the pen, and that a module can't call them at its top level.

Listed in `22-docs-changes-awaiting-approval.md` for the user's approval before the push.

## Code

- src/module-messages.ts: `modulePenError(name)`. `IMPORTED_VALUE_CLAUSE` matches "A module has no pen" too, so a style value passes the error through instead of keeping its raw text.
- src/evaluator/index.ts: `penStateOf(state)`, the `_ctxSource` walk factored out of `ctxValueFor`, and `assertHasPen(state, name, at)`. It's called at the one dispatch point for context-aware calls, before their arguments are evaluated. Same states as `ctx`: a path block's own pen passes, and a text block uses its maker's.

## Decisions made while building

- **`heading` and `turn` are included.** They don't read the position, but they set or read the pen's heading, which a module doesn't have.
- **The check comes before the helpers' own checks.** `turn(10deg)` at a module's top level used to say "turn requires an existing heading", and `tangentLine` "requires a previous path command". Now both give the module message, which names the real fix.
- **`arcFromCenter` / `arcFromPolarOffset` kept as a value** already hit step 5e's seal, with the can't-draw message at column 1. They now give the pen message at the call.
- **A pen helper in a `.map()` callback** at a module's top level is an error, wrapped like any callback error: `Error in .map() callback at index 0: Line 3, col 40: A module has no pen …`.

## Tests

tests/modules-drawing.test.ts:
- each of the nine at its call, with the exact message;
- a test that the list matches `contextAwareFunctions` minus `polarOffset`, so a new pen helper can't be missed;
- the docs table quoting the polarPoint message word for word (read from docs/modules.md);
- through a helper fn, in a style value, in a text block, in a `.map()` callback;
- allowed: `polarOffset` and `Point.polarTranslate`; a path block using `polarLine` and `polarPoint` against its own pen (the asserts inside it were checked to fail when wrong: `tmp/phase1/probe-pen-block-assert.ts`);
- a module compiled alone;
- a one-file program keeps them, before and after its first path command;
- an exported fn's `polarLine` and `polarPoint` use the caller's pen, equal to one file.

## Code review

Approve, with two coverage warnings, both now tests. The probe for them is `tmp/phase1/probe-pen-routes.ts`:
- **Called from the importing file:** an exported lambda (`{|len| polarPoint(0deg, len)}`) uses that file's pen (`M 10 10;` then `L 15 10`). An exported fn called inside that file's path block uses the block's pen (end point (5, 2)).
- **A module's own builders:** in a Grid callback and a Marker body, `polarPoint` is an error. In every spot probed, `ctx` and `polarPoint` agree: Grid, Marker and Pattern bodies, `.reduce` and `.filter` callbacks. Both go through the same check (`penStateOf`).

The reviewer also confirmed `evaluateContextAwareFunction` has one call site, and that the `polarOffset` exemption is right (its case never touches the pen). Two suggestions were not taken. A comment on the `_ctxSource` assignment isn't needed: the cast was removed because the types already match. Extending the `polarTranslate` tip to `polarMove`/`polarLine` doesn't fit: those make segments, and the path-block advice covers them.

## Checks

- tests/modules-drawing.test.ts: 84 passed (61 in step 5e, so 23 new).
- Full suite (working tree, before the review's 4 tests): 191 files, 8,285 tests, 0 failed.
- The commit's tree alone (with the review's tests): 190 files, 8,279 tests, 8,271 passed, 0 failed.
- Semantics audit against bd06f86: 1,470 programs, 1,416 unchanged, 0 changed. 50 skipped and 4 too large, as before; one skip fewer than step 5e's, because the baseline now parses the docs' `kit.pathogen` fence.
