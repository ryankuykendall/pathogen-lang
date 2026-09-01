// Print palette for syntax-highlighted code in exports.
//
// The export legend's card is always white, so exported code always
// uses the LIGHT theme's `--code-*` values from styles/theme.css —
// regardless of the app theme the user is running. The hexes are
// inlined here (rather than read from CSS custom properties at
// runtime) because exported fills must be literal attribute values:
// CSS vars don't survive SVG serialization, <img> rasterization,
// svg2pdf, or PDF text outlining.
//
// Drift guard: tests/code-print-palette.test.ts parses theme.css and
// fails if these constants diverge from the light-theme source values.
//
// Keys match the classes emitted by highlightPathogenTokens()
// (src/highlight.ts): kw num str id fn tp op cm pr.

export const CODE_PRINT_COLORS: Record<string, string> = {
  kw: '#6d3aa6',
  pr: '#3d6b9e',
  fn: '#a83d80',
  num: '#d97a6e',
  str: '#5a8a72',
  cm: '#9087a0',
  op: '#6b5a7a',
  tp: '#b65a2a',
  id: '#1c1722',
};

// Fill for unclassified tokens and the base <text> element when
// highlighting is on (light --text-primary).
export const CODE_PRINT_DEFAULT = '#1c1722';
