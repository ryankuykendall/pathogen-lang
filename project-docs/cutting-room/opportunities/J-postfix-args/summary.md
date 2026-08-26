# Item J — postfix expressions flattened in sibling-scanning builders (friction #9)

**Status:** rich summary for user review — no code changed yet.
All probes run fresh against current HEAD (2026-08-26).

## Before / after

Before (today, probe-verified):
```pathogen
let names = ["shard-0", "shard-1", "shard-2"];

for (i in 0..names.length) {          // "Undefined variable: length"
  layer(names[i]).apply {             // "layer apply target must be a
    M calc(i * 10) 0                  //  string or layer reference"
    h 5
  }
}

define ViewBox(0, 0, sheet.w, 50);    // "ViewBox width must evaluate
                                      //  to a finite number"
```

After (proposal):
```pathogen
let names = ["shard-0", "shard-1", "shard-2"];

for (i in 0..names.length) {          // bounds are just expressions
  layer(names[i]).apply {             // route by any expression
    M calc(i * 10) 0
    h 5
  }
}

define ViewBox(0, 0, sheet.w, 50);    // args are just expressions
```

No new syntax, no evaluator change: these expressions already parse
and evaluate everywhere else in the language. Four AST-builder sites
just fail to pick them up.

## Root cause — one mechanism, four builders

In the Lezer CST, a postfix chain (`names[i]`, `o.n`, `pick(0)`) sits
at SIBLING level: base node, then `[`/`.`/ArgList as following
siblings. Builders that scan siblings with plain `buildExpression`
grab the base and then misbehave on the leftovers — `layer(o.n)`
errors "Undefined variable: n" because the trailing `n` OVERWRITES the
target. The correct helper exists and is used one function below the
bug: `buildExpressionWithPostfix` (ast-builder.ts:1450), which
`buildTextStatement` adopted for exactly this reason (its comment
at :1146 even explains it).

The affected class (probe-confirmed each):

| Site | ast-builder | Failing probe | Today's error |
|---|---|---|---|
| `layer(...).apply` target | :1124 | `layer(names[0])`, `layer(o.n)`, `layer(pick(0))` | target-type / Undefined variable: n |
| for-range bounds | :541/:544 | `for (i in 0..arr.length)` | Undefined variable: length |
| for-range bounds, TEXT-BODY twin | :1257/:1260 | same inside `&{}` text blocks | same |
| `PathLayer(...)`/layer-def name | :1080 | `PathLayer(names[0])` | Layer name must be a string |
| `define ViewBox(...)` args | :1098 | `ViewBox(0, 0, o.w, 50)` | width must evaluate to a finite number |

**The for-range case is the headline**, found by enumerating the
class (the friction log only caught `layer(...)`): `0..arr.length` is
an everyday shape, and today it requires a hoisted
`let n = arr.length;`.

Not affected (already correct): text() args (:1156), tspan args
(:1199), for-in iterables (:1299), let/assignment/return RHS, ArgList
contents (node-contained), calc() interiors.

## What already works (re-verified, per the implementation-site report)

- Style VALUES are dynamic: `stroke: c;`, `stroke-width: w * 2;`,
  ternaries, `pick()` calls, `` `${w}`px `` (only bare `${c}` fails,
  for a grammar reason — `${` is the style-block opener; the idiomatic
  backtick form works).
- Layer definitions in loops: `PathLayer(\`shard-${i}\`)` inside `for`.
- Template routing: `layer(\`shard${i % 2}\`)` routes correctly —
  which means the round-robin if-chains in the published samples are
  ALREADY deletable; this item's fix adds the array/member spellings.

## Proposed fix

Swap `buildExpression` → `buildExpressionWithPostfix` at the five
line-sites (four builders), with two care points:

1. **Range bounds vs `..`**: `arr.length..10` — the postfix walker
   must not confuse RangeOp `..` with member `.`. Verify tokenization
   and pin with tests on BOTH bounds.
2. **Cursor discipline**: buildExpressionWithPostfix leaves the cursor
   on the last consumed token; each builder's sibling loop must not
   double-advance (buildTextStatement shows the pattern).

Tests: coverage matrix — argument forms (member, index, fn call,
chained `a.b[i]`, method call) × the five sites, plus range-both-
bounds and text-body-twin cases. Docs: layers.md (routing/definition
names take any expression), syntax.md loop section (bounds are
expressions), viewbox mention. All parser-level — both evaluators and
all three surfaces inherit the fix automatically.

## Series payoff

- post42/05 (jigsaw shards) and post40 (shattered glyph): delete the
  `i % 3` if-chains — three fixed layers stay, routing becomes one
  line (`layer(\`shard${i % 3}\`)` or `layer(shards[calc(i % 3)])`).
  Renders must be byte-identical (same layers, same routing).
- Jigsaw closing-section entry; friction #9 resolved (styling half was
  already true; the routing half is this fix).

## Decision points

1. Fix all five sites as one item (recommended — one mechanism, one
   matrix) vs layer()-only as logged.
2. Sample upgrade: template-literal routing (`\`shard${i % 3}\``,
   works today, reads shortest) vs array-of-layer-refs routing
   (`shards[calc(i % 3)]`, exercises the new fix). Recommend the
   array form in ONE sample as the fix's showcase, template form
   elsewhere.
3. post40 is pre-series (Boolean-ops era) — include its sample in the
   upgrade sweep, or leave pre-series posts untouched?
