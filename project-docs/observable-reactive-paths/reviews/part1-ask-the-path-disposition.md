# Review disposition — Part 1, "Ask the Path" (2026-09-16)

Agentic review (content-reviewer, four personas) of `website/blog/ask-the-path.md`
with the six post52 samples, their PNG previews and a clean validation report.
Every item below was applied unless marked otherwise.

## Must-fix

| # | Finding | Disposition |
|---|---------|-------------|
| 1 | "Every sample above is a live editor" is false — the code panel is read-only. | Replaced with the house phrasing (the "Open in playground workspace" button opens an editor). Same false claim fixed in `segment-labels-and-suffixes.md` and in part 2's closing. |
| 2 | Part-2 teaser said annotations are drawn "as the form is drawn", contradicting program-end dispatch. | Rewritten: drawn "once the program finishes, once per match, in drawing order, wherever in the program the drawing happened". |
| 3 | "none of them does arithmetic" is too strong (twins compute leader offsets). | Narrowed to "none of them re-types a coordinate the form already knows". |
| 4 | Sample 05 caption described `command(line)` but the source uses `command(line, close)[length>40]`. | Caption now describes every edge longer than 40, closing edge included. |
| 5 | `query()` is in the title and description but never defined; `query` vs `queryAll` never contrasted. | New bullet in "Before you lean on it": `query` insists (one match, errors listing what exists), `queryAll` returns an array. |
| 6 | Five-noun taxonomy was one 50-word sentence. | Split into a short sentence and a five-item list. |
| 7 | Sample 02: spokes ran centre→`get(0.5)` and the circle's centres were unmarked; count note unclear. | Spokes now run from each arc's midpoint to `arc.center`; midpoint dots in red, centres marked; note reads the count back. |
| 8 | Sample 03: tips and roots used the same colour; no legend. | Tips solid blue, roots ringed (bg fill, blue stroke), teeth gold; three-line legend. |
| 9 | Sample 04: "face" form read as a cartoon; leaders crossed. | Form is now a control knob (bezel, pointer, cap, detent). Rows ordered by box height so leaders never cross; each leader anchors at its box's right-edge midpoint. |
| 10 | Sample 06: two twins crammed into one panel. | Three panels (form, `subpath` noun, `.subPath()` slice) with two hairline dividers; gold / purple runs, red slice. |

## Should-fix

| # | Finding | Disposition |
|---|---------|-------------|
| 11 | Fillet gotcha stated the arc is found but not the consequence for `endpoint(name)`. | Added: `endpoint(name)` on a filleted corner answers the trimmed tangent point, not the joint you typed. |
| 12 | Two friction-log entries had 40+-word sentences (subPath `z`, arc solver). | Both split; the `z` sentence now says what the closing edge does in one clause. |
| 13 | `description` and `seriesDescription` too long for the index card. | Trimmed to ~150 characters each. |

## Consider

| # | Finding | Disposition |
|---|---------|-------------|
| 14 | "struct" used before it is glossed. | Glossed at first use in the sample 02 paragraph. |
| 15 | "finalization" is compiler jargon. | Now "when the path was finished". |
| 16 | One "And" sentence opener. | Removed. |
| 17 | `ProjectedPath` named without explanation. | Glossed as "the block once it is placed on the page". |
| 18 | `call` matches the outer statement only; a `circle()` inside a user fn is `call(myFn)`. | One-sentence caveat added after the sample 04 paragraph. |
| 19 | TOC markers inconsistent ("coming next" vs "coming"). | Normalised to "— coming". |
| 20 | Closing should point at where the finished pieces begin. | "The finished pieces start in part 3, where three projects put both to work." |

## Deferred

- The leading-move fix (friction entry 15) is told in part 2's friction section, where the ring sample surfaced it; part 1 does not repeat it.
- The design-system / sanitizer font disagreement is logged, not resolved (friction entry 11).
