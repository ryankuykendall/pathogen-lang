/**
 * Static tags that explain an expected difference for a given phase 0a step
 * (project-docs/modules/06-phase-0a-plan.md). A program whose output changes
 * without one of its step's tags is an unexplained difference.
 */
import { BUILTIN_NAMES } from '../../../src/builtin-names';
import { RESERVED_UNIT_NAMES } from '../../../src/evaluator/reserved-names';
import { lezerParser } from '../../../src/parser';
import { findReservedBindings } from '../../../src/parser/reserved-bindings';

import type { PathogenModule } from './baseline';

type Node = Record<string, unknown>;

function walk(value: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const node = value as Node;
  if (typeof node.type === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue;
    walk(node[key], visit);
  }
}

/** Argument kinds the old evaluator evaluated twice (step 1). */
const CALL_SHAPED = new Set(['FunctionCall', 'MethodCallExpression', 'CalcExpression', 'IndexExpression']);

/**
 * Step 2 (the drawing context follows the call; block rules for called code).
 * Every change step 2 makes involves a path block: layers and text blocks
 * already shared the caller's pen.
 * - `ctx-with-path-block`: the program reads `ctx` and builds a path block —
 *   ctx inside a block now follows its cursor, and a block no longer leaks
 *   its cursor into the program's ctx;
 * - `call-in-path-block`: a path block calls a user-defined callable (a fn, a
 *   let-bound lambda, or a fn/lambda parameter) — a lambda now draws with the
 *   block's pen, and both now meet the block's rules;
 * - `callback-in-path-block`: a trailing block or `<<` worker inside a path
 *   block — it now draws and reads ctx with the block's pen;
 * - `callable-defined-in-path-block`: a lambda or fn written inside a block —
 *   called later, it draws with the caller's pen, not the block's;
 * - `nested-uppercase-in-path-block`: an uppercase command inside a block but
 *   not one of its own lines (an if/for/switch body, a builder block) — now an
 *   error, as on the block's own lines.
 */
function step2Tags(ast: unknown, tags: Set<string>): void {
  let readsCtx = false;
  let hasPathBlock = false;
  const userFns = new Set<string>();
  walk(ast, (node) => {
    if (node.type === 'Identifier' && node.name === 'ctx') readsCtx = true;
    if (node.type === 'PathBlockExpression') hasPathBlock = true;
    if (node.type === 'FunctionDefinition' && typeof node.name === 'string') userFns.add(node.name);
    if (node.type === 'LetDeclaration' && (node.value as Node | undefined)?.type === 'LambdaExpression') {
      userFns.add(String(node.name));
    }
    if ((node.type === 'FunctionDefinition' || node.type === 'LambdaExpression') && Array.isArray(node.params)) {
      for (const param of node.params) userFns.add(String(param));
    }
  });
  if (readsCtx && hasPathBlock) tags.add('ctx-with-path-block');
  walk(ast, (node) => {
    if (node.type !== 'PathBlockExpression' || !Array.isArray(node.body)) return;
    const ownLines = new Set(node.body as Node[]);
    walk(node.body, (inner) => {
      if (inner.type === 'FunctionCall' && userFns.has(String(inner.name))) tags.add('call-in-path-block');
      if ((inner.type === 'FunctionCall' || inner.type === 'MethodCallExpression') && inner.block) {
        tags.add('callback-in-path-block');
      }
      if (inner.type === 'BinaryExpression' && inner.operator === '<<') tags.add('callback-in-path-block');
      if (inner.type === 'LambdaExpression' || inner.type === 'FunctionDefinition')
        tags.add('callable-defined-in-path-block');
      if (
        inner.type === 'PathCommand' &&
        !ownLines.has(inner) &&
        typeof inner.command === 'string' &&
        inner.command !== '' &&
        inner.command !== inner.command.toLowerCase()
      ) {
        tags.add('nested-uppercase-in-path-block');
      }
    });
  });
}

/**
 * Step 5 (built-in names are a compile error): `builtin-binding` — the
 * program declares a built-in name, so it now stops at that name. Read from
 * the parse tree, since the strict parse refuses the program.
 */
function step5Tags(source: string): string[] {
  // pi/deg/rad were already errors (their own message); only the new rule counts.
  const declared = findReservedBindings(lezerParser.parse(source), source);
  return declared.some((b) => BUILTIN_NAMES.has(b.name) && !RESERVED_UNIT_NAMES.has(b.name)) ? ['builtin-binding'] : [];
}

export function tagsFor(step: number, source: string, lib: PathogenModule): string[] {
  if (step === 5) return step5Tags(source);
  let ast: unknown;
  try {
    ast = lib.parse(source);
  } catch {
    return [];
  }
  const tags = new Set<string>();
  walk(ast, (node) => {
    if (step === 1 && node.type === 'PathCommand' && node.command !== '' && Array.isArray(node.args)) {
      if ((node.args as Node[]).some((arg) => CALL_SHAPED.has(String(arg.type)))) tags.add('call-shaped-path-arg');
    }
  });
  if (step === 2) step2Tags(ast, tags);
  return [...tags];
}
