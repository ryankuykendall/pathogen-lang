# Segment Suffix Functions & Path Labeling — Research Summary

**Date:** 2026-07-17
**Status:** Research / design exploration. No implementation planned yet.
**Ask:** Assess the relative value/power of attaching behavior and metadata to
elements of a path definition *at the point of definition*, taking into account
(a) the limitations of SVG path syntax, (b) how much the compiler already
dances around those limitations, and (c) how other languages approach this
capability. Flag where the initial pseudo-code is clunky and propose better
directions.

**Contents:** §1 the proposal · §2 what the compiler already knows ·
§3 the primitive-SVG dance · §4 in-repo prior art · §5 external prior art ·
§6 core insights · §7 syntax alternatives + recommendation · §8 open
questions · §9 companion artifact · Addendum A.1–A.8: what the
segments-everywhere refactor unlocks (incl. layer modifiability) and its costs.

---

## 1. The proposal as sketched

Two related ideas, quoted from the original prompt:

**Suffix functions** — attach behavior to a path command:

```pathogen
let myPB = @{
  h 20
  v 20 joinPreviousWithFillet(5);
};
```

…intended to be equivalent to:

```pathogen
let myPB = @{
  h 15
  tangentArc(5, 0.5pi);
  v 15
};
```

**Labels** — attach metadata to segments and vertices:

```pathogen
let pl = PathLayer(`my-path-layer`) ${...};
pl.apply {
  h 20 labeledWith segment(`first-segment`);
  v 20 labeledWith endpoint(`second-endpoint`);
  h -20 labeledWith segment(`third-segment`), endpoint(`third-endpoint`);
  circle(5, 5, 20) labeledWith segment(`circle-01`);
}
```

The guiding insight: users gain a great deal of power if PathBlocks and
PathLayers can be treated as **collections of richly defined segments** rather
than opaque command streams. The features implied downstream (querying,
styling, referencing labeled segments) are deliberately deferred; the question
here is whether definition-site attachment is the right foundation, and what
syntax would carry it without clunkiness.

---

## 2. What the compiler already knows about segments

The headline finding: **Pathogen already has a per-segment object model — it is
just unevenly deployed.**

### 2.1 The segment model exists inside `@{}`

Every PathBlock evaluates to a `PathBlockValue` whose authoritative
representation is a structured command list (a parallel `pathStrings` array
coexists for emit — see §A.1):

- `PathBlockCommand { command, args: number[], start: Point, end: Point }` —
  `src/evaluator/types.ts:511-516`
- `PathBlockValue { commands, pathStrings, startPoint, endPoint }` —
  `src/evaluator/types.ts:521-527`

Every geometry API the language exposes — `get(t)`, `tangent(t)`, `normal(t)`,
`partition(n)`, `boundingBox()`, `reverse()`, `offset()`, `fillet()`,
`chamfer()`, boolean ops — consumes the structured `commands` array and never
re-parses the `d` string (`src/evaluator/sampling.ts`,
`src/evaluator/path-transforms.ts`). The segment model is already the real
engine of the language.

### 2.2 …but not inside `apply {}` or at top level

Command history tracking (`trackHistory`) is on only for `@{}` blocks
(`src/evaluator/index.ts:1816`). PathLayers and the top-level context
accumulate an append-only `accum: string[]`
(`src/evaluator/types.ts:642-650`); every command's identity — its type, its
arguments, its start/end points, its source location — is destroyed the moment
it becomes a string. `PathSegment`, the value stdlib path functions return, is
literally `{ type: 'PathSegment', value: string }` with zero metadata
(`src/stdlib/path.ts:7`).

**Consequence:** the labeling proposal's `pl.apply { h 20 labeledWith … }`
form has nothing to attach metadata *to* today. The prerequisite work is
extending the structured model to layers — and as §3 shows, that prerequisite
is independently valuable.

### 2.3 Per-command metadata channel: none

Neither `PathBlockCommand` nor `CommandHistoryEntry`
(`src/evaluator/context.ts:17-22`) carries a label, style, or even the source
location that the AST has (`PathCommand.loc`, `src/parser/ast.ts:150` — dropped
during evaluation). Adding a metadata field to these two types is the natural
channel for labels.

---

## 3. The primitive-SVG dance: what the compiler works around today

SVG's path syntax is a 1999-era pen-plotter instruction stream: single-letter
opcodes, positional numeric args, no names, no structure, one style per `d`
attribute. The compiler pays for this continuously:

| Workaround | Where | Why it exists |
|---|---|---|
| `normalizeToRelativeArgs` | `src/evaluator/index.ts:979-1018` | Convert absolute args back to relative when building the structured model; hard-codes each command's arg layout |
| `commandsToRelativeD` | `src/evaluator/annotated.ts:572-605` (+ a second copy near `index.ts:2289`) | Re-emit relative `d` from structured commands, again special-casing every letter |
| `parseAndTrackPathString` | `src/evaluator/index.ts:7489-7515` | **Regex re-parse** of strings returned by stdlib functions, to recover the cursor state that was lost because segment identity wasn't preserved |
| Bézier-extrema bbox solver | `src/evaluator/path-transforms.ts:214-310` | SVG offers no geometry queries; everything is re-derived from commands |
| `draw()` reconstruction | comment at `src/evaluator/index.ts:2284-2289` | stdlib generators store absolute strings while structured commands are relative — a direct symptom of the dual representation |
| Boolean-ops subpath splitting | `src/evaluator/boolean-ops.ts:3030,:3395` | Compensates for uppercase `M` falling through relative-command tracking |

The pattern: **the string representation and the segment representation
coexist, and every boundary between them costs a hand-written, per-letter
converter.** A unified segment-first model (strings generated once, at the very
end) would collapse the representation-boundary rows of this table (the
converters and the regex re-parse); the geometry-derivation rows (the bbox
solver) are inherent and remain. The labeling feature *requires* that
unification for layers — which means the feature's prerequisite is also a
refactor the codebase already wants. This substantially strengthens the case
for the direction.

### 3.1 One SVG limitation worth naming explicitly

A single `<path>` has a single style. There is no way to stroke one segment of
a `d` string differently, animate it independently, or attach a marker to an
interior vertex that isn't `marker-mid` on *every* vertex. Any future
"style/animate/reference this labeled segment" feature necessarily means the
compiler **splits one logical path into multiple SVG elements** (or duplicates
overlay paths). Labels are exactly the license the compiler needs to do that
splitting invisibly: the user authors one logical path; the compiler regroups
it by label at emit time. This is arguably the deepest long-term payoff of
definition-site labeling and is impossible in the string-accumulator model.

---

## 4. Prior art in this repo

- **`project-docs/pathblock-extensions/`** — the closest prior work: fillet /
  chamfer / elliptical fillet as **post-hoc whole-path methods**, with
  vertex-targeted variants addressed **by index** (`filletAtVertex(3, 5)`).
  Implemented via `applyCornerOperations`
  (`src/evaluator/path-transforms.ts:1501-1683`): identify corner vertices,
  trim the incoming and outgoing commands, splice in an arc. Line–line
  junctions only (v1 by design).
- **`tangentArc(r, sweep)` / `tangentLine(len)` / `turn` / `heading`**
  (`src/evaluator/index.ts:7346-7457`) — *forward* continuations from the
  running heading (`ctx.lastTangent`). They never look behind or rewrite.
- **Naming precedent** — every nameable thing in Pathogen (layers, Markers,
  Gradients, Patterns, Masks, ClipPaths, CSSVars) is a string key in a
  Map/registry with duplicate-ID detection. Labels extend a well-established
  pattern to sub-path granularity; no new mental model for users.
- **No prior exploration** of named segments/anchors/path queries exists in
  project-docs. The closest is index-based vertex targeting — which is exactly
  the API shape labels would fix (see §6.3).

---

## 5. Prior art in other languages

Surveyed for the specific question: *where do other systems attach join
behavior and sub-path identity?*

### 5.1 MetaPost / METAFONT (Knuth, Hobby) — annotate the joint, not the segment

Paths are first-class expressions where the **connective tissue between points
carries the behavior**:

```metapost
draw z0 .. z1 {up} .. tension 1.5 .. {right} z2 -- z3;
```

Direction specifiers (`{up}`), tension, and curl attach **at the knots and
joins**, not as suffixes on segments. MetaPost also has one of the richest
sub-path query surfaces ever shipped in a path language: `point t of p`,
`direction t of p`, `subpath (a,b) of p`, `arctime`, `intersectiontimes`.
Notably these are **positional queries** (time/arc-length), not named — users
resort to storing knot variables (`z1`) to name locations, which is precisely
the gap labels fill.

**Lesson:** join behavior reads most naturally *between* the two things being
joined; and a strong query API is what makes a rich path model pay off.

### 5.2 PostScript `arct` — the fillet as a corner operator (1985)

```postscript
x0 y0 moveto  x1 y1 x2 y2 r arct  x3 y3 lineto
```

`arct` takes the corner point and the next point and appends *line + tangent
arc* — a fillet expressed inline, at the corner, parameterized by the two
tangent lines. `joinPreviousWithFillet` is `arct`'s mirror image (looking
backward instead of forward). PostScript demonstrates the inline-fillet
semantics are sound and 40 years proven; the wrinkle is that `arct` *is* a
command in the stream, whereas a suffix modifies neighbors — a meaningful
difference for evaluation order (§6.2).

### 5.3 TikZ — inline naming and scoped join options

TikZ has shipped both halves of this proposal for ~20 years:

**Inline coordinate naming** (≙ `labeledWith endpoint(…)`):

```latex
\draw (0,0) -- (2,0) coordinate (a) -- (2,2);
\draw (a) circle (2pt);   % reference the named point later
```

The name attaches *in the flow of the path* at the point it describes, and
later drawing operations reference it. This is the strongest external
validation of definition-site vertex labeling — it is one of the most-used
features of TikZ.

**Scoped corner rounding** (an alternative to per-command suffixes):

```latex
\draw (0,0) [rounded corners=5pt] -- (1,0) -- (1,1) [sharp corners] -- (2,1);
```

Rounding is a **stateful option toggled mid-path**, applying to every corner
until switched off. Zero per-corner syntax; changing one corner means toggling
around it. Good for uniform styling, weak for individual corners — a useful
point on the design spectrum (§7, option D).

### 5.4 Inkscape Live Path Effects — record, don't rewrite

The fillet/chamfer LPE stores the *intent* (radius, per-node overrides) as
metadata on the path and applies it non-destructively at render time. The
original geometry is never lost; the effect re-applies when nodes move.
**Lesson:** definition-site annotations should be recorded and applied at
finalization, not eagerly baked into the command stream (§6.2).

### 5.5 CadQuery / build123d — tags and selectors are the payoff

```python
result = (cq.Workplane("XY").box(10, 10, 10)
          .edges(">Z").fillet(1)             # selector: query by geometry
          .faces(">X").workplane().tag("side") # tag: name for later reference
          ...
          .workplaneFromTagged("side"))
```

CAD kernels learned the hard way that **indexing into generated geometry is
brittle** (the "topological naming problem" — insert one feature and every
index shifts). Their answer is tags (explicit names at definition) plus
selectors (queries). This is the exact failure mode of Pathogen's current
`filletAtVertex(3, 5)`: add a command above it and the fillet lands on the
wrong corner. Labels are the proven fix.

### 5.6 The rest, briefly

- **Skia `CornerPathEffect` / Android `PathEffect`** — corner rounding as a
  uniform render-time effect. Another vote for "join behavior is a
  finalization concern."
- **D3 curve factories** (`curveCardinal`, `curveBasis`…) — join policy set
  once per generator, never per segment: policy-level joins suffice
  surprisingly often.
- **CSS `border-radius`** — per-**corner** property, not per-edge. Everyday
  evidence that users think of rounding as belonging to corners.
- **Flutter `PathMetrics.extractPath(a, b)`** — arc-length sub-path
  extraction; the query API labels would let Pathogen offer *by name*.
- **The DOM itself** — `SVGPathSegList` (a per-segment object API) was
  **removed** from the platform in Chrome 48 and dropped from SVG 2. The
  platform abandoned segment objects; every serious tool (paper.js, Snap,
  flatten.js, this compiler) reinvents them in userland. Pathogen making the
  segment model first-class in the *language* is exactly where such a model
  can live well.

---

## 6. Core insights

### 6.1 Join behavior belongs to the vertex, not the segment

The clunkiness of `v 20 joinPreviousWithFillet(5)` has a specific source: a
fillet is a property of the **joint between two segments**, and the pseudo-code
attaches it to the trailing segment. The name itself confesses this —
"joinPrevious**With**Fillet" is a sentence about a relationship, bolted onto
one of its two participants. Every mature system surveyed (MetaPost joins,
PostScript `arct`, CSS corners, TikZ rounded corners, CadQuery edge selectors)
puts this information on the joint/corner.

Reframing: the suffix feature is really **two features with different nouns**:

- **Vertex annotations** — fillet/chamfer radii, endpoint labels. Attach to the
  joint between the previous and current command.
- **Segment annotations** — segment labels (and eventually per-segment style,
  markers, animation targeting). Attach to the command(s) themselves.

Once the nouns are separated, syntax options stop fighting each other (§7).

### 6.2 Record, don't rewrite

The sketched equivalence (`h 20 / v 20 + fillet(5)` ≡
`h 15 / tangentArc / v 15`) implies the evaluator rewrites the *previous*
command at emit time. That is the wrong implementation model:

- The accumulator is append-only; nothing reaches back today, and reaching
  back interacts badly with loops, stdlib calls that emit multi-command
  strings, and the annotated evaluator.
- The compiler already has the right machinery in finalize-time form:
  `applyCornerOperations` trims the incoming/outgoing commands and splices the
  arc (`src/evaluator/path-transforms.ts:1576-1655`).

So `joinPreviousWithFillet(5)` should desugar to **a corner-op record attached
to the vertex being created**, applied when the path is finalized — i.e. it is
sugar for `filletAtVertex(<this vertex>, 5)` with the vertex identified by
adjacency instead of a brittle index. The user's equivalence still holds
observably (same output geometry, authored extents preserved and trimmed by
the fillet, matching `.fillet()`'s existing semantics), but no emit-time
rewriting exists. This also makes the annotations non-destructive
(Inkscape-LPE-style): `myPB.withoutCornerOps()` or inspecting the pre-fillet
vertices remains possible, and labels survive the fillet application.

Edge case to pin down: `with fillet(…)` on a command with **no previous
joint** — the first command of a block, or the first after a subpath-opening
`m` — has nothing to fillet. Recommended: compile error, mirroring
`tangentArc`'s existing no-prior-heading error (`src/evaluator/index.ts:7380`),
rather than a silent no-op.

### 6.3 Labels convert index-based APIs to name-based — that is the power

The concrete, near-term value of labels is that they fix an API family that is
already shipping in brittle form:

| Today (brittle) | With labels (robust) |
|---|---|
| `pb.filletAtVertex(3, 5)` — index shifts when a command is added | `pb.vertex('lid-corner').fillet(5)` |
| `pb.vertices[2]` as a drawTo target | `pb.point('anchor')` |
| `partition(n)` + manual index math to find a region | `pb.segment('east-face')` → sub-PathBlock with `get/tangent/normal/partition/boundingBox` |

And the deferred, longer-term value (out of scope now, but the reason the
foundation matters):

- **Per-segment styling/animation** via compiler-driven path splitting (§3.1) —
  impossible without segment identity.
- **Cross-layer references**: `layer('a').segment('lid')` as a geometry source
  for another layer, extending the existing `layer('name').ctx` pattern.
- **Marker/text attachment to named points** instead of marker-mid-everywhere.
- **Tooling**: hover/inspector showing labeled regions; diagnostics that say
  "in segment 'lid'" instead of a character offset.

**Naming convention used throughout this doc** (to keep the speculative API
consistent): an `endpoint('x')` label names a path vertex; it is queried two
ways — `pb.point('x')` returns a `Point` (geometry, for `drawTo`/layout), and
`pb.vertex('x')` returns a *vertex handle* exposing corner ops
(`.fillet(r)`, `.chamfer(…)`). Two nouns because they answer different
questions: `point` is a value, `vertex` is a structural handle. Note that a
two-argument `fillet(r, target)` spelling is deliberately avoided: `fillet(r)`
already ships with all-corners semantics, and overloading it with a target
argument would collide.

One nuance the pseudo-code already got right: `segment(…)` and `endpoint(…)`
are distinct label kinds. They map cleanly onto the existing
`subPathCommands` / `vertices` duality (`docs/path-blocks.md:89-110`).

A nuance it didn't surface: **one statement can emit many commands.**
`circle(5, 5, 20) labeledWith segment('circle-01')` labels a stdlib generator
that returns a multi-command string (today re-parsed by regex,
`src/evaluator/index.ts:7489`). Labels must therefore attach at **statement
granularity and denote command ranges**, not single commands — `'circle-01'`
names commands *i..j*. This falls out naturally from record-at-emit metadata
and would be painful in any design that assumes 1 statement = 1 segment.

### 6.4 The prerequisite is also the payoff

Labels in `apply {}` blocks require structured command tracking in layers
(§2.2), which forces retiring the string accumulator as the source of truth —
which in turn collapses the workaround inventory in §3. Even if the suffix
syntax were ultimately rejected, "make `PathBlockCommand[]` the universal
representation, generate strings only at emit" is independently the highest
-leverage internal change identified by this research. Recommended sequencing
in §8.

### 6.5 The parser makes one option untenable and the rest cheap

Path-command arguments are consumed as one opaque token by an external
tokenizer (`src/parser/path-args-tokenizer.ts`) and re-parsed by hand
(`parsePathArgs`, `src/parser/ast-builder.ts:679-834`). Three hard facts, all
verified against the real `parse()` (`src/parser/index.ts`), not inferred from
code reading:

- `v 20 joinPreviousWithFillet(5)` (no trailing `;`) **already parses,
  silently**, as `v` with two positional args — the tokenizer swallows the
  call into the `PathArgs` blob and `parsePathArgs` emits
  `[NumberLiteral 20, FunctionCall joinPreviousWithFillet(5)]`. Function calls
  are legal path args, so a bare suffix call is *grammatically
  indistinguishable from an argument*. Option A in §7 is dead on arrival, not
  merely clunky.
- The pseudo-code **as literally written errors today for an unrelated
  reason**: no path command accepts a trailing semicolon. Even `h 20;` is a
  parse error — the tokenizer stops *before* the `;` and the grammar's
  `PathCommand` production has no `";"?` slot, so the stray `;` becomes an
  error node, surfaced as a (misleading) `Missing ';'` message. Two
  consequences: (1) any suffix design written with a terminating `;` implies
  also adding optional `";"?` to `PathCommand` (precedent exists —
  `TextStatement` takes `;?`); (2) the `Missing ';'` wording on a *surplus*
  semicolon is an adjacent diagnostics paper cut worth fixing regardless of
  this feature (verified by running `parse()` on `h 20;`; per repo policy,
  backstop any wording fix with a diagnostics test).
- `labeledWith a, b` **breaks today** at the tokenizer's top-level-comma
  boundary (`path-args-tokenizer.ts:174-183`).

The good news: `@{}` bodies, `apply {}` bodies, and top level all share the
same `statement*` production (`src/parser/pathogen.grammar:24-40, 94-97,
291-293`), so a single change to the `PathCommand` production
(`pathogen.grammar:139-178`) — a post-`PathArgs` clause introduced by a
keyword the tokenizer treats as a boundary — propagates to every context. The
AST hook is one optional field on `PathCommand` (`src/parser/ast.ts:145-151`).

---

## 7. Syntax alternatives

Evaluated against: parser feasibility (§6.5), the vertex/segment noun split
(§6.1), verbosity, and consistency with existing Pathogen idioms (keyword
clauses like `define`, style blocks, method chains; single-quoted names).

**A. Bare suffix call** — `v 20 joinPreviousWithFillet(5);`
Rejected. Indistinguishable from a positional function-call argument (§6.5);
today it is silently swallowed as one. Making it mean something would change
the meaning of currently-valid programs and create a permanent ambiguity class.

**B. Keyword clause (recommended core)** — a marker word ends the args and
introduces annotations:

```pathogen
pl.apply {
  h 20 as segment('lid');
  v 20 with fillet(5);
  h -20 as segment('base'), endpoint('base-end');
  circle(5, 5, 20) as segment('circle-01');
  v 20 with fillet(5) as segment('west'), endpoint('home');
}
```

Two keywords for the two nouns: **`as`** for identity (labels), **`with`** for
behavior (corner ops on the vertex being created). Short, reads as English,
follows the existing keyword-clause idiom, and the comma problem disappears
because the clause is real grammar, not tokenizer soup. `labeledWith` works
identically but is heavier; `as … / with …` is the tighter spelling of the
same design. Parser cost, honestly stated: two boundary words, a post-`PathArgs`
grammar slot, optional trailing `";"?` on `PathCommand` (see §6.5 — today no
path command accepts one), and an AST field that is a small struct (corner ops
+ labels), not a scalar. The combined clause also needs ordering rules pinned
down in the design phase — proposed: at most one `with` and one `as` clause per
command, `with` before `as`, and the comma-separated list belongs exclusively
to `as`.

**C. Sigil shorthand (possible later sugar)** —

```pathogen
h 20 #lid;             // segment label
v 20 ~fillet(5) #west; // corner op + label
```

Tokenizer-trivial, terse, TikZ-flavored. But it introduces a new sigil
vocabulary with no precedent in Pathogen, and `#` may want reserving for other
uses. Worth keeping in the back pocket as sugar over B, not as the primary
syntax.

**D. Scoped modifier (complementary, not competing)** —

```pathogen
withFillet(5) {
  h 20; v 20; h -20;   // every corner in the block gets r=5
}
```

The TikZ `rounded corners` model. Excellent for uniform rounding (the common
case in practice — see D3/Skia, §5.6), useless for naming individual segments.
If per-vertex `with fillet(…)` exists, the scoped form is a natural later
addition sharing the same corner-op records. Don't lead with it; don't design
B in a way that precludes it.

**E. Post-hoc by name only (minimal grammar footprint)** —

```pathogen
let pb = @{ h 20; v 20; };
pb.label('lid', 0).labelVertex('corner', 1);   // still index-based at attach time
```

No grammar change, but attachment is again positional/index-based — it
reintroduces the brittleness labels exist to fix, and it separates the label
from the line of code that creates the geometry, losing the definition-site
readability that motivated the whole idea. Not recommended except as an escape
hatch for computed/loop-generated labels (`h step as segment('rib-${i}')` may
want an expression-valued label anyway — see open questions).

### Recommended direction

1. Reframe as **vertex annotations** (behavior: fillet/chamfer; identity:
   endpoint labels) plus **segment annotations** (identity: segment labels,
   spanning command ranges).
2. Syntax **B**: `with <op>(…)` for behavior, `as segment('…') / endpoint('…')`
   for identity, in all three path contexts.
3. Semantics: **record-then-apply** — annotations become metadata on the
   structured command model; corner ops apply at finalization via the existing
   `applyCornerOperations`; labels persist through it.
4. Keep C (sigils) and D (scoped blocks) as compatible future sugar.

---

## 8. Open questions & deferred work

- **Sequencing.** The enabling refactor (structured commands as universal
  source of truth in layers; strings emitted once) is valuable standalone and
  should likely land *first*, without any syntax change. Labels/suffixes then
  become a small grammar + metadata delta instead of a big-bang feature.
- **Query API shape.** `pb.segment('lid')` returning a real PathBlock (with
  `get/tangent/partition/boundingBox`) vs. a lighter view object; what
  `pb.vertex('x')` returns (Point? an object with `.fillet()`?); wildcard or
  list queries (`pb.segments('rib-*')`?). CadQuery selectors suggest queries
  can grow rich; start minimal.
- **Duplicate labels.** Registry-per-path with duplicate detection (matching
  the Marker/Gradient pattern), or allow duplicates as groups (`'rib'` on
  every rib, query returns a collection)? Loops make the group reading
  attractive; `as segment('rib-${i}')` implies label expressions must be
  evaluated, not bare literals.
- **Fillet at curve junctions.** Current corner ops are line–line only.
  A definition-site `with fillet(5)` on a curve join would need either the
  existing warning behavior or the elliptical/curve-aware machinery from
  `pathblock-extensions` follow-ups.
- **Annotated evaluator & three surfaces.** Any implementation must land in
  both evaluators (`index.ts` + `annotated.ts`) and render identically in CLI,
  playground, and VS Code; labels likely also want inspector/hover support.
  (Standard lifecycle; noted so estimates include it.)
- **`ctx` inside `@{}`.** The frozen `ctx.position` gotcha
  (`src/evaluator/index.ts:7072-7093` walks past the block scope) is adjacent:
  a richer segment model is a natural moment to fix live `ctx` in blocks.
- **Docs-first.** Per repo policy, implementation begins with
  `docs/<feature>.md` (+ `DOC_FILES` registration) — probably extending
  `docs/path-blocks.md` with a new page for labels/annotations. This document
  is internal research and does not satisfy that requirement.

---

## 9. Companion artifact

`syntax-sketches.pathogen` in this directory holds all candidate syntaxes as
one commented, **non-compilable** sketch file for side-by-side reading.

---

## Addendum (2026-07-17): What else the refactor unlocks

> Prompted by the observation in §6.4 — "the feature forces a refactor the
> codebase already wants." That sentence implies a current limitation; this
> addendum names the limitation precisely and surveys the *other*
> opportunities that open up once it is addressed, independent of whether
> suffix syntax or labels ever ship.

### A.1 The limitation, stated precisely

Outside `@{}` blocks, **the string is the source of truth**. Layers and the
top-level context accumulate `accum: string[]`; the structured
`PathBlockCommand[]` model exists only where `trackHistory` is on
(`src/evaluator/index.ts:1816`), and even there it coexists with a parallel
`pathStrings` array (`src/evaluator/types.ts:524`). Three consequences follow:

1. **Every boundary between representations costs a hand-written converter**
   (the §3 table), each special-casing all ~20 command letters, each a drift
   risk against the others.
2. **Segment identity is destroyed at emit.** Once a command becomes a string,
   its type, arguments, geometry, provenance (`PathCommand.loc`,
   `src/parser/ast.ts:150`), and any future metadata are unrecoverable except
   by regex re-parsing (`parseAndTrackPathString`,
   `src/evaluator/index.ts:7489`).
3. **Geometry the compiler computed is thrown away and re-derived.** The
   evaluator knew every `start`/`end` point as it emitted; downstream
   consumers re-parse strings to learn what the evaluator already knew.

The refactor is: make `PathBlockCommand[]` (extended with a metadata slot) the
universal representation in all three path contexts, and serialize to SVG
strings exactly once, at emit time. Everything below falls out of that single
inversion.

### A.2 Tier 1 — Debt collapse (correctness and simplification)

- **Retire the converter museum.** `normalizeToRelativeArgs`
  (`index.ts:979`), both copies of `commandsToRelativeD` (`annotated.ts:572`,
  near `index.ts:2289`), `projectCommands`, and `parseAndTrackPathString`
  reduce to one serializer + one origin-offset helper over structured
  segments. The `draw()` reconstruction workaround (comment at
  `index.ts:2284-2289`) and the boolean-ops uppercase-`M` compensation
  (`boolean-ops.ts:3030, :3395`) disappear with them.
- **Eliminate a fidelity risk class.** The regex re-parse
  (`/([MLHVCSQTAZ...])\s*([\d\s.,eE+-]*)/g`) is the kind of code where arc
  flags, exponent notation, or a future syntax extension silently corrupt
  geometry. Structured segments never round-trip through text, so the class
  of bug is gone, not just currently absent.
- **`PathSegment` stops being a bare string** (`src/stdlib/path.ts:7`).
  Stdlib generators return structured segments directly — which is also the
  prerequisite for statement-granularity labels on generator output (§6.3).

### A.3 Tier 2 — Capability parity: layers become geometry, not write-only sinks

Today the entire geometry API — `boundingBox()`, `get/tangent/normal`,
`partition()`, `fillet()/chamfer()`, `offset()`, `reverse()`, `intersects()`,
boolean ops — exists only on PathBlock values. A layer built with `apply {}`
is **write-only**: you can add commands to it, but you can never ask it
anything. With structured tracking everywhere:

- `layer('blob').boundingBox()` — layout and centering against layers, not
  just PathBlocks (extending the existing "use `boundingBox()` + `drawTo()`
  for layout" idiom to the whole language).
- `pl.fillet(5)` / corner ops on apply-built paths — currently impossible;
  users must restructure code into PathBlocks to round a corner.
- `layer('road').partition(40)` — decorate along a *layer's* path (the
  cross-layer read precedent already exists in `layer('name').ctx`).
- Uniformity as a teaching win: one geometry vocabulary everywhere, no
  "PathBlocks are queryable but layers aren't" asterisk in the docs.

**Beyond queryable: modifiable.** (Ryan's extension of this point.) Reading is
half the win; structured segments also make layer contents *editable after
definition* — something the append-only string accum makes impossible in
principle. Post-hoc modification of a layer becomes an ordinary operation:

```pathogen
// speculative
pl.apply { h 20 as segment('lid'); v 20; }
pl.replaceSegment('lid', @{ h 8; tangentArc(4, pi); h 8; });
pl.removeSegment('scaffold');      // drop construction geometry before emit
pl.vertex('base-corner').fillet(5); // corner ops on a finished layer
```

Two design notes make this a natural fit rather than a bolt-on:

1. **The mutability semantics already match.** PathBlock operations are
   functional — `reverse()`, `offset()`, `fillet()` return new values —
   while layers are the language's *stateful* construct: `apply {}` blocks
   mutate them incrementally by design. In-place modification methods on
   layers extend that existing statefulness; nothing about the language's
   expression-first character is violated.
2. **Labels are what make modification safe.** Editing by command index has
   the same brittleness as `filletAtVertex(3, r)` (§6.3) — any earlier
   `apply` change shifts the target. Named segments give modification a
   stable handle, which is why modifiability lands in this research rather
   than standing alone: labels and layer editability are two halves of one
   capability.

The open question it raises: *when* do modifications apply relative to
multiple `apply {}` blocks and emit — immediately (mutating the segment list
between statements) or as recorded operations at finalization like corner ops
(§6.2)? Immediate mutation is the intuitive reading of stateful layers;
recorded application composes better with non-destructive labels. Flagged for
the design phase.

### A.4 Tier 3 — Transform-aware geometry

Verified: transforms **never touch coordinates** today. `TransformState` is
carried beside the path and serialized to an SVG `transform=` attribute
(`transformStateToSvg`, `src/evaluator/context.ts:413-444`), and every
`computeBoundingBox` call site consumes raw untransformed `commands`. So the
compiler literally does not know the true extent of a rotated or scaled layer
— bounding boxes, `intersects()`, and any layout math are silently
pre-transform.

The affine-baking machinery already exists for PathBlock rotate/scale
(`transformPathPoints`, `src/evaluator/path-transforms.ts:794-870`, including
the subtle cases: H/V commands re-emitted as `l` under rotation, arc handling
via ellipse eigendecomposition at `:994`). With segments as the universal
model, a `.flatten()` (bake transforms into coordinates) becomes a small,
uniform operation — unlocking:

- **True post-transform bounding boxes** and correct `intersects()` across
  transformed layers.
- **Boolean ops between transformed geometry** without the current
  compensation code.
- **Layout that survives rotation** — centering a rotated layer currently
  requires the user to do trigonometry the compiler could do.

### A.5 Tier 4 — Tooling and DX: provenance restored

The AST knows every command's source location (`PathCommand.loc`); evaluation
drops it. A metadata-bearing segment model carries it through, which enables:

- **Runtime errors that point at code.** "Fillet skipped: curve junction" as
  a warning *on the source line of the corner*, not a console note.
- **Preview ↔ source mapping.** Click a segment in the playground or VS Code
  preview, jump to the command that produced it; hover a command, highlight
  its geometry. This is the inspector-panel direction, and it is impossible
  while emit destroys identity. Labels make the mapping human-meaningful
  ("segment 'lid'"), but `loc` alone already makes it mechanical.
- **A cheaper annotated evaluator.** `annotated.ts` exists substantially to
  track provenance the main evaluator discards. If provenance rides on
  segments in the shared model, the two evaluators converge — shrinking the
  permanent double-maintenance tax noted in every feature checklist.

### A.6 Tier 5 — Emit becomes a controllable backend

Once serialization happens exactly once, the emit step becomes a place to add
value instead of a formality:

- **Output optimization**: precision control, collinear-segment merging,
  `h`/`v` recognition, shortest-form relative/absolute choice per command,
  `S`/`T` smooth-command reconstruction — smaller published SVGs for free.
- **Label-driven path splitting** (§3.1): one logical path authored, multiple
  `<path>` elements emitted so labeled segments can carry their own style,
  markers, or animation. The single-style-per-`d` limitation of SVG stops
  being a language limitation and becomes an emit detail.
- **Alternate backends.** Structured segments are a renderer-neutral IR:
  Canvas2D rendering for playground performance, GPU tessellation (the
  WebGPU precedent already exists for conic gradients), PDF export, pen
  plotter / CNC output (HPGL, G-code). Pathogen's identity shifts from "a
  language that builds SVG strings" to "a geometry language whose default
  backend is SVG" — strategically the largest item on this list.

### A.7 Tier 6 — Farther out, but only reachable from here

- **Direct manipulation**: segments + `loc` + labels are exactly the three
  ingredients needed for drag-a-vertex-in-preview → rewrite-the-source
  editing.
- **Per-segment caching**: `partition/get/tangent` re-derive arc-length
  tables per call; immutable segment objects are natural memoization keys.
- **Constraint-flavored layout**: named points on structured geometry enable
  snapping, alignment, and `drawTo(other.point('anchor'))` chains — the
  lightweight end of the CAD-constraint spectrum, without a solver.

### A.8 Honest costs

- The refactor spans both evaluators, the emit paths of all three surfaces,
  and boolean ops; the CLI byte-snapshot fixtures will churn and need a
  deliberate `--update` pass with diff review.
- Relative/absolute emission choices are observable in output bytes; "same
  geometry, different serialization" must be treated as an intended,
  reviewed change, not silent drift.
- A staged (strangler) path exists: first track structured commands
  *alongside* the string accum in layers (the mechanism already supports it —
  `trackHistory` is just off), verify parity, then flip the source of truth
  and delete the string path. No big-bang required.
