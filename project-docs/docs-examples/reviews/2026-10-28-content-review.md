# Content review: published docs examples parse again (2026-10-28)

Multi-persona review (UX designer, UX engineer, product manager, instructional designer) of the uncommitted docs/ fix: semicolons added to ~96 examples, 27 non-Pathogen blocks retagged, 11 outdated examples fixed, and `tests/docs-examples.test.ts`.

## Verdict

Ready to commit after one fix. All 11 outdated-code fixes are correct and keep their prose; every retag is right (none of the retagged blocks is runnable Pathogen); semicolon spot-checks clean. Verified by reading:
- C1 shore rewrite matches `project-docs/topological-gradient/topo-terrain-demo.pathogen` geometry; relative offsets round-trip to the original absolute points.
- C10 rotation parameter is `AngleValue`, so `0.3rad` / `0.5rad` are right.
- C11 `polygon(cx, cy, r, sides)`; `startAt(40%)` on the pentagon lands on vertex 2.
- C6 `45deg` ≈ 0.785 rad; C4 `rad()` is degrees→radians.
- ```` ```pathogen invalid ```` builds to `class="hljs language-pathogen"`, same as ```` ```pathogen ````.

## Findings and dispositions

| # | Finding | Proposed disposition |
|---|---|---|
| 1 | textblock.md:329–337: the "(e.g., style blocks)" premise and `${ fill: red; }` payload show the old style opener; style blocks are `#{` now and need no escaping. The ✓ line sits under `invalid`, so the test doesn't check it. | Fix: real `${…}` payload, honest "✗" comment (it interpolates rather than failing), add `#{` to the no-escaping list, ✓ line in its own checked block. |
| 2 | layers.md:285, 289, 461: three ```` ```js ```` `compile(`…`)` examples still use `${` style openers. Outside the diff; the test doesn't look inside js fences. | Fix `${` → `#{`; log the js-fence gap as a follow-up. |
| 3 | layers.md:436: "bare numbers are radians" for tspan rotation contradicts syntax.md:1438 (a bare rotation literal in text()/tspan() is an error). | Fix the clause: write `45deg`, `0.5rad` or `0.25pi`. |
| 4 | Most original bugs in the C group were compile-time, not parse errors; a parse-only test can't catch them returning. | Already done: every Pathogen block in docs/ was compiled (tmp/docs-fences/compile-all.ts); the C blocks compile, except the security list (rejected on purpose) and subscriptions.md (a fragment). Say so in the commit message. Compile-level checking stays a follow-up (fragments need context). |
| 5 | gradients.md:732 says a contour must "end with `closePath()`"; shore now ends with `z` (valid; the check looks for `z`). | Fix: "(end with `z` or `closePath()`)". |
| 6 | stdlib.md:848: parameters `w, h, s` include path-command letters (`h`, `s`), which the code-example guidelines §6 ask samples to avoid. | Fix: `width, height, spacing`. |
| 7 | tests/docs-examples.test.ts:13: "shown failing on purpose" is too broad (security.md, syntax.md fail at compile time but parse, so stay checked). | Fix: "shown failing to parse on purpose". |
| 8 | scripts/build-docs.ts:49: highlight.js has no `text`/`xml` registered, so retagged blocks are still auto-highlighted; the retag stops them claiming to be Pathogen but doesn't change how they look. The CHANGELOG line "no longer look like code to run" overstates this. | Awaiting the user: register `plaintext` (as `text`) and `xml` so those blocks render plain/as XML, or keep rendering as is and correct the CHANGELOG wording. |

## Outcome (user's choice: apply 1–7, register the highlighters)

- 1: done. While fixing it, `\${` turned out to keep its backslash in the text (the parser's unescape step had no `\$`); the user chose to fix the parser first — `f210e1f` fix(core) — so the rewritten example shows the escape working, as one checked ```` ```pathogen ```` block. The code-snippet example above it now uses `#{` (no escape needed).
- 2: done; both JS `compile()` examples compile and match their documented layers. The js-fence gap is a follow-up.
- 3, 5, 6, 7: done as proposed.
- 4: stated in the commit message; compile-level checking stays a follow-up.
- 8: `scripts/build-docs.ts` registers highlight.js `plaintext` (as `text`) and `xml`; the built page has 24 `text` blocks with no highlight spans and 16 `xml` blocks with XML spans.

## Synthesis

The UX engineer and instructional designer agree the fixes keep each example's lesson; their remaining concerns are the stale textblock premise and the nearby angle-unit prose. The product manager's priority is #4, keeping the examples working beyond parsing. The UX designer had little to assess beyond fence rendering (#8).
