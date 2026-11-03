/**
 * Static check for `const` (phase 0a step 4; docs/syntax.md "Variables" →
 * "const"): report a reassigned or redeclared const at its position, before
 * the program runs — including in a function that is never called. The
 * evaluator enforces the same rules when the code runs (declareBinding /
 * updateVariable); this check only moves the error earlier, so it must never
 * flag a program that runs without one. Two rules keep it on the safe side:
 *
 * - Redeclaration is checked within one statement list, which is one scope at
 *   run time: a const followed by a let/const/fn of the same name, or a
 *   let/fn followed by a const.
 * - Reassignment is checked only for a name that the whole program uses in
 *   three ways and no others: const declarations, reads (Identifier), and
 *   plain assignments. Any other appearance — a parameter, a loop variable, a
 *   case or callback binding, a `let`, a fn name, even a property name or a
 *   string — leaves the name to the run-time check, so no shadowing form can
 *   make this check wrong. For the rest, names resolve where they are written
 *   (step 3), so an assignment written after a const in the same list, or in
 *   anything nested in a later statement of it, assigns that const.
 */
import { constOverExistingError, constReassignError, constRedeclareError } from '../evaluator/const-bindings';
import { assignImportedError } from '../module-messages';

import type {
  ArrayDestructuringPattern,
  ImportDeclaration,
  ObjectDestructuringPattern,
  Program,
  SourceLocation,
} from './ast';

export interface ConstViolation {
  message: string;
  loc: SourceLocation;
}

type Node = { type: string; loc?: SourceLocation } & Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

type DeclKind = 'let' | 'const' | 'fn' | 'import';

/** Names a declaration statement binds, with its kind; empty for anything else. */
function declaredNames(node: Node): { kind: DeclKind; names: string[]; source?: string } | null {
  if (node.type === 'FunctionDefinition') return { kind: 'fn', names: [node.name as string] };
  if (node.type === 'ImportDeclaration') {
    // An imported name is fixed like a const (docs/modules.md); its file names the error.
    const decl = node as unknown as ImportDeclaration;
    const names = decl.namespace ? [decl.namespace.local] : decl.specifiers.map((s) => s.local);
    return { kind: 'import', names, source: decl.source };
  }
  if (node.type !== 'LetDeclaration') return null;
  const kind = node.kind === 'const' ? 'const' : 'let';
  const pattern = node.pattern as ArrayDestructuringPattern | ObjectDestructuringPattern | undefined;
  if (!pattern) return { kind, names: [node.name as string] };
  const names =
    pattern.type === 'ArrayDestructuringPattern'
      ? [...pattern.elements]
      : pattern.properties.map((p) => p.alias ?? p.key);
  if (pattern.rest) names.push(pattern.rest);
  return { kind, names };
}

const SKIPPED_FIELDS = new Set(['type', 'kind', 'loc']);

/**
 * Every name that appears anywhere other than a const declaration, a read or
 * a plain assignment target.
 */
function namesUsedOtherwise(program: Program): Set<string> {
  const other = new Set<string>();
  const visit = (node: Node, inConstPattern: boolean): void => {
    // An import's names are declarations (like a const's), its path is not a name.
    if (node.type === 'ImportDeclaration') return;
    for (const [field, value] of Object.entries(node)) {
      if (SKIPPED_FIELDS.has(field)) continue;
      const allowed =
        inConstPattern ||
        (field === 'name' &&
          (node.type === 'Identifier' ||
            node.type === 'AssignmentStatement' ||
            (node.type === 'LetDeclaration' && node.kind === 'const')));
      const intoConstPattern = inConstPattern || (field === 'pattern' && node.type === 'LetDeclaration' && node.kind === 'const');
      const each = (item: unknown): void => {
        if (typeof item === 'string') {
          if (!allowed) other.add(item);
        } else if (isNode(item)) {
          visit(item, intoConstPattern);
        } else if (typeof item === 'object' && item !== null) {
          // plain records inside nodes (e.g. destructuring properties { key, alias })
          for (const inner of Object.values(item)) each(inner);
        }
      };
      if (Array.isArray(value)) value.forEach(each);
      else each(value);
    }
  };
  visit(program as unknown as Node, false);
  return other;
}

/** The first const violation in the program, by position, or null. */
export function findConstViolation(program: Program): ConstViolation | null {
  const usedOtherwise = namesUsedOtherwise(program);
  const found: ConstViolation[] = [];

  // `visible`: fixed names declared earlier in this list or an enclosing one —
  // a const (null) or an import (the path it was imported from).
  const walkList = (items: unknown[], visible: ReadonlyMap<string, string | null>): void => {
    const inScope = new Map(visible);
    const declaredHere = new Map<string, DeclKind>();
    for (const item of items) {
      if (!isNode(item)) continue;
      walkNode(item, inScope);
      const decl = declaredNames(item);
      if (!decl || !item.loc) continue;
      for (const name of decl.names) {
        const prior = declaredHere.get(name);
        // Declaring an imported name again is module-check.ts's message, at the name.
        if (prior === 'const' && decl.kind !== 'import') {
          found.push({ message: constRedeclareError(name), loc: item.loc });
        } else if (prior && prior !== 'import' && decl.kind === 'const') {
          found.push({ message: constOverExistingError(name), loc: item.loc });
        }
        declaredHere.set(name, decl.kind);
        if (decl.kind === 'const') inScope.set(name, null);
        else if (decl.kind === 'import') inScope.set(name, decl.source ?? '');
        else inScope.delete(name);
      }
    }
  };

  const walkNode = (node: Node, visible: ReadonlyMap<string, string | null>): void => {
    if (
      node.type === 'AssignmentStatement' &&
      node.loc &&
      visible.has(node.name as string) &&
      !usedOtherwise.has(node.name as string)
    ) {
      const name = node.name as string;
      const importedFrom = visible.get(name);
      found.push({
        message: importedFrom == null ? constReassignError(name) : assignImportedError(name, importedFrom),
        loc: node.loc,
      });
    }
    for (const [field, value] of Object.entries(node)) {
      if (SKIPPED_FIELDS.has(field)) continue;
      if (Array.isArray(value)) walkList(value, visible);
      else if (isNode(value)) walkNode(value, visible);
    }
  };

  walkList(program.body, new Map());
  if (found.length === 0) return null;
  return found.reduce((first, v) => (v.loc.offset < first.loc.offset ? v : first));
}
