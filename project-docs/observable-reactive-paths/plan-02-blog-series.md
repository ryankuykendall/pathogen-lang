# Blog series — "Drawing Without Bookkeeping" (queries, subscriptions, 2–3 domains)

## Context

Milestones 1 and 2 of observable/reactive paths shipped (`c558cd0` path queries,
`dfac50d` subscriptions, `b488822` arc-length fix). Ryan approved a blog series:
part 1 "Ask the Path" (queries), part 2 "Thinking and Drawing in Parallel"
(subscriptions), six samples each, and asked to broaden it with 2–3 posts applying
the features to real DOMAINS from `project-docs/domain-survey/`, to run the
Cutting Room "friction log" exercise as we go (the arc-length fix is its first
entry), and to make the samples show **drawing and designing in parallel**: one
panel focused on the FORM and a side-by-side panel that annotates it with
schematic information derived by queries/subscriptions.

Synopsis for parts 1–2 (approved shape): `project-docs/observable-reactive-paths/blog-synopsis-v1.md`.

## Series structure

| Part | Slug | Samples dir | Subject |
|---|---|---|---|
| 1 | `ask-the-path` | post52 | `query()` / `queryAll()` |
| 2 | `thinking-and-drawing-in-parallel` | post53 | `subscribe()` |
| 3 | `bookkeeping-mechanisms` | post54 | STEM mechanisms — a four-bar linkage, dimensioned (Ryan's pick) |
| 4 | `bookkeeping-front-panels` | post55 | PCB / instrument front panels — a Eurorack panel with its drill schedule (Ryan's pick) |
| 5 | `bookkeeping-fretboard` | post56 | Luthiery — a fretboard from scale length, numbered and ranged (Ryan's pick) |

Domain order ladders the annotation kinds: dimensions and angles → schedules and tables → numbering and ranges. Slugs are working names; final titles come from each domain synopsis.

- Frontmatter per `website/blog/CLAUDE.md`: `title, slug, date, description, series: "Drawing Without Bookkeeping", seriesPart`; part 1 also `seriesDescription`. Consecutive dates. Header block copied from `website/blog/cutting-room-papercraft.md:1-23`: italic `*Part N of M in <Series> — <one-clause premise>.*`, then `> **Series: …**` numbered TOC (`[Title](/blog/slug) — gloss`, current post bold + "(this post)"), then `> **Prerequisites:** …` (parts 2+ also name reused idioms). Prose hard-wrapped ~70 cols.
- Every post ends with the friction-log section **`## What this project taught the language`** immediately before `## Where to go next`. Part 1 introduces the convention in prose ("this series is also a working friction log …"); parts 2+ open the section with the shared one-liner "This series doubles as a working friction log (part 1 explains the convention)". Entry shape (from `cutting-room-jigsaw.md:154-180`): bold past-tense lead sentence naming what changed → 2–3 sentences of the friction as met in a named example → the fix with a `/docs#…` deep link → optional `pathogen` fence with `// before` / `// after`. Not numbered, no severity, ordered by example. Links go to docs anchors and sibling posts, never commits.
- Voice: `website/guidelines/voice-and-audience.md` (mental model first, jargon translated, ladder simple→complex, gotchas early). Sweeps at write time: em-dash clusters (single asides fine), pet terms once per series ("bookkeeping" is this series' signature word — budget it: title + one use per post), repeated sentence frames, "And" openers.

## The form / annotated-twin layout (house pattern for every sample)

Verified against the evaluator: layer records are stored in **layer-local coordinates**; GroupLayer/layer transforms apply at emit (`layerState.transformState` is separate from `accum`), and `layer('x').queryAll(...)` / `subscribe` read the store. So:

- Two (or three) `GroupLayer`s placed side by side with `translate-x/translate-y`; children authored at local coordinates (`post9/boolean-basics.pathogen` model, NOT `post11/before-after.pathogen`'s absolute placement).
- The same PathBlock is drawn at the same local position in each group's form layer (`shape.drawTo(0, 0)` twice). Annotation layers live in the twin group; subscriptions/queries read the **twin group's own form layer**, so query coordinates and annotation coordinates coincide with zero arithmetic. (Part 2 samples subscribe to the twin's form layer; the callback draws into sibling layers of the same group.)
- Captions: a TextLayer child per group at local `text(0, -10)`; optional mid-canvas hairline divider; eyebrow-over-title only on hero figures.
- Design system (`website/guidelines/example-design-system.md`): fg opacity ladder (`fg_auto` / `fg_muted` .60 / `fg_hair` .22 / `fg_faint` .10, never `#000`/`#fff`), categorical hues at L .55 C .16 (red 27°, amber 80°, green 140°, teal 200°, blue 260°, purple 320°) — form in `fg_auto`, annotation in one categorical hue, leaders in `fg_hair`; typography ramp Label 10/700/+2, Eyebrow 8/700/+3, Small 8/400/+0.5, always-quoted stack `'Helvetica Neue', 'Helvetica', 'Arial', sans-serif` bound as `let font = "…"`; strokes .5/1; `stroke-dasharray: 3 4`; 15px margin; viewBox sized to the content band (dead-space check is y-only).
- Labels without font metrics: place along the query result's own geometry — `Endpoint.turn`/`next` for an outward normal at a joint, `Command.center` for arcs, `Segment.block.normal(t)` for edges — leader + text pushed a fixed distance; verify collisions with `validate:samples` and, where needed, in-program `.intersects()` warnings (`post11/style-merge.pathogen`).
- Reusable annotation idioms: leaders (`post8/fillet-anatomy.pathogen:140-150`), dimension line + arrowhead (`post8/fillet-anatomy.pathogen:114-135`, two-sided `post8/chamfer-anatomy.pathogen:100-112`), normal ticks (`post43/05-pattern-sheet.pathogen:71-79`), grainline chevrons (`post43/05-pattern-sheet.pathogen:107-118`), `polarProject` radial labels (`post11/before-after.pathogen`). Consider a shared `fn dimension(from, to, offset)` / `fn callout(point, angle, label)` written once in part 1 and reused verbatim (copy per sample — samples are standalone).
- Path-arg trap: two-level member chains are rejected in command position (`M arc.start.x …`); bind `let from = arc.start;` first (already a friction entry).

## Samples (six per post; twin layout wherever it demonstrates the point)

**Part 1 — post52 (queries)**
1. `01-twice-vs-once` — left: dots on every corner with coordinates typed twice; right: the same from `queryAll('endpoint')`. Contrast row.
2. `02-every-arc` — the tab (two arcs + a `with fillet` arc) | twin with `command(a)` centres marked and spoked; `Command.length` on the circle as the arc-length footnote.
3. `03-labels-through-query` — comb | twin: `segment(tooth)` runs tinted, `segment(tooth) endpoint` tips dotted (combinator).
4. `04-what-a-call-drew` — face (circle + rect calls) | twin: one bounding box + `Call.name` per statement.
5. `05-filters-and-ranges` — three squares | twin: `command(line)[length>…]` tinted, `subpath(1..2) command` indexed, `endpoint:nth(-3..-1)` marked.
6. `06-subpath-vs-subPath` — one open+closed path | twin A: `subpath` runs colour-banded by index; twin B: `.subPath(0.2, 0.7)` slice highlighted. Same word, two jobs.

**Part 2 — post53 (subscriptions)**
1. `01-declared-first` — form | twin: dots from a subscription declared before the drawing.
2. `02-fan-out` — form | twin: dots + numbered labels (TextLayer) from one subscription.
3. `03-windows` — two shapes drawn in two apply blocks | twin: only the windowed one annotated (`unsubscribe()` between).
4. `04-last-three` — form | twin: `endpoint:nth(-3..-1)` under a subscription; caption says why the window must be complete.
5. `05-annotate-the-annotations` — form | twin: dots, then rings around the dots from a subscription on the dots layer (second round).
6. `06-final-values` — the closure caveat made visible: a radius mutated after subscribing; left the value you might expect, right what the callback sees; prose states it early.

**Parts 3–5 — one domain project each (post54–56)**, Cutting Room shape: start from one bare mechanism, climb to a finished composition, 4–6 samples, every sample a form | twin pair, friction section last. Domains chosen by Ryan (2026-09-16); one-pagers in `project-docs/domain-survey/`:
- **Part 3 — STEM mechanisms & dimensioned diagrams** (`01-sample-domains/stem-mechanisms-diagrams.md`): four-bar linkage; twin = numbered pivots at every `endpoint`, link lengths from `command(l)` as dimension lines, angle arc at the crank from `Endpoint.turn`. Wiggle: link lengths. Vocabulary: ground link, crank, coupler, rocker, pivot, extension line.
- **Part 4 — PCB / instrument front panels** (`03-profiles/pcb-front-panels.md`): Eurorack panel (rail slots, jack/pot circles); twin = drill schedule from `queryAll('call(circle)')` (`#n ⌀d x,y` column), centre crosses, leaders. Wiggle: HP width (5.08 mm). Vocabulary: HP, 3U, rail mounting slots, jack grid, pot scale arc, legend layer.
- **Part 5 — Luthiery templates** (`03-profiles/luthiery-templates.md`): fretboard taper with slots from scale length (12th root of 2); twin = fret numbers, marker dots at frets 3/5/7/9/12 via `:nth` ranges, distance-from-nut column. Wiggle: scale length. Vocabulary: nut, saddle, fanned/multi-scale, fretboard radius, marker dots.
- Held back (Ryan agreed): packaging dielines (collides with planned series "The Third Dimension of Flat"), origami crease patterns (needs coincident-vertex grouping), astronomy & sundials (strong, but three is the budget).
- Technique precedent to name and differentiate, not repeat: hand-placed solder dots in `cutting-room-stained-glass.md` (the pre-feature version of an endpoint subscription); `.boundingBox()` dimension lines in `textblock-introduction.md`; partition-along-a-path in `pathblock-parametric-sampling.md` / `broken-lines-leathercraft.md`; `segment-labels-and-suffixes.md` as the direct ancestor of the query grammar.

## Friction log (as we go)

- Internal running log: `project-docs/observable-reactive-paths/FRICTION-LOG.md`, format of `project-docs/cutting-room/FEATURE-OPPORTUNITIES.md` (flat numbered list; sample ids in parens; resolved entries rewritten in place as `N. **RESOLVED (Item <letter>, <date>): …** … Original: …`).
- Seed entries (known now): (1) `fn` and `layer` are keywords → struct members `Call.name`, `Subscription.source`; (2) path-arg tokenizer rejects two-level member chains (`M arc.start.x`); (3) arc length ignored sweep flags (ISSUE-021) — RESOLVED `b488822`, part 1's section; (4) meta rebuilt from label whitelists dropped identity — RESOLVED `dfac50d`; (5) a fillet re-emits the trimmed `h` as `l` (document); (6) `PI` is a function, not a constant; (7) `ctx` frozen inside `@{}` (open); (8) `<<` concatenation drops record labels (open); (9) `:atomic` not in `query()` — by design, document. New entries get logged the moment a sample hits them; fixes land as their own commits (docs → tests → fix), then the post's closing section tells the story.

## Workflow per post (blog playbook)

1. Synopsis (parts 1–2 approved; domain synopses ~250 words each after the pick, reviewed with Ryan).
2. Samples: author `website/blog/samples/postN/*.pathogen` (`define ViewBox` first line, no legacy comment; descriptive names; multiline `@{}` bodies; one style declaration per line) → `npm run format:samples -- website/blog/samples/postN` → `npm run compile:samples -- --post N` → `npm run validate:samples -- website/blog/samples/postN` (fix every warning; previews land in `postN/previews/`) → `npm run compile:bbwp` for Ryan's index → Read each PNG.
3. Draft `website/blog/<slug>.md` with `<mini-workspace src="samples/postN/…" caption="…" code-open>` embeds; liberal links to `/docs#path-queries-…`, `/docs#subscriptions-…`, sibling posts, and the segment-labels post as ancestor.
4. Agentic review: `content-reviewer` agent with sources, PNG previews, the validation report, and an explicit change scope; ask for the tic sweeps above. Disposition record in `project-docs/observable-reactive-paths/reviews/`.
5. Final version → `npm run build:blog` (no warnings) → `npm run dev:website` + `npm run check-links` → commit (stage `.md`, `.pathogen`, `.svg`, `website/bbwp/index.html`; never generated `.bbwp.html`/`.mw.html`).
6. Housekeeping at the end: CHANGELOG (Documentation), memory (series decisions, friction rule), `project-docs/observable-reactive-paths/STATUS.md`.

## Verification

- `validate:samples` clean per post dir (margins, collisions, dead space, GroupLayer, formatting); every compiled SVG contains `<script id="pathogen-metadata">`.
- Compiled SVGs byte-identical after `format:samples` re-run (formatting never changes output).
- `npm run build:blog` warning-free; `check-links` clean with the dev server up; series section renders on the blog index with parts in order; each mini-workspace's inspector populates.
- Each friction entry's fix has its own test and commit before the post that cites it is finalized.

## Order of work

0. Read-only check of the local-coordinate claim (transform applied at emit) — done in exploration; re-confirm with one sample compile before building on it.
1. Create `FRICTION-LOG.md` with the seed entries.
2. Part 1: samples → validate → draft → review → final.
3. Part 2: same.
4. Domain posts in Ryan's chosen order: one-pager read → synopsis → samples → draft → review → final; dates consecutive after part 2.
