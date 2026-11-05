import {
  exportNameRange,
  importedFile,
  importSiteAt,
  namespaceReceiverAt,
  resolveExport,
  resolveImport,
} from './module-exports';
import { analyzeScopes } from './scope-analysis';

import type { TextDocument } from './document';
import type { ImportTarget, LanguageServiceOptions } from './module-exports';
import type { Declaration, ScopeInfo } from './scope-analysis';
import type { Position, Range } from './types';

export interface Location {
  /**
   * Another file, by its project path (`/parts/gears.pathogen`); none means
   * the document asked about. The language server turns it into a URI.
   */
  file?: string;
  range: Range;
}

/** The top of a file: where a namespace or an import's path leads. */
const FILE_START: Range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

/**
 * Get the definition location for the symbol at the given position.
 * Returns null for builtins (stdlib, ctx, etc.) since they have no user-authored source.
 * With `options.modules`, a name from another file leads to its declaration
 * there (docs/modules.md "In each tool").
 */
export function getDefinition(
  document: TextDocument,
  position: Position,
  options: LanguageServiceOptions = {},
): Location | null {
  const source = document.getText();
  const offset = document.offsetAt(position);
  const graph = options.modules;
  let scopeInfo: ScopeInfo | null = null;
  const scopes = (): ScopeInfo => {
    scopeInfo ??= analyzeScopes(document);
    return scopeInfo;
  };

  // An import's path opens the file, wherever in the string the cursor is (a
  // quote or a `/` too); the exported name in `{ Teeth as Kind }` leads to
  // the export.
  if (graph) {
    const tree = scopes().tree;
    const site = tree ? importSiteAt(tree, source, offset) : null;
    if (site) {
      const file = importedFile(graph, graph.entry, site.path);
      if (file) {
        return site.name === undefined
          ? { file: file.path, range: FILE_START }
          : locationOf(resolveExport(graph, file, site.name));
      }
    }
  }

  const word = getWordAt(source, offset);
  if (!word) return null;

  // `gears.gear`: the export the namespace's file declares.
  if (graph) {
    const receiver = namespaceReceiverAt(scopes(), source, word.start, position);
    if (receiver) {
      const file = importedFile(graph, graph.entry, receiver.path);
      if (file) return locationOf(resolveExport(graph, file, word.text));
    }
  }

  const otherFile = (decl: Declaration): Location | null => {
    if (!graph || decl.kind !== 'import') return null;
    const target = resolveImport(graph, graph.entry, decl);
    return target ? locationOf(target) : null;
  };

  // Find a reference at this position that resolves to a declaration
  const info = scopes();
  for (const ref of info.references) {
    if (ref.name === word.text && ref.declaration && isPositionInRange(position, ref.range)) {
      return otherFile(ref.declaration) ?? { range: ref.declaration.range };
    }
  }

  // Check if the position is ON a declaration (go-to-def on the definition itself)
  for (const decl of info.declarations) {
    if (decl.name === word.text && isPositionInRange(position, decl.range)) {
      return otherFile(decl) ?? { range: decl.range };
    }
  }

  return null;
}

/** Where a name from another file is declared; null for one the file doesn't export. */
function locationOf(target: ImportTarget): Location | null {
  if (target.kind === 'namespace') return { file: target.file.path, range: FILE_START };
  if (target.kind === 'missing') return null;
  return { file: target.file.path, range: exportNameRange(target) };
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
