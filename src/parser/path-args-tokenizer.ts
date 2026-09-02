import { ExternalTokenizer } from '@lezer/lr';
import { PathArgs } from './pathogen.generated.terms';

// Statement-starting keywords that end a run of path arguments. Every
// grammar keyword that can begin a statement must be here — otherwise
// `M x y` followed by that keyword on the next line swallows it as an
// argument. tests/keyword-registry.test.ts checks this list against the
// grammar's kw<> terms.
export const KEYWORDS = new Set([
  'let', 'for', 'if', 'else', 'fn', 'return', 'define', 'default',
  'layer', 'apply', 'text', 'tspan', 'enum', 'log',
  'break', 'continue', 'switch', 'case', 'where',
]);

// Functions that should start a new statement, not be consumed as path args.
// These are context-aware and stdlib functions that emit path data or have side effects.
const STATEMENT_FUNCTIONS = new Set([
  // Context-aware path functions
  'polarPoint', 'polarOffset', 'polarMove', 'polarLine',
  'arcFromCenter', 'arcFromPolarOffset', 'tangentLine', 'tangentArc',
  'heading', 'turn',
  // Shape functions that emit path data
  'circle', 'rect', 'roundRect', 'polygon', 'star',
  'line', 'arc', 'quadratic', 'cubic',
  'moveTo', 'lineTo', 'closePath',
  'cubicSpline', 'quadSpline', 'clippedQuadSpline', 'polarCubicBezier',
  // Grid functions
  'squareGrid', 'triangleGrid', 'hexagonGrid',
  // Other statement-level calls
  'radialWedge',
]);

const PATH_COMMANDS = new Set('MLHVCSQTAZmlhvcsqtaz'.split(''));

// Clause introducers that end path args so the grammar can attach
// `with <cornerOp>(...)` / `as segment('...')` suffix clauses. Reserved in
// path-argument position only (contextual @extend keywords in the grammar).
const CLAUSE_KEYWORDS = new Set(['with', 'as']);

/**
 * External tokenizer that greedily consumes path command arguments.
 * Called by the Lezer parser after matching a path command letter.
 * Consumes: numbers, identifiers, booleans, calc() expressions,
 * member/index/call chains, color literals.
 * Stops at: keywords, path command letters, closing braces, semicolons, EOF.
 */
export const pathArgsTokenizer = new ExternalTokenizer((input) => {
  let consumed = 0;
  let depth = 0; // ( and [ nesting
  // Braces opened INSIDE parens (a switch expression's arms inside calc()).
  // Tracked separately from `depth` so an unclosed `(` (a typo) still lets the
  // enclosing block's `}` and the next line's keyword end the token exactly
  // as they always did — only a brace this token itself opened is consumed.
  let braceDepth = 0;
  let lastNonWS = 0;

  while (true) {
    const ch = input.next;
    if (ch === -1) break; // EOF

    // Whitespace — skip but don't count as consumed content
    if (ch === 32 || ch === 9) { // space, tab
      input.advance();
      consumed++;
      continue;
    }

    // Newline — peek ahead to check for statement boundary
    if (ch === 10 || ch === 13) { // \n, \r
      // Peek at next non-whitespace char after the newline
      const saved = consumed;
      input.advance();
      consumed++;
      // Skip more whitespace after newline
      while (input.next === 32 || input.next === 9 || input.next === 10 || input.next === 13) {
        input.advance();
        consumed++;
      }
      if (input.next === -1) break;

      // Check if next token starts a new statement. Inside a switch
      // expression's braces a keyword on a new line (`case`, `default`) is
      // expression content, so the check is skipped only there.
      if (braceDepth === 0 && isAlpha(input.next)) {
        const word = peekWord(input);
        if (KEYWORDS.has(word) || STATEMENT_FUNCTIONS.has(word) || CLAUSE_KEYWORDS.has(word) || (word.length === 1 && PATH_COMMANDS.has(word))) {
          break;
        }
        // Check if this identifier is followed by '=' (but not '==') — assignment statement
        if (isAssignmentTarget(input, word.length)) {
          break;
        }
      }
      if (input.next === 125 && braceDepth === 0) break; // '}' closes the enclosing block
      if (input.next === 47) { // '/' — might be comment
        if (input.peek(1) === 47) break; // '//' comment → stop
        if (depth === 0) break; // Single '/' at top level after newline → stop
        // Inside parens (depth > 0), continue — could be division
      }
      continue;
    }

    // Semicolon → end of args. A closing brace ends the args unless it
    // closes a brace this token opened (a switch expression inside calc()).
    if (ch === 59) break; // ';'
    if (ch === 125) { // '}'
      if (braceDepth > 0) {
        braceDepth--;
        input.advance();
        consumed++;
        lastNonWS = consumed;
        continue;
      }
      break;
    }

    // Comment '//' → stop (single '/' handled as operator below)
    if (ch === 47) { // '/'
      if (input.peek(1) === 47) break; // '//' comment
      // Single '/' at depth 0 isn't a valid path arg operator — stop
      if (depth === 0) break;
      // Inside parens (depth > 0), fall through to operator handling
    }

    // Opening paren/bracket
    if (ch === 40 || ch === 91) { // '(' or '['
      depth++;
      input.advance();
      consumed++;
      lastNonWS = consumed;
      continue;
    }

    // Opening brace inside parens: a switch expression's arms inside calc().
    // At top level `{` is never an argument.
    if (ch === 123 && depth > 0) { // '{'
      braceDepth++;
      input.advance();
      consumed++;
      lastNonWS = consumed;
      continue;
    }

    // Closing paren/bracket
    if (ch === 41 || ch === 93) { // ')' or ']'
      if (depth > 0) {
        depth--;
        input.advance();
        consumed++;
        lastNonWS = consumed;
        continue;
      }
      break;
    }

    // Digits, dots, minus, plus — numbers and operators in calc()
    if (isDigit(ch) || ch === 46) { // '.'
      input.advance();
      consumed++;
      lastNonWS = consumed;
      continue;
    }

    // Hash — color literal
    if (ch === 35) { // '#'
      input.advance();
      consumed++;
      while (input.next !== -1 && isHexDigit(input.next)) {
        input.advance();
        consumed++;
      }
      lastNonWS = consumed;
      continue;
    }

    // Alpha/underscore — identifiers, keywords, booleans
    if (isAlpha(ch) || ch === 95) { // '_'
      const word = peekWord(input);

      // If at top level (not inside parens), check for statement-starting keywords
      if (depth === 0) {
        if ((KEYWORDS.has(word) || STATEMENT_FUNCTIONS.has(word) || CLAUSE_KEYWORDS.has(word)) && word !== 'calc' && word !== 'true' && word !== 'false') break;
        if (word.length === 1 && PATH_COMMANDS.has(word)) break;
      }

      // Consume the word
      for (let i = 0; i < word.length; i++) {
        input.advance();
        consumed++;
      }
      lastNonWS = consumed;
      continue;
    }

    // Operators that only make sense inside calc() parens
    if (ch === 43 || ch === 45 || ch === 42 || ch === 47 || ch === 37) { // + - * / %
      if (depth > 0) {
        input.advance();
        consumed++;
        lastNonWS = consumed;
        continue;
      }
      // Minus at top level could be negative number
      if (ch === 45) {
        input.advance();
        consumed++;
        lastNonWS = consumed;
        continue;
      }
      break;
    }

    // Comma — only inside parens (function call args)
    if (ch === 44) { // ','
      if (depth > 0) {
        input.advance();
        consumed++;
        lastNonWS = consumed;
        continue;
      }
      break;
    }

    // Comparison/equality/logical/ternary operators: expression content
    // inside calc(...) parens, statement-level punctuation outside them
    // (a bare ternary in path-arg position stays an error).
    if (ch === 60 || ch === 62 || ch === 61 || ch === 33 || ch === 38 || ch === 124 || ch === 63 || ch === 58) {
      // < > = ! & | ? :
      if (depth > 0) {
        input.advance();
        consumed++;
        lastNonWS = consumed;
        continue;
      }
      break;
    }

    // Anything else — stop
    break;
  }

  // Accept the token if we consumed any non-whitespace content
  if (lastNonWS > 0) {
    input.acceptToken(PathArgs, -consumed + lastNonWS);
  }
});

function isDigit(ch: number): boolean {
  return ch >= 48 && ch <= 57;
}

function isAlpha(ch: number): boolean {
  return (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122);
}

function isHexDigit(ch: number): boolean {
  return isDigit(ch) || (ch >= 65 && ch <= 70) || (ch >= 97 && ch <= 102);
}

/**
 * Peek at the current word (identifier) from the input stream.
 * Does NOT advance the stream.
 */
function peekWord(input: { next: number; peek(offset: number): number }): string {
  const chars: number[] = [];
  let offset = 0;
  let ch = input.next;
  while (ch !== -1 && (isAlpha(ch) || isDigit(ch) || ch === 95)) {
    chars.push(ch);
    offset++;
    ch = input.peek(offset);
  }
  return String.fromCharCode(...chars);
}

/**
 * Check if an identifier at the current position is an assignment target:
 * peek past the word and any member access chains (`.prop`, `[index]`),
 * then check for `=` not followed by `=` (assignment, not equality).
 */
function isAssignmentTarget(input: { next: number; peek(offset: number): number }, wordLen: number): boolean {
  let offset = wordLen;
  let ch = input.peek(offset);

  // Skip past member access chains: .prop, [expr]
  while (true) {
    // Skip whitespace
    while (ch === 32 || ch === 9) { // space, tab
      offset++;
      ch = input.peek(offset);
    }
    if (ch === 46) { // '.'
      offset++;
      ch = input.peek(offset);
      // Skip the property name
      while (ch !== -1 && (isAlpha(ch) || isDigit(ch) || ch === 95)) {
        offset++;
        ch = input.peek(offset);
      }
      continue;
    }
    if (ch === 91) { // '['
      // Skip until matching ']'
      let bracketDepth = 1;
      offset++;
      ch = input.peek(offset);
      while (ch !== -1 && bracketDepth > 0) {
        if (ch === 91) bracketDepth++;
        if (ch === 93) bracketDepth--;
        offset++;
        ch = input.peek(offset);
      }
      continue;
    }
    break;
  }

  // Skip whitespace before '='
  while (ch === 32 || ch === 9) {
    offset++;
    ch = input.peek(offset);
  }

  // Check for '=' not followed by '=' (assignment, not equality '==')
  return ch === 61 && input.peek(offset + 1) !== 61; // '=' but not '=='
}
