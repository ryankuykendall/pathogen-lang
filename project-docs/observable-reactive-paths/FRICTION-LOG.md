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
