/**
 * SVG fragment sanitization — validates and separates SVG content.
 * String-based validation works in worker + Node environments (no DOM dependency).
 */

const BLOCKED_ELEMENTS = new Set([
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
]);

const EVENT_ATTR_RE = /\bon\w+\s*=/i;
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\s*[^>]*?\/?>/g;
const SELF_CLOSING_RE = /\/\s*>$/;

// SVG elements that are inherently self-closing (void elements)
const SVG_VOID_ELEMENTS = new Set([
  'animate',
  'animatemotion',
  'animatetransform',
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
  'set',
  'stop',
  'use',
]);

export interface SanitizeResult {
  defsContent: string;
  visualContent: string;
  rawContent: string;
}

/**
 * Sanitize and validate an SVG fragment string.
 * - Rejects blocked elements (script, iframe, etc.)
 * - Rejects on* event handler attributes
 * - Validates well-formedness via stack-based tag matching
 * - Separates <defs> content from visual content
 */
export function sanitizeSVGFragment(input: string): SanitizeResult {
  // Quick-reject dangerous content
  if (/<script[\s>]/i.test(input)) {
    throw new Error('SVGDocumentFragment: <script> elements are not allowed');
  }
  if (EVENT_ATTR_RE.test(input)) {
    throw new Error('SVGDocumentFragment: on* event handler attributes are not allowed');
  }

  // Validate well-formedness and check for blocked elements
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;

  while ((match = TAG_RE.exec(input)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith('</');
    const isSelfClosing = SELF_CLOSING_RE.test(fullTag) || SVG_VOID_ELEMENTS.has(tagName);

    if (BLOCKED_ELEMENTS.has(tagName)) {
      throw new Error(`SVGDocumentFragment: <${tagName}> elements are not allowed`);
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
