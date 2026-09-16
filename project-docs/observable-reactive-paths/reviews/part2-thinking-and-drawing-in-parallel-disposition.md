# Review disposition — Part 2, "Thinking and Drawing in Parallel" (2026-09-16)

Agentic review (content-reviewer, four personas) of
`website/blog/thinking-and-drawing-in-parallel.md` with the six post53 samples,
their PNG previews and a clean validation report. The reviewer's synthesis
arrived in five chunks (its replies truncate near 4,000 characters); numbering
is the reviewer's. Every item was applied unless marked otherwise.

## Must-fix

| # | Finding | Disposition |
|---|---------|-------------|
| 1 | Sample 03's left eyebrow said "TWO APPLY BLOCKS" but the left form draws both squares in one block. | Eyebrow is "THE FORM"; caption trimmed to "Two squares on the same layer." |
| 2 | Frontmatter description was 200 characters. | Replaced with a 138-character version naming the window, the ordering, the rounds and the closure caveat. |
| 3 | "whenever the drawing happens to be" does not parse. | "wherever in the program the drawing happened", and the sentence split after "once per match". |
| 4 | `sub.unsubscribe()` appears before the three-parameter block form is shown. | Fenced block added showing `{\|corner, i, sub\| …}` with a one-line gloss; "starting at 0" added to the prose. |
| 5 | *window*, *records* and *source* used before they are glossed. | Window glossed at first use; "records" dropped ("a window over the layer"); "your own source" → "the layer you subscribed to". |
| 6 | Second friction entry (the `layer` keyword) reprints part 1 and has no docs link. | Entry deleted; section opens "One entry this time". |
| 7 | Sample 06's left eyebrow ran into the hairline divider (invisible to the validator's 15% area test). | Both eyebrows shortened to "WHEN YOU ASKED" / "WHEN IT RAN". |

## Should-fix

| # | Finding | Disposition |
|---|---------|-------------|
| 8 | Sample 04's left note promised "six joints in drawing order" but showed no joints. | Left panel now subscribes its own form for `endpoint` and draws a ringed dot plus ordinal 0–5 at every joint, so the right panel's three are countable. Caption names joints 3, 4 and 5. |
| 9 | Sample 02's 137-character `away` expression read four coordinates off two structs and soft-wrapped. | Applied differently from the proposal: the heading is now `corner.command.block.tangent(1).angle`, plus half the joint's `turn`, minus a quarter turn. Struct-derived, two short lines, and it points along the true tangent at the rounded joints, so the compiled SVG changed deliberately. Same expression used in sample 04. |
| 10 | "part 1's knob" was a dangling reference. | "the boxes part 1 drew around each `call`". |
| 11 | 37-word sentence and the unestablished phrase "the domain posts". | Rewritten around the tangent-and-turn placement; "Parts 3 to 5 lean on the same move." |
| 12 | Post never said only path layers can be subscribed to. | Sixth bullet added to "When, exactly", matching docs/subscriptions.md. |
| 13 | Ordering bullet dropped the dash/marker consequence. | Consequence restored from the docs. |
| 14 | Handle section was one 38-word sentence. | Split into four. |
| 15 | "chosen for several reasons, and this is one of them" named no reason. | "End-of-program delivery is what makes a completed window askable at all." |
| 16 | 38-word sentence in the friction entry. | Split after "previous dot", folded in with item 10. |

## Consider

| # | Finding | Disposition |
|---|---------|-------------|
| 17 | `accent2` declared but unused in five of six samples. | Removed from the five; sample 05 keeps it. |
| 18 | Four sentences open with "That" in 90 lines. | Two varied. |
| 19 | Tie-break rule (same statement → registration order) omitted. | One clause added. |
| 20 | Self-write error restated in the rounds section. | Compressed to one sentence pointing back at the list. |
| 21 | 46-word closing sentence. | Split into four. |
| 22 | Part 1's TOC still marked part 2 "— coming". | Part 1's TOC now links part 2; both ship together. |

## Persona notes worth keeping

- Designer: sample 05's blue-to-red reading carries round one into round two; sample 04 was the weakest image because its marks explained nothing about *why those three* (fixed by item 8).
- Engineer: `turn` is an Angle, so `.rad` is valid; item 12 was the missing error case.
- Instructional designer: one honest friction entry reads better than two when the second is a reprint.
