# V3-A spike — measured 2026-10-03, not shipped

`07-design-brief.md` proposed V3-A: carry `placement: 'none' | 'authored' | 'injected'` on a
PathBlock and warn (`cursor-dependent-placement`) when an *injected* block — a `dash` / `cut` /
`.contours` / `.seams` piece — is drawn with `draw()` from a pen that is not at the origin. The
brief required measuring it against every published sample and expected zero warnings.

**It was built as a spike and measured. The result is 1652 warnings in 33 of 294 samples**
(1574 on `dash()` pieces, 78 on `cut()` pieces; no `.contours` or `.seams`). The spike was
reverted from `src/`; nothing shipped.

## Why it fires

The rule cannot tell the mistake from the documented idiom, because they are the same call:

```
M 60 120 piece.path.draw()      // post45/01-first-dash — every dash, one anchor
M 50 70 p.draw()                // post40/first-cut — every piece, one anchor
M placeX placeY spun.draw()     // post42/05-scattered-puzzle — an exploded view
```

`docs/path-blocks.md` states this as the contract three times ("drawing every piece at one
position reassembles the shape"). The brief itself rejected option B because 26 published files
use `M x y; piece.draw()` on cut pieces — the same fact that makes A's warning fire. The brief's
"expect zero warnings" and that sentence could not both be true; this measurement settles which.

Provenance separates *injected* from *authored*. It does not separate "placing the subject's
frame at the pen" (right) from "expecting the piece to start at the pen" (wrong): both are an
injected piece drawn from a moved pen.

## What is here

- `v3a-spike.patch` — the spike as a diff against 18752f5 (`src/evaluator/index.ts`,
  `src/evaluator/types.ts`): the field, `fromCommandsKeepingFrame(cmds, placement)` at all 17
  sites, the literal / `<<` / `scale` writes, the check in PathBlock `draw()`, the message.
  The propagation half works and is what V3-C would need.
- `count-2026-10-03.txt` — every warning, one per line, from `probes/count-warnings.sh
  cursor-dependent-placement`.
- `probe.pathogen` — the four-case probe (injected off-origin, authored, injected at origin,
  injected through a frame-keeping transform).

One existing test also tripped it: `tests/stroke-geometry.test.ts` "drawing every piece at one
anchor reassembles the source geometry".

## Options from here (Ryan's decision)

1. **Do not ship the warning; document the two intents instead.** The contract is already
   stated; add the missing half — how to start a piece *at the pen* (`piece.subPath(0, 1)`
   re-bases it, and its `anchor` says where it sat).
2. **Make the intent sayable, then no warning is needed.** A named re-base on a piece
   (the spelling is open), so "at the pen" is a method call and "where it sat" stays `draw()`.
3. **V3-C, position as data.** The destination the brief already named; large and breaking.
4. **Ship the warning anyway and migrate 33 samples** to `M 0 0` / `project()`. Not
   recommended: it declares the documented idiom wrong.

## Decision — 2026-10-03 (Ryan): option 2, name the intent

No warning. "Starts at the pen" becomes a method call and "where it sat" stays `draw()`:
`translateStartPointTo(x, y)` and `translateCenterPointTo(x, y)`, on PathBlock and
ProjectedPath, each carrying `anchor`. The naming went `rebase()` → rejected ("right concept,
wrong name") → "it is a translation of the start point to the origin" → `translateStartPoint(0, 0)`
→ `…To`, because a bare `translate` reads as a delta and `(0, 0)` as a no-op; `To` is the
suffix `drawTo` already uses for a destination. Built the same day: `docs/path-blocks.md`
(Transforms), `tests/translate-point.test.ts`, `../v3-translate/` (diagram, three-surface probe),
`../reviews/translate-point-2026-10-03.md`.

Found while building, not changed: `boundingBox()` / `centerPoint()` on a block count the
point a leading or trailing **move** touches (`@{ m 10 10 h 20 }.centerPoint()` is `(15, 5)`,
not the drawn `(20, 10)`; `@{ h 10 m 50 50 h 10 m 100 100 }` reports 170 × 150). The centre
method measures the drawn shape only and the docs say so.
