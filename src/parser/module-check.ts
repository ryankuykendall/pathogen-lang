/**
 * Static checks for modules (docs/modules.md), on the parse tree so each
 * message lands on the exact word:
 *   - `module;` is the file's first statement; only comments may come first;
 *   - imports come before every other statement — `@font` and `define`
 *     included; only comments and `module;` may come first (decision 32);
 *   - `export` only in a module;
 *   - in a module, no drawing statement at the top level: a path command, a
 *     layer definition, an `apply` block, text, `define ViewBox`. A call that
 *     draws (`gear(…);`) can't be seen here; the evaluator stops it as it runs;
 *   - a name imported twice;
 *   - a top-level `let`/`const`/`fn`/`enum` reusing a name an import brought in.
 *
 * The errors that stop an AST from being built at all — `import`/`export`/
 * `module;` inside a function or block, `export let`, a default import — come
 * from the AST builder. Assigning to an imported name is const-check.ts's job,
 * since it follows names into nested scopes the way a const's are followed.
 */
import {
  declareImportedAgainError,
  EXPORT_NEEDS_MODULE_MESSAGE,
  EXPORT_PLACEMENT_MESSAGE,
  importAgainError,
  IMPORTS_FIRST_MESSAGE,
  INCOMPLETE_IMPORT_MESSAGE,
  MODULE_DRAWS_MESSAGE,
  MODULE_FIRST_MESSAGE,
  MODULE_VIEWBOX_MESSAGE,
} from '../module-messages';

import type { SyntaxNode, Tree } from '@lezer/common';

/** Top-level statements that draw, which a module can't have (docs/modules.md "Exporting"). */
const DRAWING_STATEMENTS = new Set([
  'PathCommand',
  'LayerDefinition',
  'LayerApplyBlock',
  'TextStatement',
  'TspanStatement',
]);

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
  // A misplaced `module;` still says the author means a module, so the other
  // rules follow it rather than adding an `export` error on top.
  let isModule = false;
  for (let child = tree.topNode.firstChild; child; child = child.nextSibling) {
    if (child.name === 'ModuleHeader') isModule = true;
  }
  let seenOther = false;
  let seenAny = false;
  // `M 0 0 L 10 10` is one top-level PathCommand per letter: a run of them is
  // one drawing, underlined once, at its first letter.
  let inPathRun = false;
  for (let child = tree.topNode.firstChild; child; child = child.nextSibling) {
    if (child.name === 'LineComment' || child.type.isError) continue;
    const continuesPathRun = inPathRun && child.name === 'PathCommand';
    inPathRun = child.name === 'PathCommand';
    if (child.name === 'ModuleHeader') {
      if (seenAny) found.push({ offset: child.from, end: child.to, message: MODULE_FIRST_MESSAGE });
      seenAny = true;
      continue;
    }
    seenAny = true;
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
    if (child.name === 'ExportDeclaration' && !isModule) {
      found.push({ offset: child.from, end: child.from + 'export'.length, message: EXPORT_NEEDS_MODULE_MESSAGE });
    }
    if (isModule && !continuesPathRun && (child.name === 'ViewBoxDefinition' || DRAWING_STATEMENTS.has(child.name))) {
      // The first word (`define`, `layer`, `M`, `text`) carries the underline.
      const first = child.firstChild;
      found.push({
        offset: child.from,
        end: first ? first.to : child.to,
        message: child.name === 'ViewBoxDefinition' ? MODULE_VIEWBOX_MESSAGE : MODULE_DRAWS_MESSAGE,
      });
    }
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
