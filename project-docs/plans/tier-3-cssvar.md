# Tier 3: CSSVar() Integration

## Status: Future

## Context
Allow Pathogen to emit SVGs with `var()` references for parameterization at the consumption site.

## Dependencies
- None (independent of Tier 1, but composes with it)

## API Surface
- `CSSVar('--primary', '#e63946')` constructor
- Outputs `var(--primary, #e63946)` in style attributes
- Composable with Color type and CSS-function output

## Verification
- [ ] var() references render correctly in SVG
- [ ] Fallback values work
- [ ] Composable with Tier 1 and Tier 1b
