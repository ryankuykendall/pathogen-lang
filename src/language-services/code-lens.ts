import { analyzeScopes } from './scope-analysis';

import type { TextDocument } from './document';
import type { Range } from './types';

export interface CodeLens {
  range: Range;
  command: {
    title: string;
    command: string;
    arguments?: unknown[];
  };
}

/**
 * Get code lenses for a document.
 * Shows reference counts above variable/function declarations.
 */
export function getCodeLenses(document: TextDocument): CodeLens[] {
  const lenses: CodeLens[] = [];
  const scopeInfo = analyzeScopes(document);

  // Count references for each declaration
  const refCounts = new Map<string, number>();
  for (const ref of scopeInfo.references) {
    if (ref.declaration) {
      const key = `${ref.declaration.name}@${ref.declaration.range.start.line}`;
      refCounts.set(key, (refCounts.get(key) ?? 0) + 1);
    }
  }

  // Add lens for each declaration with references
  for (const decl of scopeInfo.declarations) {
    // Skip declarations at position 0,0 (implicit/synthetic)
    if (decl.range.start.line === 0 && decl.range.start.character === 0 && !decl.scope.parent) continue;

    const key = `${decl.name}@${decl.range.start.line}`;
    const count = refCounts.get(key) ?? 0;

    // Only show lens for functions and variables with meaningful reference counts
    if (decl.kind === 'function' || decl.kind === 'variable' || decl.kind === 'enum') {
      const label = count === 0
        ? 'no references'
        : count === 1
          ? '1 reference'
          : `${count} references`;

      lenses.push({
        range: {
          start: { line: decl.range.start.line, character: 0 },
          end: { line: decl.range.start.line, character: 0 },
        },
        command: {
          title: label,
          command: 'editor.action.findReferences',
          arguments: [
            document, // Will be replaced by the server with the URI
            { line: decl.range.start.line, character: decl.range.start.character },
          ],
        },
      });
    }
  }

  return lenses;
}
