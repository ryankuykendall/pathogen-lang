---
title: "The Shape of a Stroke: Envelopes, Bulges, and Lambdas"
slug: lambdas-come-to-pathogen
date: 2026-08-02
description: "Variable-width strokes get interesting when the width itself becomes a designed object — an envelope you can shape, compose, and reuse. This post builds a richer stroke step by step, shows where the abstraction outgrows named functions, and introduces Pathogen's new lambda expressions: {|a, b| ... } as a first-class closure."
---

*Part 2 of 3 in our series on variable-width strokes.*

> **Series: Variable-Width Strokes**
> 1. [The Swelling Line](/blog/the-swelling-line) — variableOffset and compoundVariableOffset
> 2. **The Shape of a Stroke** (this post) — envelopes, bulges, and lambdas
> 3. [The Reliable Line](/blog/the-reliable-line) — hash, noise, and envelopes join the stdlib

[The Swelling Line](/blog/the-swelling-line) introduced
[`variableOffset` and `compoundVariableOffset`](/docs#variable-offset-variable-offset): place stops along a path, give each one a distance,
and the stroke breathes. That post ended with ribbons. This one asks the next
question: what does it take to make a stroke genuinely *rich* — layered,
shaped, textured — and still reusable?

The answer turns out to be a ladder of abstractions over one idea: **width as
a function of position**. Climbing that ladder is what this post is about, and
near the top it required growing the language itself. Pathogen now has lambda
expressions:

```pathogen
let f = {|a, b| return a + b; };
let three = f(1, 2);
```

The same `{|...|}` block syntax you already know from `map` and the gradient
builders, promoted to a first-class value — with true lexical capture. Here's
the stroke that earns it.

## A rich stroke is a stack of thin ones

One `compoundVariableOffset` pass gives you a ribbon. A *glow* takes sixteen:
loop an index from 16 down to 1, and give each layer stop widths scaled by the
index — wide soft passes first, a narrow bright core last. Drive the widths
with `randomRange` and the result is pleasingly organic:

<mini-workspace src="samples/post31/01-halo-original.pathogen" caption="Sixteen stacked compoundVariableOffset layers, widths driven by randomRange scaled by the layer index. Fuzzy, organic — and unrepeatable." code-open></mini-workspace>

Organic, and a dead end. Every knob is buried in the loop body; the randomness
means no two compiles match; and the moment you try to extract a reusable
function, you hit the real design question: the thing you want to pass around
isn't a number. It's a **shape**.

## Width as a function: the envelope

Call that shape an *envelope* — width as a function of position `t` along the
spine. The first envelope worth designing is a **bulge**: a chosen spot where
the stroke swells, entered and left smoothly. A raised cosine does it in four
lines:

```pathogen
fn bulge(t, center, spread) {
  let d = clamp(abs(t - center) / spread, 0, 1);
  return 0.5 * (1 + cos(mpi(d)));
}
```

`d` is normalized distance from the bulge center; `0.5·(1 + cos(πd))` is
easeInOutSine wearing its trig clothes. The property that matters: its
derivative is zero at *both* ends, so the swell leaves the base width and
rejoins it without a visible crease.

<mini-workspace src="samples/post31/02-envelope-plot.pathogen" caption="Three candidate envelopes plotted above the stroke the winner produces. On a straight spine, the stroke's silhouette is its envelope — the dashed guide connects the plot's peak to the widest point. Smoothstep (drawn dashed) hides inside the cosine: the two differ by at most 1% of the peak height." code-open></mini-workspace>

## Passing the shape

Pathogen functions are values: hand a named `fn` to another function and call
it through the parameter. So the general stroke-maker takes its envelopes *as
functions* — one per profile — and samples them at each stop:

<mini-workspace src="samples/post31/03-named-envelopes.pathogen" caption="One wrapper, four envelope pairs passed by name: constant, taper, bulge, wave. The wrapper neither knows nor cares what shape arrives." code-open></mini-workspace>

This is a real abstraction — the wrapper is finished, forever, no matter what
envelope you invent next. But look at the envelopes themselves. Every one is a
**named, top-level function with its constants baked in**. `bulged1`
hard-codes its center and peak, because until now there was no way to write "a
bulge envelope *for these particular* parameters" as a value. Pathogen's named
functions are dynamically scoped — free names resolve in the *caller's* scope
at call time — so a function couldn't carry values from where it was written.
The workarounds are all familiar and all unsatisfying: top-level `let`s you
hope nobody shadows, spec-object arrays interpreted by a helper, or parameter
lists that grow a slot for every knob.

## `{|a, b| ... }` grows up

The missing piece is a function literal that *remembers*. A block literal in
expression position is now a **lambda**: a function value that captures the
scope where it was written.

```pathogen
let scale = 3;
let times = {|x| return calc(x * scale); };

fn caller() {
  let scale = 100;    // does NOT affect the lambda
  return times(2);
}
let six = caller();   // 6 — lexical capture, not the caller's scale
```

Three design decisions worth spelling out:

- **Lambdas are lexical; named `fn`s stay dynamic.** Changing `fn` scoping
  would silently alter existing programs, so it doesn't. Both behaviors are
  now [documented](/docs#syntax-scoping-functions-vs-lambdas) — and if you've
  ever been surprised by a named function picking up a caller's variable,
  that section is worth two minutes.
- **Capture is by reference, per loop iteration.** Loops create a fresh scope
  each pass, so lambdas born in a loop each remember *their* iteration — the
  classic capture trap from other languages resolves the friendly way here.
- **Zero parameters is `{|| ... }`** — one grammar wrinkle, since two bare
  pipes otherwise lex as logical-or.

And the part that makes the feature feel native: **a builtin can take a
lambda you already built, applied with the `<<` operator** — the operator
you already use to merge objects and apply style blocks, here wearing a
second hat. A literal trailing block still works exactly as before —
that's what every sample above uses. The `<<` form is the *worker* spelling
of the same idea, for when the callback is a value with a name:
`items.map() << f`, `items.sort() << cmp`, `grid.fill() << f`, and — the
one this post has been building toward —
`spine.compoundVariableOffset() << mk`. The parentheses keep the builtin's
real parameters (`reduce(init) << f`); `<<` supplies the worker. The full
rules live in [Applying workers](/docs#syntax-applying-workers).

## Envelopes on demand

The baked-constants problem, dissolved — twice. The first row replaces four
named taper functions with two inline lambda literals. Then the payoff: three
bulge strokes from one loop, each iteration's lambdas closing over that
iteration's `center` and `peak`:

<mini-workspace src="samples/post31/04-loop-closures.pathogen" caption="Row 1: inline lambdas replace four named taper fns. Rows 2-4: each loop iteration builds envelope lambdas capturing that iteration's center and peak — the bulge marches along the spine." code-open></mini-workspace>

The wrapper is untouched — it still just calls `env1(t)` and `env2(t)`. What
changed is where envelopes can come from: anywhere, parameterized by whatever
is in scope at that spot.

## The rich stroke, assembled

Now rebuild the sixteen-layer glow with intent instead of `Math.random`. Each
layer wants: a base width and two bulge peaks scaled by the layer index, a
deterministic jitter texture with a per-layer stream, and tapered caps. As
closures, that's three lambdas per layer — `width1`, `width2`, `jitter`, each
capturing the layer index — plus a builder lambda `mk`, applied with
`spine.compoundVariableOffset() << mk`:

<mini-workspace src="samples/post31/05-halo-lambdas.pathogen" caption="The glow rebuilt on closures: designed swells, deterministic hash jitter with a per-layer stream (the salt is just a captured variable), and a builder lambda applied with << onto compoundVariableOffset. Compare the opening sample: the random fuzz is gone, the swells sit where they were put, and recompiles are byte-identical." code-open></mini-workspace>

Before lambdas, this program needed a ten-parameter helper function to thread
base widths, bulge specs, jitter amount, salt, continuity, and caps down into
the builder. The closure version was verified against that parameter-threaded
build — the same deterministic design, *not* the randomized stroke that opened
this post — by diffing the compiled SVG: **byte-identical**. Same geometry,
radically less plumbing — which is the whole argument for closures in one
sentence.

And unlike the randomized original, this stroke is a *design*: move a bulge,
sharpen a peak, retune the jitter, recompile, and get exactly what you asked
for — every time.

## The fine print

Version one has honest edges, all [documented](/docs#syntax-lambdas):

- Call lambdas through a plain name. `fns[0](5)`, `obj.f(1)`, and
  immediately-invoked literals aren't callable yet — bind to a `let` first.
- A lambda *literal* can't sit inside a call in path-argument position
  (`M use({|x| ...}) 0`) — path arguments stop at `|`. Pass a name.
- Constructor binding blocks (`LinearGradient(...) {|g| ...}`, `Marker`,
  `Pattern`, filters, `Grid(...) {|g| ...}`) still take literal blocks; the
  callback-style methods also accept `<<` workers.

## Where this goes

An envelope is just the first function worth capturing. The same pattern —
small lambdas closing over local parameters, applied to a builder with `<<` —
reaches anywhere Pathogen takes a callback: comparator families for `sort`,
field functions for `Grid.fill`, per-glyph stroke treatments built inside a
`contours` loop. Calligraphic nibs, pressure-simulating taper families,
multi-pass glows with per-pass texture: all of them are a lambda closing over
the parameters that make each instance *this* instance.

Every sample on this page is live — open the code pane, change a captured
`center` or `peak`, and watch the closure carry it into the stroke. The full
reference is in the [Lambdas docs](/docs#syntax-lambdas), the scoping rules in
[Functions vs lambdas](/docs#syntax-scoping-functions-vs-lambdas), and the
stroke machinery in the [Variable Offset docs](/docs#variable-offset-variable-offset).

The stroke was always a function. Now the language lets you treat it like one.
