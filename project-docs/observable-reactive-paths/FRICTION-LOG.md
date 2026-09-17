# Friction log — "Drawing Without Bookkeeping" series

Running log, kept as samples are authored (2026-09-14 onward, milestones 1–2 and
the blog series). Each entry notes the friction hit in a real program. Resolved
entries are rewritten in place; each post's closing section
("What this project taught the language") tells the story of the entries it hit.
Format mirrors `project-docs/cutting-room/FEATURE-OPPORTUNITIES.md`.

1. **RESOLVED (M1 review, 2026-09-14): `Call.name`, not `Call.fn`.** `fn` is the
   function keyword, so `ring.fn` fails to parse; the struct member is `name`.
   Original: **The Call struct's function-name member was unreachable.** Writing
   `ring.fn` after `let ring = face.query('call(circle)');` reported "Missing ';'"
   at the dot. (path-queries tests.)

2. **RESOLVED (M2, 2026-09-15): `Subscription.source`, not `.layer`.** Same class:
   `layer` is a keyword, so `sub.layer` cannot be parsed in member position.
   Original: **The subscription handle's layer member was unreachable.** (subscriptions tests.)

3. **Two-level member chains are rejected in command position.** `M arc.start.x
   arc.start.y;` reports "Missing ';'" — the path-argument tokenizer accepts one
   level of member access (`from.x`) but not `arc.start.x`. Workaround: bind
   `let from = arc.start;` first. (demo-queries.pathogen; every twin sample.)

4. **RESOLVED (ISSUE-021, 2026-09-15, b488822): arc length honours the sweep
   flags.** A half circle measured its diameter and a large arc its minor
   complement; `circle()` reported `4r`. Circular arcs are now `|sweep| · r`,
   elliptical arcs integrate the true speed. Original: **`call(circle).block.length`
   came back as 100 for a radius-25 circle.** (path-queries tests; demo-queries.pathogen.)

5. **RESOLVED (M2 review, 2026-09-15, dfac50d): command identity survives every
   meta rebuild.** Corner-op trims, the closing line a `z` expands to, offset
   connectors, `subPath` fragments and fillet arcs rebuilt meta from a label
   whitelist and dropped `call`/`record`/`seamId`; a subscription skipped the
   trimmed edge of a filleted square. One `identityMeta` helper at every site.
   Original: **A filleted edge vanished from its own subscription.** (subscriptions tests.)

6. **A fillet re-emits the trimmed `h`/`v` as `l`.** Expected once you know it
   (a shortened horizontal is still a line), but `command(h)` after `with fillet`
   finds one fewer command than you typed. Document in part 1. (02-every-arc.)

7. **`PI` is a function, not a constant.** `10 * PI` fails with "Binary operator
   * requires numeric operands"; `PI()` works. Consider a bare constant or a
   clearer message. (arc-length tests.)

8. **`ctx` inside `@{}` is frozen at the origin** (M1 read-through; untested in
   the suite). Open; matters for any future block-argument form.

9. **`<<` PathBlock concatenation drops record labels and source locations**
   (`recordsFromCommands`), so labels authored in either half are only
   reachable through the finalized commands. Open.

10. **`:atomic` is not part of `query()`** — by design (`segment(rim) command` is
    the typed spelling), but the error should keep pointing at that spelling. Document.

11. **The design system's quoted font stack is rejected by the style sanitizer.**
    `website/guidelines/example-design-system.md` §3 says to bind
    `let font = "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif";` and
    "always quote the family names"; the style-value allow-list rejects the
    quoted token (`Style value for "font-family" contains a disallowed token
    ("'Helvetica"…)`). Every published sample that follows the guideline
    (post24) actually writes `let font = 'sans-serif';`. Either the sanitizer
    should accept quoted family names in `font-family`, or the guideline should
    say what the language accepts. (post52/01-twice-vs-once.)

12. **RESOLVED (blog series, 2026-09-16): the one-line `M x y block.draw()` idiom
    now records what it draws.** The idiom every sample uses recorded its raw
    bytes correctly but kept only the `M` as a structured command, and tracked
    the block's commands from the pen position *before* the move — so
    `layer('x').queryAll('endpoint')` on such a layer found nothing past the
    move and `ctx.position` after the statement sat at the move, not at the
    block's end. The evaluator now snapshots the context before the arguments
    evaluate and, when the emitted text carries further commands, rewinds and
    replays the whole fragment in order. Original: **The annotated twin had no
    dots.** `rightForm.queryAll('endpoint')` returned nothing for a layer drawn
    with `M 0 0 tab.draw()`, while the same layer's SVG showed the whole tab.
    (post52/01-twice-vs-once.)

13. **RESOLVED (blog series, 2026-09-16): blocks taken from a layer draw in
    place whatever case the layer was authored in.** The relative serializer
    compared command letters case-sensitively, so a run copied from a layer
    with an authored `M` (every `subpath(k)` block) or an uppercase `L` fell
    through to the catch-all and was emitted with the absolute letter and
    relative numbers — `M 44 -18` for a move that should read `m 44 -18`.
    Original: **The faint `subpath(1..2)` fills landed nowhere near their
    squares.** (post52/05-filters-and-ranges.)

14. **RESOLVED (blog series, 2026-09-16): `subPath(t0, t1)` keeps the move
    between runs.** Moves are filtered out to measure arc length and were never
    put back, so a slice spanning two runs spliced the second run's curve onto
    the end of the first run's `z` — a diagonal stroke across the gap. A gap
    between fragments is now emitted as a relative `m`. Original: **The
    arc-length slice drew a line across the move.** (post52/06-subpath-vs-subPath.)

15. **RESOLVED (blog series, 2026-09-16): a run that begins with a move
    answers for itself.** A `call(circle)` or `subpath(k)` block taken from a
    layer started with the layer's own `M`, whose recorded `start` is the pen
    position *before* it — a previous statement's geometry. `boundingBox()`
    and `centerPoint()` on such a block reached back to that point, so a
    ring meant to sit on a dot sat halfway to the previous dot, and the box
    around a face's head began at the panel origin. The block builder now
    makes a leading move zero-length. Original: **The rings landed between
    the dots.** (post53/05-annotate-the-annotations; post52/04-what-a-call-drew.)

16. **RESOLVED (blog series part 3, 2026-09-16): labels travel with a drawn block.** The
    linkage form (post54) is a labelled `@{ }` block — `l … as segment('crank'),
    endpoint('A')` — drawn into each panel's form layer, and the twin asks the layer
    for `endpoint(A)`. Every label vanished on the way in: `serializeRelativeAndTrack`
    carried them in its tracked commands, but `evaluatePathArg` kept only the emitted
    string and the record site re-parsed it. Part 1's comb never noticed because its
    labels were authored inside the layer's own apply block. Fix: the statement collects
    its path-emitting arguments' tracked commands (`EvaluationState.argTracked`) and
    `mergeTrackedMeta` copies their meta back onto the re-parsed commands by position
    (guarded by letter-for-letter agreement); corner ops were already stripped by
    `derivedMeta`, so a filleted block is not rounded twice. Docs: segment-labels
    "Labels travel with their block". Tests: `tests/path-queries.test.ts` "labels travel
    with a drawn block" (one-line idiom, own line, drawTo, filleted). Original: the
    prototype's `query('endpoint(O2)')` reported "available endpoint labels: (none)".

17. **Pivot `A` is the arc command.** (post54) Every mechanisms textbook names the
    moving pivots A and B and the ground pivots O2 and O4, and `L A.x A.y` in a block is a
    parse error: "'A' is a path command here". The same class bit the fix's own test
    (`.map {|s| s.label }` parsed as an `s` command with a member-expression argument).
    Not a bug — path letters have to win in path position — but the domain post has to
    say so in its first sample: variables `pinA`/`pinB`, labels 'A'/'B'. Part 4 hit it
    again with `let c = hole.block.centerPoint()` and `M c.x …` — `c` is the cubic
    command, and the most natural name for a centre. A friendlier parser hint ("did you
    mean calc(A.x)?") is the only fix on offer.

18. **No circle–circle intersection; blocks are relative-only.** (post54) The four-bar
    position solve needs the point where the coupler circle meets the rocker circle.
    `intersectionPoints()` is bounding-box based, so the sample solves it by the law of
    cosines in eight lines (`acos` is there). And a form block cannot be written from
    absolute pivots (`M O2.x O2.y` inside `@{ }` is "not allowed inside path blocks"), so
    the block is built from link deltas. Both are documented behaviour; both are the
    kind of arithmetic the series promised to remove. Candidate: a `circleCircle(c1, r1,
    c2, r2)` stdlib helper returning both points, and a `Command.heading` member (the
    samples reach for `pivot.next.block.tangent(0).angle`).

19. **RESOLVED (tooling, 2026-09-16): `validate:samples` measures text against
    real geometry.** Check 3 compared a text's rect with each `<path>`'s bounding
    box, so every label inside the linkage's hull — the 60° at O2, the pivot names,
    every dimension value beside its own extension line — was a "100% collision",
    51 warnings on six clean figures. The check now samples a grid over the text's
    rect and asks the element whether each point is on its stroke (at its stroke
    width) or inside its fill (`isPointInStroke`/`isPointInFill` through the
    element's screen CTM); the bounding-box overlap is only the fallback when
    nothing could be sampled. Posts 52 and 53 stay at 0 warnings; the messages now
    say which measure they used. Original: 51 false positives on post54.

20. **RESOLVED (tooling, 2026-09-16): the formatter no longer writes back a
    recovered parse that lost code.** A generator slip left `#{{ … }}` in ten
    layer definitions. `format:samples` reported "6 formatted" and rewrote every
    one as `#{}`: `formatDocument` falls back to Lezer's error-recovery parse so a
    missing semicolon can still be formatted, and the recovered AST simply omitted
    the unparseable region. The playground and VS Code call the same function. The
    fallback now refuses (no edits) when the tree holds an error node with extent —
    skipped text — while a zero-length node (a missing `;`) still formats. The script
    reports `REFUSED … parse error at line N` instead of "unchanged" and exits 1.
    Tests: formatter "never drops code". Original: ten empty style blocks, dots
    drawn in the default fill, arrows and dimension lines invisible. **Residual:** `M c.x
    calc(…)` in path position (entry 17's trap) recovers without an error node — the
    tree reads it as `M` then a `c` command — so the guard does not fire and the
    formatter writes back `M` / `c x calc(…)`, dropping the dot. Open.

21. **`marker-start` / `marker-end` are per element, not per subpath.** (post54/03,
    06) Four dimension lines in one layer are one `<path>`, so the outward
    arrowheads appeared on the first vertex of the first line and the last vertex
    of the last; `marker-mid` cannot help because a mid marker at a subpath's start
    orients along the outgoing line. The samples draw one arrowhead block with its
    tip at the origin and `tip.rotate(along)` it into place at both ends — which is
    honest, and also the kind of thing the marker feature exists to avoid. Candidate:
    a layer option that emits each subpath as its own element when markers are set.

22. **No `toFixed`.** (post55) A drill schedule wants `7.0` and `22.6`, not `7` and
    `22.60000000000001`. `round()` returns an integer, so the panel samples carry a
    four-line `mm()` helper (round to tenths, split whole and fraction, glue with a
    dot) — fine for one decimal, tedious for three, wrong for negatives. Candidate:
    `toFixed(n)` on numbers, or a precision argument on `text` interpolation.

23. **Text anchoring is per layer, so a numeric table is several layers.** (post55)
    `text-anchor` lives in the TextLayer's style, so a right-aligned number column
    beside a left-aligned label column is two layers, and a muted footer row is a
    third. The schedule uses a monospace face with fixed column offsets instead,
    which only lines up because every value has exactly one decimal (entry 22).
    Candidate: per-call anchor or a tab/column primitive on text layers.

24. **RESOLVED (blog series part 5, 2026-09-16): a TextLayer's transform reaches its
    `<text>` elements.** The fretboard's distance column wanted a text layer turned
    a quarter turn, and `rotate: -0.5pi` on the TextLayer was silently dropped by both
    emitters (`src/cli.ts` and the shared `src/render/build-layers.ts`) — path and group
    layers honoured it, the docs promised it for text layers too. Both emitters now
    compose the layer transform with the per-text rotation (`rotate(-90) rotate(30, x,
    y)`). The samples ended up using the per-text form, `text(x, y, -90deg)`, which
    turns each label about its own anchor and is the better tool for a column of
    labels. Docs: layers "Transform Convenience Properties". Tests:
    `tests/render/text-layer-transform.test.ts`, cli "applies a text layer's transform".
    Original: 22 distance labels, none rotated, none on the page.
