# Part 4 (broken-lines-stencils) — Agentic Review Synthesis

4-persona review, 2026-09-01. Condensed; ranked as delivered.

## Must fix (all applied)
- M1 ladder collapse: Example 2 introduced six mechanisms at once. → Split
  into 2a (new sample 02-dash-the-ring: pieces as colored centerlines, no
  cutting) and 2b (the cut); dimension/leader annotations added to 02
  (bandWidth, bridgeWidth, centerline) in the dead side canvas.
- M2 silent mechanism switch from Part 1's startAt() to stroke-dashoffset,
  never named in prose. → Property named + one-clause bridge back to
  startAt().
- M3 phase-shift explanation causally inverted. → Rewritten intent
  (bridge placement) → consequence (seam mid-cut) → repair (dash-seam).
- M4 Example 3 credited stroke-linejoin for corners that actually come
  from offsetting an already-curved centerline (concentric radii 16/36);
  linejoin is inert on the tangent-continuous roundRect. → Prose + caption
  corrected; linejoin kept and called out as inert-here honestly.
- M5 "three lines" overclaim. → "three steps" + code block extended with
  the outline/difference punchline.
- M6 island unlabeled, fallen-piece contrast collapse, no causality. →
  Leader label "island (counter)" outside the sheet; fallen fill darkened;
  dashed ghost at origin + motion arrow in the right panel.

## Should improve (applied)
- S1 decorative boundingBox in 04 → replaced with honest sheet-corner
  arithmetic; post prose updated to match.
- S2 "counter" glossed at first use (with island).
- S3 "seam" glossed inline.
- S4 placement claim: stroke-dashoffset named as the placement knob.
- S5 filter written uniformly (sugar form) across 02/03/04.
- S6 gotchas added: cutLength ≤ 0 → negative-dasharray error; user units
  + material bridge-width floor.
- S7 laser cut-vs-reference layers sentence added.
- S9 Where-to-go expanded (docs + parts 2-3).
- C1 mylar named in prose; C2 intent comments on the -cutLength/2 shift;
  C6 ghost centerline contrast raised.

## Deferred (recorded, not applied)
- S8 GroupLayer-transform refactor of sample 01/04 layout (craft debt,
  reader-invisible; validate clean).
- C3 union-then-difference batching note; C4 playground-open CTA
  (series-level); C5 optical margin nits.
