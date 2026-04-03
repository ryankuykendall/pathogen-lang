import { parse } from '../parser';

import type { Program } from '../parser/ast';

/**
 * Regex matching lines that likely start a new top-level statement.
 * Used to find recovery points after a parse error.
 */
const STATEMENT_START_RE =
  /^\s*(let\b|for\b|if\b|fn\b|define\b|layer\b|enum\b|text\b|@font\b|\/\/|[MLHVCSQTAZmlhvcsqtaz]\s)/;

/** Max number of recovery attempts to prevent runaway loops. */
const MAX_RECOVERY_ATTEMPTS = 10;

export interface RecoveryResult {
  /** The AST if the full source parsed successfully, or null if it failed. */
  ast: Program | null;
  /** Parse errors collected during recovery. Each has 1-based line/column in its message. */
  errors: RecoveryError[];
}

export interface RecoveryError {
  /** The raw error message from the parser (includes line/column). */
  message: string;
  /**
   * The line offset (0-based) within the original source where this error's
   * sub-parse started. For the first attempt this is 0; for recovered attempts
   * it's the line where we resumed parsing.
   */
  sourceLineOffset: number;
}

/**
 * Try to parse the source, recovering from errors by scanning forward to
 * the next statement boundary and re-parsing from there.
 *
 * Returns the AST from a successful full parse (if any) plus all collected
 * parse errors. For valid programs, errors will be empty and ast will be set.
 *
 * Each error's message contains line/column relative to its sub-parse.
 * The caller must add sourceLineOffset to convert to original document lines.
 */
export function parseWithRecovery(source: string): RecoveryResult {
  // First, try the full source
  try {
    const ast = parse(source);
    return { ast, errors: [] };
  } catch (err) {
    // Fall through to recovery
  }

  const lines = source.split('\n');
  const errors: RecoveryError[] = [];
  let currentLine = 0;
  let attempts = 0;

  while (currentLine < lines.length && attempts < MAX_RECOVERY_ATTEMPTS) {
    attempts++;
    const remainingSource = lines.slice(currentLine).join('\n');

    if (remainingSource.trim() === '') break;

    try {
      parse(remainingSource);
      // This chunk parsed — no more errors from it
      break;
    } catch (err) {
      const message = (err as Error).message;
      errors.push({ message, sourceLineOffset: currentLine });

      // Extract the error line from the message to know where to scan from
      const errorLine = extractErrorLine(message);
      // errorLine is 1-based relative to remainingSource; convert to absolute 0-based
      const absoluteErrorLine = currentLine + (errorLine !== null ? errorLine - 1 : 0);

      // Scan forward from the line AFTER the error to find the next statement boundary
      const nextStatement = findNextStatementBoundary(lines, absoluteErrorLine + 1);
      if (nextStatement === null || nextStatement <= currentLine) {
        // No more recoverable points — we're done
        break;
      }
      currentLine = nextStatement;
    }
  }

  return { ast: null, errors };
}

/**
 * Extract the 1-based line number from a parser error message.
 * Returns null if the line cannot be parsed.
 */
function extractErrorLine(message: string): number | null {
  const match = /at line (\d+)/.exec(message);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Scan forward from startLine to find the next line that looks like
 * the start of a new statement. Returns the 0-based line index, or null
 * if no statement boundary is found.
 */
function findNextStatementBoundary(lines: string[], startLine: number): number | null {
  for (let i = startLine; i < lines.length; i++) {
    if (STATEMENT_START_RE.test(lines[i])) {
      return i;
    }
    // A line starting with `}` followed by content on the next line is also a boundary
    if (/^\s*\}\s*$/.test(lines[i]) && i + 1 < lines.length) {
      // The line after a closing brace might be the start of the next statement
      if (STATEMENT_START_RE.test(lines[i + 1])) {
        return i + 1;
      }
    }
  }
  return null;
}
