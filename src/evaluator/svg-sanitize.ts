/**
 * SVG fragment sanitization — validates and separates SVG content.
 *
 * String-based validation works in worker + Node environments (no DOM
 * dependency). For the article's threat-class coverage, see
 * project-docs/security/threat-model.md and docs/security.md.
 *
 * Contract (rows F1–F7 in project-docs/security/svg-attack-fixtures.md):
 *  - Block dangerous SVG/HTML elements outright (script, foreignObject, a,
 *    animate*, set, discard, handler, listener, style, plus the existing
 *    HTML-form/iframe/object/embed list).
 *  - Reject `on*` event-handler attributes.
 *  - Reject inline `style="..."` attributes — fragment is for geometry; use
 *    Pathogen `style { … }` blocks for styling (those go through the strict
 *    CSS allow-list).
 *  - Validate every `href` / `xlink:href` against the local-fragment + data:
 *    image allow-list (see validateHrefValue in ./sanitize.ts).
 *
 * Implementation: a single-pass cursor tokenizer (not regex). Regex tag/attr
 * scanning is unsound for markup — `>` inside a quoted attribute value
 * truncates a naive `<[^>]*>` match, letting a later `href="javascript:…"`
 * escape validation, and `\bon\w+=` misses a `on\nclick=` split across
 * whitespace. The tokenizer is quote-aware and validates each attribute
 * structurally, closing both bypass classes. Comments, CDATA, DOCTYPE,
 * processing instructions, and any unterminated construct are rejected
 * outright — a geometry fragment has no legitimate use for them, and passing
 * them through (as the regex scanner did) is the smuggling surface.
 */

import { validateHrefValue } from './sanitize';

// Allow-list (not a deny-list): only these element names are permitted; every
// other name is rejected. A deny-list is unsound here — it silently admits any
// element the author didn't think to block (e.g. <meta http-equiv="refresh">,
// which HTML5 foreign-content breakout pops out of the SVG subtree into a live
// page-navigation, or MathML/HTML container elements). This mirrors the set
// published in docs/security.md plus the structural elements real fragments
// need (use, symbol) and the full filter-primitive family.
const ALLOWED_ELEMENTS = new Set([
  // Structural / shape
  'defs',
  'g',
  'symbol',
  'use',
  'path',
  'circle',
  'ellipse',
  'line',
  'polygon',
  'polyline',
  'rect',
  'image',
  'text',
  'tspan',
  // Paint servers / references
  'lineargradient',
  'radialgradient',
  'pattern',
  'mask',
  'clippath',
  'marker',
  'stop',
  'filter',
  // Filter primitives
  'feblend',
  'fecolormatrix',
  'fecomponenttransfer',
  'fecomposite',
  'feconvolvematrix',
  'fediffuselighting',
  'fedisplacementmap',
  'fedistantlight',
  'fedropshadow',
  'feflood',
  'fefunca',
  'fefuncb',
  'fefuncg',
  'fefuncr',
  'fegaussianblur',
  'feimage',
  'femerge',
  'femergenode',
  'femorphology',
  'feoffset',
  'fepointlight',
  'fespecularlighting',
  'fespotlight',
  'fetile',
  'feturbulence',
]);

// Presentation attributes that accept a `url(...)` paint-server/reference
// value. A remote or data: url() here is an outbound-fetch (SSRF/tracking)
// vector, so — like the CSS value validator's URL_VALUED_PROPERTIES — only a
// local fragment ref `url(#name)` is permitted.
const PRESENTATION_URL_ATTRS = new Set([
  'fill',
  'stroke',
  'mask',
  'clip-path',
  'filter',
  'marker',
  'marker-start',
  'marker-mid',
  'marker-end',
]);

// Elements whose `href` may be a data:image URI (rendered in image mode, no
// scripting). Every other href-bearing element (notably <use>, which clones
// referenced content into the live document) is restricted to local fragment
// refs — a data:image/svg+xml <use> target is a historical clone-a-script
// bypass class.
const DATA_IMAGE_HREF_ELEMENTS = new Set(['image', 'feimage']);
const LOCAL_FRAGMENT_HREF_RE = /^#[A-Za-z_][A-Za-z0-9_-]*$/;
// Each url(...) occurrence in a presentation attribute must be a local ref.
const URL_TOKEN_RE = /url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi;

// SVG elements that are inherently self-closing (void elements)
const SVG_VOID_ELEMENTS = new Set([
  'circle',
  'ellipse',
  'feblend',
  'fecolormatrix',
  'fecomponenttransfer',
  'fecomposite',
  'feconvolvematrix',
  'fediffuselighting',
  'fedisplacementmap',
  'fedistantlight',
  'fedropshadow',
  'feflood',
  'fefunca',
  'fefuncb',
  'fefuncg',
  'fefuncr',
  'fegaussianblur',
  'feimage',
  'femergenode',
  'femorphology',
  'feoffset',
  'fepointlight',
  'fespecularlighting',
  'fespotlight',
  'fetile',
  'feturbulence',
  'image',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
  'stop',
  'use',
]);

export interface SanitizeResult {
  defsContent: string;
  visualContent: string;
  rawContent: string;
}

interface SvgAttr {
  name: string;
  value: string;
}

interface TagToken {
  kind: 'open' | 'close';
  name: string; // lowercased
  attrs: SvgAttr[];
  selfClosing: boolean;
  start: number; // byte offset of '<' in the input
  end: number; // byte offset just past '>'
}

const isNameStart = (ch: string) => /[a-zA-Z_:]/.test(ch);
const isNameChar = (ch: string) => /[a-zA-Z0-9_:.-]/.test(ch);
const isSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';

function fail(message: string): never {
  throw new Error(`SVGDocumentFragment: ${message}`);
}

/**
 * Validate an href/xlink:href value per element. Elements rendered in image
 * mode (image, feImage) may use the data:image allow-list; every other
 * href-bearing element (notably <use>, which clones into the live document)
 * is restricted to local fragment refs.
 */
function validateElementHref(elementName: string, attrLabel: string, value: string): void {
  if (DATA_IMAGE_HREF_ELEMENTS.has(elementName)) {
    try {
      validateHrefValue(value, `<${elementName}> ${attrLabel}`);
    } catch (e) {
      fail((e as Error).message);
    }
    return;
  }
  if (!LOCAL_FRAGMENT_HREF_RE.test(value.trim())) {
    fail(`<${elementName}> ${attrLabel} must be a local fragment ref (#name), got ${JSON.stringify(value)}`);
  }
}

/**
 * Validate a presentation attribute (fill, stroke, mask, filter, …) whose
 * value may contain url(...). Every url() occurrence must be a local fragment
 * ref; a remote or data: url() is rejected. Values with no url() are left to
 * downstream CSS handling (colors etc. carry no fetch surface here).
 */
function validatePresentationUrl(elementName: string, attrLabel: string, value: string): void {
  URL_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_TOKEN_RE.exec(value)) !== null) {
    const target = m[2].trim();
    if (!LOCAL_FRAGMENT_HREF_RE.test(target)) {
      fail(
        `<${elementName}> ${attrLabel} url(...) must reference a local fragment (#name), got ${JSON.stringify(target)}`,
      );
    }
  }
}

/**
 * Tokenize element tags. Text between tags is not emitted (it carries no
 * security surface and is preserved verbatim in the raw/visual output).
 * Throws on any structural malformation — a stray `<`, an unterminated tag,
 * an unterminated attribute quote — and on comments, CDATA, DOCTYPE, and
 * processing instructions. The regex scanner silently skipped all of these,
 * which is precisely the smuggling surface this replaces.
 */
function tokenizeTags(input: string): TagToken[] {
  const tokens: TagToken[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const lt = input.indexOf('<', i);
    if (lt === -1) break;
    const start = lt;
    let j = lt + 1;

    // Reject inert/obfuscation constructs before attempting to read a tag
    // name. Rejecting (vs. stripping) keeps the surface minimal: a geometry
    // fragment never legitimately contains a comment, CDATA, DOCTYPE, or PI.
    if (input[j] === '!') {
      if (input.startsWith('<!--', start)) fail('XML comments are not allowed');
      if (input.startsWith('<![CDATA[', start)) fail('CDATA sections are not allowed');
      fail('DOCTYPE and other <!…> declarations are not allowed');
    }
    if (input[j] === '?') {
      fail('processing instructions (<?…?>) are not allowed');
    }

    const isClosing = input[j] === '/';
    if (isClosing) j++;

    if (j >= len || !isNameStart(input[j])) {
      fail(`malformed SVG — stray '<' or invalid tag name at position ${start}`);
    }
    const nameStart = j;
    while (j < len && isNameChar(input[j])) j++;
    const name = input.slice(nameStart, j).toLowerCase();

    const attrs: SvgAttr[] = [];
    let selfClosing = false;

    // Attribute loop — quote-aware, so `>` inside a value does not end the tag.
    for (;;) {
      while (j < len && isSpace(input[j])) j++;
      if (j >= len) fail(`malformed SVG — unterminated <${name}> tag`);

      const ch = input[j];
      if (ch === '>') {
        j++;
        break;
      }
      if (ch === '/') {
        // Expect `/>`
        let k = j + 1;
        while (k < len && isSpace(input[k])) k++;
        if (input[k] !== '>') fail(`malformed SVG — invalid '/' in <${name}> tag`);
        selfClosing = true;
        j = k + 1;
        break;
      }
      if (isClosing) {
        // Closing tags carry no attributes.
        fail(`malformed SVG — unexpected content in closing </${name}> tag`);
      }
      if (!isNameStart(ch)) {
        fail(`malformed SVG — invalid attribute name in <${name}> tag`);
      }

      const attrNameStart = j;
      while (j < len && isNameChar(input[j])) j++;
      const attrName = input.slice(attrNameStart, j);

      while (j < len && isSpace(input[j])) j++;
      let attrValue = '';
      if (input[j] === '=') {
        j++;
        while (j < len && isSpace(input[j])) j++;
        const q = input[j];
        if (q !== '"' && q !== "'") {
          // Require quoted attribute values. Unquoted values are not valid XML
          // and let the scanner's tag-boundary model diverge from a real
          // parser's (an unquoted value can swallow an embedded `<tag>` into
          // what it treats as text) — reject rather than rely on downstream
          // parser strictness.
          fail(`malformed SVG — attribute value for '${attrName}' in <${name}> must be quoted`);
        }
        const close = input.indexOf(q, j + 1);
        if (close === -1) fail(`malformed SVG — unterminated attribute value in <${name}> tag`);
        attrValue = input.slice(j + 1, close);
        j = close + 1;
      }
      attrs.push({ name: attrName, value: attrValue });
    }

    tokens.push({ kind: isClosing ? 'close' : 'open', name, attrs, selfClosing, start, end: j });
    i = j;
  }

  return tokens;
}

/**
 * Sanitize and validate an SVG fragment string. See the file header for the
 * contract. Throws an Error on rejection — the caller (SVGDocumentFragment
 * constructor in the evaluator) attaches line/col context.
 */
export function sanitizeSVGFragment(input: string): SanitizeResult {
  const tokens = tokenizeTags(input);

  const stack: string[] = [];
  // Track byte ranges of top-level <defs>…</defs>. All boundaries come from
  // the tokenizer's quote-aware positions: `start`/`end` bound the whole
  // block (for removal from the visual content), `innerStart`/`innerEnd`
  // bound the child content between the opening `<defs …>` and `</defs>`.
  const defsRanges: { start: number; innerStart: number; innerEnd: number; end: number }[] = [];
  let defsDepth = 0;
  let defsStart = -1;
  let defsInnerStart = -1;

  for (const tok of tokens) {
    // Reject any namespace-prefixed element name. A prefix bound to a real
    // namespace URI (e.g. `xmlns:svg="http://www.w3.org/2000/svg"` +
    // `<svg:script>`) is namespace-equivalent to the bare element in every
    // conformant consumer, so a bare-name check alone would let an aliased
    // <script>/<foreignObject>/… through. Geometry fragments have no
    // legitimate use for prefixed element names — reject outright (mirrors the
    // `*:href` attribute handling below).
    if (tok.name.includes(':')) {
      fail(`namespace-prefixed elements (<${tok.name}>) are not allowed`);
    }
    // Allow-list: anything not explicitly permitted is rejected.
    if (!ALLOWED_ELEMENTS.has(tok.name)) {
      fail(`<${tok.name}> elements are not allowed`);
    }

    if (tok.kind === 'open') {
      for (const attr of tok.attrs) {
        const lower = attr.name.toLowerCase();
        // Reject any on-prefixed attribute name. No geometry/SVG presentation
        // attribute begins with `on`, so this is safe; it also rejects the
        // bare `on` that a whitespace-split `on\nclick` decomposes into.
        if (/^on/.test(lower)) {
          fail('on* event handler attributes are not allowed');
        }
        if (lower === 'style' || lower.endsWith(':style')) {
          fail('inline style="..." attributes are not allowed — use a Pathogen style { … } block instead');
        }
        // Validate bare `href` and ANY namespace-prefixed `*:href`. A prefix
        // is just an alias for a namespace URI, so `x:href` bound to the
        // XLink namespace resolves identically to `xlink:href` in every
        // namespace-aware consumer — matching only the literal `xlink:href`
        // string would let a renamed prefix skip the allow-list. No
        // legitimate attribute other than href ends in `:href`, so
        // over-validating is safe (it fails closed).
        if (lower === 'href' || lower.endsWith(':href')) {
          validateElementHref(tok.name, lower, attr.value);
        }
        // Presentation attributes carrying url(...) must reference a local
        // fragment only — a remote/data url() is an outbound-fetch vector.
        if (PRESENTATION_URL_ATTRS.has(lower)) {
          validatePresentationUrl(tok.name, lower, attr.value);
        }
      }

      const isSelfClosing = tok.selfClosing || SVG_VOID_ELEMENTS.has(tok.name);
      if (tok.name === 'defs' && !isSelfClosing && defsDepth === 0) {
        defsStart = tok.start;
        // tok.end is the quote-aware end of the opening `<defs …>` tag — the
        // start of the child content. Never re-derived with indexOf('>'),
        // which would land inside a `>`-bearing quoted attribute value.
        defsInnerStart = tok.end;
      }
      if (tok.name === 'defs' && !isSelfClosing) {
        defsDepth++;
      }
      if (!isSelfClosing) {
        stack.push(tok.name);
      }
    } else {
      // Closing tag.
      if (stack.length === 0 || stack[stack.length - 1] !== tok.name) {
        const expected = stack.length > 0 ? stack[stack.length - 1] : 'none';
        fail(`malformed SVG — closing </${tok.name}> but expected </${expected}>`);
      }
      stack.pop();
      if (tok.name === 'defs') {
        defsDepth--;
        if (defsDepth === 0 && defsStart !== -1) {
          // tok.start is the position of the matching `</defs>` — the end of
          // the child content.
          defsRanges.push({ start: defsStart, innerStart: defsInnerStart, innerEnd: tok.start, end: tok.end });
          defsStart = -1;
          defsInnerStart = -1;
        }
      }
    }
  }

  if (stack.length > 0) {
    fail(`malformed SVG — unclosed <${stack[stack.length - 1]}>`);
  }

  // Slice defs blocks out of the input by the recorded ranges (range-based,
  // so a `</defs>` inside an attribute value can never mis-split the content).
  const defsInners: string[] = [];
  let visual = '';
  let cursor = 0;
  for (const range of defsRanges) {
    visual += input.slice(cursor, range.start);
    // Inner content is bounded by the tokenizer's quote-aware positions — no
    // wrapper-stripping heuristic that a crafted attribute could subvert.
    defsInners.push(input.slice(range.innerStart, range.innerEnd).trim());
    cursor = range.end;
  }
  visual += input.slice(cursor);

  return {
    defsContent: defsInners.join('\n'),
    visualContent: visual.trim(),
    rawContent: input.trim(),
  };
}
