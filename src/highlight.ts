// Browser-side syntax highlighter for Pathogen source code.
//
// Lazy-loaded by the workspace detail page (/u/:handle/:slug) on first
// expand of the "View source" disclosure. SEO crawlers and visitors
// with JS disabled see the raw <pre> emitted by the SSR worker; this
// module progressively enhances by walking the Lezer parse tree and
// wrapping each leaf in a <span class="..."> for CSS-driven coloring.
//
// Strictly smaller than dist/index.global.js because it imports only
// the Lezer parser table (and its transitive @lezer/highlight prop
// source), not the evaluator, stdlib, AST builder, or expression
// parser. Bundle size is measured via the standard build pipeline —
// keep an eye on dist/highlight.global.js after grammar changes.

import { parser as lezerParser } from './parser/pathogen.generated';

// Re-export so the workspace detail page can hand the same parser to
// CodeMirror's LRLanguage.define() without dragging in the full
// dist/index.global.js bundle (which adds the evaluator + stdlib +
// 9MB of compiler weight we don't need for read-only display).
export { lezerParser };

// Lookup table: Lezer grammar node names → CSS class names. Mirrors
// the semantic intent of pathogenHighlighting in src/parser/highlight.ts
// without importing the @lezer/highlight tag system at the call site.
// Add new entries here as the grammar grows; missing entries render
// as un-classed text (acceptable graceful degradation).
const NODE_CLASS: Record<string, string> = {
  // Keywords — match the `kw<…>` macro names from pathogen.grammar.
  let: 'kw', fn: 'kw', for: 'kw', in: 'kw', if: 'kw', else: 'kw',
  return: 'kw', apply: 'kw', layer: 'kw', text: 'kw', tspan: 'kw',
  define: 'kw', default: 'kw', calc: 'kw', enum: 'kw',
  // Block-opener keywords inside the path/style/text grammars.
  styleBlockOpen: 'kw',
  pathBlockOpen: 'kw',
  textBlockOpen: 'kw',
  fontDirectiveKw: 'kw',

  // Literals
  Number: 'num',
  String: 'str',
  ColorLiteral: 'str',
  CSSColorLiteral: 'str',
  templateContent: 'str',
  templateStart: 'str',
  templateEnd: 'str',
  BooleanLiteral: 'num',
  NullLiteral: 'num',

  // Identifiers
  Identifier: 'id',
  VariableName: 'fn',

  // Type names (layer types, enum names)
  LayerType: 'tp',

  // Operators that have named terms in the grammar
  RangeOp: 'op',
  // Path commands (M, L, H, V, C, S, Q, T, A, Z) read as operators in
  // the editor.
  pathCommandLetter: 'op',

  // Comments
  Comment: 'cm',
  LineComment: 'cm',

  // Style block content (CSS-ish text inside ${...} blocks)
  StyleContent: 'str',
};

// Anonymous-token text fallback: Lezer emits anonymous tokens (those
// declared as bare literal strings in the grammar like "=" or "+")
// with `type.name === ""`. The map above can't reach them by name, so
// we pattern-match on the slice text for short tokens. Keeps the
// bundle tiny — no regex backtracking, just direct lookup.
const ANON_OP_CLASS: Record<string, string> = {
  '+': 'op', '-': 'op', '*': 'op', '/': 'op', '%': 'op',
  '==': 'op', '!=': 'op', '<=': 'op', '>=': 'op', '<': 'op', '>': 'op',
  '||': 'op', '&&': 'op', '!': 'op',
  '=': 'op', '?': 'op', ':': 'op',
  '...': 'op',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function classFor(typeName: string, text: string): string | null {
  const named = NODE_CLASS[typeName];
  if (named) return named;
  if (typeName === '' && text.length <= 3) {
    const anon = ANON_OP_CLASS[text];
    if (anon) return anon;
  }
  return null;
}

export function highlightPathogen(source: string): string {
  // Empty input: skip the walk; the cursor's behavior on an empty tree
  // is fine but the bookkeeping below assumes at least one iteration.
  if (source.length === 0) return '';

  const tree = lezerParser.parse(source);
  const cur = tree.cursor();
  const parts: string[] = [];
  let cursorPos = 0;

  // Leaf-only depth-first walk. The outer loop descends into the first
  // child until it hits a leaf, emits, then climbs to the next sibling
  // (or the next ancestor's sibling if no siblings remain).
  while (true) {
    while (cur.firstChild()) {
      // Descend.
    }

    // Emit any gap between the previous leaf's end and this leaf's
    // start (Lezer skips whitespace; we capture it as raw escaped
    // text to preserve formatting).
    if (cur.from > cursorPos) {
      parts.push(escapeHtml(source.slice(cursorPos, cur.from)));
    }

    const text = source.slice(cur.from, cur.to);
    const cls = classFor(cur.type.name, text);
    parts.push(cls ? `<span class="${cls}">${escapeHtml(text)}</span>` : escapeHtml(text));
    cursorPos = cur.to;

    // Advance to the next leaf: try a sibling first, then climb
    // parents until one has a sibling. Run-out signals end of tree.
    while (!cur.nextSibling()) {
      if (!cur.parent()) {
        if (cursorPos < source.length) {
          parts.push(escapeHtml(source.slice(cursorPos)));
        }
        return parts.join('');
      }
    }
  }
}
