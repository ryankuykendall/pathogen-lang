import type { Comment, Program } from './ast';

import { parser as lezerParser } from './pathogen.generated';
import { buildAST, setExpressionParser } from './ast-builder';

// Wire the Lezer-based expression parser into the AST builder
import { parseExpression as lezerParseExpression, findExpressionErrorOffset } from './lezer-expression';
import { describeBareRange } from './range-value-errors';
import { reservedBindingAt } from './reserved-bindings';
import type { ReservedBinding } from './reserved-bindings';

setExpressionParser({
  parse: (input: string) => {
    const result = lezerParseExpression(input);
    return { status: result !== null, value: result };
  },
  errorOffset: findExpressionErrorOffset,
});

export function detectMissingSemicolon(
  input: string,
  offset: number,
): { message: string; line: number; column: number } | null {
  const before = input.slice(0, offset);
  // Find the start of the current statement by scanning backward for a boundary,
  // skipping over @{ ... } path blocks and #{ ... } style blocks
  let lastBoundary = -1;
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i];
    if (ch === '}') {
      // Check if this closes a @{ } or #{ } block — skip over it
      const braceStart = before.lastIndexOf('{', i - 1);
      if (braceStart >= 1 && (before[braceStart - 1] === '@' || before[braceStart - 1] === '#')) {
        i = braceStart - 1;
        continue;
      }
      lastBoundary = i;
      break;
    }
    if (ch === ';' || ch === '{') {
      lastBoundary = i;
      break;
    }
  }
  const statementText = before.slice(lastBoundary + 1).trim();

  let message: string;
  if (statementText.startsWith('let ')) {
    message = "Missing ';' after let declaration";
  } else if (statementText.startsWith('return ') || statementText === 'return') {
    message = "Missing ';' after return statement";
  } else if (/^[a-zA-Z_]\w*\s*(?:\.\w+|\[[\s\S]*?\])*\s*=(?!=)/.test(statementText)) {
    message = "Missing ';' after assignment";
  } else {
    message = "Missing ';'";
  }

  // Point to where the semicolon should go (end of statement) rather than
  // where the parser failed (start of next token)
  let endOffset = offset;
  for (let i = offset - 1; i >= 0; i--) {
    if (input[i] !== ' ' && input[i] !== '\t' && input[i] !== '\n' && input[i] !== '\r') {
      endOffset = i + 1;
      break;
    }
  }
  const beforeEnd = input.slice(0, endOffset);
  const endLines = beforeEnd.split('\n');

  return {
    message,
    line: endLines.length,
    column: endLines[endLines.length - 1].length + 1,
  };
}

const PATH_COMMAND_LETTER_SET = new Set('MLHVCSQTAZmlhvcsqtaz'.split(''));

/**
 * Detect the command-letter shadowing trap: `let m = 25; ... L m 40`.
 * The path-args tokenizer must treat a bare single letter as a command,
 * so recovery inserts a zero-width error where the arguments should be
 * and honestly reparses `m 40` as a new PathCommand — the generic
 * "Missing ';'" it produces points at punctuation nowhere near the
 * mistake. Tree position alone cannot identify the case (the reparse is
 * legitimate); the discriminator is the following command's letter ALSO
 * being a declared variable (a single-letter VariableName node anywhere
 * in the tree — path arguments produce no VariableName nodes, so the
 * reparse can never self-trigger). Shared by parse() (CLI errors) and
 * getDiagnostics' describeError (editor squiggles), which otherwise
 * have independent error paths.
 */
export function describeCommandShadowing(
  input: string,
  errorNode: import('@lezer/common').SyntaxNode,
): { message: string; offset: number } | null {
  if (errorNode.from !== errorNode.to) return null;
  const parent = errorNode.parent;
  if (!parent || parent.name !== 'PathCommand') return null;
  const prevName = errorNode.prevSibling?.name;
  if (prevName !== 'PathCommandLetter' && prevName !== 'PathArgs') return null;
  if (errorNode.nextSibling) return null;

  const isDeclared = (letter: string): boolean => {
    let root: import('@lezer/common').SyntaxNode = errorNode;
    while (root.parent) root = root.parent;
    const cur = root.cursor();
    do {
      if (cur.type.name === 'VariableName' && cur.to - cur.from === 1 && input.slice(cur.from, cur.to) === letter) {
        return true;
      }
    } while (cur.next());
    return false;
  };
  const rescue = (letterNode: import('@lezer/common').SyntaxNode): { message: string; offset: number } | null => {
    const letter = input.slice(letterNode.from, letterNode.to);
    if (letter.length !== 1 || !PATH_COMMAND_LETTER_SET.has(letter)) return null;
    if (!isDeclared(letter)) return null;
    // `A.x` reads as the arc command followed by junk; the fix the user
    // wants is calc(A.x), not calc(A).
    const member = /^\.([A-Za-z_]\w*)/.exec(input.slice(letterNode.to, letterNode.to + 64));
    const spelling = member ? `${letter}.${member[1]}` : letter;
    return {
      message: `'${letter}' is a path command here, so it cannot be used as a bare variable in path arguments — write calc(${spelling}), or rename the variable`,
      offset: letterNode.from,
    };
  };

  // Shape 1 (`L m 40`): the letter opens the FOLLOWING PathCommand —
  // recovery ended the current command's args early and reparsed the
  // variable as a new command.
  const following = parent.nextSibling;
  if (following?.name === 'PathCommand') {
    const letterNode = following.firstChild;
    if (letterNode?.name === 'PathCommandLetter') {
      const hit = rescue(letterNode);
      if (hit) return hit;
    }
  }
  // Shape 2 (`L 5 V`): the variable itself was consumed as the command
  // that now misses its arguments — the offender is the error's OWN
  // command letter.
  if (prevName === 'PathCommandLetter' && errorNode.prevSibling) {
    return rescue(errorNode.prevSibling);
  }
  return null;
}

/**
 * Parse using the Lezer parser. Returns the Lezer tree + AST.
 * Used by the playground for syntax highlighting.
 */
export function parseLezer(input: string): { tree: import('@lezer/common').Tree; ast: Program } {
  const tree = lezerParser.parse(input);
  const ast = buildAST(tree, input);
  return { tree, ast };
}

/** Export the Lezer parser for direct CodeMirror integration. */
export { lezerParser };

export { describeBareRange, RANGE_IN_PATH_ARGS, RANGE_NEEDS_BOTH_BOUNDS } from './range-value-errors';

export function parse(input: string): Program {
  const tree = lezerParser.parse(input);

  // One pass over the tree: stop at the first Lezer error node, and along the
  // way note the first reserved name used as a binding (reserved-bindings.ts).
  // A syntax error wins — the reserved-name check only reports on a tree that
  // parsed cleanly.
  let hasErrors = false;
  let reservedBinding: ReservedBinding | null = null;
  const errCur = tree.cursor();
  do {
    if (errCur.type.isError) {
      hasErrors = true;
      break;
    }
    reservedBinding ??= reservedBindingAt(errCur, input);
  } while (errCur.next());

  if (hasErrors) {
    // Lezer-native error messages
    const errOffset = errCur.from;
    const shadow = describeCommandShadowing(input, errCur.node);
    if (shadow) {
      const shadowLines = input.slice(0, shadow.offset).split('\n');
      throw new Error(
        `Parse error at line ${shadowLines.length}, column ${shadowLines[shadowLines.length - 1].length + 1}: ${shadow.message}`,
      );
    }
    // A legacy `${` opener anywhere wins over the first error: its cascade is
    // what usually produced the other errors, and the message is the one the
    // user can act on. Same rule as the editor's diagnostics.
    const legacyAt = firstLegacyStyleOpener(input, tree);
    if (legacyAt !== null) {
      const legacyLines = input.slice(0, legacyAt).split('\n');
      throw new Error(
        `Parse error at line ${legacyLines.length}, column ${legacyLines[legacyLines.length - 1].length + 1}: ${LEGACY_STYLE_OPENER_MESSAGE}`,
      );
    }
    // A bare `1..5` in value position recovers as a missing ';' — name the
    // real fix (parentheses) instead. Same text as the editor diagnostic.
    const bareRange = describeBareRange(input, errCur.node);
    if (bareRange) {
      const rangeLines = input.slice(0, bareRange.offset).split('\n');
      throw new Error(
        `Parse error at line ${rangeLines.length}, column ${rangeLines[rangeLines.length - 1].length + 1}: ${bareRange.message}`,
      );
    }
    const semiResult = detectMissingSemicolon(input, errOffset);
    if (semiResult) {
      throw new Error(`Parse error at line ${semiResult.line}, column ${semiResult.column}: ${semiResult.message}`);
    }
    const errLines = input.slice(0, errOffset).split('\n');
    throw new Error(
      `Parse error at line ${errLines.length}, column ${errLines[errLines.length - 1].length + 1}: unexpected token`,
    );
  }

  // The reserved-name check reads the tree; other compile errors ('break'
  // outside a loop, a malformed case pattern, a range in a path argument)
  // come from the AST builder. Report whichever problem appears FIRST in the
  // document — people fix errors top-down, and `case [deg, 2]` is a malformed
  // pattern before it is a naming problem. A builder error with no position
  // wins, since it cannot be ordered.
  let ast: Program;
  try {
    ast = buildAST(tree, input);
  } catch (builderError) {
    if (reservedBinding && reservedBinding.offset < parseErrorOffset(builderError, input)) {
      throw reservedBindingError(reservedBinding, input);
    }
    throw builderError;
  }
  if (reservedBinding) throw reservedBindingError(reservedBinding, input);
  return ast;
}

function reservedBindingError(binding: ReservedBinding, input: string): Error {
  const lines = input.slice(0, binding.offset).split('\n');
  return new Error(
    `Parse error at line ${lines.length}, column ${lines[lines.length - 1].length + 1}: ${binding.message}`,
  );
}

/**
 * Document offset of a builder error. Two shapes exist: `Parse error at line
 * L, column C: …` (parseErrorAt) and the older `Parse error at line L: …` with
 * no column — that one still has a position, so it is placed at the start of
 * its line rather than treated as unpositioned. Only a message with no line at
 * all returns 0 (= earliest, so it wins).
 */
function parseErrorOffset(error: unknown, input: string): number {
  const match = /^Parse error at line (\d+)(?:, column (\d+))?/.exec(error instanceof Error ? error.message : '');
  if (!match) return 0;
  const lines = input.split('\n');
  let offset = 0;
  for (let i = 0; i < Number(match[1]) - 1 && i < lines.length; i++) offset += lines[i].length + 1;
  return offset + (match[2] ? Number(match[2]) - 1 : 0);
}

/**
 * Diagnostic for the pre-2026-09 style-block opener. `${` is only ever an
 * interpolation now (inside backtick templates and style values); a `${`
 * that is neither is the old opener and gets this message instead of a
 * generic parse error. The playground and VS Code turn it into a quick fix.
 */
export const LEGACY_STYLE_OPENER_MESSAGE =
  "Style blocks open with '#{ … }' — '${ … }' is only template interpolation now. Change this '${' to '#{'";

/**
 * Is the error node inside a REAL backtick template or style block? A `${`
 * there is a broken interpolation, not a legacy opener. Ancestor names are
 * not enough: where the grammar demands a StyleBlockLiteral (the
 * `PathLayer('a') ${ … }` constructor form) error recovery synthesizes one
 * around the stray `${`, so each ancestor must also start with its genuine
 * opener (`#{` / `` ` ``) before it counts.
 */
function insideTemplateOrStyle(source: string, node: import('@lezer/common').SyntaxNode): boolean {
  for (let n: import('@lezer/common').SyntaxNode | null = node.parent; n; n = n.parent) {
    if (n.name === 'TemplateLiteral' && source[n.from] === '`') return true;
    if ((n.name === 'StyleBlockLiteral' || n.name === 'StyleBody') && legacyFreeStyleBlockStart(source, n)) return true;
  }
  return false;
}

/** The StyleBlockLiteral (or the StyleBody's parent) really opens with `#{`. */
function legacyFreeStyleBlockStart(source: string, node: import('@lezer/common').SyntaxNode): boolean {
  const block = node.name === 'StyleBody' ? node.parent : node;
  return !!block && source.startsWith('#{', block.from);
}

/**
 * True when the error node marks a legacy `${` style-block opener: the
 * error starts exactly at a `${` that sits outside any template or style
 * body.
 */
export function isLegacyStyleOpenerError(source: string, errorNode: import('@lezer/common').SyntaxNode): boolean {
  return source.startsWith('${', errorNode.from) && !insideTemplateOrStyle(source, errorNode);
}

/** The first legacy `${` opener anywhere in the tree, or null. */
function firstLegacyStyleOpener(source: string, tree: import('@lezer/common').Tree): number | null {
  let found: number | null = null;
  tree.iterate({
    enter(node) {
      if (found !== null) return false;
      if (node.type.isError && isLegacyStyleOpenerError(source, node.node)) found = node.from;
      return undefined;
    },
  });
  return found;
}

// Extract comments from source code
// Returns array of Comment nodes with their positions
export function extractComments(input: string): Comment[] {
  const comments: Comment[] = [];
  const lines = input.split('\n');

  let offset = 0;
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const commentMatch = /\/\/(.*)$/.exec(line);

    if (commentMatch) {
      const commentStart = line.indexOf('//');
      comments.push({
        type: 'Comment',
        text: `//${commentMatch[1]}`,
        loc: {
          line: lineNum + 1, // 1-indexed
          column: commentStart + 1, // 1-indexed
          offset: offset + commentStart,
        },
      });
    }

    offset += line.length + 1; // +1 for newline
  }

  return comments;
}

// Parse result that includes both AST and comments
export interface ParseResultWithComments {
  program: Program;
  comments: Comment[];
}

// Parse input and extract comments separately
export function parseWithComments(input: string): ParseResultWithComments {
  return {
    program: parse(input),
    comments: extractComments(input),
  };
}
