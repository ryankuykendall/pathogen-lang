import { parse } from '../parser';
import { evaluate } from '../evaluator';
import { parseWithRecovery } from './recovery';

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
 * Runs the parser (with multi-error recovery) and evaluator, converting
 * thrown errors into structured Diagnostic objects with 0-based ranges.
 */
export function getDiagnostics(document: TextDocument): Diagnostic[] {
  const source = document.getText();
  const diagnostics: Diagnostic[] = [];

  // Phase 1: Try to parse (with recovery for multiple errors)
  const recovery = parseWithRecovery(source);

  if (recovery.errors.length > 0) {
    // Convert each recovered parse error to a diagnostic
    for (const error of recovery.errors) {
      const diag = parseParserErrorWithOffset(error.message, error.sourceLineOffset, document);
      if (diag) {
        diagnostics.push(diag);
      } else {
        diagnostics.push({
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          severity: DiagnosticSeverity.Error,
          message: error.message,
          source: 'pathogen-parser',
        });
      }
    }
    return diagnostics;
  }

  // Parser succeeded — try to evaluate
  if (recovery.ast) {
    try {
      evaluate(recovery.ast);
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
  }

  return diagnostics;
}

/**
 * Parse a parser error message into a Diagnostic, adjusting line numbers
 * by the sourceLineOffset from recovery.
 */
function parseParserErrorWithOffset(
  message: string,
  sourceLineOffset: number,
  document: TextDocument,
): Diagnostic | null {
  const match = PARSE_ERROR_RE.exec(message);
  if (!match) return null;

  // Parser lines are 1-based relative to the sub-parse.
  // Add sourceLineOffset and convert to 0-based.
  const line = parseInt(match[1], 10) - 1 + sourceLineOffset;
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
