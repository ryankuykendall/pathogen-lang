# Series design decisions — "Drawing Without Bookkeeping"

Fixed after the part 1 agentic review (2026-09-16). Every sample in parts 1–5
follows these unless a post's friction log says why not.

## Panel system
- ViewBox 480×230 for two panels (left group at translate 40–50/70–75, right at
  270–290/70–75); three panels at 22 / 176 / 330. Hairline dividers between
  panels (`fg_hair`, 0.5) from y 45 to 200.
- Eyebrow at `text(0, -18)` (8/700/+3, `fg_muted`), one or more note lines from
  y 100–112 (8/400/+0.5, `fg_auto`) — every panel gets a note, the right-hand
  notes name the selector(s) in play.
- Form stroke `fg_auto` 1.5; the same PathBlock drawn at the same local origin
  in every panel (`M 0 0 shape.draw()`), so query coordinates need no arithmetic.
- Tokens: `bg_color = Color(CSSVar('--bg', #d0d7f0))`, `fg_auto = Color('#0d1638')`
  with `.alpha(0.6 / 0.22 / 0.1)`, `font = 'sans-serif'` (the sanitizer rejects
  the quoted stack — friction 11).

## Colour roles (OKLCH L .55 C .16)
| Role | Hue | Used for |
|---|---|---|
| points / endpoints | blue 260 | endpoint dots, numbered joints, last-three marks |
| runs / segments | gold 80 | `segment(...)` tints, `subpath(0)` |
| a second run | purple 320 | `subpath(1)` when two runs must differ |
| filtered / sliced geometry | red 27 | arcs by kind, `[length>…]` edges, `.subPath` slices, rings in round two |
| structural boxes & names | teal 200 | call bounding boxes, leaders, labels |
Fills for run membership: `fg_faint`. Labelled endpoints that must be told apart
from unlabelled ones: same hue, ringed (`fill: bg_color; stroke: points`).

## Prose conventions
- TOC marker for unpublished parts: "— coming".
- Closing CTA (house phrasing, from easing-with-lambdas.md): the code panel is
  read-only; the "Open in playground workspace" button drops the sample into an
  editor. Never "live editor".
- "bookkeeping": series name only, plus at most one body use per post.
