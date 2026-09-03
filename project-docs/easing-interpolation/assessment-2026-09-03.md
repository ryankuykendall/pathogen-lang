# Assessment: Easing Interpolation API proposal

Date: 2026-09-03. Reviewer: Claude (Fable 5.1), at Ryan's request. Input:
`proposal-2026-09-03.md`. Evidence: three read-only surveys of the repo at HEAD
`17d7777`, summarized in "Verified facts" below. Outcome: approved path is the
three-phase plan recorded in `README.md`.

## Verdict

The proposal's engineering is sound, but it is designed for an animation runtime,
and its public primitive is the wrong one for Pathogen. Adopt its cubic-Bézier
core and its clamp-input, never-clamp-output rule. Drop the `Easing.` namespace,
the `(start, end, time)` interpolator shape, and `sineWave`. Ship one stdlib
function first, then a named-curve family that gradients share.

| Proposal as written | Recommended shape |
|---|---|
| `Easing.cubicBezier(x1,y1,x2,y2)` returns an interpolator | `cubicBezier(x1, y1, x2, y2, t)` returns eased `t` |
| Public contract is `(start, end, time) => value` | Public contract is `t -> t'`, composed via `lerp`, `Color.mix`, `Point.lerp` |
| `Easing.sine({ mode })`, `Easing.linear()` | Phase 2: extend the existing `Easing` enum, add `ease(curve, t)` |
| `Easing.sineWave({ amplitude, halfCycles })` | Not added. `A * sin(TAU() * k * t)` is already one line; taught in the blog post as a lambda |
| Precompute once for the hot path | Irrelevant. No time, no frames. Reuse is a one-line closure |
| Gradient parity unaddressed | Phase 1 is stdlib-only. Phase 2 extends the shaders deliberately |

## Critical assessment

- **Wrong primitive.** Baking `lerp` into every curve forces one scalar output.
  Pathogen authors feed one eased `t` into several channels at once. The
  dusk-horizon sample (`website/blog/samples/post36/05-horizon.pathogen`) drives
  lightness, chroma and hue from a single `smoothstep`. The stdlib already uses
  the timing-function shape for `easeIn`, `smoothstep` and `bump`, and so does
  CSS. The proposal calls that shape "internal"; in Pathogen it must be the
  public one.
- **The animation framing does not transfer.** There is no time in the language,
  and animation elements are stripped by the sanitizer (`docs/security.md:13`).
  `t` is a normalized loop index in every sample. "Allocation-free hot path" buys
  nothing in a tree-walking interpreter, where a closure call costs more than the
  trig it wraps.
- **The `Easing` namespace is already taken.** `Easing` is a built-in enum whose
  string members drive `TopoGradient.easing`. Enum objects have no callable
  methods (`src/evaluator/index.ts:5537-5546`), and namespaces are a closed
  hardcoded set of four (`:843-858`). `Easing.sine(...)` fails today with
  `Unknown object method: sine`.
- **Duplication is the real hazard.** The quadratic curves are copied in five
  places, two of them WGSL, and the gradient-service copy does not clamp. The
  docs promise the callable trio matches the renderer (`docs/stdlib.md:165-168`),
  and nothing tests that. Any easing that claims gradient parity has to land in
  the shaders, and a four-float Bézier cannot ride the existing one-integer
  uniform.
- **Demand evidence is thin for timing curves.** Across 258 published samples
  the easing trio has zero organic uses. What authors hand-rolled was envelope
  kernels (post31), and post32 retired those with `bump` and `smoothstep`. The
  value here is CSS familiarity and overshoot, not replacing existing code. The
  docs already name the gap in one sentence (`docs/stdlib.md:178`).

**What the proposal gets right:** the timing-versus-offset distinction,
restricting only the x control points, solving x then evaluating y, permitting
overshoot, and a small first surface. Its test list (§14) is good and is reused
nearly as is.

## Options considered

1. Adopt the proposal as written. Rejected: collides with the enum and gives the
   least composable result for the largest evaluator change.
2. Docs-only prelude of lambdas. Rejected as the main path: no completion or
   hover, and every program re-pastes a Newton solver.
3. Extend the stdlib shaping family with timing functions. **Recommended.**
4. Extend the enum without `cubicBezier`. Rejected: loses the one primitive that
   generates every monotone curve plus overshoot.
5. Do nothing beyond the existing docs sentence. Defensible given demand, but
   cheap to do better.

## Recommendation (as approved)

Option 3 in phases, plus a blog post:

- **Phase 1**: `cubicBezier(x1, y1, x2, y2, t)`. `t` last to match `smoothstep`
  and CSS reading order; `t` clamped; y free so curves can overshoot. Docs carry
  CSS and easings.net preset numbers plus the reuse idiom
  `let smooth = {|t| cubicBezier(0.42, 0, 0.58, 1, t)};`. Implemented with
  arithmetic only and a fixed iteration structure so it can join the hash
  family's cross-engine bit-exact contract.
- **Phase 2**: grow the `Easing` enum with unambiguous members (`SineInOut`,
  `BackOut`, `ElasticOut`, …), add `ease(curve, t)`, and generate the WGSL
  `applyEasing` from the same table the stdlib uses so gradients and stdlib share
  one source. Add the missing parity test and fix the missing clamp.
- **Phase 3**: a practical blog post, "easing with lambdas", showing how to apply
  an eased `t` to ranges, amplitudes, and cycles/half-cycles.

## Verified facts (survey summary)

Language expressiveness:
- Factory returning a lambda, stored and called: test-pinned at
  `tests/evaluator.test.ts:1398`. Lexical closures `:1367`. Strict lambda arity
  `src/evaluator/index.ts:7806`. `fns[0](5)`, `obj.f(1)` not callable
  (`docs/syntax.md:1869`).
- Options objects with string modes are idiomatic: `offset(d, {join:'round'})`
  (`docs/path-blocks.md:437`), `Grid(..., {outOfBounds:'wrap'})` (`docs/grid.md:39`).
  No keyword arguments (`ArgList` is positional, `src/parser/pathogen.grammar:313`).
- Enums resolve to `ObjectValue` (`src/evaluator/index.ts:883-887`); 21 enums in
  `src/evaluator/builtin-enums.ts`; `docs/syntax.md:556-566` lists only 8.
- Stdlib dispatch: `callStdlibPreservingAngles` (`src/evaluator/angle.ts:62-75`),
  blind spread, no arity validation; strings pass through; stdlib functions
  cannot take callables (callbacks are the `<<` worker feature, `src/callback-methods.ts`).

Existing easing surface:
- `src/stdlib/math.ts:72-101`: `lerp`, `clamp`, `map`, `smoothstep`, `bump`,
  `easeIn/easeOut/easeInOut` (quadratic, clamped).
- Copies: `playground/gpu/gradient-service.ts:1611 getEasingFn` (no clamp),
  `playground/gpu/topo-shader.ts:193`, `playground/gpu/topo-laplace-shader.ts:241`,
  and the Hermite fade inlined in `noise`/`noise2`.
- `TopoGradient.easing` is the only consumer of the enum (`src/pathogen-api.ts:1375`);
  validation centralized in `src/evaluator/member-assign.ts:144-152`.
- Only the playground rasterizes topo gradients; CLI and VS Code emit a
  flat-color rect via `src/render/build-defs.ts:189-245`.
- All Bézier math in `src/` is 2D `Point`-based; no scalar timing evaluator. No
  shared `lerp`/`clamp01` helper (four file-local copies).

Sample corpus (258 files):
- `easeIn`/`easeOut`: 0 uses; `easeInOut`: 1 (a builtins demo); `smoothstep`: 8
  files; `bump`: 10; `Point.lerp`: 0; `Color.mix` composed with an easing: 0.
- Hand-rolled envelopes in post31 (`win`, `tentEnv`, `smoothEnv`, `cosEnv`,
  `bulge`), retired in post32. No hand-rolled cubic/power/overshoot ease.
- The loop idiom is `let t = i / N;` over an inclusive range (~30 occurrences).
