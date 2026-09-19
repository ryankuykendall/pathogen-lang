/**
 * Static check: `pi`, `deg` and `rad` are unit suffixes and cannot be BOUND as
 * a name (let, for, fn name/params, lambda and trailing-block params, enum
 * name, every destructuring form, case-pattern bindings).
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
 * Only parse() — the strict path — runs this. parseLezer(), which the language
 * services use mid-typing, must keep building an AST for `let rad = …` so
 * scope analysis, completion and hover survive while the diagnostic is shown.
 */
import { RESERVED_UNIT_NAMES, reservedNameBindingError } from '../evaluator/reserved-names';

import type { SyntaxNode, TreeCursor } from '@lezer/common';

export interface ReservedBinding {
  name: string;
  offset: number;
  message: string;
}

function reservedAt(node: SyntaxNode | null, input: string): ReservedBinding | null {
  if (!node) return null;
  const name = input.slice(node.from, node.to);
  if (!RESERVED_UNIT_NAMES.has(name)) return null;
  return { name, offset: node.from, message: reservedNameBindingError(name) };
}

/** The Identifier a `...rest` element binds, if that is what `node` is. */
function spreadTarget(node: SyntaxNode): SyntaxNode | null {
  if (node.name !== 'SpreadElement') return null;
  const target = node.lastChild;
  return target?.name === 'Identifier' ? target : null;
}

function inCaseLiteral(literal: SyntaxNode, input: string): ReservedBinding | null {
  for (let child = literal.firstChild; child; child = child.nextSibling) {
    let binding: SyntaxNode | null = null;
    if (child.name === 'Identifier') {
      binding = child; // case [first, second]
    } else if (child.name === 'ObjectProperty') {
      // `{ x }` binds x; `{ key: alias }` binds alias (the key is only a key)
      const last = child.lastChild;
      binding = last?.name === 'Identifier' ? last : null;
    } else {
      binding = spreadTarget(child); // ...rest
    }
    const hit = reservedAt(binding, input);
    if (hit) return hit;
  }
  return null;
}

/**
 * The reserved binding AT the cursor's node, or null. Called for every node
 * of parse()'s existing scan, so the name test comes first and a SyntaxNode is
 * only materialized for the three node kinds that can hold a binding.
 */
export function reservedBindingAt(cursor: TreeCursor, input: string): ReservedBinding | null {
  switch (cursor.name) {
    case 'VariableName': {
      const node = cursor.node;
      return node.parent?.name === 'EnumMember' ? null : reservedAt(node, input);
    }
    case 'ObjectDestructureProp': {
      const node = cursor.node;
      if (node.getChild('VariableName')) return null; // aliased: the VariableName case handles it
      return reservedAt(node.getChild('Identifier'), input);
    }
    case 'CasePattern': {
      const node = cursor.node;
      const only = node.firstChild;
      if (!only || only.nextSibling) return null; // a value pattern, not a destructuring cover
      if (only.name !== 'ArrayLiteral' && only.name !== 'ObjectLiteral') return null;
      return inCaseLiteral(only, input);
    }
    default:
      return null;
  }
}
