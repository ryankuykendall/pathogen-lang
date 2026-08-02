# Blog Context: From a Halo Snippet to Lambdas in the Language

*Written 2026-08-02. Internal source material for a future blog post (or
series). Everything referenced lives in this directory or is linked below.*

> **Editorial direction (Ryan, 2026-08-02):** the published post must NOT be a
> personal/origin narrative ("Ryan wrote a doodle and asked…"). Frame it as a
> technical generalization story — building a richer variable-width stroke,
> width-as-a-function (envelopes), and how lambdas make that abstraction
> powerful. The internal history below is background for the author, not the
> post's subject. The shipped post (`website/blog/lambdas-come-to-pathogen.md`,
> "The Shape of a Stroke") follows this framing.

## The arc, in one paragraph

Ryan wrote a 16-layer "halo" stroke in the playground — `compoundVariableOffset`
with ~100 random-width stops per layer — and asked how to generalize it into a
reusable function with a designed "bulge" eased in and out trigonometrically.
The tutorial that answered him (`tutorial.md`, stages 0–6) kept colliding with
one language boundary: **no closures**, so every parameterized envelope had to
bake its constants into a named top-level `fn` or flow through ever-longer
parameter lists. The tutorial's speculative sidebar sketched
`let f = {|a, b| ...};` as the fix. One session later the sidebar became a
shipped language feature — lexically-scoped lambda expressions reusing the
trailing-block syntax — and the refactored stages (`03b`, `06b`) close the
loop, with `06b` producing **byte-identical output** to its closure-free
predecessor.

## Story beats a post could use

1. **The itch** — the original snippet (quoted in `tutorial.md` §0), with two
   honest bugs (dead `min`, inclusive-range off-by-one) and a
   misleading-parameter-name problem (`bulgeLeftMax`/`RightMax` vs the API's
   actual profile/sign semantics — a naming decision that later fixed a
   published-docs error in `docs/variable-offset.md`).
2. **The easing lesson** — linear tent → raised cosine (`0.5·(1+cos πd)` =
   easeInOutSine; derivative zero at both ends = G1-smooth landings), the
   smoothstep near-coincidence (|Δ| ≤ 0.010 at u ≈ 0.28/0.72), `pow`
   sharpening and its k = 0.5 crease boundary (a claim the content review
   corrected — see beat 5). Renders: `previews/02a`, `02b`.
3. **The abstraction ladder** — concrete params (stage 1) → envelope
   functions passed by name (stage 3, first-class fns, no lambdas yet) →
   data-driven spec arrays as the closure-free workaround (stage 4) →
   deterministic hash jitter replacing raw randomness (stage 5) → the halo
   rebuilt with every knob named (stage 6).
4. **The language-design turn** — the stage-3 limitation paragraph *was* the
   design brief. Key decisions when lambdas shipped:
   - **Lambdas lexical, named `fn`s stay dynamic.** Zero breakage; the
     difference is documented and test-pinned (neither was documented
     before). The language-services scope analyzer had always modeled fns
     lexically — lambdas made tooling and runtime agree for the first time.
   - **Reuse `TrailingBlock` in the grammar** rather than a duplicate rule —
     the LALR generator accepted it with zero conflicts on the first run
     (the feared ObjectLiteral-vs-lambda `{` collision never materialized).
     Zero-param `{||}` needed one grammar alternative because `||` lexes as
     logical-or.
   - **`closure` as an optional field on the existing UserFunction value** —
     one line at the call site (`createScope(fn.closure ?? scope)`) gives
     lambdas capture and leaves fns untouched.
   - **Builtins take callbacks as arguments** (`.map(f)`,
     `compoundVariableOffset(mk)`) via one shared resolver per evaluator,
     riding the existing hot-loop fast path (64k-cell fill: no regression).
   - Loop capture resolves the friendly way for free: Pathogen for-loops
     already created a per-iteration scope.
5. **The review as a character** — the multi-persona content review of the
   tutorial caught real math (the k < 0.5 edge-slope blowup), a real salt-
   stream collision (`hash01(i·7+salt)` replays streams at salt+7 — fixed
   with a ×1013 stride), a published-docs contradiction, and a
   reproducibility hole (the preview renderer depended on a session-scoped
   scratchpad). All fixed; the before/after BBWPs are preserved.
6. **The payoff demos** — `03b`: three bulge strokes built in a loop, each
   iteration's lambdas closing over that iteration's center/peak
   (`previews/03b-envelope-lambdas.png` shows the bulge marching along the
   spine). `06b`: the halo's ten-parameter `strokeJittered` dissolves into
   three closures + a builder lambda handed straight to
   `compoundVariableOffset(mk)` — byte-identical SVG to stage 6, proven by
   diff. "Same geometry, radically less parameter plumbing."

## Honest limitations to disclose (v1)

Callee expressions (`fns[0](5)`, `obj.f(1)`, IIFE) not yet callable — bind to
a `let` first (pre-existing gap for all non-identifier callees). Lambda
literals can't sit inside path-argument calls (the greedy path-args tokenizer
stops at `|`). Constructor binding blocks (gradients, Marker, Pattern,
filters, Grid ctor) still require literal trailing blocks — their positional
arg-count validation made lambda-args invasive for marginal payoff; possible
follow-up.

## Where everything lives

- Tutorial + stages: this directory (`tutorial.md`, `00`–`06b` `.pathogen`,
  `previews/`, `svg/`, `render-previews.mts`).
- Feature docs: `docs/syntax.md` § Functions (scoping section + Lambdas).
- Implementation: `src/parser/pathogen.grammar` (+regenerated parser),
  `src/parser/ast.ts` / `ast-builder.ts`, `src/evaluator/{types,index,annotated}.ts`,
  `src/language-services/{scope-analysis,type-inference-ast,diagnostics,formatter,completion-data-static,hover}.ts`.
- Tests: `tests/lambdas.test.ts` (interop + position matrix),
  `tests/evaluator.test.ts` (lambdas + scoping pins), `tests/parser.test.ts`,
  `tests/annotated.test.ts`, `tests/language-services/*`.
- CHANGELOG: `## [Unreleased] - 2026-08-02 (lambda expressions)`.
- Playground verification: `scripts/smoke-lambda-playground.mts` (drives the
  dev server, injects a lambda program, asserts the rendered path).
- Grammar spike artifacts: session scratchpad (ephemeral); the spike's
  conclusions are recorded in the CHANGELOG entry and here.

## Candidate titles

- "The Sidebar That Shipped: Designing Lambdas from a Tutorial's Complaints"
- "Closures for Strokes: How a Halo Doodle Grew Pathogen a Lambda"
- "Same Geometry, Less Plumbing" (the 06 ≡ 06b diff as thesis)
