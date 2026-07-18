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

const BLOCKED_ELEMENTS = new Set([
  // HTML/script-bearing
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'textarea',
  'button',
  'select',
  'option',
  // Article F1: foreignObject is the historical XSS vector
  'foreignobject',
  // Article F2: <a> can carry javascript: hrefs; Pathogen has no link semantics
  'a',
  // Article F3: animation elements can mutate href to javascript:
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
  'discard',
  'handler',
  'listener',
  // Article F6: <style> bypasses the Pathogen style allow-list
  'style',
]);

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
        if (q === '"' || q === "'") {
          const close = input.indexOf(q, j + 1);
          if (close === -1) fail(`malformed SVG — unterminated attribute value in <${name}> tag`);
          attrValue = input.slice(j + 1, close);
          j = close + 1;
        } else {
          // Unquoted value: run until whitespace or tag end.
          const valStart = j;
          while (j < len && !isSpace(input[j]) && input[j] !== '>' && input[j] !== '/') j++;
          if (j === valStart) fail(`malformed SVG — empty attribute value in <${name}> tag`);
          attrValue = input.slice(valStart, j);
        }
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
  // Track byte ranges of top-level <defs>…</defs> in the input.
  const defsRanges: { start: number; end: number }[] = [];
  let defsDepth = 0;
  let defsStart = -1;

  for (const tok of tokens) {
    if (BLOCKED_ELEMENTS.has(tok.name)) {
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
        if (lower === 'style') {
          fail('inline style="..." attributes are not allowed — use a Pathogen style { … } block instead');
        }
        if (lower === 'href' || lower === 'xlink:href') {
          try {
            validateHrefValue(attr.value, `<${tok.name}> ${lower}`);
          } catch (e) {
            fail((e as Error).message);
          }
        }
      }

      const isSelfClosing = tok.selfClosing || SVG_VOID_ELEMENTS.has(tok.name);
      if (tok.name === 'defs' && !isSelfClosing && defsDepth === 0) {
        defsStart = tok.start;
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
          defsRanges.push({ start: defsStart, end: tok.end });
          defsStart = -1;
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
    const block = input.slice(range.start, range.end);
    // Strip the outer <defs …> and </defs> wrapper to keep inner content.
    const openEnd = block.indexOf('>');
    const closeStart = block.lastIndexOf('</');
    defsInners.push(block.slice(openEnd + 1, closeStart).trim());
    cursor = range.end;
  }
  visual += input.slice(cursor);

  return {
    defsContent: defsInners.join('\n'),
    visualContent: visual.trim(),
    rawContent: input.trim(),
  };
}
