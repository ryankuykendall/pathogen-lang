---
title: "What Broken Lines Taught the Language"
slug: broken-lines-what-it-taught
date: 2026-09-05
description: "Closing Broken Lines: the friction log. Building sashiko, leather, and stencil artifacts against the real language filled the log — five entries became fixes — the last one landing after publication, in the session this post promised it, and the rest are on the bench with their diagnoses attached."
series: "Broken Lines"
seriesPart: 5
---

*Part 5 of 5 in Broken Lines — projects that treat the stroke not as
paint, but as geometry you can hold.*

> **Series: Broken Lines**
> 1. [Stroke geometry](/blog/broken-lines-stroke-geometry) — dashes,
>    outlines, and start points as real paths
> 2. [Sashiko](/blog/broken-lines-sashiko) — running stitches from
>    binary sequences
> 3. [Leathercraft](/blog/broken-lines-leathercraft) — stitch holes
>    that can't disagree
> 4. [Stencils](/blog/broken-lines-stencils) — bridges are just gaps
> 5. **What Broken Lines taught the language** (this post) — the
>    friction log, resolved

> **Prerequisites:** This post assumes the toolkit from
> [part 1](/blog/broken-lines-stroke-geometry) — `dash()` pieces and
> their `kind`, `outline()`, and applying a worker with `<<` — plus
> the [boolean operations](/docs#path-blocks-boolean-operations)
> (`union`, `difference`). It reports on the four posts before it; you
> don't need to have read them all, but the samples it references live
> there.

Part 1 promised that this series was a working friction log: real
artifacts, built against the real language, with every stumble written
down as it happened. This post opens the log. Five entries went in
while parts 1 through 4 were being written, and two more arrived when
the finished series was reviewed. Four became fixes that shipped
before publication — the leather and stencil samples you already read
use the first. The rest are on the bench, each with its
diagnosis attached, because an honestly-described open problem is
worth more than a quietly absorbed workaround.

## Fixed: the ceremony in every filter

The single most repeated line of code in this series is a filter:
keep the dashes, drop the gaps. The first time it was written, it
didn't parse:

```pathogen
// before the fix — Parse error … Missing ';'
let inked = pieces.filter {|piece| piece.kind == 'dash'};
```

The language required a full statement body — `return`, semicolon,
braces earning their keep — for what is always a one-expression
predicate:

```pathogen
// the form that worked, pre-fix
let inked = pieces.filter {|piece| return piece.kind == 'dash'; };
```

The parse error was the deciding vote: it said *missing semicolon*
and nothing about what was actually missing. So the sugar shipped.
Today, a lambda whose whole body is one expression returns it, no
ceremony — the first fence above is now valid code:

```pathogen
// today — three shapes of the same sugar:
let inked = pieces.filter {|piece| piece.kind == 'dash'};  // an inline predicate
let doubler = {|v| calc(v * 2)};                           // a reusable worker
let five = {|| 5};                                         // a zero-parameter constant
```

The bare expression is an implicit `return` — the two earlier forms
stay equivalent — and the formatter round-trips each form as written.
The [leather](/blog/broken-lines-leathercraft) and
[stencil](/blog/broken-lines-stencils) samples were upgraded in place;
what you read is the sugar. Details in the
[lambda documentation](/docs#syntax-lambdas).

A companion ruling landed when the series was reviewed, and it's the
sixth and final log entry: writing a lambda *literal* directly after
`<<` — `filter() << {|piece| ...}` — is now a compile error. `<<`
exists to apply a worker defined elsewhere, reusable across callback
builtins; the inline spelling *is* the trailing block. Two ways to
say the same thing is how cruft accumulates, so the language now has
exactly one of each:

```pathogen
let inked = pieces.filter {|piece| piece.kind == 'dash'};  // inline: trailing block
let isDash = {|piece| piece.kind == 'dash'};
let alsoInked = pieces.filter() << isDash;                 // reusable: << a name
```

## Fixed: the drifting hole

The stencil post's island demo tried a perfectly reasonable
construction — subtract an annulus (a ring with a hole) from a sheet
— and got back a ring whose counter had *drifted*, sitting off-center
like a badly registered print. The workaround made the published
sample better anyway (drawing the counter as its own piece is truer to
the physical situation), but the log entry stayed, and the diagnosis
turned out to be old plumbing. The
[boolean engine's](/docs#path-blocks-boolean-operations) subpath
splitter only recognized a subpath boundary at an explicit `z`. A ring
that closes by ending exactly where it started — which is what
`circle()` emits — got glued to the hole-ring after it, and the step
that implements subtraction by running the subtracted shape's outline
backwards then scrambled the pair.

The fix teaches the splitter what SVG always meant: a move after
drawing commands starts a new subpath, `z` or no `z`. One function,
one regression test, and the construction that started it all now
renders exactly as designed — the dashed marker reconstructs where the
counter used to land:

<mini-workspace src="samples/post49/01-holed-subtrahend.pathogen" caption="A holed subtrahend (the shape being subtracted), post-fix: ring and island in place. Dashed: the pre-fix drift, reconstructed." code-open></mini-workspace>

A pleasant footnote: `cut()` had privately worked around this exact
limitation with its own local subpath splitting. The fix makes the
general machinery honest, and the workaround is now just redundancy.

## Fixed: the interpolation that couldn't nest

This one was on the bench when this post first went to review, with a
promise that it deserved a careful session of its own. It got one.

The trap: interpolating a variable as a complete style value was a
parse-killing error, with a "Missing ';'" pointing nowhere near the
cause. The workaround was a backtick template — and a list built from
variables needed one backtick fragment per token:

```pathogen
stroke-linecap: ${capName};      // parse error, before the fix
stroke-linecap: `${capName}`;    // the old workaround
```

The diagnosis is a good story. A style block's interior isn't parsed
structurally — it's one opaque token, scanned by a little machine
that hunts for the closing `}`. In that machine, `$` and `{` were
ordinary text but `}` was a hard stop: write `${v}` in a value and
the interpolation's own closing brace was read as the end of the
*whole style block*, wrecking everything after it. Backticks
survived only because the scanner already knew to skip over template
literals whole. The irony ran deep: `${` is literally how a style
block *opens*, yet it was the one thing that couldn't appear bare
inside one.

The fix gives the bare interpolation its own token beside the opaque
content — the scanner now hands `${...}` spans through intact, the
value parser treats their insides as expression territory, and both
evaluators splice them through the exact same path as the backtick
form. So today, the bare form just works — whole values, list
tokens, even fused to a unit inside a function argument:

```pathogen
stroke-linecap: ${capName};
stroke-dasharray: ${cell} ${cell};
filter: blur(${softness}px);
```

The backtick form remains equivalent; every sample in this series
now uses the bare one. (One souvenir of the tokenizer's size limits:
inside a style value, a *template's* interpolation still can't nest
braces — the bare form can, one level, making it the more capable
spelling as well as the shorter one.)

## On the bench, with diagnoses

**Stdlib shapes after `M`.** A shape function can't follow a move on
the same line — and would mislead even if it could, because stdlib
shapes position themselves through their arguments and ignore the
current position:

```pathogen
M 85 52 roundRect(0, 0, 320, 220, 14)     // parse error today
roundRect(85, 52, 320, 220, 14);          // the working idiom: fold the anchor in
```

Method-call draws (`M x y piece.path.draw()`) work inline, which makes
the inconsistency feel arbitrary. The planned fix is a contextual
diagnostic that says the true rule out loud.

**Dashing an inset line by the edge it came from.** The leather
post's deepest want. Stitch lines run *inside* the edge, but
`offset()` changes a curve's length, so dashing two inset lines
separately can disagree on hole counts — the exact error the craft
forbids:

```pathogen
let flapHoles = seamEdge.offset(3).dash(holePattern);   // 17 holes…
let bodyHoles = seamEdge.offset(-3).dash(holePattern);  // …or maybe 18
```

What the domain wants is an offset-aware dash: partition the shared
edge once, then carry each piece to the inset line at the matching
position along the curve. That's a real feature, not a fix, and it's
now on the roadmap ledger with the wallet as its motivating artifact.

## The tally

Seven entries — five while writing, two more when the finished series
was reviewed: five fixed (four before publication, one in the
promised follow-up session), two diagnosed and deferred with their
next steps written down. (The
seventh was the review pass catching the blog's own tooling
red-handed: Pathogen code was being syntax-highlighted *as
JavaScript*, splitting `stroke-width` into two colors — every code
panel you've read renders through the real parser now.) A sixth rough edge — the
comma-vs-arithmetic dash-array rule — came into the series already
known and carries a
[documentation note](/docs#path-blocks-dashstyles-array-of-path-kind-t0-t1)
instead of a log entry; [part 1](/blog/broken-lines-stroke-geometry)
states it up front. That ratio is the point of working this way.
Feature planning imagines what users need; an artifact *demands* it,
in order, with a failing sample as the spec.
[The Cutting Room](/blog/cutting-room-papercraft) established the
tradition, folding its report into each post's closing section;
Broken Lines gave the log a post of its own. The next series will
start its log on entry one.

## Where to go next

The toolkit these five posts exercised is documented in the
[stroke geometry reference](/docs#path-blocks-stroke-geometry), and
the sugar this series earned is in the
[lambda docs](/docs#syntax-lambdas). The best way to add to the next
log is the way every entry here was made: build something real in the
[playground](/workspace/scratch), and when the language pushes back,
write it down. That's the entry.
