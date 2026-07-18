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
| F8a | `>`-in-quoted-attr tag truncation | `SVGDocumentFragment("<use title='a>b' href='javascript:alert(1)'/>")` | Sanitizer error: quote-aware tokenizer still validates the href (regex `<[^>]*>` truncated at the inner `>` and skipped it). |
| F8b | Event-handler name split by whitespace | `SVGDocumentFragment("<rect on\nclick='alert(1)'/>")` | Sanitizer error: structural attribute-name read rejects the `on`-prefixed name (`\bon\w+=` missed the split). |
| F8c | Inert-construct smuggling | `SVGDocumentFragment("<!-- <script>x</script> --><rect/>")`, CDATA, DOCTYPE, PIs, stray `<` | Sanitizer error: comments/CDATA/DOCTYPE/PI/stray-`<` rejected outright (regex silently skipped them). |
| F8d | `</defs>`-in-attribute mis-split | `SVGDocumentFragment("<defs><rect data-x='</defs>'/></defs><circle r='5'/>")` | defs separated by tokenizer byte ranges (regex `<defs…>[\s\S]*?</defs>` closed at the first literal `</defs>`). |
| F8e | `>`-in-`<defs>`-attribute inner-carve | `SVGDocumentFragment("<defs id='x><image onerror=... />'><rect/></defs>")` | Inner content bounded by quote-aware positions; smuggled `<image>` stays inert quoted text, only real child `<rect/>` extracted. |
| F8f | Namespace-prefixed href aliasing | `SVGDocumentFragment("<image xmlns:x='http://www.w3.org/1999/xlink' x:href='javascript:alert(1)'/>")` | Sanitizer error: every `*:href` local name is validated, not just the literal `xlink:href`. |
| F8g | Namespace-prefixed element aliasing | `SVGDocumentFragment("<svg:script xmlns:svg='http://www.w3.org/2000/svg'>alert(1)</svg:script>")` | Sanitizer error: any element name containing `:` is rejected (a bare-name block list would miss the namespace-equivalent alias). |
| F9a | HTML breakout via non-SVG element | `SVGDocumentFragment("<meta http-equiv='refresh' content='0;url=https://evil/'/>")` | Sanitizer error: element allow-list rejects any name not in the safe set (`<meta>`/`<div>`/`<img>`/`<math>` etc.). HTML5 foreign-content breakout would otherwise pop `<meta>` into a live page-navigation when the SVG is embedded via innerHTML. |
| F9b | Presentation-attr remote url() (SSRF/tracking) | `SVGDocumentFragment("<rect fill='url(https://evil/track.svg#x)' width='10' height='10'/>")` | Sanitizer error: `fill`/`stroke`/`mask`/`filter`/`clip-path`/`marker*` url() must be a local fragment (`url(#name)`); remote/data url() rejected. |
| F9c | `<use>` data:image/svg+xml clone-a-script | `SVGDocumentFragment("<use href='data:image/svg+xml;base64,…<script>…'/>")` | Sanitizer error: the `data:image` href allow-list is scoped to `<image>`/`<feImage>` (image mode); `<use>` (document-clone) is restricted to local fragment refs. |
| F9d | Unquoted attribute value | `SVGDocumentFragment("<rect data-x=foo<foreignObject/> width='1'/>")` | Sanitizer error: unquoted attribute values are rejected (not valid XML; the tokenizer's tag-boundary model would otherwise diverge from a real parser and swallow the embedded tag). |
| P1 | Long transition restyling | Through C1: malicious CSS with `transform: ... transition: all 9999s` — depends on C1 being closed. | Indirect: prevented because C1 cannot inject CSS. |

## Notes on coverage

- **C1–C7** test the compiler emission path (Phase 1).
- **C8–C10** test identifier validation across def-id and layer-name surfaces (Phase 1).
- **F1–F7** test the fragment sanitizer (Phase 2).
- **F8a–F8g** test the cursor-tokenizer rewrite of the sanitizer (regex-audit Phase 2): markup-by-regex parsing bypasses (attribute truncation, split handler names, inert-construct smuggling, defs mis-splitting) and namespace-prefix href/element aliasing.
- **F9a–F9d** test the allow-list conversion + presentation-attribute url() validation (regex-audit Phase 2 follow-up): the sanitizer moved from a deny-list to the documented allow-list, added url() validation on presentation attributes, scoped the data:image href allow-list to image-mode elements, and rejects unquoted attribute values.
- **P1** is indirect: it depends on C1's CSS injection vector being closed.

When adding a new vector, add a row here and a corresponding test case in `tests/security/`.
