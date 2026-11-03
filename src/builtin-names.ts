/**
 * Every name the language defines, and the rule that a program can't declare
 * one (docs/syntax.md "Built-in names"; decisions 18 and 20 in
 * project-docs/modules/05-phase-0a-audit.md).
 *
 * The table is DERIVED from the runtime's own registries — the stdlib, the
 * context-aware functions, the evaluator's constructors and statement
 * builtins, the built-in enums and the namespaces below — so a new built-in
 * is reserved the moment it exists. Never hand-list names here.
 *
 * Users: the parser's static check (parser/reserved-bindings.ts), the
 * evaluator's binding funnel (the backstop) and its namespace lookup, and the
 * language services (diagnostics, the rename quick fix, scope analysis,
 * semantic tokens, code actions).
 */
import { BUILTIN_ENUMS } from './evaluator/builtin-enums';
import { EVALUATOR_CONSTRUCTORS, STATEMENT_BUILTINS } from './evaluator/constructor-registry';
import { contextAwareFunctions, stdlib } from './stdlib';

export type BuiltinKind = 'function' | 'constructor' | 'enum' | 'namespace' | 'context' | 'viewbox';

/**
 * Namespaces the evaluator resolves by name, with the value type each one
 * evaluates to. `Color(…)` and `Marker(…)` are also constructor calls.
 */
export const BUILTIN_NAMESPACES = {
  Object: 'ObjectNamespace',
  Color: 'ColorNamespace',
  PathBlock: 'PathBlockNamespace',
  Font: 'FontNamespace',
  Cap: 'CapNamespace',
  Marker: 'MarkerNamespace',
} as const;

export type BuiltinNamespaceType = (typeof BUILTIN_NAMESPACES)[keyof typeof BUILTIN_NAMESPACES];

/** The namespace value type for `name`, or undefined. */
export function builtinNamespaceType(name: string): BuiltinNamespaceType | undefined {
  return Object.hasOwn(BUILTIN_NAMESPACES, name)
    ? BUILTIN_NAMESPACES[name as keyof typeof BUILTIN_NAMESPACES]
    : undefined;
}

function buildTable(): ReadonlyMap<string, BuiltinKind> {
  const table = new Map<string, BuiltinKind>();
  // Later entries win, so the most specific kind is the one a message names:
  // `Color` and `Marker` are namespaces AND constructors — say constructor.
  for (const name of Object.keys(BUILTIN_NAMESPACES)) table.set(name, 'namespace');
  for (const name of Object.keys(BUILTIN_ENUMS)) table.set(name, 'enum');
  for (const name of Object.keys(stdlib)) table.set(name, 'function');
  for (const name of contextAwareFunctions) table.set(name, 'function');
  for (const name of STATEMENT_BUILTINS) table.set(name, 'function');
  for (const name of EVALUATOR_CONSTRUCTORS) table.set(name, 'constructor');
  table.set('Color', 'constructor');
  table.set('Marker', 'constructor');
  table.set('ctx', 'context');
  table.set('viewbox', 'viewbox');
  return table;
}

/** Every built-in name and what it is. `Infinity` and `NaN` are not names the runtime resolves. */
export const BUILTIN_NAMES: ReadonlyMap<string, BuiltinKind> = buildTable();

const WHAT_IT_IS: Record<BuiltinKind, string> = {
  function: 'it is a built-in function',
  constructor: 'it is a built-in constructor',
  enum: 'it is a built-in enum',
  namespace: 'it is a built-in namespace',
  context: 'it is the drawing context',
  viewbox: "it is the program's viewBox",
};

/**
 * A free name to use instead of a built-in one: `minValue` for a variable
 * named `min`, `myMpi` for a function named `mpi` (the program's own version
 * of the built-in), `MyMarker` for a capitalised name; numbered (`minValue2`,
 * …) when `isTaken` says the first choice is already used.
 */
export function suggestName(
  name: string,
  isTaken: (candidate: string) => boolean = () => false,
  isFunction = false,
): string {
  const base = /^[A-Z]/.test(name)
    ? `My${name}`
    : isFunction
      ? `my${name[0].toUpperCase()}${name.slice(1)}`
      : `${name}Value`;
  let candidate = base;
  for (let n = 2; isTaken(candidate) || BUILTIN_NAMES.has(candidate); n++) candidate = `${base}${n}`;
  return candidate;
}

/**
 * The error for declaring a built-in name. `shorthand` is a destructured
 * property taken under its own name (`let { min } = r;`), whose fix is to
 * write the property and a new name.
 */
export function builtinNameError(name: string, shorthand = false): string {
  const kind = BUILTIN_NAMES.get(name);
  const what = kind ? WHAT_IT_IS[kind] : 'it is a built-in name';
  const fix = shorthand
    ? `Take the property under another name: { ${name}: ${suggestName(name)} }`
    : 'Use another name';
  return `Cannot use ${name} as a name — ${what}. ${fix}`;
}

/** Matches a builtinNameError message; group 1 is the name. */
export const BUILTIN_NAME_ERROR_RE =
  /\bCannot use (\w+) as a name — it is (?:a built-in|the drawing context|the program's viewBox)/;
