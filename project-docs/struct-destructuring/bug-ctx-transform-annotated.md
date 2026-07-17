# Bug: `ctx.transform` throws in the annotated evaluator

**Status:** Open (pre-existing; confirmed 2026-07-17 during struct-destructuring code review)
**Surface:** `compileAnnotated()` / CLI `--annotated`
**Severity:** Any program that sets layer transforms fails entirely under annotated mode — not a degraded rendering, a hard compile error.

## Reproduction

```pathogen
define PathLayer('shape') ${}
layer('shape').ctx.transform.translate.set(50, 50);
layer('shape').apply { M 0 0 L 10 10 }
```

| Evaluator | Result |
|---|---|
| `compile()` | OK — layer carries `transform="translate(50, 50)"` |
| `compileAnnotated()` | **Throws** `Line 2: Property 'transform' does not exist on context object` |

Verified against the built `dist/index.cjs` at commit `f0c14c8` (and the same
error text reproduces at the parent commit — this is not a regression from
the struct-destructuring work; the shared registry preserved the annotated
evaluator's existing behavior byte-for-byte).

## Root cause

`ctx.transform` is not a data property — the **main** evaluator synthesizes a
`TransformReference` from the context object's internal `_transformState`
(special case at the top of `evaluateMemberExpression`, `src/evaluator/index.ts`,
kept deliberately outside the shared `struct-properties.ts` registry).

The **annotated** evaluator has never had that special case:

1. Its `evaluateMemberExpression` has no `transform` branch for ContextObject
   (checked at `HEAD` and at every commit back through the ContextObject
   branch's introduction — the case was never ported).
2. Its `Value` union (`src/evaluator/annotated.ts:~170`) has **no
   `TransformReference` / `TransformPropertyReference` members at all**, and
   annotated `LayerReference` stubs (`AnnotatedLayerRef`) return dummy `ctx`
   ContextObjects with no `_transformState` attached.

So the failure is structural, not a missing `if`: annotated mode has no
transform-state model to reference.

## Why it matters

`docs/layers.md` ("Layer Transforms") and `docs/stdlib.md` document
`layer('...').ctx.transform.translate.set(...)` / `.rotate.set(...)` /
`.scale.set(...)` as a first-class feature. Per the three-surface parity rule
(`.claude/CLAUDE.md`), a program that renders fine in CLI/playground/VS Code
but *throws* under `--annotated` is a silent surface regression — users
debugging exactly these programs with the annotated output are the ones who
hit it.

## Sketch of a fix (not started)

Two credible levels:

- **Lenient stub (small):** mirror how annotated handles filters — accept
  `ctx.transform.<prop>.set(...)` chains as no-ops (annotated output has no
  transform attribute to emit anyway). Needs: a `transform` special case in
  annotated's `evaluateMemberExpression` returning a stub reference value, a
  stub member/method path for `.translate/.rotate/.scale/.skewX/.skewY` and
  `.set/.clear`, and two Value-union arms (or one catch-all stub type).
  Restores "annotated never crashes on valid programs" parity cheaply.
- **Faithful port (larger):** thread real `TransformState` through annotated
  layer/ctx objects so annotated output can also *annotate* the transform
  (e.g. a `//--- transform: translate(50, 50)` comment line). Only worth it
  if annotated output should surface transforms to the reader.

Recommend the lenient stub first; it matches annotated mode's existing
philosophy ("no defs output, type-mismatched values ignored rather than
thrown" — see `assignGradientProperty` in annotated.ts).

## Test to add with the fix

In `tests/annotated.test.ts`: the reproduction program above must
`not.toThrow()` under `compileAnnotated`, plus a `layer.ctx.transform` read
after `.set(...)`. A drift note also belongs in `tests/struct-properties.test.ts`
if `transform` ever moves into the shared registry.
