# Content review — docs/syntax.md "Ranges as Values" (2026-09-18)

4-persona agentic review (`content-reviewer` agent), scoped to the new and
changed text only. Overall verdict: the mental model ("a `for` loop that hands
you its counter values as a list"), the loop-vs-`.map` before/after, and the
gotcha list land; not ship-ready as first drafted because two statements
conflicted with the section's own examples and the two facts most likely to
bite sat in fine print.

| # | Finding (personas) | Disposition |
|---|---|---|
| 1 | "Inclusive" is contradicted by `(0.5..3)` → `[0.5, 1.5, 2.5]`; the governing rule was only a trailing comment (ID, UXE) | **Applied.** New first bullet: "Steps are always one, counted from the start." |
| 2 | Bullet says a `for` header needs no parentheses; eight lines later `for ([value, position] in (10..12))` has them, unexplained (UXE, ID) | **Applied.** Paragraph after the loop explains that destructuring needs the array. Verified the bare form is rejected with the needs-parentheses error. |
| 3 | Error text paraphrased where the page quotes verbatim (ID, UXE) | **Applied.** Both messages quoted; both checked byte-for-byte against the CLI. |
| 4 | 32,000 cap buried as the last clause of a three-fact paragraph (ID, PM) | **Applied.** Promoted to its own bullet. |
| 5 | The only rendered example (eight identical circles) is a throwaway and undercuts the pitch (UXD, PM, ID) | **Applied.** Range held in `columns`, mapped to both `centers` and `radii`, graduated row, closing "Change `(0..<8)` to `(0..<5)`…". No `<mini-workspace>`: no page under `docs/` uses one. |
| 5b | Follow-up introduced by #5: canvas width `240` hard-coded twice (UXE, ID) | **Applied.** `viewbox.width` / `viewbox.height`, linked to ViewBox "Reading the `viewbox`". |
| 6 | `position` is the domain's word for a coordinate, wrong for an index (ID, UXD) | **Applied.** `index`. |
| 7 | New section writes bare arithmetic while the page's stated rule says "wrap them in `calc()`" (UXE, ID) | **Applied, option (a).** Verified with the CLI: `calc()` is required only in path-command arguments (`M width / 2 0` is a parse error; `let`, `return` and call arguments take infix arithmetic). `## Expressions with calc()` opener amended — a one-sentence precision fix to OLDER text, flagged to the user. Older `.map` bodies that use `calc()` were left alone (accepted, not required). |
| 8 | Link text "everywhere else"; 55-word sentence (UXD, ID) | **Applied.** Split; link text "range value". |
| 9 | Opener never shows the correct `let` form, only the wrong one (ID, UXD) | **Applied.** First line is `let steps = (1..5);`. |
| 10 | `<<` paragraph now restates its neighbour (ID) | **Applied.** Restated sentence removed; the constraint stays in the paragraph above. |
| 11 | A range in a path argument being rejected was undocumented (UXE) | **Applied.** Added to the parentheses bullet with the `calc((1..3).last)` way out; mirrored by a test. |
| 12 | Forward references to `for` / `case` with no orientation (ID) | **Accepted as-is** — reviewer's own recommendation; both are linked, and a Prerequisites blockquote is heavy for a reference subsection. |

Every code fence in the section is mirrored by a test marked "(docs example)" in
`tests/range-values.test.ts`.
