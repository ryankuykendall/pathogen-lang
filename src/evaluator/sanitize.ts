/**
 * Central SVG/CSS sanitization helpers — one home, one allow-list.
 *
 * The article *On Scratch SVG Sanitization* (https://muffin.ink/blog/scratch-svg-sanitization/)
 * documents how repeated rounds of "scrub-and-allow" lost to CSS escapes,
 * comments, image-set, var() indirection, and css-tree parser mismatches.
 * These helpers take the opposite approach: a strict allow-list of value
 * shapes that have NO escape hatches into URL-fetching, script-execution, or
 * host-document restyling.
 *
 * - `validateCSSIdent`     — CSS-ident grammar for any user-controlled string
 *                            that becomes an SVG `id`, a `@property` name, or
 *                            a fragment ref. Rejects whitespace, quotes,
 *                            braces, semicolons, and CSS escape sequences.
 * - `validateCSSValue`     — Strict allow-list for style-block property
 *                            values. NO `url()`, `var()`, `calc()`, `image-set()`,
 *                            `image()`, `src()`, `expression()`, `attr()`,
 *                            CSS escapes, or comments. Local fragment refs
 *                            (`url(#name)`) are accepted via the property-aware
 *                            URL allow-list. Pathogen `CSSVar()` and `Color()`
 *                            outputs are passed through unchanged because they
 *                            are produced by the compiler, not by the user.
 *
 * Errors thrown here are caught by the evaluator's `formatError` and surfaced
 * with line/column context.
 */

import { matchFunctionNotation, splitTopLevel } from '../css-value-utils';

// ── Identifier grammar ────────────────────────────────────────────────────

const CSS_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const CSS_CUSTOM_PROPERTY_RE = /^--[A-Za-z_][A-Za-z0-9_-]*$/;

export type IdentKind =
  | 'css-var'        // CSSVar() name — must start with --
  | 'layer-name'
  | 'mask-id'
  | 'clippath-id'
  | 'pattern-id'
  | 'marker-id'
  | 'gradient-id'
  | 'gradient-href'  // local-only fragment ref (no `#` prefix in stored form)
  | 'fragment-ref';  // generic local-only fragment ref

/**
 * Validate a user-controlled identifier that will be emitted into SVG `id`,
 * CSS `@property`, or a `#fragment` ref. Throws an Error (caller adds line/col).
 */
export function validateCSSIdent(name: unknown, kind: IdentKind): string {
  if (typeof name !== 'string') {
    throw new Error(`${describeKind(kind)} must be a string, got ${typeof name}`);
  }
  if (name.length === 0) {
    throw new Error(`${describeKind(kind)} must not be empty`);
  }
  if (kind === 'css-var') {
    if (!CSS_CUSTOM_PROPERTY_RE.test(name)) {
      throw new Error(
        `${describeKind(kind)} must match \`--[A-Za-z_][A-Za-z0-9_-]*\` (got ${JSON.stringify(name)})`,
      );
    }
    return name;
  }
  if (!CSS_IDENT_RE.test(name)) {
    throw new Error(
      `${describeKind(kind)} must match \`[A-Za-z_][A-Za-z0-9_-]*\` (got ${JSON.stringify(name)})`,
    );
  }
  return name;
}

function describeKind(kind: IdentKind): string {
  switch (kind) {
    case 'css-var': return 'CSSVar() name';
    case 'layer-name': return 'Layer name';
    case 'mask-id': return 'Mask() id';
    case 'clippath-id': return 'ClipPath() id';
    case 'pattern-id': return 'Pattern() id';
    case 'marker-id': return 'Marker() id';
    case 'gradient-id': return 'Gradient id';
    case 'gradient-href': return 'Gradient inherit() href';
    case 'fragment-ref': return 'Fragment ref';
  }
}

// ── @property syntax allow-list ───────────────────────────────────────────

const PROPERTY_SYNTAX_ALLOW = new Set([
  '<color>', '<length>', '<number>', '<percentage>', '<integer>',
  '<angle>', '<time>', '<resolution>', '<image>', '<url>',
  '<length-percentage>', '<custom-ident>', '<transform-function>',
  '<transform-list>', '*',
]);

export function validatePropertySyntax(syntax: unknown): string {
  if (typeof syntax !== 'string') {
    throw new Error(`@property syntax must be a string, got ${typeof syntax}`);
  }
  // Allow either bare `<token>` or syntax with `|` alternation
  for (const part of syntax.split('|').map((s) => s.trim())) {
    if (!PROPERTY_SYNTAX_ALLOW.has(part)) {
      throw new Error(
        `@property syntax must be one of ${[...PROPERTY_SYNTAX_ALLOW].join(', ')} (got ${JSON.stringify(syntax)})`,
      );
    }
  }
  return syntax;
}

// ── CSS value allow-list ──────────────────────────────────────────────────

/**
 * Forbidden tokens — checked early to give clear error messages. The
 * allow-list pass below is the real backstop.
 */
const FORBIDDEN_TOKENS: Array<[RegExp, string]> = [
  [/\bjavascript:/i, 'javascript: URI'],
  [/@import\b/i, '@import directive'],
  [/\bexpression\s*\(/i, 'CSS expression()'],
  [/\battr\s*\(/i, 'attr()'],
  [/\bimage-set\s*\(/i, 'image-set()'],
  [/\bsrc\s*\(/i, 'CSS src()'],
  [/\bbehavior\s*:/i, 'IE CSS behavior'],
  [/\\[0-9a-fA-F]/, 'CSS escape sequence (\\xx)'],
  [/<!--|-->/, 'HTML/CSS comment delimiter'],
  [/\/\*|\*\//, 'CSS comment'],
  [/[<>]/, 'angle bracket'],
];

/**
 * URL value rule for properties that take URLs as values. We allow only:
 * - Local fragment refs: `url(#ident)` or `url("#ident")` or `url('#ident')`
 * - Compiler-internal data URLs: `url("data:image/...")` (rasterised gradients)
 *
 * No other URL forms — http(s), protocol-relative, javascript, data:text/html.
 */
const URL_LOCAL_FRAGMENT_RE = /^url\(\s*['"]?#[A-Za-z_][A-Za-z0-9_-]*['"]?\s*\)$/;
const URL_DATA_IMAGE_RE = /^url\(\s*['"]?data:image\/[a-z+]+(;[a-z0-9-]+=[^,)\s'"]+)*(;base64)?,[^)]*['"]?\s*\)$/i;

/** Properties that legitimately take URL values (local fragment refs only). */
const URL_VALUED_PROPERTIES = new Set([
  'fill', 'stroke', 'mask', 'clip-path', 'filter',
  'marker', 'marker-start', 'marker-mid', 'marker-end',
]);

/**
 * Token-level allow-list. After we strip leading/trailing whitespace and
 * optional quotes, the value must match one of these forms.
 */
const ALLOWED_VALUE_FORMS: RegExp[] = [
  // Number with optional unit
  /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px|em|rem|%|deg|rad|turn|s|ms|pt|pc|in|cm|mm|vw|vh|vmin|vmax|fr|ch|ex)?$/i,
  // CSS hex color
  /^#[0-9a-fA-F]{3,8}$/,
  // CSS keyword identifier (single token)
  /^[A-Za-z_][A-Za-z0-9_-]*$/,
];

/**
 * CSS function-name allow-list, grouped by role. The groups are exported so
 * other layers (e.g. language-services completion data) derive from this
 * single source instead of hand-maintaining parallel lists.
 */
export const CSS_COLOR_FUNCTION_NAMES = [
  'oklch', 'oklab', 'lch', 'lab', 'rgb', 'rgba', 'hsl', 'hsla',
  'hwb', 'color', 'color-mix', 'light-dark',
] as const;

export const CSS_TRANSFORM_FUNCTION_NAMES = [
  'translate', 'translatex', 'translatey', 'translatez', 'translate3d',
  'rotate', 'rotatex', 'rotatey', 'rotatez', 'rotate3d',
  'scale', 'scalex', 'scaley', 'scalez', 'scale3d',
  'skew', 'skewx', 'skewy',
  'matrix', 'matrix3d',
  'perspective',
] as const;

export const CSS_FILTER_FUNCTION_NAMES = [
  'blur', 'brightness', 'contrast', 'drop-shadow', 'grayscale',
  'hue-rotate', 'invert', 'opacity', 'saturate', 'sepia',
] as const;

export const CSS_SHAPE_FUNCTION_NAMES = [
  'inset', 'circle', 'ellipse', 'polygon', 'path',
] as const;

export const CSS_TIMING_FUNCTION_NAMES = [
  'cubic-bezier', 'steps',
] as const;

/**
 * CSS color/transform functions that are safe (no URL fetching, no host-doc
 * restyling, no script). Everything else (url, var, calc, image-set, image,
 * src, expression, attr) is rejected.
 */
const ALLOWED_FUNCTION_NAMES = new Set<string>([
  ...CSS_COLOR_FUNCTION_NAMES,
  ...CSS_TRANSFORM_FUNCTION_NAMES,
  ...CSS_FILTER_FUNCTION_NAMES,
  ...CSS_SHAPE_FUNCTION_NAMES,
  ...CSS_TIMING_FUNCTION_NAMES,
]);

/**
 * Functions whose CSS grammar is space-separated — a top-level comma inside
 * their arguments is invalid CSS that browsers silently drop. Pathogen call
 * syntax uses commas everywhere else, so this is a natural mistake; fail
 * loudly with a fix-it message instead of emitting a dead declaration.
 */
const COMMA_FORBIDDEN_FUNCTIONS = new Set<string>(CSS_FILTER_FUNCTION_NAMES);

/**
 * String-typed properties — accept a quoted string verbatim (after rejecting
 * forbidden tokens).
 */
const STRING_VALUED_PROPERTIES = new Set([
  'font-family', 'content',
]);

/**
 * Validate a style-block property value against the strict allow-list.
 *
 * User-supplied string values are subject to the full shape-and-token
 * allow-list. Compiler-emitted strings (from CSSVarValue, ColorValue,
 * GradientValue, …) bypass validation entirely — they were already validated
 * at construction time and the validator cannot distinguish them from
 * user-supplied strings of the same shape (e.g. `var(--evil)` vs.
 * `var(--brand, #e63946)`). Pass them through with no check.
 *
 * Throws a plain Error on rejection; the caller adds line/col context.
 */
export function validateCSSValue(
  rawValue: unknown,
  propertyName: string,
  options: { allowVar?: boolean } = {},
): string {
  if (typeof rawValue !== 'string') {
    throw new Error(
      `Style value for "${propertyName}" must be a string, got ${typeof rawValue}`,
    );
  }
  const value = rawValue.trim();
  if (value.length === 0) {
    throw new Error(`Style value for "${propertyName}" must not be empty`);
  }

  // Compiler-produced url(#ident) — emitted from gradient/mask/clip refs and
  // also written verbatim by users via `mask: "#myMask"`-style values. Either
  // way, the local-fragment shape is safe.
  if (URL_VALUED_PROPERTIES.has(propertyName) && URL_LOCAL_FRAGMENT_RE.test(value)) {
    return value;
  }

  // Reject any property containing a forbidden token outright. This catches
  // url(http...), @import, image-set, calc, var (when not allowed), expression,
  // attr, escapes, comments, angle brackets — the whole article-listed attack
  // surface. The `allowVar` option is set when the caller has already confirmed
  // any var(...) refs in the value were produced by the compiler from a
  // pre-validated CSSVar (e.g. tryResolveCSSFunctionArgs result).
  rejectForbiddenTokens(value, propertyName, options);

  // Quoted string (font-family, content)
  if (STRING_VALUED_PROPERTIES.has(propertyName)) {
    if (isQuotedString(value)) {
      return value;
    }
    // fall through — bare keywords like `serif` also acceptable
  }

  // Filter chains are space-separated in CSS (`blur(2px) brightness(1.2)`);
  // a comma between chained functions is invalid CSS the browser drops.
  if (propertyName === 'filter' && hasTopLevelComma(value)) {
    throw new Error(
      `filter chains are space-separated: blur(2px) brightness(1.2) — remove the commas`,
    );
  }

  // Multi-token values (e.g. "1px solid red", "1px 2px 3px") — split and
  // validate each token. Functional notation is treated as one token via
  // a balanced-paren split.
  const tokens = splitTopLevel(value);
  for (const token of tokens) {
    if (!isAllowedToken(token, propertyName, options)) {
      throw new Error(
        `Style value for "${propertyName}" contains a disallowed token (${JSON.stringify(token)} in ${JSON.stringify(rawValue)}). ` +
        `Allowed: numbers with units, hex colors, keywords, color/transform functions, and Pathogen CSSVar()/gradient refs. ` +
        `See docs/security.md for the full allow-list.`,
      );
    }
  }
  return value;
}

function rejectForbiddenTokens(value: string, propertyName: string, options: { allowVar?: boolean } = {}): void {
  for (const [re, label] of FORBIDDEN_TOKENS) {
    if (re.test(value)) {
      throw new Error(
        `Style value for "${propertyName}" contains forbidden ${label}: ${JSON.stringify(value)}. ` +
        `See docs/security.md for the allow-list.`,
      );
    }
  }
  // Any url() that isn't a compiler-emitted local fragment is rejected.
  if (/\burl\s*\(/i.test(value)) {
    throw new Error(
      `Style value for "${propertyName}" contains url(): only local fragment refs (url(#id)) are allowed, ` +
      `and they must be produced by referencing a Pathogen Mask/ClipPath/Gradient/Pattern/Marker rather than written literally.`,
    );
  }
  // var() is rejected by default — direct users to CSSVar(). When
  // `options.allowVar` is set (post-resolve path from tryResolveCSSFunctionArgs),
  // we accept well-formed var(--ident) / var(--ident, fallback) shapes but
  // still reject malformed ones.
  if (/\bvar\s*\(/i.test(value)) {
    if (!options.allowVar) {
      throw new Error(
        `Style value for "${propertyName}" contains a raw var(): use the Pathogen CSSVar() constructor instead.`,
      );
    }
    // When `allowVar` is set, the var() refs came from tryResolveCSSFunctionArgs
    // substituting validated CSSVarValue objects. Their varNames were already
    // checked by validateCSSIdent at CSSVar() construction and their fallbacks
    // by validateCSSValue. We therefore accept any shape; the alternative
    // (re-parsing var() balanced-paren content with our own regex) is the
    // exact "roll-our-own CSS parser" trap the article warns against.
  }
  // calc() rejected
  if (/\bcalc\s*\(/i.test(value)) {
    throw new Error(
      `Style value for "${propertyName}" contains calc(): use Pathogen calc{} expressions to compute values, not CSS calc().`,
    );
  }
  // image() rejected
  if (/\bimage\s*\(/i.test(value)) {
    throw new Error(
      `Style value for "${propertyName}" contains CSS image(): not allowed.`,
    );
  }
}

/**
 * True when the string contains a comma outside any parens/brackets/quotes.
 * Used to distinguish `drop-shadow(4px, 4px, ...)` (invalid, top-level commas
 * in the arg string) from `drop-shadow(4px 4px rgba(0, 0, 0, .5))` (valid,
 * commas nested one paren level down).
 */
function hasTopLevelComma(value: string): boolean {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') {
      if (depth > 0) depth--;
    } else if (ch === ',' && depth === 0) return true;
  }
  return false;
}

function isCompilerEmittedVar(value: string): boolean {
  // var(--ident) or var(--ident, anything-without-var)
  const m = value.match(/^var\(\s*(--[A-Za-z_][A-Za-z0-9_-]*)\s*(?:,\s*([^)]*))?\)$/);
  return m !== null;
}

function extractVarFallback(value: string): string | null {
  const m = value.match(/^var\(\s*--[A-Za-z_][A-Za-z0-9_-]*\s*(?:,\s*([^)]*))?\)$/);
  if (!m) return null;
  return m[1] ?? null;
}

function isQuotedString(value: string): boolean {
  return (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  );
}

function isAllowedToken(
  token: string,
  propertyName: string,
  options: { allowVar?: boolean } = {},
): boolean {
  const trimmed = token.trim();
  if (trimmed.length === 0) return true;

  // Allow var() refs when the caller has marked the value as compiler-resolved.
  // Match any var(--ident, …) shape — the fallback may contain nested function
  // calls like rgba(...). We accept these because the source CSSVarValue was
  // validated at construction; re-validating the inner content here would
  // require a real CSS parser.
  if (options.allowVar && /^var\s*\(\s*--[A-Za-z_][A-Za-z0-9_-]*\s*(?:,[\s\S]*)?\)\s*$/.test(trimmed)) {
    return true;
  }

  // Functional notation
  const fnMatch = matchFunctionNotation(trimmed);
  if (fnMatch && /^[A-Za-z]/.test(fnMatch.name)) {
    const fnName = fnMatch.name.toLowerCase();
    if (!ALLOWED_FUNCTION_NAMES.has(fnName)) {
      return false;
    }
    // Space-separated CSS functions reject top-level commas loudly — the
    // browser would silently drop the whole declaration otherwise.
    if (COMMA_FORBIDDEN_FUNCTIONS.has(fnName) && hasTopLevelComma(fnMatch.args)) {
      if (fnName === 'drop-shadow') {
        throw new Error(
          `drop-shadow() uses space-separated CSS syntax: drop-shadow(4px 4px 4px color) — remove the commas`,
        );
      }
      throw new Error(
        `${fnName}() takes a single value — commas are not allowed`,
      );
    }
    // Recursively validate args of allowed functions.
    const inner = fnMatch.args;
    // Reject nested forbidden tokens (defense in depth) — propagate allowVar.
    try {
      rejectForbiddenTokens(inner, propertyName, options);
    } catch {
      return false;
    }
    // Walk the inner tokens and require each to be allowed.
    const innerTokens = splitTopLevel(inner);
    return innerTokens.every((t) => isAllowedToken(t, propertyName, options));
  }

  // Quoted string allowed for string-typed properties
  if (STRING_VALUED_PROPERTIES.has(propertyName) && isQuotedString(trimmed)) {
    return true;
  }

  // Comma-separated list (e.g. font-family fallbacks)
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
    return parts.every((p) => isAllowedToken(p, propertyName, options));
  }

  // Slash-separated list (e.g. `1px/1.5` line-height shorthand) — same rule.
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/').map((p) => p.trim()).filter((p) => p.length > 0);
    return parts.every((p) => isAllowedToken(p, propertyName, options));
  }

  // Atomic token: number, hex, ident
  for (const re of ALLOWED_VALUE_FORMS) {
    if (re.test(trimmed)) return true;
  }
  return false;
}

// ── URL/href allow-list (used by fragment sanitizer in Phase 2) ───────────

const SAFE_DATA_IMAGE_RE = /^data:image\/(png|jpeg|gif|webp|svg\+xml);(?:[a-z0-9-]+=[^,)\s'"]+;)*base64,[A-Za-z0-9+/=]+$/i;
const LOCAL_FRAGMENT_RE = /^#[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * Validate a value used as `href`/`xlink:href` on SVG fragment elements.
 * Allows only local fragment refs and `data:image/...;base64,...` URIs.
 */
export function validateHrefValue(value: string, contextLabel = 'href'): void {
  const v = value.trim();
  if (LOCAL_FRAGMENT_RE.test(v)) return;
  if (SAFE_DATA_IMAGE_RE.test(v)) return;
  throw new Error(
    `${contextLabel} must be a local fragment ref (#name) or data:image/... URI, got ${JSON.stringify(value)}`,
  );
}

// ── Internal exports for tests ────────────────────────────────────────────

export const __test__ = {
  CSS_IDENT_RE,
  CSS_CUSTOM_PROPERTY_RE,
  URL_LOCAL_FRAGMENT_RE,
  URL_DATA_IMAGE_RE,
  ALLOWED_FUNCTION_NAMES,
  isCompilerEmittedVar,
};
