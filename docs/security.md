# Security & SVG Sanitization

Pathogen produces SVG that is meant to be safe to embed inline in a host page or serve as `image/svg+xml` from a top-level navigation, even when the source `.pathogen` was authored by an untrusted party. This page documents the contract — what the compiler will accept, what it will reject, and what guarantees the output gives downstream consumers.

The contract exists because SVG renderers have a long history of being used to exfiltrate data, restyle host pages, and execute scripts. The article [*On Scratch SVG Sanitization*](https://muffin.ink/blog/scratch-svg-sanitization/) catalogs eleven classes of attacks against the Scratch project's SVG pipeline, several of which apply to any system that emits user-influenced SVG. Pathogen's contract closes those attack classes at the producer.

## Compiler contract

> **Compiled SVG output is safe to embed inline OR serve as `image/svg+xml` from arbitrary `.pathogen` source.**

This means the SVG that comes out of `compile() → buildSvgTree() → toSvgString()` is guaranteed to contain:

- No `<script>`, `<iframe>`, `<foreignObject>`, `<a>`, `<animate>`, `<animateTransform>`, `<animateMotion>`, `<set>`, `<discard>`, `<handler>`, or `<listener>` elements.
- No `on*` event-handler attributes on any element.
- No `href` or `xlink:href` attribute pointing anywhere except a local fragment (`#name`) or a `data:image/...` URI. No `http:`, `https:`, `javascript:`, `data:text/html`, or protocol-relative URLs.
- No CSS `url(...)`, `image-set(...)`, `image(...)`, `src(...)`, `var(...)`, `calc(...)`, `expression(...)`, `attr(...)`, `@import`, or CSS escape sequences (`\xx`) in any style value.
- No CSS comments inside style values.
- Identifiers (layer names, mask/clipPath/gradient/pattern/marker IDs, `CSSVar()` names) restricted to the CSS-ident grammar: `--?[A-Za-z_][A-Za-z0-9_-]*`.

Anything that would violate this contract is rejected at evaluate-time with a Pathogen error citing the source line and column.

## What's allowed in `style { … }` blocks

Pathogen uses a strict allow-list for style values. Allowed value forms are:

- **Numbers**, with optional unit: `px`, `em`, `rem`, `%`, `deg`, `rad`, `turn`, `s`, `ms`. Example: `stroke-width: 2`, `font-size: 1.25rem`, `transform: rotate(45deg)`.
- **CSS hex colors**: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`. Example: `fill: "#e63946"`.
- **CSS keyword identifiers** (matching `[A-Za-z_][A-Za-z0-9_-]*`): `none`, `currentColor`, `bold`, `inherit`, `initial`, etc.
- **CSS color functions** from a fixed allow-list: `oklch(...)`, `oklab(...)`, `lch(...)`, `lab(...)`, `rgb(...)`, `rgba(...)`, `hsl(...)`, `hsla(...)`, `color(...)`. Example: `fill: oklch(0.7 0.15 240)`.
- **Local fragment refs** (`#ident`) on properties that take URLs: `mask`, `clip-path`, `filter`, `fill`, `stroke`. Example: `mask: "#myMask"`.
- **Quoted strings** on string-typed properties: `font-family`, `content`. Example: `font-family: "Inter, sans-serif"`.
- **Pathogen `CSSVar()` values** (auto-converted to `var(...)` during emission). Use this instead of writing `var()` literally — see below.

What's **rejected**:

```pathogen
# Rejected: url() with any argument
define PathLayer('a') ${ background-image: "url(https://evil.example/log)"; }

# Rejected: var() — use CSSVar() instead
define PathLayer('a') ${ fill: "var(--brand)"; }

# Rejected: calc() in style values
define PathLayer('a') ${ stroke-width: "calc(2px + 1em)"; }

# Rejected: image-set, image, src, expression, attr
define PathLayer('a') ${ background-image: "image-set('foo.png' 1x)"; }

# Rejected: CSS escape sequences
define PathLayer('a') ${ fill: "\\75\\72\\6c(...)"; }

# Rejected: CSS comments in values
define PathLayer('a') ${ fill: "/* comment */ red"; }
```

If your design needs CSS variables, use Pathogen's `CSSVar()` constructor — see the [CSSVar docs](cssvar.md). The compiler will emit a properly-formed `var(--name, fallback)` reference for you.

## What's allowed as identifiers

`CSSVar()` names, layer names, and the `id` argument to `Mask()`, `ClipPath()`, `Pattern()`, `Marker()`, `LinearGradient()`, `RadialGradient()`, `ConicGradient()`, `MeshGradient()`, `FreeformGradient()`, and `TopoGradient()` must match the CSS-ident grammar:

- `CSSVar()` names: `--?[A-Za-z_][A-Za-z0-9_-]*` and must start with `--`. Example: `--primary`, `--brand-color`.
- Other identifiers: `[A-Za-z_][A-Za-z0-9_-]*`. Example: `myMask`, `gradient_1`.

Spaces, punctuation, quotes, braces, semicolons, and CSS escape sequences are rejected. The restriction exists because identifiers reach the SVG `id` attribute, the CSS `@property` rule, and various URL-fragment refs — anywhere a parser-mismatch could let an attacker break out into a different syntactic context.

## What `SVGDocumentFragment()` rejects

`SVGDocumentFragment("...")` accepts a literal string of SVG markup and inserts it into the compiled output. Because the string is user-supplied, it is run through a sanitizer that rejects:

- **All elements except** an explicit allow-list: `defs`, `g`, `symbol`, `use`, `path`, `circle`, `ellipse`, `line`, `polygon`, `polyline`, `rect`, `image`, `text`, `tspan`, `linearGradient`, `radialGradient`, `pattern`, `mask`, `clipPath`, `marker`, `stop`, `filter`, and the SVG filter primitives (`feBlend`, `feColorMatrix`, `feGaussianBlur`, `feMerge`, `feMergeNode`, … the full `fe*` family). Anything not on this list — including HTML/MathML containers such as `<div>`, `<meta>`, `<img>`, `<math>` — is rejected. (This is an allow-list: unknown elements fail closed, so a novel breakout element cannot slip through.)
- All `on*` event-handler attributes (including any namespace-prefixed `*:on…` alias).
- Inline `style="..."` attributes (and `*:style` aliases) and `<style>` blocks. Use a Pathogen `style { … }` block on the surrounding layer instead — that goes through the value allow-list above.
- `href` / `xlink:href` (and any namespace-prefixed `*:href`) attributes whose value is not a local fragment (`#name`). A `data:image/(png|jpeg|gif|webp|svg+xml);base64,...` URI is additionally allowed **only** on `<image>` / `<feImage>` (rendered in image mode); on `<use>` and every other element the value must be a local fragment.
- Presentation attributes that take a `url(...)` value — `fill`, `stroke`, `mask`, `clip-path`, `filter`, `marker`, `marker-start`, `marker-mid`, `marker-end` — whose `url(...)` is not a local fragment (`url(#name)`). A remote or `data:` `url()` is rejected (outbound-fetch / tracking vector).
- Unquoted attribute values (not valid XML, and a tokenizer/parser mismatch surface).
- XML comments, CDATA sections, DOCTYPE declarations, and processing instructions.

A malformed fragment, a blocked element, or a forbidden attribute throws a Pathogen evaluator error with line/column information.

## Playground & blog rendering

When the playground or the static blog renders compiled SVG, it does so inside a sandboxed iframe with a strict Content-Security-Policy (`default-src 'none'; style-src 'unsafe-inline' data:; img-src data:; connect-src 'none'`). This is defense in depth: even if the compiler produced unsafe content (it won't), the iframe sandbox prevents the SVG from affecting the host page or making outbound requests.

The VS Code preview surface uses the same CSP via the webview's `cspSource`.

If you embed `dist/index.global.js` in your own page and feed it user-supplied `.pathogen` source, you inherit the compiler contract automatically — the SVG produced is safe to embed inline. We still recommend you mount it inside your own iframe + CSP for layered defense.

## Reporting a vulnerability

If you find a way to violate the compiler contract above (CSS injection, identifier escape, fragment sanitizer bypass, or any path to an outbound request from rendered SVG), please open a GitHub issue tagged `security` with a minimal reproducing `.pathogen` source. We'll acknowledge within a few days and ship a fix.
