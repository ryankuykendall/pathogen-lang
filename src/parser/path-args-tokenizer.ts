import { ExternalTokenizer } from '@lezer/lr';
import { PathArgs } from './pathogen.generated.terms';

const KEYWORDS = new Set([
  'let', 'for', 'if', 'else', 'fn', 'return', 'define', 'default',
  'layer', 'apply', 'text', 'tspan', 'enum', 'log',
]);

const PATH_COMMANDS = new Set('MLHVCSQTAZmlhvcsqtaz'.split(''));

/**
 * External tokenizer that greedily consumes path command arguments.
 * Called by the Lezer parser after matching a path command letter.
 * Consumes: numbers, identifiers, booleans, calc() expressions,
 * member/index/call chains, color literals.
 * Stops at: keywords, path command letters, closing braces, semicolons, EOF.
 */
export const pathArgsTokenizer = new ExternalTokenizer((input) => {
  let consumed = 0;
  let depth = 0;
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

      // Check if next token starts a new statement
      if (isAlpha(input.next)) {
        const word = peekWord(input);
        if (KEYWORDS.has(word) || (word.length === 1 && PATH_COMMANDS.has(word))) {
          // Rewind to before the newline
          break;
        }
      }
      if (input.next === 125) break; // '}'
      if (input.next === 47) { // '/' — might be comment
        // Check for '//'
        break; // Conservative: stop at '/'
      }
      continue;
    }

    // Closing brace, semicolon → end of args
    if (ch === 125 || ch === 59) break; // '}' or ';'

    // Comment '//' → stop
    if (ch === 47) { // '/'
      break;
    }

    // Opening paren/bracket
    if (ch === 40 || ch === 91) { // '(' or '['
      depth++;
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
        if (KEYWORDS.has(word) && word !== 'calc' && word !== 'true' && word !== 'false') break;
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

    // Comparison/equality/logical operators — stop
    if (ch === 60 || ch === 62 || ch === 61 || ch === 33 || ch === 38 || ch === 124) {
      break; // < > = ! & |
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
