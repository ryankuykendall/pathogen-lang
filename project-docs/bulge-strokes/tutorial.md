# Bulge Strokes: Generalizing a `compoundVariableOffset` Halo into Reusable Functions

*Internal tutorial, 2026-08-02. Companion files: `00`–`06` `.pathogen` stages in this
directory, each archived as a BBWP (browse `http://localhost:3001/website/bbwp/` after
`npm run serve:bbwp`; PNG snapshots in `previews/`).*

This is the walkthrough for turning the halo snippet from the playground workspace —
a loop of `compoundVariableOffset` calls fed by `randomRange` — into a family of
reusable stroke functions, ending with a designed "bulge" (a chosen spot along the
curve where the stroke swells) eased in and out with trigonometry.

The arc: **read the original honestly → extract a concrete function → build the
easing → generalize the shape → compose bulges → layer randomness back on top →
rebuild the halo.** Each section has a runnable stage file; every claim about the
language below was verified against the compiler while writing this.

---

## 0. Reading the original honestly

The starting point (`00-halo-original.pathogen` is the cleaned, self-contained version):

```pathogen
for (haloIndex in 16..1) {
  let offset = contour.compoundVariableOffset() {|vo, pb|
    let stepMax = 100;
    for (step in 0..stepMax) {
      let min = 0.0001;
      let max = 0.9999;
      let time = calc((max - min) / stepMax * step);
      vo.stop(time,
          randomRange(0.1, calc(4 * haloIndex)),
          CurveContinuity.G1,
          randomRange(calc(-0.1 * haloIndex), -0.1),
          CurveContinuity.G1);
    }
    vo.startCap(Cap.tapered(2, CurveContinuity.G0));
    vo.endCap(Cap.tapered(2, CurveContinuity.G0));
  };
  ...
}
```

Three things worth naming before generalizing anything:

**Bug 1 — the `min` is dead.** `(max - min) / stepMax * step` scales the step but
never adds `min` back, so the first stop lands at exactly `0`, not `0.0001`. The
intended formula was `min + (max - min) / stepMax * step`. Better news: the epsilon
isn't needed at all — a probe with stops at exactly `t = 0` and `t = 1` under
tapered caps compiles and renders cleanly, so the stages below use plain `0..1`.

**Bug 2 — ranges are inclusive on both ends.** `0..stepMax` yields `stepMax + 1`
iterations (`docs/syntax.md`, Ranges). 100 becomes 101 stops. Either count is fine,
but say which one you mean; these stages standardize on *"`steps` segments →
`steps + 1` stops."*

**The five `vo.stop` arguments are not "left" and "right."** They are two
*profiles* — `stop(time, offset1, continuity1, offset2, continuity2)` — and which
side of the spine each profile rides is decided by the **sign of its offset**, not
by argument position (`docs/variable-offset.md`, compound section). Opposite signs
straddle the spine; same signs produce a *detached band* floating off one side —
legal and useful. (The original always straddles — profile 1 strictly positive,
profile 2 strictly negative. What it flirts with is a *magnitude* extreme, not a
sign flip: profile 2's floor of `-0.1` can leave the ribbon nearly one-sided.)
Profile 1 is also special: it is the traversal start and the sole source of
the result's `anchor`. This is why the functions below say `offset1`/`offset2`
(and `base1`/`peak1`/`bulges1`…), never left/right — and why the **caller owns the
signs**.

**Placement runs through `anchor`.** The offset result is a normal PathBlock,
origin-normalized, carrying an `anchor` Point that exists *only on the raw result*
(any transform drops it — `docs/variable-offset.md`, Placement). The idiom, from
`project-docs/variable-offset/anchor-glyph-overlay.pathogen`:

```pathogen
M calc(x + offset.anchor.x) calc(y + offset.anchor.y)
offset.draw();
```

Because our functions `return` the raw builder result, `anchor` survives to the
caller. That's a design constraint worth keeping in any future variant.

One perf note: the original ran ~101 stops × every contour × 16 halos — the exact
shape documented in `project-docs/editor-perf/FINDINGS.md` as the ~900-PathLayer
program. The stages use 48 steps and one spine; if you scale back up, budget for it.

---

## 1. Extract a concrete function (`01-extract-function.pathogen`)

The aspirational signature was:

```
strokeFromPathBlock(pathBlock, bulgeTime, steps, bulgeLeftMax, bulgeRightMax, continuity)
```

It falls short in four ways, and each gap names a real parameter:

1. **No base width.** A bulge needs something to rise *from*; without a base, the
   stroke is invisible outside the bulge window. → `base1`, `base2`.
2. **No spread.** "Where is the bulge" (`bulgeTime`) is separate from "how far does
   the swell extend" — the window half-width in `t`. → `spread`.
3. **No cap control.** The original hard-coded `Cap.tapered(2, G0)`. Caps store in
   a `let` and pass as arguments just fine, so they belong in the signature. → `cap`.
4. **`bulgeLeftMax`/`bulgeRightMax` misname the API.** Profiles + signs, per above.
   → `peak1`, `peak2`, signed.

The extracted function:

```pathogen
fn strokeFromPathBlock(pathBlock, steps, bulgeTime, spread,
                       base1, peak1, base2, peak2, continuity, cap) {
  return pathBlock.compoundVariableOffset() {|vo, pb|
    vo.startCap(cap);
    for (i in 0..steps) {
      let t = i / steps;
      let e = bulge(t, bulgeTime, spread);
      vo.stop(t, base1 + peak1 * e, continuity,
                 base2 + peak2 * e, continuity);
    }
    vo.endCap(cap);
  };
}
```

Two language rules shaped this design:

- **User functions cannot take trailing blocks.** `{|vo, pb| ...}` after a user
  `fn` call parses but is *silently dropped* (verified — the evaluator's
  user-function branch never reads `call.block`). So the builder block must live
  *inside* the wrapper, and every knob arrives as a plain parameter. Only built-ins
  (array `.map`/`.sort`, `Grid.fill`, `compoundVariableOffset` itself…) consume
  trailing blocks.
- **Pathogen is dynamically scoped.** A function body resolves free names in the
  *caller's* scope chain, not the definition's. Top-level `let`s make this mostly
  invisible, but the robust habit is self-containment: everything the function
  reads comes in as a parameter. (The stage files bend this rule only for
  display-side helpers like `drawRow`, which deliberately lean on top-level
  `spine`/`px` — the load-bearing stroke functions stay pure.)

The stage renders three calls of the *same function*: a straddling swell
(`peak1 +9, peak2 -9`), a calligraphy nib (`+12, -3`), and a same-sign detached
band (`+8, +3`) — the case "left/right" naming could never express.

## 2. The easing walkthrough (`02a-envelope-plot.pathogen`, `02b-envelope-variations.pathogen`)

This is the heart of the tutorial: shaping how the stroke enters and leaves the
bulge. Stage 2a plots the three candidate envelopes as graphs, with one stroke —
built from the winner, the raised cosine — rendered on a **straight spine**
directly below. On a straight spine the silhouette of the stroke *is* its
envelope, and the dashed vertical guide shows the plot's peak landing exactly on
the stroke's widest point.

Everything is built from a normalized distance:

```pathogen
let d = clamp(abs(t - center) / spread, 0, 1);   //-- 0 at the peak, 1 at the window edge
```

`d` folds both sides of the bulge into one number: how far along the *ramp* are we,
regardless of direction? `clamp` (stdlib) pins everything outside the window to 1,
which is what makes the envelope exactly zero out there rather than leaking.

**Attempt 1 — the linear tent:** `1 - d`. It works, but the width ramps in a
straight line, so the stroke has visible creases: one at the peak (slope flips from
`+peak/spread` to `-peak/spread` instantly) and one at each window edge (slope jumps
to zero). Your eye reads both as corners.

**The fix — a raised cosine:**

```pathogen
fn bulge(t, center, spread) {
  let d = clamp(abs(t - center) / spread, 0, 1);
  return 0.5 * (1 + cos(mpi(d)));                //-- mpi(d) = d * pi
}
```

Walk the shape: at `d = 0`, `cos(0) = 1` → envelope `1`. At `d = 1`,
`cos(π) = -1` → envelope `0`. In between, the half-cosine sweeps smoothly from 1
to 0. The property that kills both creases is the **derivative**:
`-π/2 · sin(πd)`, which is `0` at `d = 0` *and* `d = 1`. Zero slope at the peak
means no corner at the summit; zero slope at the edge means the bulge lands flat on
the base width — the stroke's outline is G1-smooth where the swell begins and ends,
matching the `CurveContinuity.G1` you're asking of the offset profiles themselves.

Two identities worth knowing: `0.5·(1 + cos(πd)) = cos²(πd/2)`, and in easing
vocabulary this *is* easeInOutSine (running 1 → 0 over the window). The stdlib has
no easing helpers — no `smoothstep`, no `mix`, no `ease*` (the `Easing` enum is a
string tag consumed only by `TopoGradient`) — so hand-rolling from
`clamp`/`abs`/`cos`/`mpi` is currently *the* way, and now you own the shape.

**The polynomial cousin:** `smoothstep(u) = u²(3 - 2u)` with `u = 1 - d` has the
same signature — 0/1 endpoints, zero slope at both. Plotted together, the
difference is antisymmetric about `u = 0.5`: |Δ| ≤ **0.010** (1% of the peak),
attained at `u ≈ 0.28` *and* `u ≈ 0.72` — which is why stage 2a draws
smoothstep dashed *on top of* the cosine: drawn solid it vanishes underneath.
Practical takeaway: the two are interchangeable for stroke work; pick the cosine
when you're already thinking in trig, smoothstep when you want to avoid `cos` in a
hot loop.

**Shaping the bulge** (`02b`, five strokes on straight spines):

- *Sharpness:* `pow(bulge(...), k)`. Near the window edge the envelope behaves
  like `e ≈ (π²/4)·s²` with `s = 1 − d`, so `e^k ~ s^{2k}`: the edge slope goes
  to zero only for **k > 0.5**. `k > 1` narrows the peak (k = 4 reads as a
  spike) and keeps the flat landing. `k < 1` fattens the peak but steepens the
  onset — and at exactly `k = 0.5` the edge slope is *finite and nonzero*, a
  genuine G1 crease where the bulge meets the base width (visible in 02b's
  first row); below 0.5 the edge slope is unbounded.
- *Asymmetry:* pick a different `spread` per side —

  ```pathogen
  fn bulgeAsym(t, center, spreadIn, spreadOut) {
    let spread = spreadOut;
    if (t < center) { spread = spreadIn; }
    let d = clamp(abs(t - center) / spread, 0, 1);
    return 0.5 * (1 + cos(mpi(d)));
  }
  ```

  Both halves reach `e = 1` at the center with zero slope, so the seam is invisible
  even when `spreadIn` and `spreadOut` differ by 4×. The stage's last row
  (`0.12` in, `0.45` out) is the classic brush-attack shape.

## 3. Generalize the shape, not the knobs (`03-envelope-functions.pathogen`)

Stage 1's parameters describe *one shape family* — a single raised-cosine bulge.
The next abstraction step is passing the shape itself. Pathogen functions are
**first-class values**: pass them by name, call them through the parameter
(the pattern already appears in `docs/stdlib.md`'s `drawGridToLayer` example):

```pathogen
fn strokeWithEnvelopes(pathBlock, steps, env1, env2, continuity, cap) {
  return pathBlock.compoundVariableOffset() {|vo, pb|
    vo.startCap(cap);
    for (i in 0..steps) {
      let t = i / steps;
      vo.stop(t, env1(t), continuity, env2(t), continuity);
    }
    vo.endCap(cap);
  };
}
```

**The signing convention, decided once:** envelopes return **signed offsets** —
profile semantics, caller owns the signs, matching `vo.stop` itself. The
alternative (envelopes return positive *widths*; the wrapper negates profile 2) is
friendlier for the symmetric case but forecloses same-sign geometry: a detached
band cannot be expressed if the wrapper hard-wires the negation. Signed offsets
keep the whole configuration space; symmetric callers just write `-env(t)`
variants. When a bulge should ride profile 2, its *peak* carries the minus sign.

The stage plugs four envelope pairs into the one wrapper: constant, taper
(`lerp(9, 0.5, t)`), asymmetric bulge, and a wave where *both* profiles ride the
same sine (`±5 + 4·sin(TAU()·3t)`) — the band wanders side to side at constant
width. If an envelope crosses zero, that profile crosses the spine; same-sign
stretches float off one side, as in stage 1.

**The honest limitation:** Pathogen has no closures and no anonymous functions, so
a "parameterized envelope" must bake its constants into a named `fn`
(`fn bulged1(t) { return 0.5 + 10 * bulge(t, 0.55, 0.3); }`). You *can* lean on
dynamic scoping — a top-level `let center = 0.55;` is visible from inside the
envelope at call time — but that's fragile: the binding the function sees depends
on the call path, and a caller-local of the same name silently shadows it. This
limitation is what motivates stage 4.

### Sidebar: if Pathogen had lambdas *(historical — this WAS speculative when written; see §7)*

The trailing-block syntax already looks like a lambda literal. Imagine it were one,
as an expression form with lexical capture:

```pathogen
//-- SPECULATIVE SYNTAX — not valid Pathogen today
for (haloIndex in 16..1) {
  let peak = 0.6 * haloIndex;
  let env = {|t| 0.1 + peak * bulge(t, 0.35, 0.3)};      //-- closes over peak
  let mirror = {|t| -env(t)};                             //-- and over env
  let halo = strokeWithEnvelopes(spine, 48, env, mirror,
                                 CurveContinuity.G1, taperCap);
  ...
}
```

The parameterized-envelope problem dissolves: constants no longer need baking into
top-level named functions, and stage 4's spec-array indirection becomes optional
style rather than a workaround. What it would take in the implementation: an
expression form of `TrailingBlock` in the grammar (today it parses only as a call
suffix, and user functions drop it), a function-value with a captured environment,
and — the real cost — **lexical capture**, which the current dynamically-scoped
evaluator doesn't provide. The scoping section above is effectively the design
brief: without lexical capture, `{|t| ...}` would inherit the same
caller-scope fragility that named functions have today. Filed here as a
language-design note.

## 4. Multiple bulges: data in, shape out (`04-multi-bulge.pathogen`)

The closure-free answer to parameterized envelopes: describe each bulge as a
struct, and let one function interpret a list of them.

```pathogen
//-- Spec: { center, spread, peak, sharpness } — peak carries the sign.
fn bulgesOffset(t, base, bulges) {
  let w = base;
  for (b in bulges) {
    w = w + b.peak * pow(bulge(t, b.center, b.spread), b.sharpness);
  }
  return w;
}
```

Contributions are **summed, not maxed**. Every raised-cosine term is smooth, and a
sum of smooth terms is smooth — overlapping bulges reinforce like superposed waves
(stage row 2: two 8-unit peaks at `0.42`/`0.58` merge into one taller swell with no
seam). `max()` would crease wherever two envelopes cross. Struct literals pass
through function parameters and destructure via member access with no ceremony.

`strokeWithBulges(pathBlock, steps, base1, bulges1, base2, bulges2, continuity, cap)`
is the common-case workhorse — each profile gets its own spec list (row 3 runs two
bulges up against one wide bulge down). `strokeWithEnvelopes` remains the escape
hatch for shapes that aren't sums of bulges at all.

## 5. Randomness as a layer, not a foundation (`05-jitter.pathogen`)

The original's widths *were* the randomness. The generalized version inverts that:
width = (deterministic envelope) × (jitter factor), with `jitterAmount 0` recovering
the pure envelope exactly.

```pathogen
fn hash01(i) {
  let s = sin(i * 12.9898) * 43758.5453;
  return s - floor(s);                    //-- fract by hand; stdlib has none
}
fn jitterFactor(i, salt, amount) {
  return 1 + (hash01(i * 7 + salt * 1013) * 2 - 1) * amount;
}
```

`hash01` is the classic shader one-liner — `fract(sin(i·12.9898)·43758.5453)` —
chosen because `randomRange` is unseeded `Math.random()` with **no seed facility
anywhere** (`src/stdlib/math.ts`): every compile produces different geometry.
Hash jitter is *deterministic*: stage 5 was compiled twice and the pure and hash
rows were byte-identical while the `randomRange` row differed. `salt` picks a
stream per stroke (stage 6 uses `salt: haloIndex`); the `i * 7` stride and the
`i * 2` / `i * 2 + 1` split give each profile its own sequence. The `* 1013`
stride on the salt matters: with a bare `+ salt`, salt *s + 7* would replay
salt *s*'s other-profile stream exactly (the index stride and salt offsets
collide) — a stride far larger than any index span keeps small salts genuinely
independent. Two honest caveats: this hash is closer to a low-discrepancy
rotation than white noise (consecutive indices advance the sine argument by a
constant), which is why the hash row's ripple looks more periodic than
`randomRange`'s; and determinism is a property *across compiles*, which a
single render can't show — hence the two-run diff above. The jitter is
*multiplicative* — `[1 - amount, 1 + amount]` — so it scales with the envelope:
the bulge shimmers, thin sections stay thin, and the silhouette survives.

Use `randomRange` when you *want* fresh texture per compile; use hash jitter for
anything you need to re-render identically (committed samples, regression
comparisons, this tutorial).

## 6. The halo, rebuilt (`06-halo-rebuilt.pathogen`)

The finale reassembles the original's layered-glow structure on the new machinery:

- `for (haloIndex in 16..1)` — descending, as the original: widest halos paint
  first, the narrow bright core lands last. (Descending ranges iterate as written —
  verified.)
- Each iteration builds per-halo spec lists — peaks scale with `haloIndex`
  (`0.6·i` and a sharp `0.35·i` on profile 1, a wide `-0.3·i` on profile 2) — and
  calls `strokeJittered(...)` with `jitterAmount 0.2, salt haloIndex`.
- Color rides `base.hueShift(haloIndex * -6)` at `opacity 0.25`, so the stack
  self-tints from pink core to lavender rim.

Diff against stage 0: same silhouette family, same 16-layer glow — but every knob
has a name, the swells sit where they were *put* (bulges at `0.35` and `0.78`
instead of wherever `Math.random` landed), and recompiling produces byte-identical
output (verified with a two-run diff). That's the whole trade the tutorial is
selling: the original's charm came from randomness; the rebuilt version keeps the
charm and adds intent.

---

## 7. Postscript: the lambdas are real now (`03b`, `06b`)

The sidebar above was written as speculative syntax. It shipped on 2026-08-02:
`{|a, b| ...}` is a first-class expression producing a **closure** (lexical
capture of the definition scope), callable via `let f = ...; f(x)`, and accepted
by the callback builtins in place of a trailing block (`items.map(f)`,
`spine.compoundVariableOffset(mk)`). Named `fn`s deliberately keep their
dynamic scoping — the sidebar's "design brief" paragraph became the actual
design: lambdas carry a captured scope, named fns don't, and both behaviors are
now documented (`docs/syntax.md` § Functions) and pinned by tests. Loop bodies
create a per-iteration scope, so lambdas born in a loop capture that
iteration's values — the friendly resolution of the classic loop-capture trap.

Two refactored stages show what changes:

- **`03b-envelope-lambdas.pathogen`** — Stage 3's four named envelope fns
  become inline lambda literals, and the limitation paragraph above dissolves:
  three bulge strokes are built *in a loop*, each iteration's lambdas closing
  over that iteration's `center` and `peak`. No spec arrays, no baked
  constants. (Stage 4's data-driven specs remain the right tool when the
  parameterization itself is data — e.g. authored bulge lists — but they are
  no longer the *only* escape from baked constants.)
- **`06b-halo-lambdas.pathogen`** — the halo rebuilt on closures:
  `width1`/`width2`/`jitter` lambdas capture `haloIndex`, and the builder
  lambda `mk` is passed directly to `compoundVariableOffset(mk)`.
  `strokeJittered`'s nine-parameter signature disappears. **The output is
  byte-identical to `06-halo-rebuilt.pathogen`** (verified by diff) — a pure
  refactor, which is the strongest possible statement of what closures buy:
  same geometry, radically less parameter plumbing.

Current v1 limits worth remembering while writing samples: call lambdas
through a plain name (`fns[0](5)` / IIFE not yet supported), don't put a
lambda *literal* inside a path-arg call (path args stop at `|`), and
constructor binding blocks (gradients etc.) still take literal blocks only.

## Appendix: language gotchas encountered (with pointers)

| Gotcha | Detail | Where documented |
|---|---|---|
| Trailing blocks on user fns | Parsed, then **silently dropped** — only built-ins consume them | verified against evaluator; not yet in docs |
| Dynamic scoping | Free names resolve in the *caller's* scope; self-containment is the defense | verified; `src/evaluator/index.ts` user-fn branch |
| No lambdas / closures | Callbacks = named `fn` passed by name; see the stage 3 sidebar | `docs/syntax.md` Functions |
| No easing stdlib | `sin/cos/mpi/lerp/clamp/map/pow` exist; `smoothstep`/`mix`/`fract` do not | `docs/stdlib.md` Math |
| `calc()` in path args only | `M 100 - r 100` parses as **three args, silently** — wrap path-arg math in `calc()`; bare arithmetic is fine in `let`s and call args | `docs/syntax.md` Expressions |
| Inclusive ranges | `0..n` gives `n + 1` iterations; `16..1` descends | `docs/syntax.md` Ranges |
| `randomRange` unseeded | No seed anywhere; use index-hash for reproducibility | `docs/stdlib.md` Random |
| Profiles, not sides | `vo.stop` offset sign picks the side; same-sign = detached band | `docs/variable-offset.md` |
| `anchor` volatility | Exists only on the raw offset result; transforms drop it | `docs/variable-offset.md` Placement |
| `CurveContinuity` enum | G0/G1/G2 = position/tangent/curvature; missing from `docs/syntax.md`'s enum table (doc gap) | `docs/variable-offset.md` |
| Stop-count perf | Dense stops × many layers built the ~900-PathLayer jank program | `project-docs/editor-perf/FINDINGS.md` |

## Artifacts

| Stage | Source | BBWP (latest) |
|---|---|---|
| 0 | `00-halo-original.pathogen` | `2026-08-02-12:51:39--bulge-strokes--00-halo-original` |
| 1 | `01-extract-function.pathogen` | `2026-08-02-11:46:56--bulge-strokes--01-extract-function` |
| 2a | `02a-envelope-plot.pathogen` | `2026-08-02-11:50:42--bulge-strokes--02a-envelope-plot` |
| 2b | `02b-envelope-variations.pathogen` | `2026-08-02-12:51:40--bulge-strokes--02b-envelope-variations` |
| 3 | `03-envelope-functions.pathogen` | `2026-08-02-11:50:43--bulge-strokes--03-envelope-functions` |
| 4 | `04-multi-bulge.pathogen` | `2026-08-02-11:47:00--bulge-strokes--04-multi-bulge` |
| 5 | `05-jitter.pathogen` | `2026-08-02-12:51:41--bulge-strokes--05-jitter` |
| 6 | `06-halo-rebuilt.pathogen` | `2026-08-02-12:51:42--bulge-strokes--06-halo-rebuilt` |
| 3b | `03b-envelope-lambdas.pathogen` | `2026-08-02-12:53:16--bulge-strokes--03b-envelope-lambdas` |
| 6b | `06b-halo-lambdas.pathogen` | `2026-08-02-12:53:17--bulge-strokes--06b-halo-lambdas` |

PNG snapshots of every stage live in `previews/`, compiled SVGs in `svg/` —
both regenerate with `npx tsx project-docs/bulge-strokes/render-previews.mts`,
which now compiles the `.pathogen` sources itself (no external inputs).
Earlier BBWP timestamps capture the pre-fix iterations (too-thin halo, hidden
smoothstep, timid wave, hairline-tailed 06, pre-stride salt) — kept per the
artifact-preservation convention.
