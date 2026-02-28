# Tier 1b: CSS-Function Output Mode

## Status: Future

## Context
Add a render-time output mode where `c.lighten(0.2)` compiles to `oklch(from #e63946 calc(l + 0.2) c h)` instead of resolving at compile time. The browser resolves the color at render time.

## Dependencies
- Tier 1 (Color type) — required
- Tier 3 (CSSVar) — NOT required (composes nicely but independent)

## API Surface
- `.toCSS()` method or output mode flag
- Methods return CSS-function strings instead of concrete values
- Works with native CSS color functions

## Verification
- [ ] CSS-function output valid in modern browsers
- [ ] Composable with var() references (Tier 3)
