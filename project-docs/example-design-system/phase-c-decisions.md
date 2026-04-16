# Phase C — Per-Example Winner Decisions

Running log of user selections for the reactive-color-svg post restyle. Each example generated 3 direction alternatives; the winner is the one that will replace the inline `<reactive-svg>` block in Phase D.

## Example 1 — Color Methods

**Winner: `methods-radial.pathogen`** (520×400)

- Radial wheel with central base-color hub, 8 slim 30° sectors around it, dashed fg_auto reference ring, labels beyond the outer frame. Hub carries "OKLCH / MANIPULATION" in auto-contrasting ink against the base.
- Extended-tier signature (variant-b3 lozenge DNA) — fits a blog post whose central subject is the OKLCH color system.

Losing alternatives retained:
- `methods-grid.pathogen` (520×280) — minimal editorial 4×2 card grid
- `methods-stack.pathogen` (520×320) — editorial column with display title + 8 rows

Both remain in `website/blog/samples/post24/` as the paper trail.

## Example 2 — Harmonies & Palettes

**Winner: `harmonies-wheel.pathogen`** (520×560)

- 12-sector static hue wheel with harmony-chord overlays (analogous arc, triadic triangle, tetradic square, split-comp Y). Harmony vertices carry live base-derived chips. Central "OKLCH / HARMONY" hub. Two palette strips (lightness / interpolate) stacked below.
- Extended-tier signature — continues the variant-b3 DNA and reads as a continuation of the hero masthead.

Losing alternatives retained:
- `harmonies-matrix.pathogen` (520×540) — strict 6-row matrix, core tokens
- `harmonies-blueprint.pathogen` (520×520) — engineering spec sheet, 2×3 panel grid, extended

## Example 3 — Theme Demo

**Winner: `theme-combined.pathogen`** (520×640) — user-requested merge of two of the three directions.

- **Top half (y 0..290): THEME SYSTEM.** Geometric composition showing how the four CSS vars relate spatially. Central lightened-primary 5-point star, desaturated-secondary orbiting circles on a dashed `fg_auto` L=0.55 reference ring, raw-`--accent` linking arcs (4 quadratic curves), raw-`--accent` halo disc behind the star, raw-`--accent` tick marks at the ring diagonals, hue-shifted-accent corner diamonds in 3 corners, and a legend card bottom-right of this half.
- **Seam (y 290): hairline `fg_hair` divider** with "SYSTEM" label left-above and "STAGE" label right-below, acting as chapter break.
- **Bottom half (y 300..640): THEME STAGE.** Faint backdrop plate with three actor cards (primary/secondary/accent) in a triptych, each carrying role label + `--var-name` + descriptive text with auto-contrasting ink. Two low-opacity spotlight discs (primary-lighter + accent-shifted derived) float over the backdrop. Bottom-left masthead with eyebrow + "Color Theme" display title; bottom-right credits in tracked mono.

Accent promoted from peripheral corner-only role to central geometric role — now drives the arcs, halo, and ticks in addition to the hue-shifted diamonds.

Losing alternatives (only HTML mockups exist; no Pathogen files authored):
- `theme-living` — compact geometric illustration alone
- `theme-dashboard` — 3-panel inspection layout
- `theme-stage` — triptych alone

HTML mockups for all alternatives preserved in `project-docs/example-design-system/phase-c-mockups/theme-mockups.html` and `theme-combined-mockup.html`.

## Example 4 — Dual-Panel (light/dark)

**Winner: `lightdark-conic.pathogen`** (520×520) — bold direction iterated through mockups.

- Conic gradient with origin at (−260, 260) — 50% of canvas width to the LEFT of the canvas, so the gradient fans across the visible canvas
- Uses Pathogen's native `ConicGradient` primitive with 4 stops (plateau/transition/plateau shape): `0→bg_light, 0.4→bg_light, 0.55→bg_dark, 1→bg_dark`
- Sweep range `from=-50deg to=50deg` (100° total), `innerRadius=30`, `innerFill='transparent'`, `spread='transparent'`, `interpolation='oklch'`
- Seven thick `radialWedge` chips with `chip_span=.08pi` (~14.4° half-span) and `corner_r=20` deeply rounded corners
- Chip radii 280/350/420/490/560/630/700/755 (thickness 55, gap 15) — chips fan from left to right across canvas
- Each chip spans both the light plateau, transition, and dark plateau portions of the visible gradient
- Method labels at chip midradii along the horizon line, filled with auto-contrasting ink against each chip's color
- Display "Light" top-left (poster-weight), "Dark" bottom-right

Losing alternative mockups retained:
- `lightdark-mockups.html` — first set (split/ramp/matrix), called "boring"
- `lightdark-mockups-bold.html` — second set (spotlight/horizon/typograph)
- `lightdark-conic-mockup.html` — early conic iteration before mini-workspace preview

Design-system signature: first sample to use the `ConicGradient` primitive in the `example-design-system` token language — good candidate to reference from `example-design-system.md` as an "extended composition" pattern.
