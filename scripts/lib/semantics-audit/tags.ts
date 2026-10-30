/**
 * Static tags that explain an expected difference for a given phase 0a step
 * (project-docs/modules/06-phase-0a-plan.md). A program whose output changes
 * without one of its step's tags is an unexplained difference.
 */
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

export function tagsFor(step: number, source: string, lib: PathogenModule): string[] {
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
  return [...tags];
}
