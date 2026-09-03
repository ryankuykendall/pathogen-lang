# Agentic review: "Ease Once, Apply Everywhere: Easing with Lambdas"

Four-persona review (UX Designer, UX Engineer, Product Manager, Instructional
Designer) run 2026-09-03 via the `content-reviewer` agent on
`website/blog/easing-with-lambdas.md` and `website/blog/samples/post51/*`,
with the validate-samples PNG previews. Synthesis below, then what changed.

## Blocking findings and what was done

| # | Finding | Action |
|---|---------|--------|
| 1 | `/docs#layers` anchor does not exist (check-links: ANCHOR_NOT_FOUND) | Link now `/docs#layers-defining-layers`, the anchor every other post uses. |
| 2 | `02-ranges` label separated two expressions with three spaces; SVG collapses whitespace | Separator is now ` · `. |
| 3 | `04-half-cycles` added the sine offset in y-down space, so the first lobe sagged while the prose said "one bulge… rise, fall, rise" | Offset subtracted (`lerp(...) - amplitude * sin(...)`), caption interpolates `${amplitude}`, prose says "up, down, up". |
| 4 | `05-lambda-factories` promised "overshoot, then settle" but drew filled dots with no reference mark; the last five merged | Dashed tick at the 1.0 mark, hollow stroked dots, eleven of them, caption "past the mark, then back". |
| 5 | Caption color `oklch(0.45 0.02 260)` ≈ 2.8:1 on the dark preview background | Captions use `#8a93a6` (the post50 precedent, ≈ 5.7:1). The design system's quoted Helvetica stack and `fg_auto` expression are rejected by the style sanitizer, so the published-sample convention was followed instead. |
| 6 | "and twenty more" undercounted the 26-member family | "twenty-two more". |

## Recommendations adopted

- `%` instead of the hand-rolled `floor` modulo in the plume (7). This surfaced a **formatter bug**: it dropped the parentheses in `6 * (strandIndex % 2)`, which changes the value (`%` shares the times level but is not regroupable). Fixed in `src/language-services/formatter.ts` with regression tests; see the changelog.
- The plume's overshoot claim rewritten to what the picture shows: the strands just inside the edges pass their outer neighbors and the tips cross (8).
- Example 1 sampled at 96 points like its siblings (9).
- The clamp gotcha grounded in Example 2's radius channel (10).
- "These curves shape space, not time" added to "The one idea" (11).
- The "Open in playground workspace" button named once, and a closing call to action added (12).
- "Envelope" translated on first use (13).
- Per-item layers in `02-ranges` and `06-plume` grouped under a GroupLayer (14).
- Half-cycle rows labelled "1 half-cycle" … "4 half-cycles" beyond the row's right end; rows shortened to make room (15).
- The half-cycle caption interpolates `${amplitude}` rather than hardcoding 14 (16).
- The `makeEase` handles identified as the bézier fit of back-out, tying Example 5 to Example 1 (18).
- `smoothstep(0, 1, t)` spelled with its arguments (19); the `t`-clamp gotcha scoped to `ease`/`cubicBezier` (20); the `x`-handle compile error added to the gotcha list (21); the plume's `SineOut` advance named as a lambda (22).

## Not adopted, with reasons

- (17) Swapping `SineIn` for `CubicIn`/`ExpoIn` in the amplitude sample. Those curves start flatter than sine-in, so the middle row would grow later, not earlier. Sine-in is the gentlest ease-in and already reads as "starts silent and swells".
- Titling the plume. It closes the ladder as a finished piece; the caption carries the reading.

## What the reviewers found strong

The cam-under-a-slider model; gotchas before the pictures; the ladder from
bare mechanism to composition with "There is no new mechanism in this
picture" making it explicit; the ranges / amplitudes / half-cycles sections
matching the brief one-for-one; naming discipline in the samples; and the
plume as a finale that reads as craft.
