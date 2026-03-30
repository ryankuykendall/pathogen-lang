# Radial Bar Chart Project: Reflections

## Project Scope

Multi-day effort producing a blog post tutorial, 8 interactive code samples, and 7 language features — inspired by Patrick Wojda's Observable BoardGameGeek category visualization.

## What Worked Well

### Feature-driven development
Every language feature (`radialWedge`, `radialProject`, `VerticalAnchor`, ternary expressions, stdlib helpers) emerged from a concrete problem encountered while building the chart. This produced features that are genuinely useful rather than speculative, and the blog post tells their origin story naturally.

### Iterative visual refinement
Side-by-side comparison with the Observable original, followed by specific positional feedback ("move x 4 units, y -1"), was effective for converging on the right visual. The user's domain expertise in data visualization design guided dozens of micro-adjustments that collectively elevated the output quality.

### Diagnostic matrix methodology
Building a parameter grid of `radialWedge` shapes with XOR diffs to validate corner geometry was rigorous and caught real issues (inverted sweep flags, tangent misalignment). This also produced a compelling blog section about testing methodology.

### PNG preview self-evaluation
Using `validate-samples.ts` to generate PNG previews and reading them back for self-assessment was a turning point. This closed the feedback loop for visual work and should be standard practice going forward.

## What Should Be Done Differently

### Work out geometry on paper before coding
The `radialWedge()` function went through 6+ rewrites — each time guessing at sweep flags and tangent directions. Tracing the path direction, identifying fillet center positions, and deriving sweep flags from first principles before writing code would have reduced this to 1-2 iterations. Each failed attempt required a screenshot-describe-rebuild cycle.

### Use PNG previews from the very start
For the first several days, SVGs and BBWPs were generated without visual inspection. Visual problems were only caught when the user reviewed. The `validate-samples.ts` PNG preview capability should be the first tool used after any visual change, not a late addition.

### Recognize measurement limitations early
The text highlight positioning (background rectangles behind inline text) consumed significant time across 8+ approaches. The fundamental limitation — compile-time font measurement cannot match render-time font metrics — should have been flagged after the second failed attempt, documented, and moved past. Instead, multiple scale-factor and font-loading approaches were tried before accepting the approximation.

### Establish design rules before creating schematics
The label-to-geometry association rules (leader lines, proximity, anchor points) were codified late in the process. Without them, labels were placed at arbitrary positions, leading to multiple feedback rounds on the same fundamental issues. These rules should exist before the first schematic is created.

### Use GroupLayers as the default, not an afterthought
Multiple samples were created with flat layer structure, then restructured after feedback. Semantic GroupLayers (title, diagram, code, notes) should be the first thing established for any code example — it's in the guidelines now but needs to be internalized as a default practice.

### Agree on layout before coding complex visuals
The complete chart changed canvas from 900×900 to 1000×750, moved the center multiple times, and repositioned all chrome elements. A rough wireframe agreement (canvas size, center position, what goes where) before writing Pathogen code would have prevented this rework.

### Batch positional feedback with coordinate handles
Late-stage tweaks ("move x 4, y -1", "reduce width by 5%", "reduce by 3% more") could have been batched if exact pixel coordinates or relative commands were used. The user's suggestion about relative commands for the subtitle highlights was the right insight — dimensional handles rather than percentage guesses.

### Commit to the right abstraction level early
Time was spent on the PathBlock + `.fillet()` approach for wedges before concluding it needed a native stdlib function. Analyzing the fillet limitation (arc-line transitions) before writing the PathBlock version would have saved the intermediate approach entirely.

## Rules and Patterns Established

These emerged from the project and are now codified for future use:

1. **Label-to-geometry association rules** — Added to `website/guidelines/code-example-guidelines.md` §10. Leader lines required for non-adjacent labels, consistent offset direction, clear anchor points, no ambiguous labels.

2. **GroupLayer-first composition** — Separate title, diagram, code, and notes into distinct GroupLayers. Check for inter-group intersections.

3. **Semicircle convention** — Use right-half semicircles for reference circles when the left side is empty. Frees significant layout space.

4. **Per-category grouping** — In data-driven visualizations, each data item should be its own GroupLayer containing all associated elements (bar, label, badge). Enables interactive toggling.

5. **Visual self-evaluation workflow** — After any visual change: compile → `validate-samples.ts` → read PNG preview → assess against guidelines → iterate or proceed.

## Documented Bugs for Future Work

1. **XOR arc tangent bug** (`project-docs/radial-bar-chart/xor-arc-tangent-bug.md`) — Missing arc case in `tangentAtEnd()`/`tangentAtStart()` in boolean-ops.ts causes diagonal artifacts in XOR operations with arc-heavy paths.

2. **Text highlight measurement** (`project-docs/radial-bar-chart/text-highlight-measurement-bug.md`) — Compile-time font measurement cannot match render-time font metrics. Proposed solutions: font embedding in SVG output, runtime JavaScript measurement, or a `highlight()` TextBlock API.

## Language Features Delivered

| Feature | Motivation |
|---------|-----------|
| `radialWedge()` | Native annular sector with graceful corner degradation — PathBlock + fillet was insufficient |
| `.radialProject()` | Eliminated 6+ TextLayers and manual hemisphere branching for radial labels |
| `VerticalAnchor` | Font midline alignment for rotated text — manual y-offsets were fragile and font-size-dependent |
| Ternary expressions | Conditional values without verbose if/else blocks |
| `polarX()`/`polarY()` | Reduced repetitive cos/sin boilerplate in radial layouts |
| `normalizeAngle()` | Eliminated awkward modulo workarounds for hemisphere detection |
| Fillet arc-line support | Extended `.fillet()` to handle the arc↔line transitions in mixed PathBlocks |
| Per-element text styles | `radialProject` needed per-element `text-anchor` to render correctly |
