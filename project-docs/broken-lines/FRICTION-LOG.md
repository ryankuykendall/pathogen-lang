# Broken Lines — Friction Log

A running log of language and tooling friction encountered **while authoring
the Broken Lines blog series samples** (stroke geometry: `dash()`,
`outline()`, `startAt()` applied to sashiko, leathercraft, and stencils).
Entries are appended as samples are written, in the moment — following the
Cutting Room convention (`../cutting-room/FEATURE-OPPORTUNITIES.md`).
On resolution, a bold status prefix is added and the original text is
preserved verbatim under `Original:`. Synthesized into the series' closing
post (part 5) at project end.

---

1. **RESOLVED (2026-09-01, its own session as promised).** Bare `${expr}`
   now works in style-block values — whole values, list tokens
   (`stroke-dasharray: ${cell} ${cell};`), and inside function args fused
   to units (`blur(${x}px)`) — with exactly the backtick form's semantics
   (one shared splice path in css-value-utils; backticks stay equivalent
   and are no longer the default the docs teach). Implementation: a new
   `StyleInterp` sibling token + `StyleBody` wrapper node in the outer
   grammar (adding the interp INSIDE the StyleContent DFA overflows the
   generator's 16-bit tokenizer tables — the sibling-token shape respects
   both documented dead ends), an interp-aware value scanner in
   parseStyleDeclarations, an `Interp` value node in the editor grammar
   (direct-mounted over StyleBody so every tree walker keeps working),
   scope-analysis/completions/color-chip/tmLanguage consumers patched, and
   the parity corpus extended. Bonus: single-quoted values containing
   `${}` now parse. Known asymmetry: template-form interps inside style
   values still allow no nested braces (table-size limit) — the bare form
   allows one level and is the more capable spelling. Follow-up logged:
   full expression completions INSIDE a bare interp (this cycle only
   suppresses the wrong style completions there).

   Original: **Interpolating a variable as a whole style value is a parse error in
   bare `${var}` form.** Writing `stroke-linecap: ${capName};` inside an
   `outline()` style block fails with `Parse error … Missing ';'` — the
   style-block parser treats the inner `${` as a nested style block opener,
   not interpolation. Workaround: backtick-template form,
   `` stroke-linecap: `${capName}`; `` — which works but is easy to miss
   and the error message points nowhere near the cause. Expected: bare
   `${expr}` as a whole-value interpolation, or at minimum an error that
   says "use a backtick template to interpolate into a style value".
   (post45/03.) Related manifestation: building a LIST value from
   variables needs one backtick fragment per token —
   `` stroke-dasharray: `${cell}` `${cell}`; `` — because a bare
   `cell cell` doesn't parse as an expression and reaches the consumer
   as the literal string "cell cell". Works, but the ceremony ×N per
   token is worse than the single-value case. (post46/03, post46/05.)

2. **OPEN (2026-09-01).** Deferred: the right fix is a contextual
   diagnostic ("stdlib shapes position themselves — fold the anchor into
   the arguments") in describeError/detectMissingSemicolon, plus a docs
   callout. Logged for a diagnostics-quality pass.

   Original: **A stdlib shape call after `M` on the same line is a parse error —
   and would be a semantic trap even if it parsed.** `M anchorX anchorY
   roundRect(0, 0, 320, 220, 14)` fails with `Missing ';'` (the M arg
   tokenizer and the call collide); and stdlib shape functions emit
   ABSOLUTE coordinates, so even the two-line form would ignore the M
   silently. The working idiom is `roundRect(anchorX, anchorY, …);` with
   the anchor folded into the arguments — fine once you know, but the
   error message teaches none of it, and method-call draws
   (`M x y piece.path.draw()`) DO work inline, which makes the
   inconsistency feel arbitrary. (post47/04.)

3. **RESOLVED (2026-09-01).** Expression-bodied lambdas shipped:
   `{|piece| piece.kind == 'dash'}` is now sugar for a single implicit
   `return`. Grammar (`TrailingBlock` gains a trailing `expression?`),
   AST builder wraps it in `ReturnStatement { implicit: true }`, and the
   formatter round-trips the bare form without printing the synthesized
   keyword. Documented in docs/syntax.md → Lambdas; tests in
   tests/lambdas.test.ts + formatter.test.ts; full suite green. Series
   samples upgraded in place (post47/03, post48/02, post48/03).

   Original: **Expression-bodied lambdas don't exist, and the error
   doesn't say so.** `pieces.filter() << {|piece| piece.kind == 'dash'}`
   fails with `Parse error … Missing ';'`; the working form needs a full
   statement body: `{|piece| return piece.kind == 'dash'; }`. Every
   filter in this series is a one-expression predicate — the ceremony is
   pure noise, and the parse error gives no hint that `return` + `;` is
   what's missing. (discovered testing the filter idiom for post45
   prose.)

4. **RESOLVED (2026-09-01).** Root cause: `splitCmdsIntoSubpaths` in
   boolean-ops split only on `z`, so a subtrahend ring closed by
   coincident endpoints (circle() emits no `z`) got glued to its hole
   ring, and `reverseEntirePath` scrambled the merged contours. Fixed by
   also starting a new subpath at any `m` that follows drawing commands
   (pathCut already carried a local workaround for exactly this — now
   general). Regression test in tests/boolean-ops.test.ts ("holed
   subtrahend"); full suite green. The published sample keeps the
   separate-counter construction because it tells the physical story
   better, and the repro now renders correctly too.

   Original: **SUSPECTED BUG: difference() with a holed subtrahend
   displaces the hole.** `sheet.difference(ringOuter.difference(ringInner))`
   — subtracting an annulus (a shape WITH a hole) from a sheet — rendered
   the counter circle offset up-and-left instead of centered (post48/01,
   first attempt). Subtracting the outer circle alone lands exactly where
   expected, so the multi-contour subtrahend path is implicated. Needs a
   minimal repro; worked around in the published sample by drawing the
   counter as its own piece (which is truer to the physical situation
   anyway). (post48/01.)

5. **FEATURE OPPORTUNITY: no way to dash an offset path by its SOURCE's
   parameterization.** Leather stitch lines run ~3 mm inside the edge;
   `edge.offset(-3)` gives the line, but offsetting changes arc length,
   so dashing the flap's inset line and the body's inset line separately
   can produce DIFFERENT hole counts — the exact disagreement the craft
   forbids. What the domain wants: dash the shared edge once, then carry
   each piece to the offset line at matched t (an offset-aware dash, or a
   `mapToOffset(distance)` on pieces). Worked around in post47 by punching
   on the shared edge itself — which matches real practice (mark one line,
   punch through both layers) but sidesteps rather than solves.
   (post47/03, post47/04.)

6. **RESOLVED (user design ruling, 2026-09-01).** Reviewing the finished
   series, the user flagged `pieces.filter() << {|piece| ...}` — an inline
   lambda literal after `<<` — as unintended: `<<` exists to apply a worker
   *defined elsewhere* (reusable across callback builtins); the inline
   spelling is the trailing block. Two spellings of the same thing
   accumulate cruft. Fixed same day: an inline lambda literal directly
   after `<<` is now a compile error in both evaluators, with a message
   pointing at the trailing block form; docs/syntax.md worker rules and
   limitations updated; the lambda coverage matrix now asserts the error;
   all series samples and posts converted to `filter {|piece| ...}`.
   (post47/01-04, post48/02-04, part 4-5 prose.)

7. **RESOLVED (2026-09-01).** Pathogen code was being syntax-highlighted
   AS JAVASCRIPT on two of the blog's own surfaces, splitting dashed style
   properties (`stroke-width` → white `stroke-` + blue `width` in fenced
   blocks) and coloring dashed vs undashed property names differently in
   the mini-workspace (JS-valid `fill:` green, parse-broken `stroke-width`
   blue). Root causes: build-blog registered `hljs('pathogen', javascript)`
   for fences, and mini-workspace loaded `@codemirror/lang-javascript`.
   Fixed by using the REAL Lezer highlighter everywhere: fences render via
   `highlightPathogen()` (now walking the editorParser so style-block
   interiors get structured PropertyName/value tokens — new `pr` class,
   wired through theme.css/--code-pr, code-print-palette, and the
   github-theme CSS appended in build-blog/build-docs), and mini-workspace
   wraps `window.PathogenLang.editorParser` (falling back to
   /dist/highlight.global.js, the detail-source-mount pattern). Verified by
   screenshot on both surfaces; drift-guard + token suites updated; full
   suite green. (every sample's code panel; user report with screenshots.)
