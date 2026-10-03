# 07 — Design brief: V3 and V7

**Date:** 2026-09-26 · **Status:** V7's Marker edge built 2026-09-27 (Ryan chose `Marker.fromPathBlock`; the cheap half landed with it as a warning); V3-A agreed, built as a spike and measured 2026-10-03: **1652 warnings in 33 published samples — not shipped** (see `v3a-spike/README.md`) · **Reads
first:** `06-vocabulary.md` (this note uses its collapsed terms: *page coordinates*, *local
coordinates*, *placed* / *free-floating*, *re-basing*, *placing*), then `03-principles.md`.

## Where the audit stands after the follow-through

Closed since 2026-09-24: D1 + ISSUE-015 (Cause B, at both serialization boundaries), D3, D4
(Fix A — P3 for the six methods), D7 (angle literals need a unit), D8 (ISSUE-028), D5
(ISSUE-027); D2 mitigated (readback + `layer-transform` warning); D6 and D9 documented as
as-spec; V5/V6 documented; V8 names the two constructors (this pass); V9 puts text in the
matrix.

What is still structural, and is what this brief is about:

- **Cause A is untouched.** A PathBlock's position is still encoded as a leading `m`, and an
  *injected* one (`dash`, `cut`, `.contours`) is byte-for-byte the same as an *authored* one
  (`@{ m … }`). P1 ("the type answers *does this have a position*") and P5b ("cursor-dependent
  placement is diagnosable") are both unmet. That is **V3**.
- **Spaces 3–6 have no conversion and no rejection.** A value crossing into a `Marker`, a
  glyph frame or a text frame is reinterpreted silently. P4 is unmet. That is **V7**.

## V3 — injected vs authored position

### The problem, restated with the vocabulary

A *placed* PathBlock is one whose command list starts with `m dx dy`: it has a position,
expressed relative to wherever the pen is. Two producers of that state exist and are
indistinguishable afterwards:

| Producer | Intent | Drawn from `M 40 40` |
|---|---|---|
| `@{ m 10 10 h 20 }` (authored) | "offset from the pen" — ordinary relative drawing | correct |
| `plate.cut(knife)[0]` (injected) | "this piece sits *here* in the plate" | silently 40,40 off |

Measured (`02`, `flat` rows): `dash`, `cut` and `.contours` inject the move even from a
receiver that has none. Any diagnostic keyed on the bytes ("first command is a move and the
cursor is not the origin") fires on the authored row — which is exactly what P1 protects. So
the signal has to be **provenance**, not shape.

### Options

**A — Carry provenance on the value, warn on the injected case.**
Add one field to `PathBlockValue`: `placement: 'none' | 'authored' | 'injected'`
(`'none'` = free-floating). Set `'authored'` when a literal starts with `m`, `'injected'` by
`dash` / `cut` / `.contours` (and any future producer of Cause A). Propagate through the
transforms in exactly one place: V8's two constructors — `fromCommandsKeepingFrame` carries
the receiver's value, `fromCommandsRebased` resets it to `'none'`. `draw()` of an
`'injected'` block from a non-origin cursor emits a `cursor-dependent-placement` warning
(strict-able, like `layer-transform`) naming the producer and the two spellings that are
never wrong: `M 0 0; piece.draw()` or `subject.project(x, y).cut(knife)[i].draw()`.

- Meets P5b; moves P1 forward without changing any type.
- Cost: one field, three producers, the two constructors, one warning, a coverage-matrix test
  over every PathBlock producer (the `02` rows are the list), docs. Medium.
- Risk: propagation drift — the same class as the `origin?` argument was. Mitigation is
  structural: the field is only ever written by the two constructors and the three producers,
  so a new method cannot forget it any more than it can forget which constructor to call.
- Must be measured against every published sample before shipping (expect zero warnings; the
  `layer-transform` warning was landed the same way).

**B — Injectors return a ProjectedPath on a PathBlock receiver.**
`cut`/`dash`/`contours` pieces come back *placed in page coordinates* (the receiver's frame
treated as the page), so `draw()` is absolute and cursor dependence disappears.

- Breaks P3 in the other direction (PathBlock in, ProjectedPath out) and breaks the
  `M x y; piece.draw()` relative idiom that 26 published files use for `cut` (noted
  2026-09-24). Not recommended.

**C — Position as data: a placed sub-type.**
A `PositionedPathBlock` (or a `frameOrigin: Point` on `PathBlockValue` with **no** leading
move in `commands`); serializers synthesize the move from data, exactly as `defsPathData`
already does for Cause B. `@{ m … }` literals stay authored and stay as they are.

- This is P1 done properly, and it makes P2's `anchor` compose for free (the data survives
  transforms). It is also the destination the `cutting-room/` note pointed at on 2026-08-24.
- Cost: large — a type, every producer, every serializer, the whole `02` matrix re-measured,
  docs. Not a one-session change, and breaking for anything that reads `.d` or `.commands[0]`.

**D — Document only.**
"Pieces are relative to the subject's frame; draw them from `M 0 0` or project the subject
first." True, already half-stated, and it leaves the silent shift silent.

### Recommendation

**A now, with C named as the destination.** A is the smallest change that makes the failure
*diagnosable*, it rides on V8 so the propagation rule has one home, and everything it adds
(the provenance field, the producer list, the matrix test) is what C will need anyway.

Decisions for Ryan: (1) A now? (2) Warning or error for the injected-and-off-origin case —
warning is proposed, because `M 40 40; piece.draw()` *can* be intended. (3) The field's name:
`placement` is proposed; `06` reserves *placed* / *free-floating* for prose.

**Measured 2026-10-03 — A's warning does not survive the samples.** Built as a spike
(`v3a-spike/`), then compiled against every published sample: 1652
`cursor-dependent-placement` warnings in 33 of 294 files, every one of them the documented
reassembly idiom (`M 60 120 piece.path.draw()` for each piece). "Expect zero warnings" above
was wrong, and it contradicted option B's own note about the 26 files. Provenance tells
injected from authored; it does not tell "seat the subject's frame at the pen" from "start the
piece at the pen", which are the same call. The spike is reverted; the propagation half is
kept as a patch for V3-C. Options are in `v3a-spike/README.md`.

## V7 — space conversions

### The problem, restated

Six spaces (`01`), one named conversion (`projectCommands`, local ↔ page). Crossing any other
edge reinterprets the numbers. Two of those crossings fail silently today, both into a
`Marker`:

| Value handed to `Marker.append` | Read as | Result |
|---|---|---|
| a PathBlock centred on its own origin (`circle()`, `.contours`) | marker-viewBox coordinates, default `0 0 mw mh` | three quadrants clipped, no diagnostic |
| a ProjectedPath at `(200, 150)` | the same viewBox | entirely outside it — renders nothing, no diagnostic |

The other edges: space 3 (layer-local pre-transform) is mitigated by D2's readback and
warning, with Option A (apply the transform to query results) deliberately parked as a product
question; space 4 (glyph) *is* documented — the conversion is the `(x, y)` add in
`docs/variable-offset.md`, and there is nothing to reject; space 5 (TextBlock-local) has no
path escape hatch, so nothing crosses it today.

So V7 is, concretely, **the Marker edge**, in two halves.

Diagrams (2026-09-27, `v7-marker-space/`, compiled as BBWPs): `01-clipped-quadrant` (the
`circle()` case, with the marker's viewBox and the block's box drawn at 12× and the proposed
warning text computed from `boundingBox()`), `02-projected-invisible` (the ProjectedPath case
at page scale), `03-fit-by-hand` (the three assignments `Marker.fromPathBlock` would fold into
one call, applied to both cases). Found while drawing them: the `marker:` shorthand emitted a
`marker` attribute that no browser honours — ISSUE-031, fixed the same day.

### The cheap half — P4, a rejection that names both spaces

`Marker.append(value)`:

- **ProjectedPath** → warning `marker-space` (strict-able): *"a ProjectedPath carries page
  coordinates; a Marker draws in its own viewBox (`0 0 mw mh`) — append a PathBlock, or
  `toPathBlock()` and re-place it"*. It cannot be right, so an error is defensible too; a
  warning keeps existing (blank) markers compiling.
- **PathBlock whose bounding box lies partly outside the marker's viewBox** → the same warning
  with the measured box and the viewBox: *"the appended block spans −5…5 × −5…5 but the marker's
  viewBox is 0 0 10 10 — set `viewBox` or `refX/refY`, or translate the block"*. This is the
  `circle()` case and it is the one users hit.

Cost: one check in the Marker appender, one warning code in `types.ts`, tests for the four
cells (PathBlock in/out of box, ProjectedPath, and the silent same-space case), one paragraph
in `docs/markers.md`. Small; can land alone; no published sample should trip it (measure).

### The design half — a conversion users can call

The conversion a user actually wants is "make the marker fit this block". Proposal:

- `Marker.fromPathBlock(id, block, options?)` — sets `viewBox` to the block's bounding box
  (padded by `stroke-width` when given), `refX/refY` to its centre (or a `BBoxAnchor`), and
  `markerWidth/Height` to the box size. One call, no arithmetic. `docs/markers.md` first.
- Alternatively `marker.fit(block)` on an existing Marker, for authors who set units and
  orient themselves.

Not proposed: an automatic viewBox on every `append` — it would change every existing marker
that relies on the default `0 0 mw mh`.

### Recommendation

Land the cheap half as its own small change (docs → tests → the check), then decide the
constructor's shape before writing it. Leave layer-transform Option A parked; it is a
product question, not a placement one.

Decisions for Ryan: (1) warning or error for a ProjectedPath into a Marker? (2) Which
spelling for the conversion — `Marker.fromPathBlock` or `marker.fit(block)` — or both?

**Built 2026-09-27.** (2) `Marker.fromPathBlock(id, shape, styles?, anchor?)` (Ryan's choice);
(1) a warning, `marker-space`, one per marker, checked at the END of the program against the
final viewBox so a late `viewBox =` assignment is honoured; it names the shape's span and the
viewBox, and says when the shape was a ProjectedPath. One rule for both cases: the appended
shape's bounding box must lie inside the viewBox. `fromPathBlock` accepts a ProjectedPath too
and fits it where it is. Docs: `docs/markers.md` (two new sections); diagram
`v7-marker-space/04-from-path-block`. `marker.fit(block)` was not built.

## Sequencing and cost

| Item | Size | Risk | Needs |
|---|---|---|---|
| V7 cheap half — `marker-space` warning | S | none | — |
| V3-A — provenance field + `cursor-dependent-placement` warning | M | **measured 2026-10-03: fires on the documented idiom (1652 / 33 files) — not shipped** | a decision (`v3a-spike/README.md`) |
| V7 design half — `Marker.fromPathBlock` | M | new API surface: docs page first | decision on spelling |
| V3-C — position as data | L | breaking (`.d`, `.commands[0]`) | V3-A, the `02` matrix |

Everything above is additive except V3-C. None of it should be started before the decisions
listed under each recommendation are made.
