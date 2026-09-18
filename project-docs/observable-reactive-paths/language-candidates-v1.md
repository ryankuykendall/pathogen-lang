# Language candidates from "Drawing Without Bookkeeping" — v1 (2026-09-18)

What the five posts' samples reached for and could not find, written up as proposals.
Each entry gives the friction that produced it (entry numbers refer to
`FRICTION-LOG.md`), what the samples do today, the shape the feature could take, pseudo
code before and after, where it would be used beyond the series, and what it would cost.
Nothing here is committed to; the order is roughly by how often the series hit it.

Two things checked before writing this: `text(x, y, rotation, #{ … })` already accepts a
per-call style block (documented under "Per-Element Styles on Text and Tspan", which the
samples' author missed; entry 23 corrected), and selector strings are ordinary strings,
so `:nth(${a}, ${b})` interpolates today while an array interpolates as `[1, 3]`.

---

## 1. `Endpoint.outward`, `Endpoint.arriving`, `Endpoint.leaving`, `Command.startHeading`, `Command.endHeading`

**Friction.** Entries 17–18 and every twin in parts 2–5. Four different samples compute
"the direction that points away from the bars at a joint", and three compute "which
way does this command run" — always through `block.tangent(t).angle`, always as plain
radians that then need `deg()`.

**Today.**
```pathogen
// part 2 / part 3, the outward bisector at a joint
let heading = pivot.command.block.tangent(1).angle;
let away = heading + pivot.turn.rad / 2 - PI() / 2;
text(pivot.x + cos(away) * 12, pivot.y + sin(away) * 12 + 3)`${pivot.label}`;

// part 3, the crank angle: ground bar arriving (reversed) to crank leaving
let groundOut = pivotO2.command.block.tangent(1).angle + PI();
let crankHeading = pivotO2.next.block.tangent(0).angle;

// part 5, a fret's lean
let lean = deg(fret.block.tangent(0).angle) - 90;
```

**Proposal.** Angle-valued members on the structs queries already return:

| Member | Type | Meaning |
|---|---|---|
| `Command.startHeading` | Angle | direction of travel as the command begins |
| `Command.endHeading` | Angle | direction of travel as it ends (for `l`, the same) |
| `Endpoint.arriving` | Angle | `command.endHeading` |
| `Endpoint.leaving` | Angle or `null` | `next.startHeading`; null at an open end |
| `Endpoint.outward` | Angle | the bisector of the exterior angle at the joint — the direction a label goes to sit clear of both bars; at an open end, the reverse of `arriving` |

Angle-valued, so `.deg`/`.rad` come for free and `polarPoint(away, 12)`-style helpers
accept them directly.

**After.**
```pathogen
let away = pivot.outward;
text(pivot.x + cos(away) * 12, pivot.y + sin(away) * 12 + 3)`${pivot.label}`;

angleArc(pivotO2.point, 20, pivotO2.arriving + 180deg, pivotO2.leaving, arcs, labels);

let lean = fret.startHeading.deg - 90;
```

**Where else.** Every callout: leader lines on any drawing, dimension text, node labels
on graphs and trees, glyph placement along a path. `outward` is the single most repeated
expression in the series.

**Cost.** Small: the matcher already resolves tangents for `turn`; five lazy descriptors
in `struct-properties.ts`, a docs table row each, LS member completions. No emission
change. Risk: `outward` needs one rule for the sign at collinear joints (turn = 0 → the
left-hand normal, matching `normal(t)`) and it should be documented that on an authored
path "outward" means "the side `normal(t)` picks", not the geometric outside.

---

## 2. `circleCircle(c1, r1, c2, r2)` and friends — real intersections

**Friction.** Entry 18. The four-bar solver needs where the coupler's reach meets the
rocker's reach. `intersectionPoints()` is bounding-box based, so the sample carries the
law of cosines.

**Today.**
```pathogen
let dx = O4.x - pinA.x;
let dy = O4.y - pinA.y;
let reach = sqrt(dx * dx + dy * dy);
let toward = atan2(dy, dx);
let open = acos((coupler * coupler + reach * reach - rocker * rocker) / (2 * coupler * reach));
let pinB = Point(pinA.x + coupler * cos(toward - open), pinA.y + coupler * sin(toward - open));
```

**Proposal.** Three stdlib functions that return arrays of Points, empty when there is no
intersection, with a documented order so callers can pick a branch:

```pathogen
circleCircle(c1, r1, c2, r2)   // 0, 1 or 2 points; [left of c1→c2, right of c1→c2]
lineCircle(p1, p2, c, r)       // 0, 1 or 2 points, in order along p1→p2
lineLine(p1, p2, p3, p4)       // 0 or 1 point (infinite lines); segments via a flag
```
and, on PathBlock / ProjectedPath, an exact mode for the existing method:
`intersectionPoints(other, { exact: true })` sampling curves (arcs solved analytically,
Béziers by subdivision), returning the crossing points in arc-length order.

**After.**
```pathogen
let both = circleCircle(pinA, coupler, O4, rocker);
if (both.length == 0) {
  warn(`crank angle ${theta} cannot assemble`);
}
let pinB = both[1];   // the open configuration; both[0] is the crossed one
```

**Where else.** Compass-and-straightedge constructions ("an arc from A of radius r meets
an arc from B of radius s" is how a drafting text places every point), trusses and roof
geometry, gear centre distances, tangent circles for cam profiles, jig and template
design, the origami crease patterns held back from this series.

**Cost.** Medium: the circle–circle and line cases are twenty lines each with the usual
degeneracies (coincident, tangent, containment). Exact block intersection is the larger
piece and can come later. Names: `circleCircle` reads better than `intersectCircles` in
path-argument position; all three return Points so they work with `M both[1].x …` after a
`let`.

---

## 3. `toFixed(x, n)` — number formatting

**Friction.** Entry 22, twice over. A drill schedule wants `7.0`; a fret table wants
`323.85`; a value once printed as `22.60000000000001`. The samples carry an `mm()` helper
that grew from four lines to thirteen and shipped a wrong sign before it learned
negatives.

**Today.**
```pathogen
fn mm(value) {
  let sign = '';
  if (value < 0) {
    sign = '-';
  }
  let hundredths = round(abs(value) * 100);
  let whole = floor(hundredths / 100);
  let frac = hundredths - whole * 100;
  let pad = '';
  if (frac < 10) {
    pad = '0';
  }
  return `${sign}${whole}.${pad}${frac}`;
}
text(x, y)`${mm(fret.start.x)}`;
```

**Proposal.** One stdlib function returning a string, mirroring what every host
language offers, plus an Angle-aware overload:

```pathogen
toFixed(value, digits)          // '323.85'; digits 0..20; negatives and rounding right
toFixed(angle, digits, 'deg')   // Angle values: '-13.46'
```
Optionally a template precision suffix later — `${value:2}` — but the function alone
removes the helper from twelve files.

**After.**
```pathogen
text(x, y)`${toFixed(fret.start.x, 2)}`;
text(x, y)`${toFixed(lean, 2)}°`;
```

**Where else.** Every table, dimension value, legend, axis tick and log line. The domain
survey lists "number formatting" as a general gap for luthiery, front panels and STEM
diagrams alike.

**Cost.** Trivial in `stdlib/math.ts`; needs the completion entry in `pathogen-api.ts`,
a docs row, and a note that it returns a string (so `toFixed(x, 1) + 1` is an error, not
`8.0` + 1).

---

## 4. Per-subpath markers

**Friction.** Entry 21. `marker-start` / `marker-end` on a layer holding four dimension
lines produced two arrowheads, because a layer is one `<path>` and SVG markers are per
element. The samples rotate an arrowhead block into place instead.

**Today.**
```pathogen
let tip = @{ l -7 -3 l 0 6 z };
let along = link.block.tangent(0.5).angle;
let head = tip.rotate(along);
let tail = tip.rotate(along + PI());
dimArrows.apply {
  M calc(to.x + nx * offset) calc(to.y + ny * offset) head.draw()
  M calc(from.x + nx * offset) calc(from.y + ny * offset) tail.draw()
}
```

**Proposal.** A style property on path layers that changes how the layer is emitted:

```pathogen
let dimLines = PathLayer('dim-lines') #{
  stroke: dims;
  marker-start: dimArrow;
  marker-end: dimArrow;
  marker-scope: subpath;      // default: path
};
```
With `marker-scope: subpath`, the emitters (`src/cli.ts` and `src/render/build-layers.ts`)
write the layer as a `<g id="dim-lines">` containing one `<path>` per subpath, styles on
the group, so every run gets its own start and end marker. `marker-mid` keeps its
meaning within each run. Layer identity, `data-layer-name`, the inspector's layer list
and hit-testing all see one layer; only the DOM shape changes.

**After.**
```pathogen
fn dimension(link, offset) {
  // … extension lines as before …
  dimLines.apply {
    M calc(from.x + nx * offset) calc(from.y + ny * offset)
    L calc(to.x + nx * offset) calc(to.y + ny * offset)
  }
  // no arrowheads to draw: the markers do it, one pair per line
}
```

**Where else.** Leader lines with dots at one end and arrows at the other, vector
fields and flow diagrams (one arrow per sample), edge arrows on graphs, tick marks along
several separate rules, anything drawn in a loop that wants an end decoration per
iteration.

**Cost.** Medium: two emitters plus the playground's layer visibility toggles and the
mini-workspace inspector must accept a `<g>` where a `<path>` used to be (the
`data-layer-name` on every child, as text layers already do, is the pattern to copy).
Byte-snapshot fixtures unaffected unless a fixture opts in.

---

## 5. Per-text styles (exists — document it) and tab stops on a text layer

**Friction.** Entry 23, now corrected. The schedule's right-aligned numbers beside a
left-aligned footer became two text layers because `text-anchor` looked like a layer-only
property. It is not: `text(x, y, rotation, #{ … })` takes a per-call style block, merged
over the layer's styles in both emitters. The layers reference documents it two hundred
lines after the section that introduces `text()`, and the samples' author did not find it.

**Today (and always did).**
```pathogen
col.apply {
  text(x0 + 2, y, 0deg, #{ text-anchor: end; })`${i + 1}`;
  text(x0 + 13, y, 0deg, #{ text-anchor: end; })`${toFixed(box.width, 1)}`;
  text(x0, footerY, 0deg, #{ fill: fg_muted; })`${slots.length} rail slots`;
}
```

**Proposals.**
1. Cross-reference the fourth argument from the `text()` section (done in
   `docs/layers.md` alongside this note) and let the rotation be omitted when the third
   argument is a style block:
   `text(x, y, #{ text-anchor: end; })`. Grammar: the third expression is a rotation
   unless it is a `StyleBlockLiteral`.
2. Tab stops, for tables: a text layer property and a `\t` in the template:
   ```pathogen
   let schedule = TextLayer('schedule') #{
     font-family: mono;
     tab-stops: 2 end, 13 end, 26 end, 42 end;   // x offset from the text's x, anchor per stop
   };
   schedule.apply {
     text(x0, y)`${i + 1}\t${toFixed(box.width, 1)}\t${toFixed(centre.x, 1)}\t${toFixed(centre.y, 1)}`;
   }
   ```
   Emitted as one `<text>` with a `<tspan x=… text-anchor=…>` per field, so the row is
   one statement, the alignment is declared once, and a schedule with nine rows is nine
   lines of source.

**Where else.** Drill schedules, cut lists, bills of materials, fret tables, legend
keys, axis labels with units — any place a drawing carries a table.

**Cost.** (1) is a docs cross-reference plus a small grammar disambiguation. (2) touches the
text-body evaluator (split on `\t`), both emitters (tspans with `x` and `text-anchor`),
and the sanitizer's property allow-list; the font-metrics service is not needed because
stops are explicit.

---

## 6. `:nth` with a list value, and interpolated selectors

**Friction.** Entry 26. The marker frets are written twice, `[3, 5, 7, 9, …]` for the
dots and `:nth(2, 4, 6, 8, …)` for the tint, kept in step by hand. Scalar interpolation
into a selector works today; an array interpolates with brackets, so
`:nth(${markerFrets})` is not a selector.

**Today.**
```pathogen
let markerFrets = [3, 5, 7, 9, 12, 15, 17, 19, 21];
for (fret in slots.queryAll('command(line):nth(2, 4, 6, 8, 11, 14, 16, 18, 20)')) { … }
for (n in markerFrets) { let here = frets[n - 1]; … }
```

**Proposals**, cheapest first:
1. Let the selector parser accept an interpolated array as a list: strip `[` `]` inside
   `:nth(…)`, so `:nth(${indexes})` works, and document that selectors are strings and
   interpolate.
2. A second argument carrying values the selector refers to by name:
   `slots.queryAll('command(line):nth($marks)', { marks: indexes })` — the
   CSS-variable spelling readers already know.
3. Accept 1-based spellings where the domain counts from one: `:nth(3, 5, 7 from 1)` is
   too clever; better to leave `:nth` 0-based and let the program derive the list.

**After (1).**
```pathogen
let markerFrets = [3, 5, 7, 9, 12, 15, 17, 19, 21];
let indexes = markerFrets.map {|n| n - 1 };
for (fret in slots.queryAll(`command(line):nth(${indexes})`)) { … }
```

**Where else.** Any selection driven by data: highlighting the rows of a table that fail
a check, the teeth of a gear that carry a mark, every third rung of a ladder.

**Cost.** (1) is a few lines in `path-query.ts`'s index-list parser plus a test; (2) is a
new signature across `query`/`queryAll`/`subscribe` and the LS.

---

## 7. A friendlier parser hint for command letters in path position

**Friction.** Entry 17, twice. `L A.x A.y` and `M c.x c.y` fail with "'A' is a path
command here, so it cannot be used as a bare variable in path arguments — write calc(A),
or rename the variable". `calc(A.x)` works; the message names the wrong spelling, and
the two most natural names in a drawing — `A` for a pivot, `c` for a centre — are the
ones that collide.

**Proposals.**
1. Message: when the offending token is followed by `.`, say
   `write calc(A.x), or rename the variable (A is also the arc command)`. One line in
   the diagnostics describer.
2. Grammar: in path-argument position, `<command letter> "." <identifier>` cannot be a
   command (a command letter is never followed by a dot), so the external tokenizer
   could yield a member expression there. This is the real fix and the riskier one: the
   path-args tokenizer is a shadow boundary that must mirror the grammar (memory), and
   `A .5` with a space is still an arc. Rule: no whitespace between the letter and the
   dot, and the dot must be followed by an identifier start.

**After (2).**
```pathogen
let A = Point(crank * cos(theta), -crank * sin(theta));
L A.x A.y as segment('crank'), endpoint('A')     // parses: A.x is a member, not an arc
```

**Where else.** Every domain that names points with single capitals — geometry
worksheets, kinematics, surveying — and every program that calls a centre `c`.

**Cost.** (1) trivial. (2) a day: tokenizer + grammar + LS highlighting + tests for the
`A .5`, `A.5`, `A.x` and `a.x` spellings.

---

## 8. Smaller, or tooling

- **`Command.center` for arcs exists; a `Segment.midpoint`/`Segment.normalAt(t)` would
  save `link.block.normal(0.5)` in the dimension helper** — low priority, the block
  method is fine.
- **Formatter: a labelled `z` at the end of a `return @{ … }` block is padded with two
  blank lines and loses its semicolon** (entry 25). Cosmetic; visible in every part 3
  code panel.
- **Formatter residual (entry 20):** `M c.x calc(…)` recovers without an error node, so
  the lossy-recovery guard does not fire and the formatter writes back `M` / `c x …`.
  Fixing candidate 7(2) removes the case.
- **Validator:** a containment rule (text inside its panel's column) generalises the
  divider check added in e7d78bb; needs the GroupLayer translate to be visible to the
  checker.
- **Not proposed:** absolute commands inside `@{ }` blocks. Blocks are origin-relative by
  design, and building the linkage from deltas cost four lines; changing the block
  contract is not worth it.

## Suggested order

1 (headings/outward) and 3 (`toFixed`) are small and pay off in every future sample;
5(1) is a docs fix and is done. 6(1) is an afternoon. 2 (`circleCircle`) and 4
(per-subpath markers) are the two real features and each earns a post of its own; the
origami and dieline series held back from this one would use both.
