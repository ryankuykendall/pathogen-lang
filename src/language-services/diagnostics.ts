import { evaluate } from '../evaluator';
import { ModuleTraceError } from '../evaluator/module-runtime';
import { groupWarnings } from '../evaluator/warning-groups';
import {
  parse,
  detectMissingSemicolon,
  describeBareRange,
  describeCommandShadowing,
  isLegacyStyleOpenerError,
  LEGACY_STYLE_OPENER_MESSAGE,
} from '../parser';
import { describeExportPlacement, describeIncompleteImport, findModuleViolations } from '../parser/module-check';
import { parser as lezerParser } from '../parser/pathogen.generated';
import { findReservedBindings } from '../parser/reserved-bindings';

import type { TextDocument } from './document';
import type { Diagnostic } from './types';
import type { FontRegistry } from '../evaluator/types';
import type { ModuleGraph } from '../host/load-modules';
import { DiagnosticSeverity } from './types';

/**
 * What a host that loaded the document's fonts passes in — with the same
 * loader as the CLI (`resolveFonts`, docs/path-blocks.md § Font Loading by
 * Environment). The VS Code language server does; the playground compiles
 * with its own fonts and reports font problems itself.
 */
export interface DiagnosticsOptions {
  /**
   * The host ran the font loader for this document. Font calls then evaluate
   * as in the CLI — with `registry`, or with none when nothing loaded — so the
   * warnings and errors after them appear too, and `messages` show at their
   * `@font` lines. Without this, an error that only says no fonts were loaded
   * is skipped: the host's own compile decides.
   */
  fonts?: {
    registry?: FontRegistry;
    messages: readonly { severity: 'error' | 'warning'; message: string; line?: number; column?: number }[];
  };
  /**
   * Every file the document imports, read by the host (resolveModules;
   * docs/modules.md). Without it, an import is the no-project-folder error —
   * what the playground shows.
   */
  modules?: ModuleGraph;
}

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
export function getDiagnostics(document: TextDocument, options: DiagnosticsOptions = {}): Diagnostic[] {
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
        return lezerLine === diagLine || lezerLine === diagLine + 1;
      });
      if (isCascade) continue;
      diagnostics.push(lezerError);
    }

    return diagnostics;
  }

  // Phase 2: Lezer found no errors — try parse + evaluate.
  //
  // A declared reserved name (a built-in like `line`, or a unit suffix like
  // `rad`) stops the compile at the first one; the editor lists EVERY one, at
  // its name, so each gets its squiggle and its rename quick fix. Anything
  // else parse() would report (a malformed pattern, a const mistake) is added
  // after them; evaluation waits until the names are fixed. The import rules
  // (module-check.ts: imports first, a name imported or declared twice) are
  // listed the same way.
  const tree = lezerParser.parse(source);
  const reserved = [...findReservedBindings(tree, source), ...findModuleViolations(tree, source)].sort(
    (a, b) => a.offset - b.offset,
  );
  if (reserved.length > 0) {
    for (const r of reserved) {
      diagnostics.push({
        range: { start: document.positionAt(r.offset), end: document.positionAt(r.end) },
        severity: DiagnosticSeverity.Error,
        message: r.message,
        source: 'pathogen-parser',
      });
    }
    try {
      parse(source);
    } catch (err) {
      const message = (err as Error).message;
      if (!reserved.some((r) => message.endsWith(r.message))) {
        const diag = parseParserError(message, document);
        if (diag) diagnostics.push(diag);
      }
    }
    return diagnostics;
  }

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

  // Phase 3: Parse succeeded — report the host's font loading, then evaluate.
  for (const m of options.fonts?.messages ?? []) {
    diagnostics.push({
      range: makeRange(Math.max(0, (m.line ?? 1) - 1), Math.max(0, (m.column ?? 1) - 1), document),
      severity: m.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
      message: m.message,
      source: 'pathogen-fonts',
    });
  }
  //
  // Without a font registry from the host, any program that uses
  // font-requiring constructs (PathBlock.fromGlyph, TextBlock.toPathBlock, …)
  // throws "no fonts were loaded" on this pass — even though the host's real
  // compile (with fonts) may succeed. Such errors are false positives here,
  // so they are skipped (below) rather than masking the host's result.
  try {
    const registry = options.fonts?.registry;
    const result = evaluate(ast, {
      ...(registry ? { fonts: registry } : {}),
      ...(options.modules ? { modules: options.modules } : {}),
    });
    // Non-fatal compiler warnings become Warning diagnostics on their line —
    // one per family (code + position + message with its numbers removed),
    // carrying the count, so a fillet over every glyph contour is one entry in
    // the Problems panel rather than thousands. Warnings without a source line
    // (font aggregates) have nowhere to point.
    for (const group of groupWarnings(result.warnings)) {
      const w = group.first;
      if (w.line == null) continue;
      const line = w.line - 1;
      const character = Math.max(0, (w.column ?? 1) - 1);
      diagnostics.push({
        range: makeRange(line, character, document),
        severity: DiagnosticSeverity.Warning,
        message: group.count > 1 ? `${w.message} (×${group.count} similar)` : w.message,
        source: 'pathogen-evaluator',
      });
    }
  } catch (err) {
    const message = (err as Error).message;
    if (!options.fonts && isFontAvailabilityError(message)) {
      // No fonts from the host: its compile is the source of truth for
      // font-related errors. Skip — surfacing this here would override it.
      return diagnostics;
    }
    // An error in another file: shown where it reaches this one — the call or
    // the import — with the whole trace as its message (docs/modules.md).
    if (err instanceof ModuleTraceError && err.site) {
      diagnostics.push({
        range: makeRange(err.site.line - 1, Math.max(0, (err.site.column ?? 1) - 1), document),
        severity: DiagnosticSeverity.Error,
        message,
        source: 'pathogen-evaluator',
      });
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
  // A legacy `${` opener throws the parser off for the whole block
  // (`stroke-width` reads as `stroke - width`, every `;` is unexpected);
  // one diagnostic at the opener says everything, so the cascade inside the
  // block is suppressed up to its closing brace.
  let suppressUntil = -1;

  do {
    if (cursor.type.isError && cursor.from < suppressUntil) continue;
    if (cursor.type.isError && cursor.from < source.length) {
      if (isLegacyStyleOpenerError(source, cursor.node)) suppressUntil = legacyBlockEnd(source, cursor.from);
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
 * Offset just past the `}` that closes the legacy block opened at `from`.
 * Braces inside quoted strings and backtick templates don't count (a value
 * like `content: "a}b";` must not end the suppression early).
 */
function legacyBlockEnd(source: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      else if (ch === '\n' && quote !== '`') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i + 1;
  }
  return source.length;
}

/** One parse's worth of legacy openers (the first one's cascade can hide later ones). */
function legacyOpenersInOneParse(text: string): number[] {
  const batch: number[] = [];
  let suppressUntil = -1;
  lezerParser.parse(text).iterate({
    enter(node) {
      if (!node.type.isError || node.from < suppressUntil) return;
      if (isLegacyStyleOpenerError(text, node.node)) {
        batch.push(node.from);
        suppressUntil = legacyBlockEnd(text, node.from);
      }
    },
  });
  return batch;
}

/**
 * Every legacy `${` style-block opener in `source`, as offsets of the `$`.
 * Used by the "convert all" code action; iterate to a fixpoint because the
 * first opener's cascade can hide later ones from a single parse.
 */
export function findLegacyStyleOpeners(source: string): number[] {
  const found: number[] = [];
  let text = source;
  for (let round = 0; round < 8; round++) {
    const batch = legacyOpenersInOneParse(text);
    if (batch.length === 0) break;
    found.push(...batch);
    // `$` → `#` is a same-length edit, so offsets stay valid across rounds.
    for (const o of batch) text = `${text.slice(0, o)}#${text.slice(o + 1)}`;
  }
  return found.sort((a, b) => a - b);
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
  // `export M 0 0`, or an import with no path yet: the same message parse()
  // gives, on the keyword.
  const moduleShape = describeExportPlacement(errorNode) ?? describeIncompleteImport(errorNode);
  if (moduleShape) {
    const at = document.positionAt(moduleShape.offset);
    return { message: moduleShape.message, line: at.line, character: at.character };
  }
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

/** Every CST node the switch grammar produces (path and text forms). */
const SWITCH_FAMILY_NODES = new Set([
  'SwitchStatement',
  'TextSwitchStatement',
  'CaseClause',
  'TextCaseClause',
  'DefaultClause',
  'TextDefaultClause',
  'CasePattern',
  'RangePattern',
  'WhereGuard',
  'SwitchExpression',
  'CaseArm',
  'DefaultArm',
]);

const CASE_COLON_MESSAGE = "Case bodies use braces: case value { ... } (no ':' and no fallthrough)";
const DEFAULT_COLON_MESSAGE = "Case bodies use braces: default { ... } (no ':' and no fallthrough)";

/**
 * `case { … }` / `case 1, { … }` / `case v where { … }`: the body's `{` is
 * cover-parsed as an ObjectLiteral (TrailingBlock inside text bodies) that
 * becomes the pattern / guard expression, and the clause ends in an error
 * node because no Block follows. Returns the real-mistake message when the
 * error sits inside such a literal, null otherwise.
 */
function describeMissingCaseHead(errorNode: import('@lezer/common').SyntaxNode): string | null {
  let child: import('@lezer/common').SyntaxNode | null = errorNode;
  let head: import('@lezer/common').SyntaxNode | null = errorNode.parent;
  while (head && head.name !== 'CasePattern' && head.name !== 'WhereGuard') {
    child = head;
    head = head.parent;
  }
  if (!head || !child) return null;
  if (child.name !== 'ObjectLiteral' && child.name !== 'TrailingBlock') return null;
  const after = head.nextSibling;
  if (!after || !after.type.isError) return null;
  return head.name === 'WhereGuard'
    ? "Expected a condition after 'where' — the '{' opened the case body"
    : "Expected a pattern after 'case' — the '{' opened the case body";
}

function describeError(errorNode: import('@lezer/common').SyntaxNode, source: string): string {
  if (isLegacyStyleOpenerError(source, errorNode)) return LEGACY_STYLE_OPENER_MESSAGE;
  // ── Bare range in value position (`let r = 1..5;`, `(1..)`) ──
  // Shared with parse() so the editor squiggle and the compile error agree.
  const bareRange = describeBareRange(source, errorNode);
  if (bareRange) return bareRange.message;
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

  // ── switch keywords outside a switch ──
  // A stray `case` / `where` token surfaces as an error node carrying the
  // keyword text. Inside the switch family the clause branches below own it.
  if (!SWITCH_FAMILY_NODES.has(parentName)) {
    if (errText === 'case') return "'case' is only valid inside a switch";
    if (errText === 'where') return "'where' is only valid after a case pattern";
  }

  // ── Missing case pattern / where condition before '{' ──
  // `case { … }` and `case v where { … }` cover-parse the body's `{` as an
  // ObjectLiteral (or TrailingBlock in text bodies) and the real error lands
  // deep inside it; the clause then has no Block. Detect that shape and
  // describe the actual mistake instead of the cover grammar's noise.
  const missingBeforeBrace = describeMissingCaseHead(errorNode);
  if (missingBeforeBrace) return missingBeforeBrace;

  // ── Trailing block / lambda literal issues ──
  if (parentName === 'TrailingBlock') {
    // Error before the closing '|' (or right after the opening one) is a
    // parameter-list problem: {|a b| ...}, {|a,| ...}, {|1| ...}
    const inParamList = nextName === '|' || prevName === '|' || (prevName === 'VariableName' && next?.name === '|');
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

  // ── Command-letter shadowing in path arguments ──
  // `let m = 25; L m 40` — the bare single letter reads as a command,
  // recovery reparses it as one, and the generic message points at
  // punctuation. The shared detector (also used by parse() for CLI
  // errors) fires only when the letter is a declared variable.
  if (parentName === 'PathCommand' && !errText) {
    const shadow = describeCommandShadowing(source, errorNode);
    if (shadow) return shadow.message;
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
  if (parentName === 'BreakStatement' && !errText) {
    return "Missing ';' after break statement";
  }
  if (parentName === 'ContinueStatement' && !errText) {
    return "Missing ';' after continue statement";
  }

  // ── let declaration issues ──
  if (parentName === 'LetDeclaration') {
    if (prevName === 'VariableName' && !errText) return "Expected '=' after variable name";
    if (prevName === '=' && errText) return `Unexpected '${errText}' in let declaration`;
    if (prev && prev.name === 'ParenExpression' && errText) return `Unexpected '${errText}' after expression`;
    // Fallback with semicolon heuristic
    const semi = detectMissingSemicolon(source, errorNode.from);
    if (semi) return semi.message;
    return 'Invalid let declaration';
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
    if (!errText) return 'Incomplete for loop';
    return `Unexpected '${errText}' in for loop`;
  }

  // ── if statement issues ──
  if (parentName === 'IfStatement') {
    if (errText === '{') return "Expected ')' before '{'";
    if (!errText) return 'Incomplete if statement';
    return `Unexpected '${errText}' in if statement`;
  }

  // ── switch statement issues ──
  if (parentName === 'SwitchStatement' || parentName === 'TextSwitchStatement') {
    if (prevName === 'switch') return "Expected '(' after 'switch'";
    if (errText === '{') return "Expected ')' before '{'";
    if (!errText) return 'Incomplete switch statement';
    return `Unexpected '${errText}' in switch — expected 'case', 'default', or '}'`;
  }
  if (parentName === 'CaseClause' || parentName === 'TextCaseClause') {
    if (prevName === 'case') return "Expected a pattern after 'case'";
    if (errText === ':') return CASE_COLON_MESSAGE;
    if (!errText) return "Expected '{' to open the case body";
    return `Unexpected '${errText}' in case clause`;
  }
  if (parentName === 'DefaultClause' || parentName === 'TextDefaultClause') {
    if (errText === ':') return DEFAULT_COLON_MESSAGE;
    if (!errText) return "Expected '{' after 'default'";
    return `Unexpected '${errText}' after 'default' — expected '{'`;
  }
  // ── Switch expressions (one expression per arm, default required) ──
  if (parentName === 'SwitchExpression') {
    if (prevName === 'switch') return "Expected '(' after 'switch'";
    if (errText === '{') return "Expected ')' before '{'";
    if (errText === 'case' && prevName === 'DefaultArm') return "'default' must be the last arm in a switch expression";
    if (errText === '}' || !errText) {
      // A missing default and a missing closing brace both surface as an
      // empty error node; the presence of a DefaultArm tells them apart.
      return parent?.getChild('DefaultArm')
        ? "Expected '}' to close the switch expression"
        : "A switch expression needs a 'default' arm so it always produces a value";
    }
    return `Unexpected '${errText}' in switch expression — expected 'case', 'default', or '}'`;
  }
  if (parentName === 'CaseArm' || parentName === 'DefaultArm') {
    if (errText === ':') return parentName === 'CaseArm' ? CASE_COLON_MESSAGE : DEFAULT_COLON_MESSAGE;
    if (prevName === 'case' && parentName === 'CaseArm') return "Expected a pattern after 'case'";
    if (errText === '}' || (prevName === '{' && !errText)) return 'Expected an expression inside the arm';
    if (!errText) return "Expected '{' to open the arm";
    return `Unexpected '${errText}' in switch expression arm — one expression per arm (a trailing ';' is fine)`;
  }
  // `case 1: …` — the ':' error node lands inside CasePattern, not CaseClause.
  if (parentName === 'CasePattern' || parentName === 'RangePattern') {
    if (errText === ':') return CASE_COLON_MESSAGE;
    return errText ? `Invalid case pattern — unexpected '${errText}'` : 'Invalid case pattern';
  }
  if (parentName === 'WhereGuard') {
    if (prevName === 'where') return "Expected a condition after 'where'";
    return errText ? `Invalid where guard — unexpected '${errText}'` : 'Invalid where guard';
  }

  // ── Function definition issues ──
  if (parentName === 'FunctionDefinition') {
    if (prevName === ')' && !errText) return "Expected '{' for function body";
    if (!errText) return 'Incomplete function definition';
    return `Unexpected '${errText}' in function definition`;
  }

  // ── Enum issues ──
  if (parentName === 'EnumDefinition') {
    return errText ? `Unexpected '${errText}' in enum` : 'Incomplete enum definition';
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
  const lineEnd =
    clampedLine + 1 < document.lineCount
      ? document.offsetAt({ line: clampedLine + 1, character: 0 }) - 1
      : document.getText().length;
  const lineLength = lineEnd - lineStart;

  return {
    start: { line: clampedLine, character: Math.min(character, lineLength) },
    end: { line: clampedLine, character: lineLength },
  };
}
