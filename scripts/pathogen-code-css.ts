// CSS for the token classes emitted by highlightPathogen (src/highlight.ts):
// kw num str id fn tp op cm pr. Fenced ```pathogen blocks in blog/docs pages
// are highlighted with the REAL Lezer parser (never hljs-as-javascript, which
// split dashed style properties like `stroke-width` into two tokens), so the
// github hljs themes those pages inline don't know these classes — this
// snippet rides along wherever a github theme is inlined.
//
// Colors are drawn from the same github palettes so pathogen fences sit
// visually beside js/bash fences. Property names use the github green that
// hljs gives attributes — uniformly, dashed or not.

export const pathogenCodeCssDark = `
/* pathogen fence tokens (highlightPathogen classes) */
.hljs .kw { color: #ff7b72; }
.hljs .pr { color: #7ee787; }
.hljs .fn { color: #d2a8ff; }
.hljs .tp { color: #ffa657; }
.hljs .num { color: #79c0ff; }
.hljs .str { color: #a5d6ff; }
.hljs .cm { color: #8b949e; font-style: italic; }
.hljs .op { color: #ff7b72; }
`;

export const pathogenCodeCssLight = `
/* pathogen fence tokens (highlightPathogen classes) */
.hljs .kw { color: #cf222e; }
.hljs .pr { color: #116329; }
.hljs .fn { color: #8250df; }
.hljs .tp { color: #953800; }
.hljs .num { color: #0550ae; }
.hljs .str { color: #0a3069; }
.hljs .cm { color: #6e7781; font-style: italic; }
.hljs .op { color: #cf222e; }
`;
