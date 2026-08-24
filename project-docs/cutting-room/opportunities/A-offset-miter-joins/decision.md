# Item A — decision (2026-08-24)

User approved **all three options** from summary-v2:

1. **Joins-only structural fix** — join vectors never baked into curve
   arg frames; segments offset with their own start/end normals; bevel
   (`l`) connectors inserted where consecutive offset segments no longer
   meet; true miter kept only for line-line corners with miter length
   ≤ 2×distance (keeps rectangular offsets byte-stable).
2. **Curvature-aware curve offsetting** — cubics/quadratics subdivided
   and re-fit as true parallel curves (sampled normal displacement)
   instead of endpoint/control-point translation.
3. **`offset(distance, {join: 'round'})`** — opt-in arc connectors at
   joins (round join), as an options argument on offset for PathBlock
   and ProjectedPath receivers. Default stays bevel/miter per (1).

Also decided in the same review (applies series-wide, effective now):
**published samples use descriptive variable names** — no single-letter
or cryptic identifiers in blog/docs code beyond loop indices (i, j, k),
coordinate members (.x/.y), and the documented parametric fraction `t`.
Doubly important because ten single letters (m l h v c s q t a z) shadow
path commands in path-argument position (the log #4 trap). Codified in
website/guidelines/code-example-guidelines.md; Cutting Room samples
swept before Item A's implementation so later diffs stay clean.
