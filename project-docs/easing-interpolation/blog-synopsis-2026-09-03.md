# Blog synopsis: "Ease Once, Apply Everywhere: Easing with Lambdas"

Slug `easing-with-lambdas`, dated 2026-09-07 (after the newest post, 2026-09-06).
Standalone, not part of the Stdlib Primers series. Written for people who build
things with code, per `website/guidelines/voice-and-audience.md`.

Ryan's brief (2026-09-03): "a blog post that walks through how to practically use
the updated easing functionality using lambdas. It should include explanations of
how to apply the easing function output to ranges, amplitudes, and
cycles/half-cycles (that's what I am getting at with practical)."

## Synopsis (~250 words)

The post teaches one idea and applies it six times: an easing curve is a
function that takes `t` and hands back a reshaped `t`. The mental model is a
cam under a slider: the slider (`t`) turns at a steady rate, the cam's profile
decides how fast whatever rides on it rises, and swapping the cam changes the
motion's character without touching the slider. In Pathogen a cam is a lambda:
`let smooth = {|t| cubicBezier(0.42, 0, 0.58, 1, t)};` or
`let bounce = {|t| ease(Easing.BounceOut, t)};`.

Gotchas come first: `back` and `elastic` (and `cubicBezier` with y handles
outside 0..1) leave the 0..1 box and nothing clamps them; `t` itself is
clamped; lambdas take exactly the arguments they declare.

The ladder: (1) five cams plotted bare, including two that overshoot; (2)
ranges, where one lambda drives position through `lerp`, color through
`.mix`, and radius, all in sync; (3) amplitudes, where the eased `t` becomes a
wave's envelope (constant, sine-in, smoothstep window); (4) cycles versus
half-cycles, where `sin(PI() * halfCycles * t)` counts lobes and odd counts
are possible, riding on a `lerp` journey; (5) factories, `fn`s that return
lambdas with their numbers baked in, and why to return a lambda rather than a
named `fn`; (6) a plume that uses all of it: BackInOut spread, windowed
amplitudes, half-cycle lobe counts, mixed color.

Closes with links to the Easing reference (family table, handle values),
TopoGradient easing, the `bump` primer and the lambdas post.

## Status

Samples authored, formatted, compiled, validated (0 warnings) 2026-09-03.
Agentic review pending; results recorded in `blog-review-2026-09-03.md` when done.
