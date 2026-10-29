# Content review: blog code examples parse again (website/blog/*.md, 2026-10-28)

Multi-persona review (UXD, UXE, PM, ID) of the fixes that make every untagged or ```pathogen fence in website/blog/ parse: 60 failing examples in 21 posts. 39 got semicolons, 18 were retagged (`text`, `xml`, `pathogen invalid`), and the rest were fixed by hand. Reviewed from the diff (tmp/docs-fences/blog-changes.diff at the time) and the posts.

## Verdict

Approve with edits. One blocking item: the boolean-operations post.

## Findings and dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | **Blocking.** pathblock-boolean-operations.md: replacing `d1.project(0, 0)` was right, but the prose says results are PathBlocks normalized to `(0, 0)` (~23, ~89 framed as a quote from the docs, ~103, ~107, ~118, ~140). The docs now say the receiver decides: a ProjectedPath in, a ProjectedPath out, in page coordinates (docs/path-blocks.md "Requirements and behavior"). `drawTo(0, 0)` on a ProjectedPath moves its first point, so the examples no longer draw what the prose says; the final example's sample dots would not line up. | Applied. Rendered both versions of the final example: as written, `drawTo(10, 10)` after the fillet shifted the outline by (−12, −50) away from its dots; projected where it goes and drawn with `.draw()`, they line up. All four examples now project where the shapes go and `.draw()` the result. The prose says "a path of the same kind", ~89 matches the docs' rule word for word, ~103 says the union stays where it was projected, and a dated editor's note under Requirements records the change. Renders in tmp/boolean-blog/. |
| 2 | boolean-ops ~96: `let circle = @{ circle(0, 0, 30); };` names a variable after the stdlib function the block calls. | Applied: renamed to `disc`, as docs/path-blocks.md writes it. |
| 3 | broken-lines editor's note, version A: "The parse error is gone"; "With a `;` at the end"; "has no effect" is more exact than "is ignored" (the `M` is still emitted). | Applied. |
| 4 | Version B (after the `ignored-move` warning ships): replace A rather than add a second note, echo the "planned diagnostic" promise, say the entry is closed, ship only once docs/debug.md lists the code. | To apply in the commit that ships the warning (docs/debug.md "A move a shape ignores" exists there). |
| 5 | heading-turn ~120: "when no drawing command has run yet" is too narrow (the example sets a heading after an `L`; an `M` clears it). | Applied: "`heading()` sets it explicitly at any point — including after an `M`, when there is none — and `turn()` rotates whatever heading is current." |
| 6 | heading-turn ~109: say `null` "at the start and after an `M`", as docs/stdlib.md does. | Applied. |
| 7 | fillets ~117: "it takes a unit" overstates the rule (literals only; a variable passes as radians). | Applied: "It's an angle, so a literal needs a unit (`0.3rad`, `17deg`):". |
| 8 | broken-lines ~134/~162 `text` tags: fine (docs/syntax.md does the same), but ~220 says every code panel renders through the real parser; wrapping ~162 in a style block keeps that true and lets the test check "just works today". | Applied, and taken one step further: ~162 is now `let stitch = #{ … };` under ```pathogen (checked by the test); ~134, the historical parse error, is ```pathogen invalid rather than `text`, so it keeps its Pathogen highlighting too. |
| 9 | Minor: `xml` on a bare `fill="…"` attribute gets little highlighting (harmless); glyph-extraction ~140 lacks the `;` ~164 gained; textblock `1pi` matches the sample. | glyph-extraction ~140 gets its `;`; the rest left as is. |

## On editor's notes (synthesis)

Use a dated note only where a fix changes what a post says about the language: broken-lines (a friction log that already carries a note) and boolean-operations (its rule for results changed). Semicolons, tags, renames and placeholders go unannounced; a plain factual error (heading-turn's `undefined` → `null`) is corrected quietly with a minimal edit.

## Checks after the edits

- tests/docs-examples.test.ts: 85 passed (docs and blog).
- Every blog fence compiled with the examples before it in its post (tmp/docs-fences/stitch-blog.ts --disk): no failures other than names the post never defines, three known fragments, and font-dependent examples.
- `npm run build:blog`: the `pathogen invalid` fences render with Pathogen highlighting, `text` fences as plain text; the regenerated build output was restored, not committed.
