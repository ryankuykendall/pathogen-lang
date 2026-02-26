# Tier 2: Palette & Gradient Utilities

## Status: Future

## Context
Palette generation and color harmony functions built on the Color type.

## Dependencies
- Tier 1 (Color type) — required

## API Surface
- `Color.palette(base, steps)` — lightness ramp
- `c.analogous(angle)` — ±angle° hue shift → array of 3
- `c.triadic()` — 120° hue shifts → array of 3
- `c.tetradic()` — 90° hue shifts → array of 4
- `c.splitComplementary(angle)` — complement ± angle°
- `Color.gradient(c1, c2, steps)` — interpolated color array

## Verification
- [ ] Palette functions return correct number of colors
- [ ] Colors are perceptually uniform
- [ ] Works with all constructor input formats
