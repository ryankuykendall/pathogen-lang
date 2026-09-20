// Lezer-based expression parser — replaces Parsimmon's expression parser.
// Parses expression strings by wrapping them as `let _ = <expr>;` programs
// and extracting the value from the LetDeclaration AST node.

import { parser } from './pathogen.generated';
import { buildAST, lineColumnAt, setExpressionParser } from './ast-builder';
import type { Expression, SourceLocation } from './ast';

// Bound recursive calls (parseExpression → buildAST → parseExpressionString →
// parseExpression). Legitimate nesting is common — e.g. buildReturnStatement
// re-parses `return @{ ... if (cond) ... };` and the nested buildIfStatement
// re-parses `cond` — and each level parses a strictly shorter span, so a depth
// limit terminates while a boolean guard silently DROPPED nested expressions
// (an if condition inside a returned path block defaulted to `true`).
const MAX_PARSE_DEPTH = 32;
let _parseDepth = 0;

/**
 * Parse an expression string using the Lezer parser.
 * Returns the Expression AST node, or null if parsing fails.
 *
 * This replaces Parsimmon's expression.parse() throughout the codebase.
 */
/**
 * `let _ = <expr>` + the statement's semicolon ON ITS OWN LINE. A `//` comment
 * is legal anywhere whitespace is, so the slice may END in one; with the `;`
 * on the same line the comment swallowed it, the sub-parse failed, and the
 * callers' silent fallbacks took over — an if condition became `true`, a
 * return value `null`. The 8-character prefix is what every offset adjustment
 * in this file assumes; only the suffix changed.
 */
function wrapExpression(exprStr: string): string {
  return `let _ = ${exprStr}\n;`;
}

export function parseExpression(exprStr: string): Expression | null {
  if (!exprStr.trim()) return null;
  if (_parseDepth >= MAX_PARSE_DEPTH) return null; // Bound pathological recursion

  // Wrap as a let declaration so the Lezer grammar can parse it
  const wrapped = wrapExpression(exprStr);

  _parseDepth++;
  try {
    const tree = parser.parse(wrapped);

    // Check for parse errors
    const cursor = tree.cursor();
    let hasError = false;
    do {
      if (cursor.type.isError) { hasError = true; break; }
    } while (cursor.next());

    if (hasError) return null;

    const ast = buildAST(tree, wrapped);
    if (ast.body.length === 0) return null;

    const stmt = ast.body[0];
    if (stmt.type === 'LetDeclaration') {
      const value = stmt.value;
      // Ensure the expression has a loc (some postfix-built nodes don't)
      if (value && typeof value === 'object' && !('loc' in value && (value as any).loc)) {
        const v = value as any;
        if (v.type === 'MethodCallExpression' && v.object?.loc && v.method) {
          // MethodCallExpression loc should point to the dot (Parsimmon convention)
          const objLen = v.object.name?.length || 1;
          (value as any).loc = {
            line: v.object.loc.line,
            column: v.object.loc.column + objLen, // At the dot position
            offset: v.object.loc.offset + objLen,
          };
        } else {
          const childLoc = v.object?.loc || v.left?.loc;
          if (childLoc) (value as any).loc = { ...childLoc };
        }
      }
      return value;
    }

    return null;
  } catch {
    return null;
  } finally {
    _parseDepth--;
  }
}

/**
 * Offset (into `exprStr`) of the first syntax error the grammar reports for
 * the expression, or null when it parses cleanly. Lets callers that receive
 * `null` from parseExpression() point their error at the actual mistake.
 */
export function findExpressionErrorOffset(exprStr: string): number | null {
  if (!exprStr.trim()) return 0;
  const wrapped = wrapExpression(exprStr);
  const tree = parser.parse(wrapped);
  const cursor = tree.cursor();
  do {
    if (cursor.type.isError) return Math.max(0, Math.min(cursor.from - 8, exprStr.length));
  } while (cursor.next());
  return null;
}

/**
 * Parse an expression string and adjust all SourceLocations to be relative
 * to a position in the original source.
 */
export function parseExpressionAtOffset(
  exprStr: string,
  sourceOffset: number,
  source: string,
): Expression | null {
  const expr = parseExpression(exprStr);
  if (!expr) return null;

  // Line/column offset of the source position. This runs once per calc() and
  // per style value, and used to slice-and-split the whole document prefix each
  // time — quadratic in a path-heavy program. lineColumnAt is the same
  // definition, binary-searched (tests/source-locations.test.ts).
  const at = lineColumnAt(source, sourceOffset);
  const lineOffset = at.line - 1;
  const colOffset = at.column - 1;

  // The wrapped expression has `let _ = ` (8 chars) prepended.
  // Parsimmon-parsed expressions had line 1, col 1 as the start.
  // Lezer-parsed expressions (via wrapping) have line 1, col 9 (after `let _ = `).
  // We need to adjust to the original source position.
  adjustLocs(expr, lineOffset, colOffset, 8, sourceOffset, new Set());
  return expr;
}

function adjustLocs(
  node: any,
  lineOffset: number,
  colOffset: number,
  wrapOffset: number,
  sourceOffset: number,
  seen: Set<object>,
): void {
  if (!node || typeof node !== 'object') return;
  // Some builders share ONE loc object between a node and its child (e.g. a
  // MemberExpression and its object head). Track adjusted loc objects so a
  // shared one is shifted exactly once — double-shifting doubled the line
  // offset for member-head references inside style-value interpolations.
  if (node.loc && !seen.has(node.loc)) {
    seen.add(node.loc);
    // The expression starts at sourceOffset in the document and the wrapper
    // sits before it, so every node's offset moves by the same amount on
    // every line; columns only shift on the first line.
    node.loc.offset = node.loc.offset - wrapOffset + sourceOffset;
    if (node.loc.line === 1) {
      node.loc.line += lineOffset;
      node.loc.column = node.loc.column - wrapOffset + colOffset;
    } else {
      node.loc.line += lineOffset;
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'type') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) adjustLocs(item, lineOffset, colOffset, wrapOffset, sourceOffset, seen);
    } else if (val && typeof val === 'object' && val.type) {
      adjustLocs(val, lineOffset, colOffset, wrapOffset, sourceOffset, seen);
    }
  }
}
