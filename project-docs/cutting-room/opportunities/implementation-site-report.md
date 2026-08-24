# Cutting Room feature opportunities — implementation site map

Source: `project-docs/cutting-room/FEATURE-OPPORTUNITIES.md` (13 entries).
All paths relative to `/Users/ryan/claude-code-projects/svg-path-extended`.

---

## PART 0 — Premises that do not hold (read first)

Five of the thirteen entries rest on a premise that empirical testing
contradicts. Funding these as written would buy work that is already done.

### #4 — "Member expressions need `calc()` in path args" — WRONG CAUSE

`M p.x p.y` **works today**. The failure in the sample was that the variable
was named `a`, and `a` is the SVG arc command.

```
let p = { x: 10, y: 20 };  M p.x p.y   →  M 10 20 l 5 5     ✅
let a = { x: 10, y: 20 };  M a.x a.y   →  Parse error: Missing ';'  ❌
let w = { x: 10, y: 20 };  M w.x w.y   →  M 10 20 l 5 5     ✅
let q = ... / let l = ...              →  same parse error   ❌
```

Cause: `src/parser/path-args-tokenizer.ts:27` + `:145-149`

```ts
const PATH_COMMANDS = new Set('MLHVCSQTAZmlhvcsqtaz'.split(''));
...
      if (depth === 0) {
        if ((KEYWORDS.has(word) || ...) && word !== 'calc' ...) break;
        if (word.length === 1 && PATH_COMMANDS.has(word)) break;
      }
```

The single-letter check runs only at `depth === 0`, which is why wrapping in
`calc(...)` (depth > 0) rescues it. `parsePathArgs`
(`src/parser/ast-builder.ts:847`) already builds full `MemberExpression` /
`IndexExpression` / `MethodCallExpression` chains
(`src/parser/ast-builder.ts:925-960`) — the AST layer never needed changing.

This is the documented "Key concept" in `src/CLAUDE.md` ("Single letters that
are SVG path commands cannot be used as variable names in path argument
positions"). The real opportunity is a **better diagnostic**: "`a` is the arc
command — rename the variable or wrap it in `calc()`", instead of
`Missing ';'`.

### #9 — "layer styles are static" — MOSTLY WRONG

Arbitrary expressions in style values already work. `evaluateStyleBlockLiteral`
(`src/evaluator/index.ts:1204`) re-parses each raw value string at runtime:

```ts
      const parseResult = expressionParser.parse(prop.value);
      if (parseResult.status && parseResult.value) {
        if (parseResult.value.type === 'ColorLiteral') { ... }
        const evaluated = evaluateExpression(parseResult.value, scope);
```

Verified working: `stroke: c;` (bare identifier), `stroke-width: w * 2;`,
`stroke-width: calc(1 + 1);`, `` stroke-width: `${w}`px; ``,
`filter: brightness(lvl);`, `stroke: b ? "red" : "blue";`, `stroke: pick();`.

Only **bare** `${c}` fails, and for a grammar reason: `${` is the style-block
opener itself (`src/parser/pathogen.grammar:429`), and `${...}` is recognized
only inside a backtick template (`:458-462`). The idiomatic form
`` stroke: `${c}`; `` already works.

Dynamic layer **creation** also works — `define PathLayer(name) ${...}` is
allowed inside `for`, `if`, and `fn` bodies (`src/evaluator/index.ts:8740`);
only path blocks (`:1846`) and text blocks (`:1990`) ban it.

What genuinely does not work is **postfix expressions inside `layer(...)`** —
and it is an ast-builder bug, not a language restriction
(`src/parser/ast-builder.ts:1114-1131`):

```ts
    if (cursor.name === 'apply') foundApply = true;
    else if (!foundApply && isExpressionNode(cursor.name) && cursor.name !== 'layer') {
      layerName = buildExpression(cursor, source);
    } else if (cursor.name === 'Block') { ... }
```

`postfixExpression` is inlined in the grammar
(`src/parser/pathogen.grammar:249-256`), so `layer(nm(0))` flattens into
sibling children and **the last expression-shaped child wins** —
`layerName` ends up `NullLiteral`. Works: `` layer(`shard${i}`) ``,
`layer(n)`, `let r = layer("a"); r.apply {}`. Fails:
`layer(nm(i))`, `layer(ns[i])`, `layer("s".concat(i))`. The fix already
exists in the same file: `buildExpressionWithPostfix`
(`src/parser/ast-builder.ts:1450`, used in 21 other places).

So the round-robin `if (i % 3 == 0)` chains in post40/post42 were
**avoidable today** with `` layer(`shard${i}`).apply {} ``.

### #10 — "text-if inside loop bodies discards output" — ANNOTATED MODE ONLY

The main evaluator is clean. There are **four** text-body walkers, and the
three that handle `IfStatement` are all correct:

| Function | Location | Handles `IfStatement`? |
|---|---|---|
| `evaluateTextBlockBody` | `src/evaluator/index.ts:1982` | ✅ `:2063-2075` |
| `evaluateTextBody` | `src/evaluator/index.ts:8178` | ✅ `:8249-8260` |
| `evaluateAnnotatedTextBody` | `src/evaluator/annotated.ts:3732` | ✅ `:3806-3811` |
| `evaluateTextBlockExpression` | `src/evaluator/annotated.ts:3654` | ❌ **drops elements** |

Bug site — `src/evaluator/annotated.ts:3695-3698`:

```ts
    // Other statements (let, for, if, expression) for control flow
    evaluateStatementPlain(stmt, blockScope);
```

`evaluateStatementPlain` (`src/evaluator/annotated.ts:5217`) has no
`'TextStatement'` case and no `elements` accumulator, so `text()` emitted from
inside an `if`/`for` in a `&{ }` block vanishes — but only under
`compileAnnotated` (CLI `--annotated`). Reproduced: `elementCount` returns
2/1/0 in annotated mode where runtime returns 2/2/3.

**The samples avoided conditional text unnecessarily.** Post41/04's
count-instead-of-caption workaround was not needed.

### #11 — "`offset()` flips direction on curved edges" — DOES NOT REPRODUCE

Plain `offset()` on cut pieces is **correct and uniform**, including through
holes. Measured:

```
square 0..100 cut at x=50:  piece bb 50×100 → offset(6) 62×112   (+2×6 both axes) ✅
plate 200×200, cookie-cut:  holed piece 200×200 → offset(5) 210×210 ✅
                            stamped disc 40×40  → offset(5)  50×50 ✅
repro-offset-direction-bug: piece bb 68×34.1 → offset(7) 86.3×59.8 (grows) ✅
```

The preserved repro at `project-docs/cutting-room/repro-offset-direction-bug.pathogen`
calls `pl.reverse().offset(7)`. `reverse()` inverts the traversal direction,
which flips the normal — shrinking is the *correct* result for that program,
and the entry's own note ("Reversing first shrinks the whole ring") records it.

Two real, separable defects remain — see entry #11 below.

### #3 — "`normal(t)` has no material-side orientation" — IT ALREADY HAS ONE

`normal(t)` on a cut seam already points **away from the piece's own
material**, on both sides of a shared seam. Measured on the x=50 cut:

```
piece bb.x=50 (right):  seam (50,100)→(50,0)  normal -180° = (-1,0)  → away from right piece ✅
piece bb.x=0  (left):   seam (50,0)→(50,100)  normal    0° = (+1,0)  → away from left piece  ✅
```

This is not luck. `canonicalizeRingWindings`
(`src/evaluator/boolean-ops.ts:4066-4088`) enforces a global invariant, and
`normal()` and `offsetCommands` use the *same* rotation, so they agree by
construction:

- `samplePathAtFraction` → `tangent = Math.atan2(dy, dx)`
  (`src/evaluator/sampling.ts:445`, `:460`, `:474`, `:487`)
- `normal` case returns `result.tangent - Math.PI / 2`
  (`src/evaluator/index.ts:3155`)
- `unitNormal(dx,dy) = (dy, -dx)/len` (`src/evaluator/path-transforms.ts:391-397`)

and `(cos(θ−π/2), sin(θ−π/2)) ≡ (dy, −dx)/len` exactly.

**#3 is a documentation + naming task, not a geometry task.** An
`outwardNormal(t)` would be an alias for `normal(t)` on cut seams. The
dot-product-against-centroid dance in the tab samples was unnecessary.

---

## PART 1 — Per-entry implementation map

### #1 + #12 — ProjectedPath in-place `draw()` / `startPoint` footgun

**Confirmed: there is no `draw` case for ProjectedPath.** Switch opens at
`src/evaluator/index.ts:3069`; its complete case list is

```
drawTo, get, tangent, normal, partition, segment/segmentAll, point/pointAll,
vertex/vertexAll, reverse, boundingBox, offset, mirror, rotate,
rotateAtVertexIndex, scale, subPath, chamfer, chamferAtVertex, fillet,
filletAtVertex, ellipticalFillet, ellipticalFilletAtVertex,
union/difference/intersection/xor, cut, intersects, intersectionPoints
```

PathBlock's switch (`:2391`) has `draw` at `:2398` and `project` at `:2471`;
ProjectedPath has neither. Default throw at `:3603`.

**`drawTo` emission — `src/evaluator/index.ts:3086-3102`:**

```ts
        // Re-project commands from PPV origin to new drawTo origin
        const offsetX = dtX - obj.startPoint.x;
        const offsetY = dtY - obj.startPoint.y;
        const reProjectedCommands = obj.commands.map((cmd) => ({ ... }));

        const { d: emittedPath, tracked: emittedCommands } = serializeRelativeAndTrack(
          reProjectedCommands,
          scope.evalState.pathContext,
          { moveTo: { x: dtX, y: dtY } },
        );
```

**Why `drawTo(startPoint)` drops a cut piece's offset.** The `moveTo` option
emits an absolute `M dtX dtY` and then walks the body as *relative* deltas
whose cursor starts at the first command's own recorded `start`
(`src/evaluator/path-data.ts:199-215`). PathBlock's `draw`/`drawTo` pass
`bridgeOriginGap: true` (`index.ts:2416`, `:2450`), which emits a leading
`m firstStart.x firstStart.y` to close that gap; **ProjectedPath's `drawTo`
does not pass it** (`:3101`). For a sub-run from `segmentAll` this is
invisible, because `buildSubProjected` sets `startPoint` to the first command's
own start (`index.ts:3195`: `startPoint: { ...copies[0].start }`) — the gap is
zero. For a whole cut piece it is not: `buildPathBlockFromCommands` hardcodes
`startPoint: { x: 0, y: 0 }` (`index.ts:1008`) while `emitRing` deliberately
omits the leading `m` (`boolean-ops.ts:4449-4454`), so the piece's first
command starts at its subject-local offset. `drawTo(p.startPoint...)` then
anchors `M` at the frame origin and replays the body relatively, silently
translating the piece by `−(firstStart − startPoint)`.

**Crisp invariant:** ProjectedPath.drawTo is correct exactly when
`startPoint == commands[0].start`, and wrong when they differ — which is only
the cut-piece case.

**Feasibility asymmetry (matters for prioritisation):**

- `ProjectedPath.draw()` is **strictly additive** — a new case that emits
  `M commands[0].start` plus the relative body. Touches no existing behavior.
- "Fix `drawTo`" is a **behavior change with regression surface**. Do NOT just
  add `bridgeOriginGap: true` at `:3101`: that option tests
  `commands[0].start` against absolute zero
  (`path-data.ts:206-215`), which is right for block-local PathBlock commands
  and wrong for ProjectedPath's world-space ones. It would double-offset every
  `segmentAll` sub-run that works today.

**Annotated parity:** `src/evaluator/annotated.ts:1854-1856` — same
ProjectedPath `drawTo`, same missing `bridgeOriginGap`, and no `draw` case
either. A `draw()` needs a counterpart here.

**API declaration:** `src/pathogen-api.ts:1103-1181` (`@type ProjectedPath`);
`drawTo` at `:1119-1120`. PathBlock's `draw`/`drawTo` at `:752-755` are the
doc-comment template to copy. Regenerate with `npm run generate:completions`.

### #2 — `pieces.seams()` group query

**`cut()` returns an `ArrayValue` of `PathBlockValue`s** (not ProjectedPaths),
at two identical sites — `src/evaluator/index.ts:2979-3003` (PathBlock
receiver) and `:3518-3542` (ProjectedPath receiver):

```ts
        const pieceCmds = pathCut(obj.commands, cutterCmds, cutWarnings);
        ...
        return {
          type: 'ArrayValue' as const,
          // Origin (0,0) keeps each piece's subject-local placement, so
          // drawing every piece at one position reassembles the shape.
          elements: pieceCmds.map(p => buildPathBlockFromCommands(p, { x: 0, y: 0 })),
        };
```

**Array method dispatch** is the final fallthrough of the one big
`evaluateMethodCall` (`src/evaluator/index.ts:2144`), at `:5327-5331`:

```ts
  // Array methods
  if (!isArrayValue(obj)) {
    throw mError(`Cannot call method '${expr.method}' on non-array value`);
  }
```

Existing cases: `push, pop, shift, unshift, empty, map, filter, reduce,
mapSlice, slice, reverse, sort`. A `seams()` would be a new case here plus an
element-type guard (arrays are untyped, so it must check every element is a
PathBlock). Note `src/callback-methods.ts` — any method named `map`/`filter`/
`reduce`/`sort`/`fill`/`forEach`/`variableOffset`/`compoundVariableOffset`
becomes `<<`-interceptable on *any* receiver; `seams` is not in that set, so
no interaction.

Dedupe key would come from the seam runs: every healed seam edge is stamped
`segmentLabel: 'cut'` in **both** adjacent pieces (`boolean-ops.ts:4772-4775`),
so the twin pair is the natural unit.

### #3 — `outwardNormal` / material side

See Part 0. Load-bearing anchors:

`src/evaluator/boolean-ops.ts:4066-4071`:

```ts
/**
 * Canonicalize winding of the subject's closed rings so material is always
 * on the LEFT of every directed boundary segment: rings at even containment
 * depth get positive signed area, rings at odd depth negative. This is the
 * invariant the face walk depends on.
 */
```

`src/evaluator/boolean-ops.ts:4347-4353`:

```ts
 * Trace the faces of the arrangement. ... Because subject edges are
 * one-sided with material on the left, every traced face is a material
 * region; the unbounded face and hole interiors are never traced.
```

Tangent source `src/evaluator/sampling.ts:689` →
`samplePathAtFractionResolved`; per-command
`tangent: Math.atan2(dy, dx)` (`:445`, `:460`, `:474`, `:487`) and
`arcTangentFromCenter` for arcs (`:518-521`). Consumed by the `normal` case at
`src/evaluator/index.ts:3145-3158` as `result.tangent - Math.PI / 2`.

Scope: docs (`docs/path-blocks.md:204` `### normal(t)`) + optionally an alias
method. No geometry change.

### #4 — Path-arg member access

See Part 0. Real fix is the diagnostic at
`src/parser/path-args-tokenizer.ts:145-149`, surfaced through
`describeError()` in `src/language-services/diagnostics.ts`.

### #5 — `pi` as a bare identifier — CONFIRMED

```
l calc(pi) 0  →  Error: Line 2, col 8: Undefined variable: pi
l 0.25pi 0    →  l 0.7853981633974483 0     ✅
```

- Angle-literal suffix rule: `src/parser/pathogen.grammar:396`
  `(@digit+ "." @digit+ | "." @digit+ | @digit+) ("deg" | "rad" | "pi" | "%")?`
  — `pi` is a numeric *suffix*, never an identifier.
- Constants live in `src/stdlib/math.ts`: `PI: () => Math.PI` (`:64`),
  `TAU: () => Math.PI * 2` (`:66`), `mpi: (x) => Math.PI * x` (`:69`) — all
  zero-arg *functions*, so `PI()` with parens is required.

Fix shape: a bare-identifier constant binding (`pi`, `tau`) resolved before
the undefined-variable throw, or a language-services quick-fix
`pi` → `PI()`.

### #6 — Multi-knife composition

**PathBlock has no `append`/`concat`/`merge`.** Its full case list
(`src/evaluator/index.ts:2397-3064`):

```
draw, drawTo, project, get, tangent, normal, partition,
segment/segmentAll, point/pointAll, vertex/vertexAll, reverse, boundingBox,
offset, variableOffset, compoundVariableOffset, mirror, rotate,
rotateAtVertexIndex, scale, subPath, chamfer, chamferAtVertex, fillet,
filletAtVertex, ellipticalFillet, ellipticalFilletAtVertex,
union/difference/intersection/xor, cut, intersects, intersectionPoints
```

There *is* a concatenation operator — `<<` — documented at
`docs/path-blocks.md:575 ## Concatenation`.

**`cut()`'s argument validation is a 7-line site** (`index.ts:2980-2989`,
mirrored at `:3519-3528`):

```ts
        if (expr.args.length !== 1) throw mError('cut() expects 1 argument (cutter path)');
        const cutterVal = evaluateExpression(expr.args[0], scope);
        let cutterCmds: PathBlockCommand[];
        if (isPathBlockValue(cutterVal)) {
          cutterCmds = cutterVal.commands;
        } else if (isProjectedPathValue(cutterVal)) {
          cutterCmds = cutterVal.commands;
        } else {
          throw mError('cut() argument must be a PathBlock or ProjectedPath');
        }
```

Accepting an `ArrayValue` here is a genuinely small change: add an
`isArrayValue` branch that flat-maps `commands` from each element. `pathCut`
already treats the cutter as multiple independent subpaths/chains
(`splitSegsIntoChains`, `boolean-ops.ts:4091`, `:4533`), and already handles
knife-vs-knife crossings (`cutterHits`, `:4629-4656`). **This is the
lowest-cost, highest-leverage item in the list.**

Two sites to change (both `cut` cases) + annotated (currently throws, see
below) + `src/pathogen-api.ts:817` / `:1165-1166` signature.

### #7 — Cutter label propagation

**Cutter meta DOES reach half-edge creation** — it is thrown away
deliberately at one line.

- `extractDrawCmds` preserves meta (`boolean-ops.ts:3155`:
  `...(cmd.meta !== undefined ? { meta: cmd.meta } : {})`)
- `rebaseCmdStart` / `rebaseCmdEnd` preserve meta (`:4004-4012`, same spread)
- Then `boolean-ops.ts:3959-3964`:

```ts
/** Stamp a cutter fragment as a healed seam: fresh meta, segmentLabel 'cut'.
 *  Overrides any cutter-authored labels — the cutter's own labels do not
 *  propagate into pieces (documented). */
function stampCutSeam(cmds: TransformCmd[]): TransformCmd[] {
  return cmds.map((cmd) => ({ ...cmd, meta: { segmentLabel: 'cut' } }));
}
```

Two call sites: `boolean-ops.ts:4773` (open-chain seams, immediately before
the twinned half-edges at `:4774-4775`) and `:4798` (cookie loops).

```ts
  for (const e of snappedCutter) {
    const fwd = halfEdges.length;
    // Every healed seam edge carries segment('cut') — in both adjacent pieces.
    const seamCmds = stampCutSeam(e.cmds);
    halfEdges.push({ cmds: seamCmds, fromNode: e.fromNode, toNode: e.toNode, twin: fwd + 1, visited: false });
    halfEdges.push({ cmds: reverseRing(seamCmds), fromNode: e.toNode, toNode: e.fromNode, twin: fwd, visited: false });
  }
```

An opt-in `cut:<cutterLabel>` composite is a change to `stampCutSeam`'s body
plus a threaded option — the meta is right there in `cmd.meta.segmentLabel`.
Bridging `l` commands inserted during the face walk also hardcode
`meta: { segmentLabel: 'cut' }` (`:4428`) and would need the same treatment.

Note the label *query* side already supports groups: duplicate labels form
groups by design (`src/evaluator/segments.ts:45-48`).

### #8 — Unmerged runs

**Run merging is implicit and has no boundary record** —
`src/evaluator/segments.ts:260-273`:

```ts
export function findLabeledRuns(commands: PathBlockCommand[], label: string): PathBlockCommand[][] {
  const runs: PathBlockCommand[][] = [];
  let current: PathBlockCommand[] = [];
  for (const c of commands) {
    if (c.meta?.segmentLabel === label) {
      current.push(c);
    } else if (current.length > 0) {
      runs.push(current); current = [];
    }
  }
```

Adjacent same-label commands accumulate with no per-statement marker in the
run itself. Statement boundaries do exist in `PathStore.records`
(`PathRecord.label`, `segments.ts:101-111`) for *authored* blocks — but
derived blocks get one record per command
(`recordsFromCommands`, `:123-125`), so for cut pieces the record boundary is
already per-command and carries no seam-edge grouping.

**Three query entry points** to thread an option through:
`src/evaluator/index.ts:2247` (layer query), `:2566` (PathBlock),
`:3199` (ProjectedPath).

**Where an options argument lands** — every `*All` query validates arity
identically (`index.ts:3180-3183`, and `:3209`, `:3225`):

```ts
      case 'segment':
      case 'segmentAll': {
        if (expr.args.length !== 1) throw mError(`${expr.method}() expects 1 argument (name)`);
        const segName = evaluateExpression(expr.args[0], scope);
        if (typeof segName !== 'string') throw mError(`${expr.method}() name must be a string`);
```

Relax to `1..2`, evaluate arg 1 as an `ObjectValue`, read `merge`. Note the
segment/segmentAll pair shares one case body, so `segment` would need to
reject the option or define its meaning.

### #9 — Dynamic layer styling

See Part 0. Anchors: `evaluateStyleBlockLiteral`
(`src/evaluator/index.ts:1204`, value eval at `:1228-1235`, fallbacks at
`:1300` `spliceTemplateFragments`, `:1333` `tryResolveCSSFunctionArgs`,
`:1360` `validateCSSValue`); layer wiring at `:8760-8764`; apply-routing at
`:8828-8845`; `layer()` call at `:6364-6377`;
`parseStyleDeclarations` at `src/parser/ast-builder.ts:2113` (values stored as
raw `string`, `src/parser/ast.ts:405`).

Real work item: fix `buildExpressionWithPostfix` usage at
`src/parser/ast-builder.ts:1114-1131`.

### #10 — text-if discard

See Part 0. Single bug site: `src/evaluator/annotated.ts:3695-3698`
(`evaluateTextBlockExpression` at `:3654` delegating to
`evaluateStatementPlain` at `:5217`, which has no `TextStatement` case).

### #11 — offset() on cut pieces

Headline does not reproduce (Part 0). Two real defects:

**(a) Overshoot / self-crossing on strongly bowed cubics.** The site is
control-point *translation*, not normal selection —
`src/evaluator/path-transforms.ts:635-651`:

```ts
    } else if (upper === 'C') {
      const [cx1, cy1, cx2, cy2] = seg.cmd.args;
      const p2 = { x: seg.cmd.start.x + cx2 + seg.endOffset.x, y: seg.cmd.start.y + cy2 + seg.endOffset.y };
      // Adjust CP1 relative to actual start (considering miter join)
      // CP1 keeps the same offset as the start normal for consistency
      const adjP1 = { x: seg.cmd.start.x + cx1 + actualStartOffset.x, y: seg.cmd.start.y + cy1 + actualStartOffset.y };
```

Control points are translated by the *endpoint* offsets with no
curvature-aware scaling, so the offset curve's midsection stays at roughly the
original distance while the endpoints move by `distance`. On the repro's neck
curve this produced +18.3 / +25.7 growth for `distance = 7` (expected +14 /
+14). Q has the same shape with an averaged offset (`:653-660`).

Direction selection itself is a fixed left-hand normal with **no winding or
area sign consulted anywhere** — `path-transforms.ts:391-397`:

```ts
export function unitNormal(dx: number, dy: number): Point {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-12) return { x: 0, y: -1 }; // default upward
  // Left-hand normal in SVG coords (y-down): (dy, -dx) / len
  // For rightward (1,0) → (0,-1) = upward ✓
  return { x: dy / len, y: -dx / len };
}
```

So `offset()` direction is purely traversal-direction-derived. That is exactly
why `reverse().offset(d)` shrinks — and why it is correct on canonicalized cut
pieces.

**(b) Documentation gap.** Nothing tells the user that `offset(+d)` grows a
cut piece and `reverse().offset(+d)` shrinks it. `docs/path-blocks.md:365`
`### offset(distance)` is the anchor.

Correction to an earlier suspicion: `offset()` **does** carry segment labels —
`path-transforms.ts:719-720`, applied generically after each push:

```ts
    // 1:1 offset image of the source segment — labels carry straight across.
    if (seg.cmd.meta !== undefined) result[result.length - 1].meta = seg.cmd.meta;
```

Arg convention is also fine: cut pieces come out lowercase/relative
(verified by dumping `pathCut` output), matching what `offsetCommands`
assumes.

### #13 — String ternaries in `${}` — confirmed working

`stroke: b ? "red" : "blue";` evaluates correctly through
`evaluateStyleBlockLiteral`. Pure docs task.

---

## PART 2 — Cross-cutting constraint: annotated-evaluator parity

`src/evaluator/annotated.ts:1836-1850` already throws for the whole query
family on PathBlock:

```ts
    if (
      expr.method === 'variableOffset' || expr.method === 'compoundVariableOffset' ||
      expr.method === 'segment' || expr.method === 'segmentAll' ||
      expr.method === 'point' || expr.method === 'pointAll' ||
      expr.method === 'vertex' || expr.method === 'vertexAll' ||
      expr.method === 'cut'
    ) {
      throw mError(
        `${expr.method}() is not supported in --annotated debug mode yet; compile normally (it works in the CLI, playground, and VS Code preview).`,
      );
    }
```

Every new method proposed above needs either an annotated counterpart or an
explicit addition to this throw list. Per `.claude/CLAUDE.md` this is a
shipping requirement, and it changes each entry's cost estimate.

---

## PART 3 — Tests and docs anchors

### Test files

| Area | File | Anchor |
|---|---|---|
| `offset()` on paths | `tests/path-blocks.test.ts:1151` | `describe('offset()', ...)` → `it('horizontal line offset preserves length')` |
| segment / segmentAll | `tests/segment-labels.test.ts:178` | `describe('name-based query APIs (segment / point / vertex)')`; also `:267` group labels, `:374` labels survive derived paths |
| `cut()` | `tests/path-cut.test.ts:26` | `describe('PathBlock.cut()')` → `:27` closed subjects, `:122` endpoint tolerance, `:179` multi-contour, `:230` crossing/closed cutters, `:465` label preservation |

There is no `tests/path-transforms.test.ts`. `union/difference/intersection/xor`
live in `tests/boolean-ops.test.ts:7`. Don't conflate the three "offset"s:
`Point.offset()` is `tests/evaluator.test.ts:2848`, `variableOffset` is
`tests/variable-offset.test.ts:180`.

### Doc anchors

`docs/path-blocks.md`:
- `:248 ## Transforms` — new transform methods, keyed
  `### \`name(args)\` → PathBlock / ProjectedPath`. `:365` is `offset()`.
- `:177 ## Parametric Sampling` — `:204 ### normal(t)` is where #3's
  orientation guarantee belongs.
- `:749 ## Boolean Operations`, `:804 ## Cutting Paths`
  (`:810 ### cut(cutter)`, `:934 ### Cutting behavior`) — #6's array-cutter and
  #7's label propagation.
- `:17 ## Drawing a Path Block` / `:32 ### Assigning the draw result` /
  `:42 ### Drawing at a specific position` — #1/#12's `draw()`.
- `:575 ## Concatenation (<<)` — existing composition story for #6.

`docs/segment-labels.md`:
- `:148 ## Querying Labels` (`:180 ### segment('name')`,
  `:198 ### point('name')`, `:216 ### vertex('name')`) — #2's `seams()` and
  #8's merge option. **Note:** `segmentAll`/`pointAll`/`vertexAll` are
  implemented and tested but have no `###` heading of their own — only prose
  inside `:148-255`. Worth fixing while in the file.
- `:83 ### Group labels and computed labels` — #7's `cut:<label>` composite.
