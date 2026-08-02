import { parse, detectMissingSemicolon } from '../parser';
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
    // Filter cascade errors: Lezer errors on the same line as a prior
    // diagnostic are duplicates; errors on the immediately next line are
    // usually cascade noise from the parser not recovering cleanly.
    for (const lezerError of lezerErrors) {
      const lezerLine = lezerError.range.start.line;
      const isCascade = diagnostics.some((d) => {
        const diagLine = d.range.start.line;
        return lezerLine === diagLine || (lezerLine === diagLine + 1);
      });
      if (isCascade) continue;
      diagnostics.push(lezerError);
    }

    return diagnostics;
  }

  // Phase 2: Lezer found no errors — try parse + evaluate.
  let ast;
  try {
    ast = parse(source);
  } catch (err) {
    // parse() found an error that Lezer didn't (edge case — Lezer is more lenient)
    let message = (err as Error).message;

    // Improve message for incomplete member access: if the error is right after a '.',
    // the user is typing a property/method name — give a helpful message
    const locMatch = message.match(/at line (\d+), column (\d+)/);
    if (locMatch && message.includes("Missing ';'")) {
      const errLine = parseInt(locMatch[1], 10);
      const errCol = parseInt(locMatch[2], 10);
      const lines = source.split('\n');
      if (errLine >= 1 && errLine <= lines.length) {
        const lineText = lines[errLine - 1];
        // Check if the character before the error position is a dot
        const charBefore = lineText[errCol - 2]; // errCol is 1-based, so -2 to get char before
        if (charBefore === '.') {
          const beforeDot = lineText.slice(0, errCol - 2).trim();
          const varMatch = beforeDot.match(/(\w+)$/);
          const varName = varMatch ? varMatch[1] : 'expression';
          message = `Parse error at line ${errLine}, column ${errCol}: Expected property or method name after '${varName}.'`;
        }
      }
    }

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

  // Phase 3: Parse succeeded — try to evaluate.
  //
  // We pass no font registry here, so any program that uses font-requiring
  // constructs (PathBlock.fromGlyph, TextBlock.toPathBlock, …) will throw
  // "no fonts were loaded" on this fontless pass — even though the host's
  // real compile (with fonts) may have succeeded in the worker. Such errors
  // are language-services false positives, not real user errors. Filter
  // them out so they don't mask the host's authoritative result.
  try {
    evaluate(ast);
  } catch (err) {
    const message = (err as Error).message;
    if (isFontAvailabilityError(message)) {
      // The host compile is the source of truth for font-related diagnostics.
      // Skip — surfacing this here would override the real error/success.
      return diagnostics;
    }
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
 * Recognize errors that fire only because the language-services evaluator
 * runs without a font registry. A real host compile with fonts would not
 * throw these.
 */
function isFontAvailabilityError(message: string): boolean {
  return (
    message.includes('no fonts were loaded') ||
    message.includes('requires fonts to be loaded') ||
    message.includes('Available fonts: none')
  );
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
      const { message, line, character } = describeErrorWithPosition(cursor.node, source, document);
      // Deduplicate: one error per line
      if (!seenLines.has(line)) {
        seenLines.add(line);
        errors.push({
          range: makeRange(line, character, document),
          severity: DiagnosticSeverity.Error,
          message,
          source: 'pathogen-parser',
        });
      }
    }
  } while (cursor.next());

  return errors;
}

/**
 * Generate a contextual error message and adjusted position from the Lezer
 * error node's location in the partially-recovered parse tree.
 * For missing-semicolon errors, the position is adjusted to point at the end
 * of the unterminated statement rather than the start of the next token.
 */
function describeErrorWithPosition(
  errorNode: import('@lezer/common').SyntaxNode,
  source: string,
  document: TextDocument,
): { message: string; line: number; character: number } {
  const defaultPos = document.positionAt(errorNode.from);
  const message = describeError(errorNode, source);

  // For missing-semicolon errors, use detectMissingSemicolon to get the
  // correct position (end of unterminated statement, not start of next token)
  if (message.startsWith("Missing ';'")) {
    const semi = detectMissingSemicolon(source, errorNode.from);
    if (semi) {
      // detectMissingSemicolon returns 1-based line/column; convert to 0-based
      return { message, line: semi.line - 1, character: semi.column - 1 };
    }
  }

  return { message, line: defaultPos.line, character: defaultPos.character };
}

function describeError(errorNode: import('@lezer/common').SyntaxNode, source: string): string {
  const parent = errorNode.parent;
  const prev = errorNode.prevSibling;
  const next = errorNode.nextSibling;
  const parentName = parent?.name ?? '';
  const prevName = prev?.name ?? '';
  const nextName = next?.name ?? '';
  const errText = source.slice(errorNode.from, Math.min(errorNode.to, errorNode.from + 30)).trim();

  // ── Incomplete member access (bg.) ──
  // When the previous sibling is '.', the user is typing a member name
  if (prevName === '.' && prev) {
    // Find what's before the dot
    const dotPos = prev.from;
    const beforeDot = source.slice(Math.max(0, dotPos - 40), dotPos).trim();
    const varMatch = beforeDot.match(/(\w+)$/);
    const varName = varMatch ? varMatch[1] : 'expression';
    return `Expected property or method name after '${varName}.'`;
  }

  // ── Trailing block / lambda literal issues ──
  if (parentName === 'TrailingBlock') {
    // Error before the closing '|' (or right after the opening one) is a
    // parameter-list problem: {|a b| ...}, {|a,| ...}, {|1| ...}
    const inParamList = nextName === '|' || prevName === '|' ||
      (prevName === 'VariableName' && next?.name === '|');
    if (errText && inParamList) {
      return `Unexpected '${errText}' in block parameters — parameters are names separated by commas: {|a, b| ... }`;
    }
    if (prevName === '{' && !errText) {
      return "Expected block parameters after '{' — use {|a, b| ... }, or {|| ... } for zero parameters";
    }
    if (!errText) {
      return "Expected '}' to close the block — {|params| statements }";
    }
    return `Unexpected '${errText}' in block body`;
  }

  // ── Missing semicolon patterns ──
  // LetDeclaration: previous is a value expression, no ';' follows
  if (parentName === 'LetDeclaration' && prevName && !nextName && !errText) {
    if (prevName === '=') return "Expected expression after '='";
    if (prevName === 'VariableName' || prevName === 'let') return "Expected '=' after variable name";
    return "Missing ';' after let declaration";
  }
  // ExpressionStatement: previous is an expression, no ';'
  if (parentName === 'ExpressionStatement' && !errText) {
    return "Missing ';' after expression";
  }
  // ReturnStatement missing ';'
  if (parentName === 'ReturnStatement' && !errText) {
    return "Missing ';' after return statement";
  }

  // ── let declaration issues ──
  if (parentName === 'LetDeclaration') {
    if (prevName === 'VariableName' && !errText) return "Expected '=' after variable name";
    if (prevName === '=' && errText) return `Unexpected '${errText}' in let declaration`;
    if (prev && prev.name === 'ParenExpression' && errText) return `Unexpected '${errText}' after expression`;
    // Fallback with semicolon heuristic
    const semi = detectMissingSemicolon(source, errorNode.from);
    if (semi) return semi.message;
    return "Invalid let declaration";
  }

  // ── Unclosed / mismatched blocks ──
  if (parentName === 'Block' && !errText) {
    return "Expected '}' to close block";
  }
  if (parentName === 'TextBlock' && !errText) {
    return "Expected '}' to close text block";
  }

  // ── for loop issues ──
  if (parentName === 'ForLoop' || parentName === 'ForEachLoop') {
    if (errText === '{') return "Expected ')' before '{'";
    if (!errText) return "Incomplete for loop";
    return `Unexpected '${errText}' in for loop`;
  }

  // ── if statement issues ──
  if (parentName === 'IfStatement') {
    if (errText === '{') return "Expected ')' before '{'";
    if (!errText) return "Incomplete if statement";
    return `Unexpected '${errText}' in if statement`;
  }

  // ── Function definition issues ──
  if (parentName === 'FunctionDefinition') {
    if (prevName === ')' && !errText) return "Expected '{' for function body";
    if (!errText) return "Incomplete function definition";
    return `Unexpected '${errText}' in function definition`;
  }

  // ── Enum issues ──
  if (parentName === 'EnumDefinition') {
    return errText ? `Unexpected '${errText}' in enum` : "Incomplete enum definition";
  }

  // ── Unexpected token with text ──
  if (errText) {
    // Check for common unexpected tokens
    if (errText === '}') return "Unexpected '}'";
    if (errText === ')') return "Unexpected ')'";
    if (errText === ']') return "Unexpected ']'";
    return `Unexpected '${errText}'`;
  }

  // ── Fallback: use semicolon heuristic ──
  const semi = detectMissingSemicolon(source, errorNode.from);
  if (semi) return semi.message;

  return 'Syntax error';
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
