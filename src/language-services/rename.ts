import { analyzeScopes, declarationName } from './scope-analysis';
import { renameExportedError, renameImportedError } from '../module-messages';

import type { TextDocument } from './document';
import type { Declaration, Reference, ScopeInfo } from './scope-analysis';
import type { Position, Range } from './types';

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface PrepareRenameResult {
  range: Range;
  placeholder: string;
}

/**
 * Keywords and builtins. Rename never starts from a reference to one of these
 * (it resolves to no declaration); a DECLARATION that uses a built-in's name —
 * an error since phase 0a step 5 — can still be renamed, which is how the
 * quick fix repairs it.
 */
export const NON_RENAMEABLE = new Set([
  'let', 'const', 'for', 'in', 'if', 'else', 'fn', 'return', 'define', 'default',
  'layer', 'apply', 'text', 'tspan', 'null', 'true', 'false', 'enum',
  'break', 'continue', 'switch', 'case', 'where', 'with', 'as', 'ViewBox', 'import', 'export',
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
 * Returns the current name and range, or null if not renameable. A name
 * other files share is not (renameRefusal says why).
 */
export function prepareRename(document: TextDocument, position: Position): PrepareRenameResult | null {
  const source = document.getText();
  const word = getWordAt(source, document.offsetAt(position));
  if (!word) return null;
  const info = analyzeScopes(document);
  const target = declarationAt(document, info, position, word.text);
  return target && !refusalFor(target) ? { range: word.range, placeholder: word.text } : null;
}

/**
 * Why the name at position can't be renamed, when it is one other files
 * share: an imported name, or an exported one (docs/modules.md "In each
 * tool"). Renaming it in one file would leave the others with the old name,
 * so F2 says so instead of changing only some of its uses. Null otherwise.
 */
export function renameRefusal(document: TextDocument, position: Position): string | null {
  const word = getWordAt(document.getText(), document.offsetAt(position));
  if (!word) return null;
  const target = declarationAt(document, analyzeScopes(document), position, word.text);
  return target ? refusalFor(target) : null;
}

function refusalFor(decl: Declaration): string | null {
  if (decl.kind === 'import' && decl.importFrom) return renameImportedError(decl.name, decl.importFrom.path);
  if (decl.exported) return renameExportedError(decl.name);
  return null;
}

/**
 * Compute text edits to rename the symbol at position to newName.
 * Returns edits for the declaration and all references in the same scope chain.
 * None for a name other files share (renameRefusal).
 */
export function getRenameEdits(document: TextDocument, position: Position, newName: string): TextEdit[] {
  const source = document.getText();
  const word = getWordAt(source, document.offsetAt(position));
  if (!word) return [];
  const info = analyzeScopes(document);
  const target = declarationAt(document, info, position, word.text);
  return target && !refusalFor(target) ? renameDeclarationEdits(document, info, target, newName) : [];
}

/**
 * The edits that rename one declaration and every reference to it. Used by
 * rename, the built-in-name quick fix (code-actions.ts) and the stored-
 * workspace migration (scripts/migrate-builtin-names-kv.ts).
 *
 * Positions are exact wherever the parse tree gives them: the declaration's
 * name (scope-analysis.ts `declarationName`), a reference whose position
 * holds its name, and style-value references (full-width ranges). Only a
 * reference without one falls back to a scan of its line. A shorthand
 * property — `{ x }` as a value or `let { x } = o` — becomes `x: newName`, so
 * the key keeps its name.
 */
export function renameDeclarationEdits(
  document: TextDocument,
  info: ScopeInfo,
  decl: Declaration,
  newName: string,
): TextEdit[] {
  const source = document.getText();
  const edits: TextEdit[] = [];
  const name = declarationName(info, decl, document);
  if (name) {
    edits.push({ range: name.range, newText: name.shorthand ? `${decl.name}: ${newName}` : newName });
  } else {
    const range = findWordRangeOnLine(source, document, decl.range.start.line, decl.name);
    if (range) edits.push({ range, newText: newName });
  }
  for (const ref of info.references) {
    if (ref.declaration !== decl) continue;
    const range =
      exactReferenceRange(ref, source, document) ??
      findWordRangeOnLine(source, document, ref.range.start.line, ref.name, edits);
    if (!range || edits.some((e) => samePosition(e.range.start, range.start))) continue;
    edits.push({ range, newText: ref.inShorthandProperty ? `${ref.name}: ${newName}` : newName });
  }
  return edits;
}

// --- Helpers ---

/** The declaration the name at `position` declares or refers to. */
function declarationAt(document: TextDocument, info: ScopeInfo, position: Position, name: string): Declaration | null {
  const source = document.getText();
  for (const ref of info.references) {
    if (ref.name !== name || !ref.declaration) continue;
    const range = exactReferenceRange(ref, source, document);
    if (range && contains(range, position)) return ref.declaration;
  }
  for (const decl of info.declarations) {
    if (decl.name !== name) continue;
    const declName = declarationName(info, decl, document);
    if (declName && contains(declName.range, position)) return decl;
  }
  // A position the tree couldn't place: the first match on the line, as before.
  for (const ref of info.references) {
    if (ref.name === name && ref.declaration && isOnLine(position, ref.range)) return ref.declaration;
  }
  for (const decl of info.declarations) {
    if (decl.name === name && isOnLine(position, decl.range)) return decl;
  }
  return null;
}

/**
 * A reference's exact extent: style-value references carry it; others start
 * at their name when the parser gave them their own position (the text there
 * is the name, as a whole word). Null when the position belongs to an
 * enclosing statement.
 */
function exactReferenceRange(ref: Reference, source: string, document: TextDocument): Range | null {
  if (isFullWidth(ref.range)) return ref.range;
  const offset = document.offsetAt(ref.range.start);
  const end = offset + ref.name.length;
  if (source.slice(offset, end) !== ref.name || isWordChar(source[offset - 1]) || isWordChar(source[end])) return null;
  return { start: ref.range.start, end: document.positionAt(end) };
}

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

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[a-zA-Z0-9_]/.test(ch);
}

function isOnLine(position: Position, range: Range): boolean {
  return position.line === range.start.line;
}

function isFullWidth(range: Range): boolean {
  return range.end.line > range.start.line || range.end.character > range.start.character;
}

function samePosition(a: Position, b: Position): boolean {
  return a.line === b.line && a.character === b.character;
}

function contains(range: Range, position: Position): boolean {
  if (position.line < range.start.line || position.line > range.end.line) return false;
  if (position.line === range.start.line && position.character < range.start.character) return false;
  if (position.line === range.end.line && position.character > range.end.character) return false;
  return true;
}

/**
 * Find the exact word range for a name on a given line — the fallback for a
 * position the tree couldn't place. When `claimed` is given, occurrences
 * whose start position already has an edit are skipped, so successive
 * same-line references each get the next unclaimed occurrence instead of
 * piling onto the first.
 */
function findWordRangeOnLine(source: string, document: TextDocument, line: number, name: string, claimed?: TextEdit[]): Range | null {
  const lineStart = document.offsetAt({ line, character: 0 });
  const lineEnd = line + 1 < document.lineCount
    ? document.offsetAt({ line: line + 1, character: 0 })
    : source.length;
  const lineText = source.slice(lineStart, lineEnd);

  // Find the name as a whole word on this line
  const re = new RegExp(`\\b${escapeRegex(name)}\\b`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(lineText)) !== null) {
    const startChar = match.index;
    if (claimed?.some((e) => e.range.start.line === line && e.range.start.character === startChar)) continue;
    return {
      start: { line, character: startChar },
      end: { line, character: startChar + name.length },
    };
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
