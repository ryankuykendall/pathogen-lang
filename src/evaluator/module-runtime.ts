/**
 * Run-time pieces of modules (docs/modules.md) that don't need the
 * evaluator's internals: the error that names another file, reading a
 * file's exports from its AST, and finding which file a scope runs.
 */
import { fileLabel, MODULE_DRAWS_MESSAGE } from '../module-messages';

import type { ModuleIdentity, Scope } from './types';
import type { ImportSite } from '../host/load-modules';
import type { Program, Statement } from '../parser/ast';

/**
 * An error raised in a file other than the compiled one. Its message is
 * `parts/gears.pathogen line 3, col 3: …` followed by one line per file
 * boundary on the way back to the compiled file: `called from main.pathogen
 * line 4` for a call, `imported from main.pathogen line 2` for a file that
 * failed while it loaded (docs/modules.md "Errors in other files").
 * An error in the compiled file's own code keeps its text exactly as
 * before, unless it was reached through another file (a lambda handed to an
 * imported fn, which calls it back): then it is traced like any other, since
 * the way it was reached is the useful part.
 */
export class ModuleTraceError extends Error {
  /** The file the error happened in, as a path from the project folder. */
  readonly file: string;

  readonly line?: number;

  readonly column?: number;

  /** The error's own words, without a position. */
  readonly detail: string;

  /** `called from …` / `imported from …`, nearest first. */
  readonly trail: string[] = [];

  /**
   * Where the error reaches the compiled file: the call or the import there.
   * Editors put the diagnostic on it (docs/modules.md "In each tool").
   */
  site?: { line: number; column?: number };

  /**
   * The scope the last step's call was made from. A style value compares it
   * with its own scope to tell its own call (parsed on its own, so its line
   * reads 1) from a call made deeper in, whose line is right.
   */
  lastCaller?: object;

  constructor(file: string, line: number | undefined, column: number | undefined, detail: string) {
    super(detail);
    this.name = 'ModuleTraceError';
    this.file = file;
    this.line = line;
    this.column = column;
    this.detail = detail;
    this.message = this.render();
  }

  /**
   * Add the next file boundary on the way back, the compiled-file position
   * when it is reached, and the scope a call was made from.
   */
  addStep(text: string, site?: { line: number; column?: number }, caller?: object): void {
    this.trail.push(text);
    if (site) this.site = site;
    this.lastCaller = caller;
    this.message = this.render();
  }

  /**
   * Point the last step at another line of the same file: a style value's
   * own call (see lastCaller). `site` is true when that file is the
   * compiled one.
   */
  moveLastStep(line: number, column: number | undefined, site: boolean): void {
    const last = this.trail.length - 1;
    if (last < 0) return;
    this.trail[last] = this.trail[last].replace(/ line (?:\d+|\?)$/, ` line ${line}`);
    if (site) this.site = { line, column };
    this.message = this.render();
  }

  private render(): string {
    const where =
      this.line === undefined
        ? `${this.file}: `
        : `${this.file} line ${this.line}${this.column === undefined ? '' : `, col ${this.column}`}: `;
    return [`${where}${this.detail}`, ...this.trail.map((step) => `  ${step}`)].join('\n');
  }
}

/**
 * The position at the front of an evaluator or parser message, and the words
 * after it: `Line 3, col 5: x`, `Line 3: x`, `Parse error at line 3, column 5: x`.
 */
export function splitPosition(message: string): { line?: number; column?: number; detail: string } {
  const evaluator = /^Line (\d+)(?:, col (\d+))?: ([\s\S]*)$/.exec(message);
  if (evaluator) {
    return {
      line: Number(evaluator[1]),
      ...(evaluator[2] !== undefined ? { column: Number(evaluator[2]) } : {}),
      detail: evaluator[3],
    };
  }
  const parser = /^Parse error at line (\d+)(?:, column (\d+))?: ([\s\S]*)$/.exec(message);
  if (parser) {
    return {
      line: Number(parser[1]),
      ...(parser[2] !== undefined ? { column: Number(parser[2]) } : {}),
      detail: parser[3],
    };
  }
  return { detail: message };
}

/** The `imported from` lines for a file reached through `chain` (nearest first), and the compiled-file site. */
export function importedFromSteps(chain: readonly ImportSite[]): {
  steps: string[];
  site?: { line: number; column?: number };
} {
  const steps = chain.map((s) => `imported from ${fileLabel(s.file)} line ${s.line}`);
  const last = chain[chain.length - 1];
  return { steps, ...(last ? { site: { line: last.line, column: last.column } } : {}) };
}

/** The names a top-level statement declares in its file's scope. */
function declaredBy(stmt: Statement): string[] {
  if (stmt.type === 'FunctionDefinition' || stmt.type === 'EnumDefinition') return [stmt.name];
  if (stmt.type !== 'LetDeclaration') return [];
  const pattern = stmt.pattern;
  if (!pattern) return [stmt.name];
  const names =
    pattern.type === 'ArrayDestructuringPattern'
      ? [...pattern.elements]
      : pattern.properties.map((p) => p.alias ?? p.key);
  if (pattern.rest) names.push(pattern.rest);
  return names;
}

/** A file's exported names, in source order, and every name its top level declares. */
export function exportsOf(program: Program): { exported: string[]; declared: Set<string> } {
  const exported: string[] = [];
  const declared = new Set<string>();
  for (const stmt of program.body) {
    const names = declaredBy(stmt);
    for (const name of names) declared.add(name);
    if ('exported' in stmt && stmt.exported) exported.push(...names);
  }
  return { exported, declared };
}

/**
 * The prefix an imported file's ids get (docs/modules.md "Ids from other
 * files"): its path from the project folder, `/` turned into `-` and
 * `.pathogen` dropped, then `--`. Any character an id can't hold becomes `_`
 * plus its Unicode code point in lowercase hex, and a leading digit (or `-`,
 * which an id can't start with either) gets a `_` in front.
 */
export function idPrefixOf(projectPath: string): string {
  const stem = projectPath.replace(/^\//, '').replace(/\.pathogen$/, '');
  let out = '';
  for (const ch of stem) {
    if (ch === '/') out += '-';
    else if (/^[A-Za-z0-9_-]$/.test(ch)) out += ch;
    else out += `_${ch.codePointAt(0)!.toString(16)}`;
  }
  return `${/^[0-9-]/.test(out) ? '_' : ''}${out}--`;
}

/** The file a scope runs: its root scope's identity, when the compile has files. */
export function moduleOf(scope: Scope): ModuleIdentity | undefined {
  let root = scope;
  while (root.parent) root = root.parent;
  return root.module;
}

/**
 * The methods that change the value they're called on, keyed `Type.method`
 * as receiverTypeName names the type. On a fixed value each one is an error
 * (docs/modules.md "What you import is fixed"). tests/modules-freeze.test.ts
 * checks every method the API declares (TYPE_MEMBERS) is either here or
 * known to only read, so a new changing method can't slip past.
 */
export const CHANGES_RECEIVER: ReadonlySet<string> = new Set([
  'Array.push',
  'Array.pop',
  'Array.shift',
  'Array.unshift',
  'Cycler.pick',
  'Grid.set',
  'Grid.fill',
  'Gradient.stop',
  'Gradient.colorAll',
  'Gradient.point',
  'Gradient.contour',
  'MeshPoint.translate',
  'Mask.append',
  'ClipPath.append',
  'Pattern.append',
  'Marker.append',
  // The builder handed to variableOffset / compoundVariableOffset blocks.
  'VariableOffsetBuilder.stop',
  'VariableOffsetBuilder.startTangent',
  'VariableOffsetBuilder.endTangent',
  'VariableOffsetBuilder.startCap',
  'VariableOffsetBuilder.endCap',
]);

/**
 * The receiver types with at least one method in CHANGES_RECEIVER, so a call
 * on any other type skips building its `Type.method` key.
 */
export const CHANGES_RECEIVER_TYPES: ReadonlySet<string> = new Set(
  [...CHANGES_RECEIVER].map((key) => key.slice(0, key.indexOf('.'))),
);

/** Which file fixed a value or scope, and the name of the binding it was reached from. */
export interface FixedOwner {
  file: ModuleIdentity;
  name: string;
}

/** Everything fixed in one compile (docs/modules.md "What you import is fixed"). */
export type FixedValues = WeakMap<object, FixedOwner>;

/**
 * The types tied to a drawing. A module can't make one (its drawing is sealed
 * while it loads), so fixFile meeting one means that guard has a gap.
 */
const DRAWING_TYPES: ReadonlySet<string> = new Set([
  'LayerReference',
  'TransformReference',
  'TransformPropertyReference',
  'SubscriptionValue',
]);

/**
 * Namespaces, guarded as imports wherever they are, and values nothing can change.
 */
const NOT_FIXED = new Set([
  'ModuleNamespaceValue',
  // Values nothing can change: every property write is already an error and
  // no method changes them. Skipping them keeps a file of 90k points cheap
  // to fix (marking each doubled its load time). A type missing here is
  // marked, so the list can only err on the safe side.
  'BooleanValue',
  'AngleValue',
  'PointValue',
  'PolarVectorValue',
  'ColorValue',
  'PathBlockValue',
  'StyleBlockValue',
]);

/** The types heldValues looks inside. */
const HOLDERS = new Set(['ArrayValue', 'CyclerValue', 'ObjectValue', 'GridValue', 'GradientValue']);

/** The values a value holds, which are fixed along with it. */
function heldValues(value: object, tag: string): Iterable<unknown> {
  switch (tag) {
    case 'ArrayValue':
    case 'CyclerValue':
      return (value as { elements: unknown[] }).elements;
    case 'ObjectValue':
      return (value as { properties: Map<string, unknown> }).properties.values();
    case 'GridValue':
      return (value as { cells: unknown[][] }).cells.flat();
    case 'GradientValue':
      // getPoint() hands back the mesh's own points.
      return (value as { meshGrid?: unknown[][] }).meshGrid?.flat() ?? [];
    default:
      return [];
  }
}

/**
 * Fix what a file holds once it has loaded: its top-level variables, every
 * value reachable from them (the elements of arrays, objects, Cyclers and
 * grids, a mesh gradient's points), and the scopes its fns and lambdas close
 * over, such as a counter a fn made while the file loaded. Private values are
 * fixed too: an exported fn can hand them out. A value another file already
 * fixed keeps that file as its owner, so a file that re-exports a value
 * doesn't take it over. The walk is iterative and marks before it descends,
 * so cycles and deep nesting are safe.
 *
 * A scope belongs to the file it is written in, which isn't always the file
 * being fixed: `export const f = mk();` keeps a scope of the file `mk` comes
 * from. That scope's variables, and what they hold, belong to `mk`'s file,
 * whose code names them. Such scopes wait until the file's own scopes and
 * everything they hold are done, so a value the file reaches through its own
 * data stays the file's even when the other file's scope holds it too.
 *
 * A layer, transform or subscription can't be made while a module loads
 * (docs/modules.md "Exporting"). Reaching one here is an error rather than a
 * value that would draw into a drawing that doesn't exist.
 */
export function fixFile(root: Scope, file: ModuleIdentity, fixed: FixedValues): void {
  const ownScopes: Scope[] = [root];
  const otherScopes: { scope: Scope; writtenIn: ModuleIdentity }[] = [];
  // Only values that hold others wait their turn; the rest are marked as
  // they're found, so an array of 90k points queues nothing.
  const holders: { value: object; tag: string; owner: FixedOwner }[] = [];
  const queue = (scope: Scope, writtenIn: ModuleIdentity): void => {
    if (writtenIn.path === file.path) ownScopes.push(scope);
    else otherScopes.push({ scope, writtenIn });
  };
  /** The type of a value the walk fixes, or undefined for one it skips. */
  const fixable = (value: unknown): string | undefined => {
    if (typeof value !== 'object' || value === null || !('type' in value)) return undefined;
    const tag = value.type;
    return typeof tag === 'string' && !NOT_FIXED.has(tag) && !fixed.has(value) ? tag : undefined;
  };
  const mark = (value: object, tag: string, owner: FixedOwner): void => {
    if (DRAWING_TYPES.has(tag)) throw new Error(`${MODULE_DRAWS_MESSAGE} (${owner.name} holds a part of a drawing.)`);
    fixed.set(value, owner);
    if (tag === 'UserFunction' && 'closure' in value) {
      const closure = value.closure as Scope;
      queue(closure, moduleOf(closure) ?? file);
    } else if (HOLDERS.has(tag)) holders.push({ value, tag, owner });
  };
  const visit = (scope: Scope, writtenIn: ModuleIdentity): void => {
    if (fixed.has(scope)) return;
    fixed.set(scope, { file: writtenIn, name: '' });
    for (const [name, value] of scope.variables) {
      const tag = fixable(value);
      if (tag) mark(value as object, tag, { file: writtenIn, name });
    }
    if (scope.parent) queue(scope.parent, writtenIn);
  };
  for (;;) {
    const own = ownScopes.pop();
    if (own) {
      visit(own, file);
      continue;
    }
    const holder = holders.pop();
    if (holder) {
      for (const held of heldValues(holder.value, holder.tag)) {
        const tag = fixable(held);
        if (tag) mark(held as object, tag, holder.owner);
      }
      continue;
    }
    const other = otherScopes.pop();
    if (!other) return;
    visit(other.scope, other.writtenIn);
  }
}
