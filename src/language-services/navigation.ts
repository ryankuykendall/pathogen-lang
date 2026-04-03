import { analyzeScopes } from './scope-analysis';

import type { TextDocument } from './document';
import type { Position, Range } from './types';

export interface Location {
  range: Range;
}

/**
 * Get the definition location for the symbol at the given position.
 * Returns null for builtins (stdlib, ctx, etc.) since they have no user-authored source.
 */
export function getDefinition(document: TextDocument, position: Position): Location | null {
  const source = document.getText();
  const offset = document.offsetAt(position);
  const word = getWordAt(source, offset);
  if (!word) return null;

  const scopeInfo = analyzeScopes(document);

  // Find a reference at this position that resolves to a declaration
  for (const ref of scopeInfo.references) {
    if (ref.name === word.text && ref.declaration && isPositionInRange(position, ref.range)) {
      return { range: ref.declaration.range };
    }
  }

  // Check if the position is ON a declaration (go-to-def on the definition itself)
  for (const decl of scopeInfo.declarations) {
    if (decl.name === word.text && isPositionInRange(position, decl.range)) {
      return { range: decl.range };
    }
  }

  return null;
}

/**
 * Find all references to the symbol at the given position.
 * Returns references within the same scope chain (respects shadowing).
 */
export function getReferences(
  document: TextDocument,
  position: Position,
  includeDeclaration: boolean = true,
): Location[] {
  const source = document.getText();
  const offset = document.offsetAt(position);
  const word = getWordAt(source, offset);
  if (!word) return [];

  const scopeInfo = analyzeScopes(document);

  // Find which declaration the word at this position refers to
  let targetDecl = null;

  // Check if cursor is on a reference
  for (const ref of scopeInfo.references) {
    if (ref.name === word.text && ref.declaration && isPositionInRange(position, ref.range)) {
      targetDecl = ref.declaration;
      break;
    }
  }

  // Check if cursor is on a declaration
  if (!targetDecl) {
    for (const decl of scopeInfo.declarations) {
      if (decl.name === word.text && isPositionInRange(position, decl.range)) {
        targetDecl = decl;
        break;
      }
    }
  }

  if (!targetDecl) return [];

  const locations: Location[] = [];

  // Include the declaration itself
  if (includeDeclaration) {
    locations.push({ range: targetDecl.range });
  }

  // Find all references that resolve to this specific declaration
  for (const ref of scopeInfo.references) {
    if (ref.declaration === targetDecl) {
      locations.push({ range: ref.range });
    }
  }

  return locations;
}

// --- Helpers ---

interface WordAtPosition {
  text: string;
  start: number;
  end: number;
  range: Range;
}

function getWordAt(source: string, offset: number): WordAtPosition | null {
  let start = offset;
  let end = offset;

  while (start > 0 && /[a-zA-Z0-9_]/.test(source[start - 1])) start--;
  while (end < source.length && /[a-zA-Z0-9_]/.test(source[end])) end++;

  if (start === end) return null;

  const text = source.slice(start, end);
  const lines = source.slice(0, start).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;
  const endLines = source.slice(0, end).split('\n');

  return {
    text,
    start,
    end,
    range: {
      start: { line, character },
      end: { line: endLines.length - 1, character: endLines[endLines.length - 1].length },
    },
  };
}

function isPositionInRange(position: Position, range: Range): boolean {
  // For single-point ranges (loc-based), check if position is on the same line
  // and within a reasonable window (scope analysis loc points to start of statement)
  if (range.start.line === range.end.line && range.start.character === range.end.character) {
    return position.line === range.start.line;
  }
  // For proper ranges, check containment
  if (position.line < range.start.line || position.line > range.end.line) return false;
  if (position.line === range.start.line && position.character < range.start.character) return false;
  if (position.line === range.end.line && position.character > range.end.character) return false;
  return true;
}
