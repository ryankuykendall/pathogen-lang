# Feature / improvement opportunities surfaced while building The Cutting Room

Running log, kept as samples are authored (2026-08-23 onward). Each entry
notes the friction hit in a real sample. To be synthesized at project end.

1. **RESOLVED (Item B, 2026-08-24).** ProjectedPath.draw() shipped — the idiom is one line; see opportunities/B-projected-draw/. Original: **ProjectedPath had no in-place `draw()`.** Stroking a projected seam
   where it lies requires `let s0 = seam.get(0); seam.drawTo(s0.x, s0.y);`
   — a two-line incantation used in every single sample. A `draw()` that
   emits at the path's own absolute coordinates would make the core
   seam-decoration idiom one obvious line. (post41/01 onward.)
2. **Shared seams double-draw.** Every interior cut line exists twice —
   once per adjacent piece — so naive seam decoration strokes it twice,
   and opposite-direction dashes visibly fill each other's gaps. Samples
   dedupe with ad-hoc ownership rules (midpoint-vs-center compare). A
   group-level `pieces.seams()` (each physical seam once) would remove a
   whole class of bookkeeping. (post41/02, post41/06.)
3. **`normal(t)` has no material-side orientation.** Tabs must point away
   from the piece; deciding requires the dot-product-against-centroid
   flip dance. Cut seams KNOW their material side (winding
   canonicalization puts material on the left) — an `outwardNormal(t)` on
   seam runs, or a documented orientation guarantee, would delete the
   trickiest lines in the tab samples. (post41/03, post41/06.)
4. **Member expressions need `calc()` in path args.** `M a.x a.y` is a
   parse error; `M calc(a.x) calc(a.y)` works. Allowing bare member
   access in path-argument position would match user expectation.
   (post41/03.)
5. **`pi` is not a bare identifier in calc.** `0.25pi` literals exist but
   inside `calc()` one must call `PI()`. Surprising asymmetry.
   (post41/03.)
6. **RESOLVED (Item H, 2026-08-24): `cut()` accepts an array of cutters** — knives compose and can be loop-built; the remaining in-block re-orientation need is Item L (ctx block argument, user design). Original: **Multi-stroke knife authoring is relative-move arithmetic.** Chaining
   strokes with `m` deltas between stroke endpoints caused two authoring
   bugs in one session (post41/06 hex knives, post42/03 grid knives).
   Absolute `M` support inside path blocks, or a way to combine several
   blocks into one cutter (`PathBlock.merge(...)` / array-of-knives
   `cut([k1, k2, k3])`), would make knives compositional.
7. **Cutter labels don't propagate (by design), so seams have no
   per-stroke identity.** Mountain-vs-valley folds (different knives →
   different dash styles) are inexpressible; all seams share one 'cut'
   group. An opt-in (e.g. cutter edges labeled `as segment('fold-a')`
   propagating as `cut:fold-a`, or `cut(knife, {seamLabel: 'valley'})`)
   would unlock real papercraft templates. (post41/02 prose caveat.)
8. **Run-merging has no unmerged escape hatch.** Adjacent same-label
   edges merge into one run; getting individual edges back requires
   `subPath` surgery at guessed fractions (post41/06 walks V-run halves).
   A `segmentAll('cut', {merge: false})` or per-command iteration would
   help advanced decoration.
9. **Per-piece dynamic styling requires N fixed layers + if-chains.**
   Round-robin tinting (post40 shattered-glyph, post42/05) hand-rolls
   `if (i % 3 == 0) shard0.apply {...}` ×3 because layer styles are
   static and layers can't be created/styled per iteration with computed
   fills. Dynamic style values (interpolation in style blocks) or an
   `apply { ... } with style` override would collapse this.
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
13. **Confirmed working, worth documenting: string ternaries inside
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
