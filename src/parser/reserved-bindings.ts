/**
 * Static check: names a program can't DECLARE (let, const, for, fn
 * name/params, lambda and trailing-block params, enum name, every
 * destructuring form, case-pattern bindings):
 *   - `pi`, `deg` and `rad`, the angle unit suffixes (their own message);
 *   - every built-in name — stdlib functions, constructors, built-in enums
 *     and namespaces, `ctx`, `viewbox` (src/builtin-names.ts; docs/syntax.md
 *     "Built-in names").
 *
 * The evaluator enforces the same rule at its binding funnel (`setVariable`),
 * but that funnel has no source location and only runs when a binding
 * executes — so the error had no line (editors put the squiggle on line 1) and
 * an uncalled fn, an uncalled lambda, or a case arm that never matched slipped
 * through. Checking the parse tree fixes both: every binding occurrence is
 * visible with its exact position. The evaluator check stays as the backstop
 * for ASTs that did not come through parse().
 *
 * Binding occurrences in the tree (see
 * project-docs/range-values/probes/binding-shapes.ts):
 *   - every `VariableName` node, EXCEPT an enum member's (`enum U { deg }` —
 *     members are not variables; `U.deg` stays legal)
 *   - `ObjectDestructureProp` with no alias: `let { rad } = o` binds its
 *     Identifier (with an alias, the Identifier is only a key and the
 *     VariableName is the binding)
 *   - a `CasePattern` that is nothing but an array/object literal — the cover
 *     grammar for `case [a, ...rest]` / `case { x, y: alias, ...rest }`. A
 *     literal followed by anything (`case [a, b].length`) is a value pattern
 *     whose names are references, not bindings
 *
 * Only parse() — the strict path — throws on these (and only with
 * `namingChecks`). parseLezer(), which the language services use mid-typing,
 * must keep building an AST for `let rad = …` so scope analysis, completion
 * and hover survive while the diagnostic is shown; the diagnostics engine
 * lists every offender with findReservedBindings().
 */
import { BUILTIN_NAMES, builtinNameError } from '../builtin-names';
import { RESERVED_UNIT_NAMES, reservedNameBindingError } from '../evaluator/reserved-names';

import type { SyntaxNode, Tree, TreeCursor } from '@lezer/common';

export interface ReservedBinding {
  name: string;
  /** Document offsets of the name. */
  offset: number;
  end: number;
  message: string;
}

/**
 * One name a program declares, at its exact position. `shorthand` marks a
 * destructured property taken under its own name (`{ min }`), whose key and
 * variable are the same text.
 */
export interface BindingNode {
  node: SyntaxNode;
  shorthand: boolean;
}

/** The Identifier a `...rest` element binds, if that is what `node` is. */
function spreadTarget(node: SyntaxNode): SyntaxNode | null {
  if (node.name !== 'SpreadElement') return null;
  const target = node.lastChild;
  return target?.name === 'Identifier' ? target : null;
}

function inCaseLiteral(literal: SyntaxNode): BindingNode[] {
  const out: BindingNode[] = [];
  for (let child = literal.firstChild; child; child = child.nextSibling) {
    if (child.name === 'Identifier') {
      out.push({ node: child, shorthand: false }); // case [first, second]
    } else if (child.name === 'ObjectProperty') {
      // `{ x }` binds x (shorthand); `{ key: alias }` binds alias (the key is only a key)
      const last = child.lastChild;
      if (last?.name === 'Identifier') out.push({ node: last, shorthand: last.from === child.firstChild?.from });
    } else {
      const rest = spreadTarget(child); // ...rest
      if (rest) out.push({ node: rest, shorthand: false });
    }
  }
  return out;
}

/**
 * The names declared AT the cursor's node. Called for every node of a tree
 * walk, so the node-kind test comes first and a SyntaxNode is only
 * materialized for the three kinds that can hold a binding.
 */
export function bindingNodesAt(cursor: TreeCursor): BindingNode[] {
  switch (cursor.name) {
    case 'VariableName': {
      const node = cursor.node;
      return node.parent?.name === 'EnumMember' ? [] : [{ node, shorthand: false }];
    }
    case 'ObjectDestructureProp': {
      const node = cursor.node;
      if (node.getChild('VariableName')) return []; // aliased: the VariableName case handles it
      const id = node.getChild('Identifier');
      return id ? [{ node: id, shorthand: true }] : [];
    }
    case 'CasePattern': {
      const node = cursor.node;
      const only = node.firstChild;
      if (!only || only.nextSibling) return []; // a value pattern, not a destructuring cover
      if (only.name !== 'ArrayLiteral' && only.name !== 'ObjectLiteral') return [];
      return inCaseLiteral(only);
    }
    default:
      return [];
  }
}

function reservedAt(binding: BindingNode, input: string): ReservedBinding | null {
  const { node, shorthand } = binding;
  const name = input.slice(node.from, node.to);
  let message: string;
  if (RESERVED_UNIT_NAMES.has(name)) message = reservedNameBindingError(name);
  else if (BUILTIN_NAMES.has(name)) message = builtinNameError(name, shorthand);
  else return null;
  return { name, offset: node.from, end: node.to, message };
}

/** The first reserved name declared AT the cursor's node, or null (parse()'s scan). */
export function reservedBindingAt(cursor: TreeCursor, input: string): ReservedBinding | null {
  for (const binding of bindingNodesAt(cursor)) {
    const hit = reservedAt(binding, input);
    if (hit) return hit;
  }
  return null;
}

/** Every reserved name the program declares, in source order (the editors list them all). */
export function findReservedBindings(tree: Tree, input: string): ReservedBinding[] {
  const found: ReservedBinding[] = [];
  const cursor = tree.cursor();
  do {
    for (const binding of bindingNodesAt(cursor)) {
      const hit = reservedAt(binding, input);
      if (hit) found.push(hit);
    }
  } while (cursor.next());
  return found.sort((a, b) => a.offset - b.offset);
}
