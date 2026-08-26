# Feature / improvement opportunities surfaced while building The Cutting Room

Running log, kept as samples are authored (2026-08-23 onward). Each entry
notes the friction hit in a real sample. To be synthesized at project end.

1. **RESOLVED (Item B, 2026-08-24).** ProjectedPath.draw() shipped — the idiom is one line; see opportunities/B-projected-draw/. Original: **ProjectedPath had no in-place `draw()`.** Stroking a projected seam
   where it lies requires `let s0 = seam.get(0); seam.drawTo(s0.x, s0.y);`
   — a two-line incantation used in every single sample. A `draw()` that
   emits at the path's own absolute coordinates would make the core
   seam-decoration idiom one obvious line. (post41/01 onward.)
2. **RESOLVED (Item D, 2026-08-24): `pieces.seams()`** — each physical seam once, powered by seamId twin-stamping in cut(); post41/02's ownership rule deleted. Original: **Shared seams double-draw.** Every interior cut line exists twice —
   once per adjacent piece — so naive seam decoration strokes it twice,
   and opposite-direction dashes visibly fill each other's gaps. Samples
   dedupe with ad-hoc ownership rules (midpoint-vs-center compare). A
   group-level `pieces.seams()` (each physical seam once) would remove a
   whole class of bookkeeping. (post41/02, post41/06.)
3. **RESOLVED (Item E, 2026-08-25).** normal(t) was ALREADY material-outward on cut/boolean pieces (winding canonicalization) — the fix was documenting the guarantee, pinning it with tests, and deleting the dead flip dance from two samples (byte-identical outputs). No new API; an outwardNormal alias was deliberately rejected. Original: **`normal(t)` has no material-side orientation.** Tabs must point away
   from the piece; deciding requires the dot-product-against-centroid
   flip dance. Cut seams KNOW their material side (winding
   canonicalization puts material on the left) — an `outwardNormal(t)` on
   seam runs, or a documented orientation guarantee, would delete the
   trickiest lines in the tab samples. (post41/03, post41/06.)
4. **RESOLVED (Item I, 2026-08-25) as a diagnostics fix.** The
   implementation-site report had shown member path args already work;
   the real trap in this entry's class was single-letter variables
   shadowing path commands (`let m = 25; L m 40` → "Missing ';'"
   pointed at punctuation). Now: a specific message ("'m' is a path
   command here — write calc(m), or rename the variable") at BOTH
   error paths (parse()/CLI + describeError/editor; two tree shapes:
   following-command `L m 40` and own-command `L 5 V`), a
   wrap-in-calc() quick fix, and hover on a single-letter variable's
   declaration or calc() reference showing the variable, not the
   command. Original: **Member expressions need `calc()` in path
   args.** `M a.x a.y` is a parse error; `M calc(a.x) calc(a.y)`
   works. (post41/03.)
5. **RESOLVED (Item I, 2026-08-25): `pi`, `deg`, `rad` are reserved
   words** — suffix-only (user decision: strictness over binding pi as
   a constant). Binding any of them (let/for/fn/params/destructuring,
   both evaluators via the setVariable funnel — no F2-style
   divergence) and standalone reference both error with pointers at
   the three working spellings (0.5pi / PI() / deg(x)). Call position,
   suffix position, and Angle members .pi/.deg/.rad untouched.
   Original: **`pi` is not a bare identifier in calc.** `0.25pi`
   literals exist but inside `calc()` one must call `PI()`. Surprising
   asymmetry. (post41/03.)
6. **RESOLVED (Item H, 2026-08-24): `cut()` accepts an array of cutters** — knives compose and can be loop-built; the remaining in-block re-orientation need is Item L (ctx block argument, user design). Original: **Multi-stroke knife authoring is relative-move arithmetic.** Chaining
   strokes with `m` deltas between stroke endpoints caused two authoring
   bugs in one session (post41/06 hex knives, post42/03 grid knives).
   Absolute `M` support inside path blocks, or a way to combine several
   blocks into one cutter (`PathBlock.merge(...)` / array-of-knives
   `cut([k1, k2, k3])`), would make knives compositional.
7. **RESOLVED (Item F, 2026-08-25): cutter labels propagate as
   `cut.<name>` sub-labels.** A knife edge `as segment('valley')` heals
   into seams labeled `cut.valley`; umbrella `segmentAll('cut')` still
   answers the whole namespace merged, sub-label queries are exact.
   Shipped with authoring-time label validation (identifier-shaped
   names; bare 'cut' reserved; `cut.<name>` the explicit opt-in — the
   `.` delimiter chosen over `:` to keep `:` free for future
   pseudo-selectors). post41/02 is now a real mountain/valley template.
   Original: **Cutter labels don't propagate (by design), so seams have
   no per-stroke identity.** Mountain-vs-valley folds (different knives
   → different dash styles) are inexpressible; all seams share one
   'cut' group. (post41/02 prose caveat.)
7b. **Annotated mode skips label-name validation entirely** (Item F
   review finding, 2026-08-25). compileAnnotated ignores `as` labels by
   documented design and has never validated them; Item F's new rules
   (identifier charset, reserved bare 'cut') widen the divergence:
   `h 10 as segment('cut')` errors under compile() but compiles
   silently under --annotated / the playground debug panel. Same class
   as Item C's parity fixes. Fast-follow candidate: validate label
   names in annotated's PathCommand path even though labels stay
   otherwise ignored there.
8. **RESOLVED (Item G, 2026-08-25): query pseudo-selectors.**
   `:atomic` (renamed from :each on 2026-08-26 user review — decomposes compound runs per drawing command) (the general unmerged
   escape hatch — a labeled circle() hands back its arcs); `:first` /
   `:last` / `:nth(k)` (0-indexed) select runs from a group. One
   pseudo per query; segment queries only; composes with the cut
   namespace after umbrella merging. Cashes the ':' space Item F's
   validation reserved. Previously: PARTIALLY DELIVERED (via Item F)
   for the cut case —
   sub-label queries are exact, so differently-named knives' adjacent
   seams come back one edge at a time (`segmentAll('cut.k0')`) while
   the umbrella stays merged — post41/06's V-run `subPath` surgery is
   gone. Still open for authored same-label runs outside the cut
   namespace. Original: **Run-merging has no unmerged escape hatch.**
   Adjacent same-label edges merge into one run; getting individual
   edges back requires `subPath` surgery at guessed fractions
   (post41/06 walks V-run halves). A `segmentAll('cut', {merge: false})`
   or per-command iteration would help advanced decoration.
9. **RESOLVED (Item J, 2026-08-26) as a parser-class fix.** Styling
   was already dynamic (report: exprs/ternaries/fn calls in style
   values, define-in-loop, template routing); the real bug was SIX
   AST-builder sites flattening postfix expressions at sibling level:
   layer(...) apply targets, for-range bounds (`0..arr.length` —
   the everyday headline), the text-body range twin,
   PathLayer/TextLayer definition names, the constructor-expression
   form, and define ViewBox args. One helper swap
   (buildExpressionWithPostfix) + two cursor-discipline traps (RangeOp
   rest; `.apply` swallow in the paren-less form). If-chains deleted
   from post40, post42/05 (array-of-layers showcase), and post44/03.
   Original: **Per-piece dynamic styling requires N fixed layers +
   if-chains.** Round-robin tinting (post40 shattered-glyph, post42/05)
   hand-rolls `if (i % 3 == 0) shard0.apply {...}` ×3 because layer
   styles are static and layers can't be created/styled per iteration
   with computed fills.
10. **RESOLVED (Item C, 2026-08-24).** Annotated-only bug (main
    evaluator was always correct): evaluateTextBlockExpression routed
    if/for statements through a walker with no elements accumulator.
    Fixed with a recursive text-block walker mirroring the main
    evaluator. Note: post41/04's counts design was never a workaround
    for a real main-evaluator bug and stays (reviewers rated it the
    example's best beat). Original: text-if inside loop bodies
    discards output — annotated mode only.
11. **RESOLVED (Item A, 2026-08-24).** Headline was wrong — no direction
    flip existed (see opportunities/A-offset-miter-joins/summary-v2.md).
    Real defects: miter spikes baked into curve arg frames at sharp
    corners, non-curvature-aware curve offsetting, and a broken closure
    join. Fixed by the offsetCommands rewrite: per-segment normals,
    bevel/miter/round joins between segments (never inside them),
    adaptive Tiller–Hanson parallel curves, `offset(d, {join})` option.
    Garment post caveat replaced with the first "What this project
    taught the language" section. Original entry preserved below.
    ~~BUG: `offset()` flips direction on curved edges of cut pieces.~~
    Offsetting the yoke piece of the post43 bodice (cut by a curved
    knife) sends the neck-curve segment INWARD while the straight edges
    go outward — a self-crossing "allowance". Reversing first shrinks
    the whole ring instead. The uncut bodice offsets cleanly, so the
    trigger is the cut piece's canonicalized winding + strongly bowed
    curve segments. Repro preserved at
    project-docs/cutting-room/repro-offset-direction-bug.pathogen
    (bb should grow by ~14 in both axes; height shrinks instead).
    Post 3's pattern sheet restricts allowance to the body panel and
    states the caveat in prose. Deserves a proper fix in
    offsetCommands' per-command normal orientation.
12. **RESOLVED-BY-BYPASS (Item B, 2026-08-24) + B2 QUEUED.** draw() makes the footgun unreachable for in-place drawing; drawTo contract documented in docs/path-blocks.md; truthful "first inked point" startPoint (the backlogged 2026-08-01 audit) queued as item B2. Original: **FOOTGUN: `startPoint` on a projected PIECE is the frame origin,
    not the visible start.** For seam sub-runs from `segmentAll`,
    `x.drawTo(x.startPoint...)` draws in place; for a WHOLE projected
    cut piece (whose block frame origin is (0,0) but whose first
    command starts at its subject-local offset), the same expression
    silently drops the offset and draws the piece ~its-local-offset
    away from every query answered on it (caught by content review on
    post43/03+05: annotations 63 units off their pattern piece).
    `p.get(0)` and `p.startPoint` differ exactly on such pieces. Fix
    candidates: define ProjectedPath.drawTo to anchor the frame (not
    the first command) consistently, or provide the in-place `draw()`
    from entry #1, which would eliminate the anchor question entirely.
    Same family as entry #1; raises its priority.
13. **RESOLVED (Item K, 2026-08-26): documented.** Ternary operator now in the syntax operators table with its own section (value/string/interpolation/style-value forms, all compile-verified) plus the if-reassignment alternative; interpolation and style-value docs cross-updated; garment post closing entry. Original: **Confirmed working, worth documenting: string ternaries inside
    `${}` interpolation** (`${cond ? 'a' : 'b'}`) and string
    reassignment inside if-blocks — both used for piece
    self-identification (post43/02, post43/05). Neither appears in
    docs examples today.
14. **`log()` silently becomes the logarithm for bare numeric call
    expressions.** `log(sqrt(9))` evaluates to ln(3) = 1.0986 and emits
    NO log entry — the logging statement and the math function collide,
    and which one you get depends on the argument's shape. Found while
    writing Item A's tests (2026-08-24). Workaround: bind to a variable
    first (`let d2 = calc(...); log(d2);`). Deserves disambiguation or
    at minimum a documented rule.
15. **FEATURE REQUEST (user, 2026-08-24): ctx as a declared PathBlock
    block argument + in-block label querying.** `@{|ctx| ...}` de-magics
    the block context via the existing lambda-param convention;
    `ctx.origin` exposes the relative delta home (destructurable) and
    `ctx.origin.return()` emits `m dx dy` — relative purity preserved by
    design, explicitly preferred over absolute `M 0 0`; and
    `ctx.query.point('name')` answers labels authored earlier in the
    SAME block (block-local coords) for self-referential geometry. Full
    sketch + interaction spec notes preserved at
    opportunities/L-ctx-block-argument/intent.md. Deferred as
    fast-follow Item L; supersedes the block-local-absolute-M half of
    item H.
16. **RESOLVED (Item C, 2026-08-24).** Annotated stdlib calls now track
    PathSegment commands into the live path context (parity with
    index.ts) — @{ circle(...) } blocks carry their geometry, boolean
    ops on them work. Original: **stdlib-call blocks are empty in
    --annotated mode.** `let a = @{ circle(0, 0, 30); }; a.drawTo(50, 50);` emits
    just `M 50 50` under compileAnnotated — the block captures no
    commands from statement-function calls (circle/rect/polygon/…),
    while the main evaluator captures them fine. Found writing Item B's
    annotated multi-contour parity test (2026-08-24). Same family as
    #10 (annotated text-if drop): annotated block evaluation diverges
    from main. Fold into Item C's annotated-divergence sweep.
17. **RESOLVED (with Item K, 2026-08-26): both walkers' [ ] interiors are postfix-aware** — calc(arr[o.n]), arr[pick()], arr[idx[0]], and pts[o.n].x chains all work; 6 pinning tests incl. the ']'-rest cursor discipline. Original (Item J review finding; pre-existing, orthogonal to the six J sites). Both postfix walkers build `[...]` contents with plain
   buildExpression, so `calc(arr[o.n])` fails with "Array index must
   be a number". Same fix pattern; separate ticket since it lives
   INSIDE the walkers rather than at their call sites. Also noted from
   the same review: buildForEachLoop solves sibling-spanning postfix
   differently (source-slice + re-parse) — a design worth considering
   if more sibling-scan sites appear.
18. **Ternary interiors fail inside path-command calc() at parse time**
   (K/#17 review finding, 2026-08-26; pre-existing).
   `L calc(arr[flag ? 2 : 0]) 0` errors "Missing ';'" — the PathArgs
   external tokenizer doesn't consume `?`/`:` in path-argument
   position, so the calc() never closes. Works fine in let-statement
   position (the docs' shown forms). Fix would live in
   path-args-tokenizer.ts's greedy consumption set.
