import { analyzeScopes } from './scope-analysis';

import type { TextDocument } from './document';
import type { Position, Range } from './types';

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface PrepareRenameResult {
  range: Range;
  placeholder: string;
}

// Keywords and builtins that cannot be renamed
const NON_RENAMEABLE = new Set([
  'let', 'for', 'in', 'if', 'else', 'fn', 'return', 'define', 'default',
  'layer', 'apply', 'text', 'tspan', 'null', 'true', 'false', 'enum',
  'calc', 'log', 'ctx', 'Object', 'Color', 'PathBlock',
  'PathLayer', 'TextLayer', 'GroupLayer',
  // stdlib
  'circle', 'rect', 'roundRect', 'polygon', 'star', 'line', 'arc',
  'quadratic', 'cubic', 'moveTo', 'lineTo', 'closePath',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'lerp', 'clamp', 'map', 'PI', 'TAU', 'E',
  'floor', 'ceil', 'round', 'abs', 'min', 'max', 'sqrt', 'pow',
  'random', 'randomRange', 'deg', 'rad',
  'polarPoint', 'polarOffset', 'polarMove', 'polarLine',
  'arcFromCenter', 'arcFromPolarOffset', 'tangentLine', 'tangentArc',
  'heading', 'turn', 'Point', 'PolarVector', 'Cycler', 'CSSVar',
]);

/**
 * Check if the symbol at position can be renamed.
 * Returns the current name and range, or null if not renameable.
 */
export function prepareRename(document: TextDocument, position: Position): PrepareRenameResult | null {
  const source = document.getText();
  const offset = document.offsetAt(position);
  const word = getWordAt(source, offset);
  if (!word) return null;
  if (NON_RENAMEABLE.has(word.text)) return null;

  // Must resolve to a user declaration
  const scopeInfo = analyzeScopes(document);
  for (const ref of scopeInfo.references) {
    if (ref.name === word.text && ref.declaration && isOnLine(position, ref.range)) {
      return { range: word.range, placeholder: word.text };
    }
  }
  for (const decl of scopeInfo.declarations) {
    if (decl.name === word.text && isOnLine(position, decl.range)) {
      return { range: word.range, placeholder: word.text };
    }
  }

  return null;
}

/**
 * Compute text edits to rename the symbol at position to newName.
 * Returns edits for the declaration and all references in the same scope chain.
 */
export function getRenameEdits(document: TextDocument, position: Position, newName: string): TextEdit[] {
  const source = document.getText();
  const offset = document.offsetAt(position);
  const word = getWordAt(source, offset);
  if (!word) return [];
  if (NON_RENAMEABLE.has(word.text)) return [];

  const scopeInfo = analyzeScopes(document);

  // Find the target declaration
  let targetDecl = null;
  for (const ref of scopeInfo.references) {
    if (ref.name === word.text && ref.declaration && isOnLine(position, ref.range)) {
      targetDecl = ref.declaration;
      break;
    }
  }
  if (!targetDecl) {
    for (const decl of scopeInfo.declarations) {
      if (decl.name === word.text && isOnLine(position, decl.range)) {
        targetDecl = decl;
        break;
      }
    }
  }
  if (!targetDecl) return [];

  const edits: TextEdit[] = [];

  // Rename the declaration
  const declWordRange = findWordRangeOnLine(source, document, targetDecl.range.start.line, targetDecl.name);
  if (declWordRange) {
    edits.push({ range: declWordRange, newText: newName });
  }

  // Rename all references to this declaration
  for (const ref of scopeInfo.references) {
    if (ref.declaration === targetDecl) {
      const refWordRange = findWordRangeOnLine(source, document, ref.range.start.line, ref.name);
      if (refWordRange) {
        // Avoid duplicates (same range as declaration)
        if (!edits.some((e) => e.range.start.line === refWordRange.start.line && e.range.start.character === refWordRange.start.character)) {
          edits.push({ range: refWordRange, newText: newName });
        }
      }
    }
  }

  return edits;
}

// --- Helpers ---

interface WordAtPosition {
  text: string;
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
    range: {
      start: { line, character },
      end: { line: endLines.length - 1, character: endLines[endLines.length - 1].length },
    },
  };
}

function isOnLine(position: Position, range: Range): boolean {
  return position.line === range.start.line;
}

/**
 * Find the exact word range for a name on a given line.
 * Since scope analysis only gives the statement start location,
 * we need to search the actual line for the identifier.
 */
function findWordRangeOnLine(source: string, document: TextDocument, line: number, name: string): Range | null {
  const lineStart = document.offsetAt({ line, character: 0 });
  const lineEnd = line + 1 < document.lineCount
    ? document.offsetAt({ line: line + 1, character: 0 })
    : source.length;
  const lineText = source.slice(lineStart, lineEnd);

  // Find the name as a whole word on this line
  const re = new RegExp(`\\b${escapeRegex(name)}\\b`);
  const match = re.exec(lineText);
  if (!match) return null;

  const startChar = match.index;
  const endChar = startChar + name.length;
  return {
    start: { line, character: startChar },
    end: { line, character: endChar },
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
