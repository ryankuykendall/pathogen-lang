/**
 * Static checks for imports (docs/modules.md), on the parse tree so each
 * message lands on the exact word:
 *   - imports come before every other statement — `@font` and `define`
 *     included; only comments may come first (decision 32);
 *   - a name imported twice;
 *   - a top-level `let`/`const`/`fn`/`enum` reusing a name an import brought in.
 *
 * The errors that stop an AST from being built at all — `import`/`export`
 * inside a function or block, `export let`, a default import — come from the
 * AST builder. Assigning to an imported name is const-check.ts's job, since it
 * follows names into nested scopes the way a const's are followed.
 */
import {
  declareImportedAgainError,
  EXPORT_PLACEMENT_MESSAGE,
  importAgainError,
  IMPORTS_FIRST_MESSAGE,
  INCOMPLETE_IMPORT_MESSAGE,
} from '../module-messages';

import type { SyntaxNode, Tree } from '@lezer/common';

export interface ModuleViolation {
  /** Document offsets of the word the message is about. */
  offset: number;
  end: number;
  message: string;
}

function lineAt(input: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (input.charCodeAt(i) === 10) line++;
  return line;
}

/** The local names an ImportDeclaration binds, each with the node that spells it. */
function importLocals(decl: SyntaxNode): { node: SyntaxNode; namespace: boolean }[] {
  const namespaceName = decl.getChild('NamespaceImport')?.getChild('VariableName');
  if (namespaceName) return [{ node: namespaceName, namespace: true }];
  const locals: { node: SyntaxNode; namespace: boolean }[] = [];
  for (const spec of decl.getChild('ImportSpecifiers')?.getChildren('ImportSpecifier') ?? []) {
    const local = spec.getChild('VariableName') ?? spec.getChild('Identifier');
    if (local) locals.push({ node: local, namespace: false });
  }
  return locals;
}

/** The names a top-level declaration binds in the file's own scope (not its params or body). */
function topLevelNames(statement: SyntaxNode): SyntaxNode[] {
  const decl = statement.name === 'ExportDeclaration' ? statement.firstChild?.nextSibling : statement;
  if (!decl) return [];
  if (decl.name === 'FunctionDefinition' || decl.name === 'EnumDefinition') {
    const name = decl.getChild('VariableName');
    return name ? [name] : [];
  }
  if (decl.name !== 'LetDeclaration') return [];
  const plain = decl.getChild('VariableName');
  if (plain) return [plain];
  const array = decl.getChild('ArrayDestructure');
  if (array) return array.getChildren('VariableName');
  const object = decl.getChild('ObjectDestructure');
  if (!object) return [];
  const names: SyntaxNode[] = [];
  for (const prop of object.getChildren('ObjectDestructureProp')) {
    const name = prop.getChild('VariableName') ?? prop.getChild('Identifier');
    if (name) names.push(name);
  }
  names.push(...object.getChildren('VariableName')); // ...rest
  return names;
}

/** Every module-rule violation in the file, in source order (the editors list them all). */
export function findModuleViolations(tree: Tree, input: string): ModuleViolation[] {
  const found: ModuleViolation[] = [];
  const importedAt = new Map<string, number>(); // local name → line of its import
  let seenOther = false;
  for (let child = tree.topNode.firstChild; child; child = child.nextSibling) {
    if (child.name === 'LineComment' || child.type.isError) continue;
    if (child.name === 'ImportDeclaration') {
      if (seenOther) {
        found.push({ offset: child.from, end: child.from + 'import'.length, message: IMPORTS_FIRST_MESSAGE });
      }
      const line = lineAt(input, child.from);
      for (const { node, namespace } of importLocals(child)) {
        const name = input.slice(node.from, node.to);
        const first = importedAt.get(name);
        if (first !== undefined) {
          found.push({ offset: node.from, end: node.to, message: importAgainError(name, first, namespace) });
        } else {
          importedAt.set(name, line);
        }
      }
      continue;
    }
    seenOther = true;
    for (const node of topLevelNames(child)) {
      const name = input.slice(node.from, node.to);
      const line = importedAt.get(name);
      if (line !== undefined) {
        found.push({ offset: node.from, end: node.to, message: declareImportedAgainError(name, line) });
      }
    }
  }
  return found;
}

/**
 * A syntax error in the part of an import before its path (`import {`,
 * `import { gear } from`, `import { a as } from "./x.pathogen";`): name the
 * shape instead of "Missing ';'", at the `import` keyword. An error after a
 * complete path is a missing `;`, and the usual message stands.
 */
export function describeIncompleteImport(errorNode: SyntaxNode): { offset: number; message: string } | null {
  for (let node = errorNode.parent; node && node.name !== 'Program'; node = node.parent) {
    if (node.name === 'ImportDeclaration') {
      const path = node.getChild('String');
      return path && errorNode.from >= path.to ? null : { offset: node.from, message: INCOMPLETE_IMPORT_MESSAGE };
    }
  }
  return null;
}

/**
 * `export` followed by something that isn't a declaration (`export M 0 0`)
 * leaves a Lezer error node right after the keyword. Name the rule instead of
 * reporting an unexpected token.
 */
export function describeExportPlacement(errorNode: SyntaxNode): { offset: number; message: string } | null {
  const parent = errorNode.parent;
  if (parent?.name !== 'ExportDeclaration') return null;
  return { offset: parent.from, message: EXPORT_PLACEMENT_MESSAGE };
}
