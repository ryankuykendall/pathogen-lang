# Blog synopsis — v2 (order resolved with user, 2026-08-22)

**Proposed title:** Cutting Paths: Slicing Shapes Apart with `cut()`
**Series:** PathBlock Extensions, Part 5 (frontmatter `series`/`seriesPart`; manual TOC blockquotes in parts 1–4 updated to five entries)
**Prerequisites callout:** PathBlock basics (`@{}`, `.draw()`, `.project()`) → link to Introduction to PathBlocks; Boolean Operations post for contrast.

## Synopsis (~250 words)

Boolean operations combine two closed shapes into one. `cut()` goes the other
direction: it takes a shape apart. You draw a second PathBlock whose strokes
act as a knife — open lines and curves, as many as you like — and
`shape.cut(knife)` hands back an array of pieces, each one a complete
PathBlock sealed shut along the lines that cut it. Because every piece is a
real PathBlock, everything you already know applies: style each piece its own
color, `boundingBox()` it, offset it, cut it again.

The post teaches the mechanic with a ladder of six interactive examples:
(1) the barest picture — a rectangle and one straight stroke, two pieces,
drawn reassembled and then exploded; (2) the letter 'O' cut two ways — the
same two-stroke knife in two positions yielding four pieces, then two — the
example that motivated the feature; (3) a donut sliced through its hole
into two C-shapes, showing cuts that heal across both contours (and a hole
that rides along when missed); (4) a closed loop as a cookie cutter, stamping
a piece out of a shape; (5) cutting an *open* path — a long curve severed
into alternating-color dashes; and the finale, (6) the full "pathogen.studio"
wordmark shattered — every glyph laid out by advance width, cut with its own
hash-varied knife, each fragment drifting outward and rotating slightly,
with per-piece fills cycling three colors.

Gotchas get named early and plainly: a stroke that dead-ends inside a shape
cuts nothing (no invented geometry — though endpoints that land near the
boundary snap onto it), and pieces come back in no promised order, so style
them by iterating, not by index.

## Notes (resolved)

- Audience/voice per `website/guidelines/voice-and-audience.md` (people who
  build things with code; knife as the physical mental model).
- Closer resolved: the shattered "pathogen.studio" wordmark finishes the
  post (user decision after reviewing the BBWPs, 2026-08-22).
- Samples live in `website/blog/samples/post40/`, compiled via
  `compile:samples`, each also archived as a BBWP.
- Sample-authoring gotcha worth a line in the post or docs later:
  `rotateAtVertexIndex` rebases its result to the pivot vertex, so a cut
  piece being rotated must be re-placed via `p.vertices[0]` (see the
  shattered-glyph sample's comment). A placement-preserving rotate is a
  candidate follow-up API.
