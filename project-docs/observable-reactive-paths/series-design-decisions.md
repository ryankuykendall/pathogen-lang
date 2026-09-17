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


## Panel geometry variants (added 2026-09-16, part 3 review item 20)

- Parts 1–2: 480×230, two GroupLayers at translate (40–50, 70–80) and (270–290, 70–80), notes at y 100–122, divider `M 240 45 L 240 200`.
- Dimensioned figures (part 3, post54): 480×260, translate-y 60, form origin at local (16, 100) or (16, 120) when dimension lines sit below, notes at y 166, divider 40–232. Dimension lines and extension lines need the extra height.
- Millimetre forms (part 4, post55): 480×260, GroupLayers with `scale: 1.4` at (80, 40) and (220, 40); captions are page-level text layers at y 30 and 242; divider `M 190 30 L 190 235`.
- Stacked boards (part 5, post56): 480×300, form above at translate-y 62 and twin below at 178, both `scale: 0.9` (0.82 for the fanned board), horizontal divider `M 25 150 L 455 150`, captions at y 48/134 and 166/282.
