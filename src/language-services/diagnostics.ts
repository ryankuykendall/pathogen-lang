import { parse } from '../parser';
import { evaluate } from '../evaluator';
import { parser as lezerParser } from '../parser/pathogen.generated';

import type { TextDocument } from './document';
import type { Diagnostic } from './types';
import { DiagnosticSeverity } from './types';

// Parser error: "Parse error at line {line}, column {column}: {message}"
const PARSE_ERROR_RE = /^Parse error at line (\d+), column (\d+): (.+)$/;

// Evaluator error: "Line {line}, col {column}: {message}" or "Line {line}: {message}"
const EVAL_ERROR_LINE_COL_RE = /^Line (\d+), col (\d+): (.+)$/;
const EVAL_ERROR_LINE_RE = /^Line (\d+): (.+)$/;

/**
 * Get diagnostics (errors/warnings) for a Pathogen source document.
 *
 * Uses the Lezer parser's built-in error recovery to detect multiple parse
 * errors in a single pass. Falls back to Parsimmon for detailed error messages
 * and for evaluator error detection.
 */
export function getDiagnostics(document: TextDocument): Diagnostic[] {
  const source = document.getText();
  const diagnostics: Diagnostic[] = [];

  // Phase 1: Use Lezer's error recovery to find parse error positions.
  // Lezer continues parsing after errors, so we get all error locations.
  const lezerErrors = findLezerErrors(source, document);

  if (lezerErrors.length > 0) {
    // Try Parsimmon for a detailed error message for the first error
    try {
      parse(source);
    } catch (err) {
      const message = (err as Error).message;
      const diag = parseParserError(message, document);
      if (diag) {
        diagnostics.push(diag);
      }
    }

    // Add Lezer error positions that don't overlap with the Parsimmon error
    for (const lezerError of lezerErrors) {
      // Skip if we already have an error on the same line
      if (diagnostics.some((d) => d.range.start.line === lezerError.range.start.line)) continue;
      diagnostics.push(lezerError);
    }

    return diagnostics;
  }

  // Phase 2: Lezer found no errors — try Parsimmon parse + evaluate.
  let ast;
  try {
    ast = parse(source);
  } catch (err) {
    // Parsimmon found an error that Lezer didn't (edge case — Lezer is more lenient)
    const message = (err as Error).message;
    const diag = parseParserError(message, document);
    if (diag) {
      diagnostics.push(diag);
    } else {
      diagnostics.push({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        severity: DiagnosticSeverity.Error,
        message,
        source: 'pathogen-parser',
      });
    }
    return diagnostics;
  }

  // Phase 3: Parse succeeded — try to evaluate
  try {
    evaluate(ast);
  } catch (err) {
    const message = (err as Error).message;
    const diag = parseEvaluatorError(message, document);
    if (diag) {
      diagnostics.push(diag);
    } else {
      diagnostics.push({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        severity: DiagnosticSeverity.Error,
        message,
        source: 'pathogen-evaluator',
      });
    }
  }

  return diagnostics;
}

/**
 * Use the Lezer parser to find error positions via built-in error recovery.
 * Returns at most one error per line to avoid noise from cascading errors.
 */
function findLezerErrors(source: string, document: TextDocument): Diagnostic[] {
  const tree = lezerParser.parse(source);
  const cursor = tree.cursor();
  const errors: Diagnostic[] = [];
  const seenLines = new Set<number>();

  do {
    if (cursor.type.isError && cursor.from < source.length) {
      const pos = document.positionAt(cursor.from);
      // Deduplicate: one error per line
      if (!seenLines.has(pos.line)) {
        seenLines.add(pos.line);
        errors.push({
          range: makeRange(pos.line, pos.character, document),
          severity: DiagnosticSeverity.Error,
          message: 'Syntax error',
          source: 'pathogen-parser',
        });
      }
    }
  } while (cursor.next());

  return errors;
}

/**
 * Parse a Parsimmon parser error message into a structured Diagnostic.
 */
function parseParserError(message: string, document: TextDocument): Diagnostic | null {
  const match = PARSE_ERROR_RE.exec(message);
  if (!match) return null;

  const line = parseInt(match[1], 10) - 1;
  const col = parseInt(match[2], 10) - 1;
  const errorMessage = match[3];

  return {
    range: makeRange(line, col, document),
    severity: DiagnosticSeverity.Error,
    message: errorMessage,
    source: 'pathogen-parser',
  };
}

/**
 * Parse an evaluator error message into a structured Diagnostic.
 */
function parseEvaluatorError(message: string, document: TextDocument): Diagnostic | null {
  let match = EVAL_ERROR_LINE_COL_RE.exec(message);
  if (match) {
    const line = parseInt(match[1], 10) - 1;
    const col = parseInt(match[2], 10) - 1;
    const errorMessage = match[3];
    return {
      range: makeRange(line, col, document),
      severity: DiagnosticSeverity.Error,
      message: errorMessage,
      source: 'pathogen-evaluator',
    };
  }

  match = EVAL_ERROR_LINE_RE.exec(message);
  if (match) {
    const line = parseInt(match[1], 10) - 1;
    const errorMessage = match[2];
    return {
      range: makeRange(line, 0, document),
      severity: DiagnosticSeverity.Error,
      message: errorMessage,
      source: 'pathogen-evaluator',
    };
  }

  return null;
}

/**
 * Create a Range highlighting from the error position to the end of the line.
 */
function makeRange(
  line: number,
  character: number,
  document: TextDocument,
): { start: { line: number; character: number }; end: { line: number; character: number } } {
  const clampedLine = Math.max(0, Math.min(line, document.lineCount - 1));
  const lineStart = document.offsetAt({ line: clampedLine, character: 0 });
  const lineEnd = clampedLine + 1 < document.lineCount
    ? document.offsetAt({ line: clampedLine + 1, character: 0 }) - 1
    : document.getText().length;
  const lineLength = lineEnd - lineStart;

  return {
    start: { line: clampedLine, character: Math.min(character, lineLength) },
    end: { line: clampedLine, character: lineLength },
  };
}
