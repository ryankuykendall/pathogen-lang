# Blog synopses v2 — the three domain posts (2026-09-16)

Parts 3–5 of "Drawing Without Bookkeeping". Each is a Cutting Room-style
project: one bare mechanism, climbing to a finished composition, every sample a
form panel beside an annotated twin built from queries and subscriptions, the
friction log last. Sources: `project-docs/domain-survey/01-sample-domains/
stem-mechanisms-diagrams.md`, `03-profiles/pcb-front-panels.md`,
`03-profiles/luthiery-templates.md`.

## Part 3 — "Every Pivot Numbered" (working title; alt: "A Linkage That Dimensions Itself")

Synopsis (~250 words): A four-bar linkage is four lines and four pivots, and
the drawing a teacher or a robotics mentor actually needs is not the linkage
but the *dimensioned* one: every pivot numbered, every link labelled with its
length, the crank angle marked, extension lines where a dimension needs room.
Today that is drawn twice — the form in one tool, the callouts by hand, and the
two drift the moment a link length changes. This post builds the linkage as a
form (ground, crank, coupler, rocker, four `circle()` pivots) and lets the twin
annotate it entirely from what the form knows about itself: `endpoint`
subscriptions number the pivots and push labels out along each joint's `turn`;
`command(l)` supplies the link lengths and the dimension lines, drawn as a small
reusable `fn dimension(from, to, offset)` written once in the post; the crank
angle comes from the `Endpoint` at the ground pivot. The ladder: (1) the bare
linkage, form only; (2) pivots numbered by subscription; (3) link lengths as
dimension lines with extension lines from `command(line)`; (4) the crank angle
arc from `turn`; (5) a five-position sweep — the same linkage drawn at five
crank angles by a loop, and every position annotated by the same three
subscriptions with no change to the annotation code, which is the argument for
the whole series; (6) the finished worksheet figure. Wiggle: the link lengths at
the top of the file — change them and the numbering, dimensions and angle arc
re-solve. Vocabulary translated on first use: ground link, crank, coupler,
rocker, pivot, extension line. Friction log: whatever the samples hit (the
`fn dimension` helper will probably want `Endpoint.turn` on a `command(line)`
match, which does not exist — a candidate `Command.angle` member).

Samples (post54): 01-bare-linkage, 02-pivots-numbered, 03-link-dimensions,
04-crank-angle, 05-five-positions, 06-worksheet.

## Part 4 — "The Panel Prints Its Own Drill Schedule" (working title)

Synopsis (~250 words): A Eurorack front panel is a constraint grid: 3U tall,
its width a multiple of 5.08 mm (HP), mounting slots on the rail standard,
jacks and pots on a component grid, and a legend layer around each control.
Builders keep the numbers in wiki tables and re-derive them per module, and the
one artifact the panel shop needs — the drill schedule, a table of hole
numbers, diameters and coordinates — is typed out by hand from the drawing.
This post draws the panel as a form (outline, rail slots, jack and pot holes as
`circle()` calls) and lets the twin produce the schedule: `queryAll('call(circle)')`
is the hole list verbatim, so a subscription numbers each hole, draws a centre
cross and a leader, and a text layer prints `#n · ⌀d · x, y` down the right
edge. The ladder: (1) the bare panel at 6HP; (2) holes numbered and crossed;
(3) the schedule column; (4) pot scale arcs and jack labels as a legend layer,
placed from `Command.center` of each hole's arcs; (5) the wiggle — HP width is
*the* parameter, and the same file re-solves at 4HP, 8HP and 12HP with the
schedule following; (6) the finished panel with schedule beside it, the
handoff drawing. Vocabulary: HP, 3U, rail mounting slots, jack grid, pot scale
arc, legend layer. Friction log candidates: text alignment for a numeric
column (right-aligned numbers), and whether `Call.name` plus an index is enough
identity for a hole table or whether holes want a user label (`as
endpoint('jack-1')` on a `circle()` — the `as` clause on a call statement).

Samples (post55): 01-bare-panel, 02-holes-numbered, 03-drill-schedule,
04-legend-layer, 05-hp-wiggle, 06-handoff.

## Part 5 — "The Fretboard Is a Formula" (working title, from the one-pager)

Synopsis (~250 words): Fret positions are the twelfth root of two made
physical: from one scale length, every fret's distance from the nut follows,
the taper follows from nut and bridge widths, and the marker dots sit at frets
3, 5, 7, 9 and 12. Builders get the numbers from a web calculator and draw the
template by hand; multi-scale (fanned) fretboards multiply the arithmetic. This
post draws the fretboard as a form — the tapered outline, one slot per fret
computed from the formula — and lets the twin do the luthier's bookkeeping:
a subscription on `command(line)` numbers every fret slot and prints its
distance from the nut to 0.01 mm in a column, `:nth` ranges pick the marker
frets (`endpoint:nth(2, 4, 6, 8, 11)` — indexes are 0-based, and the post says
so) and drop the dots, and `:last` marks the bridge line. The ladder: (1) the
bare fretboard; (2) frets numbered; (3) the distance column; (4) marker dots by
range; (5) the wiggle — change the scale length from 25.5" to 24.75" and every
slot, number and dot moves; (6) a fanned-fret finale where two scale lengths
produce two nut-to-bridge lines and the slots interpolate between them, every
one still numbered by the same subscription. Vocabulary: scale length, nut,
saddle/bridge, twelfth root of two, fanned or multi-scale, marker dots.
Friction log candidates: number formatting to two decimals in text (`toFixed`
or equivalent — is there one?), and `:nth` with a comma list of specific frets
reading well enough that a reader trusts it.

Samples (post56): 01-bare-fretboard, 02-frets-numbered, 03-distance-column,
04-marker-dots, 05-scale-length-wiggle, 06-fanned-finale.

## Open for Ryan

1. Titles (working titles above). 2. Whether part 3's five-position sweep is
the right "argument sample" or whether a single annotated position plus a
slider-style wiggle reads better. 3. Whether the drill schedule should be an
in-SVG text column (as proposed) or the post should also show a `log()` table.
4. Units: the samples are unitless SVG; the prose can speak in mm and inches,
but the friction log will note that physical units are a survey-wide gap.
