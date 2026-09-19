# Content review — docs/syntax.md "Comments" + the reserved-name sentence (2026-09-19)

4-persona agentic review (`content-reviewer` agent), scoped to the new and
changed text. Verdict: the ladder (switch → lists → chain / text body → style
block) is the right shape and size for a small reference section; ships with
word-level edits. Two real defects, both inside scope — and one of its
"verify this" items turned out to be a data-loss bug in the formatter.

| # | Finding (personas) | Disposition |
|---|---|---|
| 1 | The reserved-name sentence restated its own bullet and used compiler-speak ("wherever a name is introduced") (ID, PM, UXD) | **Applied** — reviewer's shorter rewrite, verbatim. |
| 2 | "left exactly as you wrote it" overstated: the statement IS re-indented when its block moves. Add-on: the section's first fence shows a trailing comment, the one spelling the formatter relocated (UXE, ID) | **Applied, and the formatter fixed rather than caveated.** Every trailing comment used to move to its own line BELOW its statement, where it read as describing the next one. It now stays at the end of its line — statement lists, switch clauses, text bodies (`trailsCode` / `pushComment`). Paragraph rewritten to the reviewer's wording plus "a comment at the end of a line stays at the end of that line". |
| 3 | `enum` bodies missing from a list that reads as exhaustive (UXE, ID) | **Applied.** |
| 4 | "most editors do this with one keystroke" hedges past the surfaces we control (UXE, PM) | **Applied after verifying in code**: the playground loads CodeMirror's default keymap with `commentTokens: { line: '//' }`; the VS Code language configuration declares `lineComment: '//'`. Also checked live by `verify-playground.mjs`. |
| 5 | Is "Formatting keeps every comment" true INSIDE a style block? Style declarations are printed from parsed properties (UXE) | **It was not — a real bug.** A style block comment with words in it made the formatter refuse the whole document; one without (`// ----`) was silently DELETED. Fixed: a `StyleContent` token carrying a comment makes its statement verbatim, and those comments count in the `dropsComments` net. Four tests. |
| 6 | Older text the new example contradicts: the Arrays intro lists element types and omits colors, Points and objects (UXE, ID) | **Applied** (in bounds: factually incomplete). |
| 7 | Framing sentence defined the feature against a constraint the reader never knew about (ID, PM) | **Applied** — reviewer's rewrite. |
| 8 | Opening fence uses a single-letter variable (UXD) | **Applied** — `size`. |
| 9 | Recommendations NOT to add: a "what changed" note; the switch-expression formatting limit (PM, ID) | **Followed.** History lives in the CHANGELOG; the limit lives in the feature README. |

## A warning for later edits (reviewer, on re-check)

Do NOT shorten "between statements, between the cases of a `switch`, or between
the items of a text body" in the formatting paragraph to "a comment on its own
line is re-indented with its neighbours". It looks like padding and is not: a
comment on its own line INSIDE a statement (`// highest first` in the method
chain fence) is kept verbatim, not re-indented, so the shorter sentence would be
false.
