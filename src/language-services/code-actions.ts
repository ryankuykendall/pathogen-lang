import { STATEMENT_BUILTINS } from '../evaluator/constructor-registry';
import { LEGACY_STYLE_OPENER_MESSAGE } from '../parser';
import { stdlib, contextAwareFunctions } from '../stdlib';
import { findLegacyStyleOpeners } from './diagnostics';
import { analyzeScopes } from './scope-analysis';

import type { TextDocument } from './document';
import type { Range, Diagnostic } from './types';

export interface CodeAction {
  title: string;
  kind: 'quickfix' | 'refactor.extract' | 'refactor.inline';
  diagnostics: Diagnostic[];
  edit: WorkspaceEdit;
}

export interface WorkspaceEdit {
  changes: TextEdit[];
}

export interface TextEdit {
  range: Range;
  newText: string;
}

// All known identifiers for fuzzy matching
const ALL_KNOWN_NAMES = new Set([
  ...Object.keys(stdlib),
  ...contextAwareFunctions,
  ...STATEMENT_BUILTINS,
  'ctx',
  'Object',
  'Color',
  'PathBlock',
  'Point',
  'PolarVector',
  'Cycler',
  'CSSVar',
  'PathLayer',
  'TextLayer',
  'GroupLayer',
  'Easing',
  'Interpolation',
  'SpreadMethod',
  'GradientUnits',
  'Direction',
  'ConicSpread',
  'InnerFill',
  'TopoMethod',
  'BBoxAnchor',
  'GridPatternType',
  'true',
  'false',
  'null',
]);

/**
 * Get code actions (quick fixes) for the given diagnostics.
 */
export function getCodeActions(document: TextDocument, _range: Range, diagnostics: Diagnostic[]): CodeAction[] {
  const actions: CodeAction[] = [];
  let offeredConvertAll = false;

  for (const diag of diagnostics) {
    // Legacy `${` style-block opener — change this one, or every one at once
    if (diag.message === LEGACY_STYLE_OPENER_MESSAGE) {
      actions.push(legacyStyleOpenerFix(diag));
      if (!offeredConvertAll) {
        const all = convertAllLegacyStyleOpeners(document);
        if (all) actions.push(all);
        offeredConvertAll = true;
      }
    }

    // Missing semicolon fix
    if (diag.message.includes("Missing ';'")) {
      const fix = missingSemicolonFix(document, diag);
      if (fix) actions.push(fix);
    }

    // Undefined variable — suggest closest match
    const undefMatch = diag.message.match(/^Undefined variable: (\w+)$/);
    if (undefMatch) {
      const fixes = undefinedVariableFixes(document, diag, undefMatch[1]);
      actions.push(...fixes);
    }

    // Command-letter shadowing — wrap the variable in calc()
    const shadowMatch = diag.message.match(/^'(\w)' is a path command here/);
    if (shadowMatch) {
      const fix = wrapInCalcFix(document, diag, shadowMatch[1]);
      if (fix) actions.push(fix);
    }
  }

  return actions;
}

/**
 * The shadowing diagnostic's range starts exactly at the offending
 * letter (the detector points there), so the edit replaces that single
 * character with `calc(X)`.
 */
function wrapInCalcFix(document: TextDocument, diag: Diagnostic, letter: string): CodeAction | null {
  const { line, character } = diag.range.start;
  const lineText = document.getText().split('\n')[line] ?? '';
  if (lineText[character] !== letter) return null;
  return {
    title: `Wrap in calc(): calc(${letter})`,
    kind: 'quickfix',
    diagnostics: [diag],
    edit: {
      changes: [
        {
          range: { start: { line, character }, end: { line, character: character + 1 } },
          newText: `calc(${letter})`,
        },
      ],
    },
  };
}

/**
 * Get refactoring actions for a selection range (extract variable, extract function, inline).
 * Called when the user selects text and triggers the lightbulb / Cmd+.
 */
export function getRefactorActions(document: TextDocument, range: Range): CodeAction[] {
  const actions: CodeAction[] = [];
  const source = document.getText();
  const lines = source.split('\n');

  // Only offer refactors when there's a non-empty selection
  if (range.start.line === range.end.line && range.start.character === range.end.character) {
    return actions;
  }

  // Extract the selected text
  const selectedText = getTextInRange(lines, range).trim();
  if (!selectedText) return actions;

  // Extract Variable: offer when selection looks like an expression (not a statement block)
  if (isExtractableExpression(selectedText)) {
    const varName = suggestVariableName(selectedText);
    const insertLine = range.start.line;
    const indent = lines[insertLine].match(/^(\s*)/)?.[1] ?? '';

    actions.push({
      title: `Extract to variable '${varName}'`,
      kind: 'refactor.extract',
      diagnostics: [],
      edit: {
        changes: [
          // Insert let declaration before the current line
          {
            range: {
              start: { line: insertLine, character: 0 },
              end: { line: insertLine, character: 0 },
            },
            newText: `${indent}let ${varName} = ${selectedText};\n`,
          },
          // Replace selection with the variable name
          {
            range,
            newText: varName,
          },
        ],
      },
    });
  }

  // Extract Function: offer when selection spans multiple lines or is a statement block
  if (isExtractableBlock(selectedText, lines, range)) {
    const fnName = 'extracted';
    const indent = lines[range.start.line].match(/^(\s*)/)?.[1] ?? '';

    // Find free variables in the selection that would become parameters
    const freeVars = findFreeVariables(selectedText, source, range);
    const params = freeVars.join(', ');

    // Build the function definition
    const bodyLines = selectedText
      .split('\n')
      .map((l) => {
        // Re-indent body to one level
        const stripped = l.replace(/^\s*/, '');
        return stripped ? `  ${stripped}` : '';
      })
      .filter(Boolean);
    const fnBody = bodyLines.join('\n');

    // Insert function before the current block, and replace selection with call
    actions.push({
      title: `Extract to function '${fnName}'`,
      kind: 'refactor.extract',
      diagnostics: [],
      edit: {
        changes: [
          // Insert fn definition before the selection's line
          {
            range: {
              start: { line: range.start.line, character: 0 },
              end: { line: range.start.line, character: 0 },
            },
            newText: `${indent}fn ${fnName}(${params}) {\n${fnBody}\n${indent}}\n\n`,
          },
          // Replace selection with function call
          {
            range,
            newText: `${indent}${fnName}(${params});`,
          },
        ],
      },
    });
  }

  // Inline Variable: offer when selection is a single variable name that has a let declaration
  if (/^\w+$/.test(selectedText)) {
    const inlineAction = inlineVariableAction(document, selectedText, range);
    if (inlineAction) actions.push(inlineAction);
  }

  return actions;
}

/**
 * Check if selected text looks like an expression (not a statement).
 */
function isExtractableExpression(text: string): boolean {
  // Must not contain newlines, semicolons, or block braces (those are statements)
  if (text.includes('\n') || text.includes(';') || text.includes('{')) return false;
  // Must not be a bare keyword
  if (/^(let|for|if|fn|return|define|enum)\b/.test(text)) return false;
  // Must have some substance (not just a single identifier — extracting 'x' to 'let y = x' isn't useful)
  if (/^\w+$/.test(text)) return false;
  // Should look like an expression: function call, calc, member access, binary op, etc.
  return text.length >= 3;
}

/**
 * Check if selected text is extractable as a function.
 */
function isExtractableBlock(text: string, _lines: string[], range: Range): boolean {
  // Must span at least 2 lines or contain a semicolon (statement)
  if (range.end.line - range.start.line < 1 && !text.includes(';')) return false;
  // Must not be inside a single expression
  return text.length >= 10;
}

/**
 * Suggest a variable name from the selected expression.
 */
function suggestVariableName(expr: string): string {
  // If it's a function call, use the function name
  const callMatch = expr.match(/^(\w+)\s*\(/);
  if (callMatch) return callMatch[1] + 'Result';
  // If it's a calc expression, use 'calculated'
  if (expr.startsWith('calc(')) return 'calculated';
  // If it's a method call, use the method name
  const methodMatch = expr.match(/\.(\w+)\s*\(/);
  if (methodMatch) return methodMatch[1] + 'Result';
  // Default
  return 'extracted';
}

/**
 * Names that can never be a free variable of an extracted selection: every
 * grammar keyword (checked against the grammar by tests/keyword-registry.test.ts),
 * literals, and stdlib / context-aware function names.
 */
export const RESERVED_IDENTIFIERS: ReadonlySet<string> = new Set([
  'let',
  'for',
  'if',
  'else',
  'fn',
  'return',
  'define',
  'default',
  'enum',
  'in',
  'break',
  'continue',
  'switch',
  'case',
  'where',
  'with',
  'as',
  'ViewBox',
  'true',
  'false',
  'null',
  'calc',
  'log',
  'text',
  'tspan',
  'layer',
  'apply',
  ...Object.keys(stdlib),
  ...contextAwareFunctions,
]);

/**
 * Find variables used in the selection that are defined outside it.
 */
function findFreeVariables(selectedText: string, fullSource: string, range: Range): string[] {
  // Extract all identifiers from the selection
  const identifiers = new Set<string>();
  const idPattern = /\b([a-zA-Z_]\w*)\b/g;
  let m;
  while ((m = idPattern.exec(selectedText)) !== null) {
    identifiers.add(m[1]);
  }

  // Remove keywords, stdlib, and language constructs
  for (const r of RESERVED_IDENTIFIERS) identifiers.delete(r);

  // Keep only variables that appear in declarations before the selection
  const beforeSelection = fullSource.split('\n').slice(0, range.start.line).join('\n');
  const freeVars: string[] = [];
  for (const id of identifiers) {
    if (
      new RegExp(`\\blet\\s+${escapeRegex(id)}\\b`).test(beforeSelection) ||
      new RegExp(`\\bfn\\s+${escapeRegex(id)}\\b`).test(beforeSelection) ||
      new RegExp(`\\bfor\\s*\\(\\s*${escapeRegex(id)}\\b`).test(beforeSelection)
    ) {
      freeVars.push(id);
    }
  }
  return freeVars;
}

/**
 * Create an inline variable action: replace all references with the value.
 */
function inlineVariableAction(document: TextDocument, varName: string, _range: Range): CodeAction | null {
  const source = document.getText();
  const esc = escapeRegex(varName);

  // Find the let declaration
  const declMatch = new RegExp(`(^|\\n)([ \\t]*)let\\s+${esc}\\s*=\\s*([^;]+);`, 'm').exec(source);
  if (!declMatch) return null;

  const value = declMatch[3].trim();
  const declLine = source.slice(0, declMatch.index + declMatch[1].length).split('\n').length - 1;

  // Find all references to this variable (simple word-boundary matches)
  const lines = source.split('\n');
  const changes: TextEdit[] = [];

  // Remove the let declaration line
  changes.push({
    range: {
      start: { line: declLine, character: 0 },
      end: { line: declLine + 1, character: 0 },
    },
    newText: '',
  });

  // Replace each reference (skip the declaration itself)
  const refPattern = new RegExp(`\\b${esc}\\b`, 'g');
  for (let i = 0; i < lines.length; i++) {
    if (i === declLine) continue; // Skip the declaration line
    let refMatch;
    while ((refMatch = refPattern.exec(lines[i])) !== null) {
      // Don't replace inside let declarations of other variables
      if (lines[i].trimStart().startsWith('let ') && refMatch.index < lines[i].indexOf('=')) continue;
      changes.push({
        range: {
          start: { line: i, character: refMatch.index },
          end: { line: i, character: refMatch.index + varName.length },
        },
        newText: value,
      });
    }
  }

  if (changes.length <= 1) return null; // Only the declaration removal, no references found

  return {
    title: `Inline variable '${varName}'`,
    kind: 'refactor.inline',
    diagnostics: [],
    edit: { changes },
  };
}

/**
 * Get text content within a range from a lines array.
 */
function getTextInRange(lines: string[], range: Range): string {
  if (range.start.line === range.end.line) {
    return lines[range.start.line]?.slice(range.start.character, range.end.character) ?? '';
  }
  const result: string[] = [];
  result.push(lines[range.start.line]?.slice(range.start.character) ?? '');
  for (let i = range.start.line + 1; i < range.end.line; i++) {
    result.push(lines[i] ?? '');
  }
  result.push(lines[range.end.line]?.slice(0, range.end.character) ?? '');
  return result.join('\n');
}

/** Quick fix: replace the `$` of one legacy `${` opener with `#`. */
function legacyStyleOpenerFix(diag: Diagnostic): CodeAction {
  const { line, character } = diag.range.start;
  return {
    title: "Change '${' to '#{'",
    kind: 'quickfix',
    diagnostics: [diag],
    edit: {
      changes: [
        {
          range: { start: { line, character }, end: { line, character: character + 1 } },
          newText: '#',
        },
      ],
    },
  };
}

/**
 * Quick fix: replace every legacy `${` opener in the document. Openers are
 * found by the parser (iterated to a fixpoint in findLegacyStyleOpeners),
 * never by a text scan, so interpolations are untouched.
 */
function convertAllLegacyStyleOpeners(document: TextDocument): CodeAction | null {
  const offsets = findLegacyStyleOpeners(document.getText());
  if (offsets.length === 0) return null;
  return {
    title: `Convert all legacy '\${' style blocks to '#{' (${offsets.length})`,
    kind: 'quickfix',
    diagnostics: [],
    edit: {
      changes: offsets.map((offset) => {
        const pos = document.positionAt(offset);
        return {
          range: { start: pos, end: { line: pos.line, character: pos.character + 1 } },
          newText: '#',
        };
      }),
    },
  };
}

/**
 * Quick fix: add missing semicolon at the end of the diagnostic line.
 */
function missingSemicolonFix(document: TextDocument, diag: Diagnostic): CodeAction | null {
  const line = diag.range.start.line;
  const source = document.getText();
  const lines = source.split('\n');
  if (line < 0 || line >= lines.length) return null;

  const lineText = lines[line];
  const endChar = lineText.length;

  return {
    title: "Add missing ';'",
    kind: 'quickfix',
    diagnostics: [diag],
    edit: {
      changes: [
        {
          range: {
            start: { line, character: endChar },
            end: { line, character: endChar },
          },
          newText: ';',
        },
      ],
    },
  };
}

/**
 * Quick fix: suggest closest-matching identifier for undefined variable.
 */
function undefinedVariableFixes(document: TextDocument, diag: Diagnostic, name: string): CodeAction[] {
  const actions: CodeAction[] = [];

  // Collect user-defined names from scope analysis
  const scopeInfo = analyzeScopes(document);
  const userNames = new Set(scopeInfo.declarations.map((d) => d.name));
  const allNames = new Set([...ALL_KNOWN_NAMES, ...userNames]);

  // Find closest matches by Levenshtein distance
  const suggestions = findClosestMatches(name, allNames, 3);

  for (const suggestion of suggestions) {
    // Create a text edit that replaces the identifier on the diagnostic line
    const line = diag.range.start.line;
    const source = document.getText();
    const lines = source.split('\n');
    if (line < 0 || line >= lines.length) continue;

    const lineText = lines[line];
    const re = new RegExp(`\\b${escapeRegex(name)}\\b`);
    const match = re.exec(lineText);
    if (!match) continue;

    actions.push({
      title: `Did you mean '${suggestion}'?`,
      kind: 'quickfix',
      diagnostics: [diag],
      edit: {
        changes: [
          {
            range: {
              start: { line, character: match.index },
              end: { line, character: match.index + name.length },
            },
            newText: suggestion,
          },
        ],
      },
    });
  }

  return actions;
}

/**
 * Find the closest matching strings by Levenshtein distance.
 * Returns up to `maxResults` matches with distance <= 3.
 */
function findClosestMatches(target: string, candidates: Set<string>, maxResults: number): string[] {
  const scored: Array<{ name: string; distance: number }> = [];

  for (const name of candidates) {
    if (name === target) continue;
    const dist = levenshtein(target.toLowerCase(), name.toLowerCase());
    if (dist <= 3) {
      scored.push({ name, distance: dist });
    }
  }

  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, maxResults).map((s) => s.name);
}

/**
 * Simple Levenshtein distance (for short strings).
 */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
