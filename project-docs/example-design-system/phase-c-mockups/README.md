# Phase C Mockups

HTML/CSS visual-reference sketches produced by the `frontend-design` skill. Each mockup is a static HTML file (no JavaScript except native color-picker inputs) showing the design direction for a Pathogen illustration.

**These files are reference material, not shipped content.** They inform the Pathogen translations that live in `website/blog/samples/post24/`.

## Conventions

- Each mockup honors the design system from `website/guidelines/example-design-system.md`:
  - `#d0d7f0` light-lavender background
  - Helvetica Neue stack
  - Size/weight/letter-spacing ramp
  - `fg_auto` auto-contrast expression
  - Canvas width fixed at 520px
- Color pickers at the top let you set `--demo-color` and `--bg` and watch every derivation update via CSS relative color syntax — the same mechanism the compiled SVG will use.

## Files

- `methods-mockups.html` — three directions for the Color Methods example
  - `methods-grid` (520×280) — 4×2 grid of method cards, minimal/editorial
  - `methods-radial` (520×400) — radial wheel with central hub, extended-tier signature
  - `methods-stack` (520×320) — editorial single-column with display title + 8 rows

## Translation workflow

1. Open `methods-mockups.html` in a browser.
2. Confirm the visual direction for each layout matches intent.
3. Hand-author `website/blog/samples/post24/methods-{grid,radial,stack}.pathogen` using the mockup as geometric reference.
4. Preserve the mockup here for the iteration paper trail.
