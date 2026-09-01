/**
 * Shared CSS-value string utilities used by the parser and both evaluators.
 * Replaces three ad-hoc `fn(args)` regexes (non-nesting `[^)]*` / greedy `(.+)`
 * captures that mishandle nested parens) and two byte-identical top-level
 * splitters with one balanced, paren-aware implementation.
 */

/**
 * Split a CSS value on top-level whitespace (whitespace at paren depth 0).
 * `rgb(1 2 3) blue` → `['rgb(1 2 3)', 'blue']`. Consecutive whitespace is
 * collapsed; leading/trailing whitespace produces no empty tokens.
 */
export function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(c)) {
      if (buf.length > 0) {
        out.push(buf);
        buf = '';
      }
      continue;
    }
    buf += c;
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

// A leading function name: CSS idents plus a possible leading `-` and the
// method names used in `Color.oklch(...)`-style tokens. Name validation (e.g.
// an allow-list) is the caller's responsibility.
const FN_NAME_RE = /^[A-Za-z0-9_-]+/;

/**
 * Find interpolation spans in a raw style value and replace each with its
 * evaluated text. Two span kinds:
 *   - backtick templates — passed to `evalTemplate` verbatim (the span
 *     includes its backticks, so it parses as a template-literal expression)
 *   - bare `${...}` interpolations — wrapped in backticks and passed to the
 *     SAME callback, so both forms share one evaluation path
 * Returns the spliced string, or null when the value contains no complete
 * span. Scanning mirrors parseStyleDeclarations in the AST builder:
 * single/double quotes hide both span kinds, and inside a span `${ }`
 * nesting and backslash escapes are tracked so the closer is found
 * correctly. `evalTemplate` may throw; the error propagates to the caller.
 */
export function spliceTemplateFragments(
  raw: string,
  evalTemplate: (templateSource: string) => string,
): string | null {
  let out = '';
  let i = 0;
  let found = false;
  let quote = '';
  while (i < raw.length) {
    const ch = raw[i];
    if (quote) {
      out += ch;
      if (ch === quote) quote = '';
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '`') {
      const start = i;
      i++;
      let interpDepth = 0;
      let innerQuote = '';
      let closed = false;
      while (i < raw.length) {
        const c = raw[i];
        if (innerQuote) {
          if (c === innerQuote) innerQuote = '';
          i++;
          continue;
        }
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (interpDepth === 0) {
          if (c === '`') {
            i++;
            closed = true;
            break;
          }
          if (c === '$' && raw[i + 1] === '{') {
            interpDepth = 1;
            i += 2;
            continue;
          }
          i++;
          continue;
        }
        if (c === '"' || c === "'") {
          innerQuote = c;
          i++;
          continue;
        }
        if (c === '{') interpDepth++;
        else if (c === '}') interpDepth--;
        i++;
      }
      if (!closed) return null; // unterminated — leave for the strict parser/validator to report
      found = true;
      out += evalTemplate(raw.slice(start, i));
      continue;
    }
    if (ch === '$' && raw[i + 1] === '{') {
      // Bare `${...}` span: find the matching close (quotes hidden, brace
      // nesting tracked), then evaluate it AS a template by wrapping the
      // whole span in backticks — identical semantics, one code path.
      const start = i;
      i += 2;
      let braceDepth = 1;
      let innerQuote = '';
      while (i < raw.length && braceDepth > 0) {
        const c = raw[i];
        if (innerQuote) {
          if (c === innerQuote) innerQuote = '';
          i++;
          continue;
        }
        if (c === '"' || c === "'") {
          innerQuote = c;
          i++;
          continue;
        }
        if (c === '{') braceDepth++;
        else if (c === '}') braceDepth--;
        i++;
      }
      if (braceDepth > 0) return null; // unterminated — validator reports
      found = true;
      out += evalTemplate('`' + raw.slice(start, i) + '`');
      continue;
    }
    out += ch;
    i++;
  }
  return found ? out : null;
}

/**
 * Match a string that is a single `name( … )` functional notation spanning the
 * whole (trimmed) input, returning `{ name, args }` or null. Unlike a greedy
 * `name\((.*)\)$` or non-nesting `name\(([^)]*)\)$` regex, the argument span is
 * found by balanced-paren scanning, so nested calls
 * (`translate(calc(1 + 2))`, `oklch(from mix(a, b) l c h)`) are captured
 * correctly and trailing content after the close (`a() b()`) is rejected.
 * Quote-aware so a `)` inside a string is not treated as a close.
 */
export function matchFunctionNotation(value: string): { name: string; args: string } | null {
  const trimmed = value.trim();
  const nameMatch = FN_NAME_RE.exec(trimmed);
  if (!nameMatch) return null;
  const name = nameMatch[0];
  let i = name.length;
  if (trimmed[i] !== '(') return null;
  const argsStart = i + 1;
  let depth = 0;
  let quote = '';
  for (i = argsStart; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (quote) {
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      if (depth === 0) {
        // Matching close for the outer `(`. Must be the last non-space char.
        if (i === trimmed.length - 1) {
          return { name, args: trimmed.slice(argsStart, i) };
        }
        return null; // trailing content after the close
      }
      depth--;
    }
  }
  return null; // unterminated
}
