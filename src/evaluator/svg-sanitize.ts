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

const EVENT_ATTR_RE = /\bon\w+\s*=/i;
const STYLE_ATTR_RE = /\bstyle\s*=/i;
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\s*([^>]*?)\/?>/g;
const SELF_CLOSING_RE = /\/\s*>$/;

// Attribute extraction inside a tag — matches `name="value"`, `name='value'`,
// or `name=value`. xml:foo / xlink:foo names allowed.
const ATTR_RE = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/g;

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

/**
 * Sanitize and validate an SVG fragment string. See the file header for the
 * contract. Throws an Error on rejection — the caller (SVGDocumentFragment
 * constructor in the evaluator) attaches line/col context.
 */
export function sanitizeSVGFragment(input: string): SanitizeResult {
  // Quick-reject inline event handlers and inline style="..." everywhere.
  if (EVENT_ATTR_RE.test(input)) {
    throw new Error('SVGDocumentFragment: on* event handler attributes are not allowed');
  }
  if (STYLE_ATTR_RE.test(input)) {
    throw new Error(
      'SVGDocumentFragment: inline style="..." attributes are not allowed — use a Pathogen style { … } block instead',
    );
  }

  // Validate well-formedness, check for blocked elements, and validate
  // href/xlink:href on every element.
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;

  while ((match = TAG_RE.exec(input)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const attrsBlock = match[2] ?? '';
    const isClosing = fullTag.startsWith('</');
    const isSelfClosing = SELF_CLOSING_RE.test(fullTag) || SVG_VOID_ELEMENTS.has(tagName);

    if (BLOCKED_ELEMENTS.has(tagName)) {
      throw new Error(`SVGDocumentFragment: <${tagName}> elements are not allowed`);
    }

    if (!isClosing) {
      // Walk attributes on opening tags. Reject href/xlink:href that don't
      // match the local-fragment / data:image allow-list.
      ATTR_RE.lastIndex = 0;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = ATTR_RE.exec(attrsBlock)) !== null) {
        const attrName = attrMatch[1].toLowerCase();
        const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
        if (attrName === 'href' || attrName === 'xlink:href') {
          try {
            validateHrefValue(attrValue, `<${tagName}> ${attrName}`);
          } catch (e) {
            throw new Error(`SVGDocumentFragment: ${(e as Error).message}`);
          }
        }
      }
    }

    if (isClosing) {
      if (stack.length === 0 || stack[stack.length - 1] !== tagName) {
        const expected = stack.length > 0 ? stack[stack.length - 1] : 'none';
        throw new Error(`SVGDocumentFragment: malformed SVG — closing </${tagName}> but expected </${expected}>`);
      }
      stack.pop();
    } else if (!isSelfClosing) {
      stack.push(tagName);
    }
  }

  if (stack.length > 0) {
    throw new Error(`SVGDocumentFragment: malformed SVG — unclosed <${stack[stack.length - 1]}>`);
  }

  // Separate <defs>...</defs> from visual content
  const defsRe = /<defs[\s>][\s\S]*?<\/defs>/gi;
  const defsMatches: string[] = [];
  let defsMatch: RegExpExecArray | null;
  defsRe.lastIndex = 0;
  while ((defsMatch = defsRe.exec(input)) !== null) {
    defsMatches.push(defsMatch[0]);
  }

  const visualContent = input.replace(defsRe, '').trim();
  const defsContent = defsMatches
    .map((d) => {
      // Extract inner content of <defs>...</defs>
      const inner = d.replace(/^<defs[^>]*>/, '').replace(/<\/defs>$/, '');
      return inner.trim();
    })
    .join('\n');

  return {
    defsContent,
    visualContent,
    rawContent: input.trim(),
  };
}
