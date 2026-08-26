# Item G addendum — what :each is actually for, and the array-duplication audit

Written 2026-08-26 in answer to the user's post-ship questions: (1) a
concrete use case for `segmentAll('cut.some-label:each')`, (2) what
"block" means in the :each docs, (3) whether the pseudo family
duplicates array functionality.

## "Block" means PathBlock, nothing else

Every segment query has always returned PathBlock values (or
ProjectedPath on projected receivers) — `segmentAll('x')` is an array
of PathBlocks. ":each returns one block per drawing command" uses
"block" in exactly that pre-existing sense: the elements are ordinary
PathBlocks, just smaller ones. No callback, no trailing block, no new
syntax.

## The concrete use case: structural boundaries that fractions can't find

`:each` changes GRANULARITY — run → individual command — which no
array operation can do, because the array's elements are already
whole runs. The pre-:each escape hatch was `subPath(t0, t1)`, which is
ARC-LENGTH parametric: it can only split a run at a fraction, and the
fraction lands on the command boundary only when the commands happen
to be equal length.

Concrete: the stained-glass rim (post44/02) is labeled
`as segment('cut.rim')` on a `circle()` call — one run of two arcs.
Suppose the leading is soldered in two half-circle strips and you want
a tick mark at each strip's ends (i.e., at the arcs' actual joints):

```pathogen
// BEFORE — parametric guessing
let rim = disc.segment('cut.rim');
let stripA = rim.subPath(0, 0.5);     // correct ONLY because circle()'s
let stripB = rim.subPath(0.5, 1);     // two arcs happen to be equal;
                                      // an ellipse or a 3-arc rim breaks this

// AFTER — structural truth
for (strip in placed.segmentAll('cut.rim:each')) {
  let jointStart = strip.startPoint;
  circle(jointStart.x, jointStart.y, 2);   // tick at the real joint
}
```

The same shape appears wherever one label covers several unequal
commands: a wavy jigsaw knife's healed seam (one run, several cubics
of different lengths — score only its straight segments), a labeled
`roundRect` outline (lines + corner quads — decorate lines, skip
corners). The value of `:each` is that the split points are the
command joints the author actually drew, not fractions that
approximate them.

Honest caveat, restated from the summary: nothing published needs
this today, and the `cut.<label>` composition specifically is thinner
still — cut seams from straight knives are single commands, where
`:each` is a no-op. `:each` earns its place on authored multi-command
runs (stdlib-call labels), not on cut sub-labels.

## The duplication audit (the user's worry, confirmed in part)

| Pseudo | Array equivalent | Verdict |
|---|---|---|
| `:each` | **None.** Elements of `segmentAll('x')` are whole runs; nothing decomposes below that. `subPath` is parametric, not structural. | Genuinely new capability |
| `:first` | `segmentAll('x')[0]`, and the bare singular `segment('x')` already means exactly this | Pure duplicate — two existing spellings |
| `:nth(k)` | `segmentAll('x')[k]`, byte for byte | Pure duplicate, and a second indexing notation to keep consistent forever |
| `:last` | `let runs = segmentAll('x'); runs[calc(runs.length - 1)]` | Duplicate; the array form needs a temp + calc, so this is the one with real ergonomic value |

The position family was part of the user's F-era sketch and chosen
deliberately ("full family") — but the duplication concern was raised
after seeing it shipped, with the explicit principle: don't duplicate
array functionality in the query language, or do it judiciously.

Options presented (decision pending):
1. Trim to `:each` only — remove :first/:last/:nth while unreleased.
   The `:` grammar and its errors stay; the family can return if a
   future pseudo is NOT array-expressible (predicates like a
   hypothetical :closed, not positions).
2. Trim to `:each` + `:last` — keep the one position with a real
   ergonomic gap; drop the two exact duplicates.
3. Keep all four, re-documented explicitly as sugar over array
   indexing so the duplication is at least acknowledged.

## Decision (2026-08-26, user)

- Rename `:each` → **`:atomic`** — the user's own suggestion; pairs
  with the "compound run" vocabulary (compound runs decompose into
  atomic blocks) and removes the ambiguity that segmentAll already
  returns "each run". Renamed across code/tests/docs/posts while
  0.8.0 is unreleased; grammar and errors unchanged otherwise.
- **Keep `:first`/`:last`/`:nth(k)`** — duplication acknowledged and
  accepted deliberately: "they are helping to anchor the pseudo
  selector feature set" (option 3 of the audit, chosen with eyes
  open).
- User comprehension anchors verified by probe: rect() → 1 run →
  4 atomic sides (3 L's + the geometry-carrying z); a loop of
  labeled tangentLine() with turn() between (no commands emitted) →
  same 1-run/4-sides shape. "Compound" = any run with 2+ drawing
  commands, source-agnostic.
