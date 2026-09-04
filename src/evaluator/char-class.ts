/**
 * Character classification for fromGlyph() glyph provenance.
 *
 * Single source of truth for the evaluator and the language services,
 * including isWhitespace itself. The three whitespace classifiers partition
 * isWhitespaceChar exactly: every whitespace character satisfies exactly one
 * of isSpaceChar/isTabChar/isNewlineChar, and non-whitespace characters
 * satisfy none. `isSpaceChar` is defined as the whitespace remainder (not
 * category Zs) to keep that invariant airtight.
 */

// Line-break characters: LF, VT, FF, CR, LINE SEPARATOR, PARAGRAPH SEPARATOR.
// NEL (U+0085) is deliberately excluded — JS /\s/ (the isWhitespace test)
// does not match it, and isSpace/isTab/isNewline must partition isWhitespace
// exactly.
const NEWLINE_RE = /^[\n\v\f\r\u2028\u2029]$/;

// Combining marks (Mn/Mc/Me) — accents, harakat, niqqud, vowel signs.
const MARK_RE = /^\p{M}$/u;

export function isWhitespaceChar(char: string): boolean {
  return /\s/.test(char);
}

export function isTabChar(char: string): boolean {
  return char === '\t';
}

export function isNewlineChar(char: string): boolean {
  return NEWLINE_RE.test(char);
}

export function isSpaceChar(char: string): boolean {
  return isWhitespaceChar(char) && !isTabChar(char) && !isNewlineChar(char);
}

export function isMarkChar(char: string): boolean {
  return MARK_RE.test(char);
}

// Property-name → predicate map used by the evaluator's PathBlock member
// dispatch; keeps the boolean class cases exhaustive by construction.
export const CHAR_CLASS_PREDICATES = {
  isSpace: isSpaceChar,
  isTab: isTabChar,
  isNewline: isNewlineChar,
  isMark: isMarkChar,
} as const;
