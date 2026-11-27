# docs/syntax.md: an array's `.empty()` returns `true` or `false`

2026-11-27. The user approved the fix ("Yes, fix the array .empty() line in the docs"). Step 9's CHANGELOG review found the mistake (reviews/phase-3a-changelog-review.md, finding 6).

**The change** (docs/syntax.md, arrays, `.empty()`):
- Before: "Returns `1` (truthy) if the array has no elements, `0` (falsy) otherwise:"
- After: "Returns `true` if the array has no elements, `false` otherwise:". This matches the string `.empty()` and `.includes()`, which 3a corrected.

**Backstops.** tests/evaluator.test.ts now logs the value, where before it only tested it inside an `if`:
- an array's `.empty()`;
- a string's `.empty()`;
- a string's `.includes()`.

Each test expects `true` then `false`.

## The content review

One content-reviewer pass, scoped to the change. It found nothing that must be fixed: the sentence is accurate, it matches the string entries, and the example still reads right.

| # | Finding | Disposition |
|---|---|---|
| 1 | optional. Add `log(list.empty());  // true` to the example, like `.first` and `.last` above it, and the same to the string entry | **Not taken:** the user asked for the line. Offered to the user |
| 2 | optional. A link to Booleans: recommended against, since the string entries don't link | **Not taken**, as recommended |
| 3 | outside the change. docs/syntax.md:1824 says "Comparison results are numeric: `1` for true, `0` for false." That contradicts :685 and :702. `log(5 > 3)` logs `true` (tests/evaluator.test.ts, "log(5 > 3) displays \"true\""). Proposed: "Comparison results are booleans (`true` or `false`; see [Booleans](#syntax-booleans))." | **Taken** at the user's word ("Make the fixes and then push"), in the proposed wording |

The CHANGELOG's 2026-11-27 entry, Fixed › Documentation, was widened at the same word: "`.empty()`, on a string or an array, and a string's `.includes()` return `true` or `false`, not `1` or `0` as the page said. So does a comparison, such as `5 > 3`."
