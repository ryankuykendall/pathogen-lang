/**
 * The words of every import/export error (docs/modules.md "Errors"). One
 * home, shared by the parser's static checks, the AST builder and the
 * evaluator, so the docs, the compiler and the editors can't drift apart;
 * tests/modules-syntax.test.ts pins each one word for word.
 */

/**
 * How an error names the file an import points at: the path as written in the
 * import, without a leading `./`, so `"./parts/gears.pathogen"` reads
 * `parts/gears.pathogen`.
 */
export function importedFromLabel(written: string): string {
  return written.replace(/^\.\//, '');
}

export function notTopLevelError(keyword: 'import' | 'export'): string {
  return `${keyword} must be at the top level of the file, not inside a function or block.`;
}

export const IMPORTS_FIRST_MESSAGE =
  "import must come before the file's other statements, @font and define included. Only comments may come first.";

export const EXPORT_PLACEMENT_MESSAGE = 'export goes in front of a const, fn or enum declaration.';

/** An import that doesn't have its path yet — what the editor sees while one is being typed. */
export const INCOMPLETE_IMPORT_MESSAGE =
  'Incomplete import — write it as import { name } from "./file.pathogen"; or import * as name from "./file.pathogen";';

export const EXPORT_LET_MESSAGE =
  "export let isn't allowed: an imported file's variables are fixed once it has loaded. Use export const.";

export function defaultImportError(name: string, path: string): string {
  return (
    `import ${name} from "${path}" would import the file's drawing, which isn't supported. ` +
    `Import its names: import { … } from "${path}"; or import * as ${name} from "${path}";`
  );
}

/** A local name that an earlier import in the same file already brought in. */
export function importAgainError(name: string, firstLine: number, namespace: boolean): string {
  const how = namespace ? '* as …' : `{ ${name} as … }`;
  return `Cannot import ${name} again — it is already imported on line ${firstLine}. Import one of them under another name: ${how}`;
}

/** A top-level declaration reusing a name an import brought in. */
export function declareImportedAgainError(name: string, importLine: number): string {
  return `Cannot declare ${name} again — it is imported on line ${importLine}. Use another name`;
}

export function assignImportedError(name: string, written: string): string {
  return `Cannot assign to ${name} — it is imported from ${importedFromLabel(written)}. Declare your own with let if it needs to change`;
}

/**
 * An import in a program that has no files around it: the playground, an API
 * caller that passed no modules. Phase 1a; docs/modules.md "In each tool".
 */
export function noProjectFolderError(path: string): string {
  return (
    `Cannot import "${path}": this program has no project folder to read files from. ` +
    'Imports work in the CLI and VS Code; a playground workspace is one program for now.'
  );
}
