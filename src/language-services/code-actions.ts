import { stdlib, contextAwareFunctions } from '../stdlib';
import { analyzeScopes } from './scope-analysis';

import type { TextDocument } from './document';
import type { Range, Diagnostic } from './types';

export interface CodeAction {
  title: string;
  kind: 'quickfix';
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
  'ctx', 'Object', 'Color', 'PathBlock', 'Point', 'PolarVector', 'Cycler', 'CSSVar',
  'PathLayer', 'TextLayer', 'GroupLayer',
  'Easing', 'Interpolation', 'SpreadMethod', 'GradientUnits', 'Direction',
  'ConicSpread', 'InnerFill', 'TopoMethod', 'BBoxAnchor', 'GridPatternType',
  'true', 'false', 'null',
]);

/**
 * Get code actions (quick fixes) for the given diagnostics.
 */
export function getCodeActions(document: TextDocument, _range: Range, diagnostics: Diagnostic[]): CodeAction[] {
  const actions: CodeAction[] = [];

  for (const diag of diagnostics) {
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
  }

  return actions;
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
      changes: [{
        range: {
          start: { line, character: endChar },
          end: { line, character: endChar },
        },
        newText: ';',
      }],
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
        changes: [{
          range: {
            start: { line, character: match.index },
            end: { line, character: match.index + name.length },
          },
          newText: suggestion,
        }],
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
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
