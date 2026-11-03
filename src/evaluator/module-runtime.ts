/**
 * Run-time pieces of modules (docs/modules.md) that don't need the
 * evaluator's internals: the error that names another file, reading a
 * file's exports from its AST, and finding which file a scope runs.
 */
import { fileLabel } from '../module-messages';

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

  constructor(file: string, line: number | undefined, column: number | undefined, detail: string) {
    super(detail);
    this.name = 'ModuleTraceError';
    this.file = file;
    this.line = line;
    this.column = column;
    this.detail = detail;
    this.message = this.render();
  }

  /** Add the next file boundary on the way back, and the compiled-file position when it is reached. */
  addStep(text: string, site?: { line: number; column?: number }): void {
    this.trail.push(text);
    if (site) this.site = site;
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

/** The file a scope runs: its root scope's identity, when the compile has files. */
export function moduleOf(scope: Scope): ModuleIdentity | undefined {
  let root = scope;
  while (root.parent) root = root.parent;
  return root.module;
}
