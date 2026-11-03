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

// --- Loading files (src/host/load-modules.ts; docs/modules.md "Errors") ---

/** A path as a file label in messages: the project path without its leading `/`. */
export function fileLabel(projectPath: string): string {
  return projectPath.replace(/^\//, '');
}

export function importNotAPathError(written: string): string {
  return `import "${written}" isn't a path. Paths start with ./, ../ or / — did you mean "./${written}"?`;
}

export function importNotAFileError(written: string): string {
  return `import "${written}": only files in the project folder can be imported. Paths start with ./, ../ or /.`;
}

export function importComputerPathError(written: string): string {
  return `import path "${written}" is a path on your computer. Write paths relative to the file (./ or ../) or the project folder (/).`;
}

export function importBackslashError(written: string, fixed: string): string {
  return `import path "${written}" uses a backslash. Write paths with forward slashes on every system: "${fixed}".`;
}

export function importNoExtensionError(written: string): string {
  return `import path "${written}" has no .pathogen extension. Write the file's full name: "${written}.pathogen".`;
}

export function importOtherExtensionError(written: string): string {
  return `import path "${written}" isn't a .pathogen file. Only .pathogen files can be imported.`;
}

export function importLeavesProjectError(written: string, projectLabel: string): string {
  return `import path "${written}" leaves the project folder (${projectLabel}). Move the file into the project folder, or move the project's pathogen.json (or add one) to a folder that contains both files, other than your home folder itself.`;
}

export function importCaseMismatchError(written: string, respelled: string): string {
  return `import file "${written}" differs from the file on disk only in letter case: "${respelled}". Paths are case-sensitive on every system.`;
}

export function importNotFoundError(written: string, osPath: string): string {
  const rootHint = written.startsWith('/') ? " A leading / means the project folder, not your computer's root." : '';
  return `import file "${written}" was not found (looked for ${osPath}).${rootHint}`;
}

export function importFolderError(written: string): string {
  return `import path "${written}" is a folder, not a file.`;
}

export function importUnreadableError(written: string, reason: string): string {
  return `import file "${written}" could not be read: ${reason}`;
}

/** `cycle` is project paths in import order, ending where it started. */
export function importCycleError(cycle: readonly string[]): string {
  return `Import cycle: ${cycle.map(fileLabel).join(' → ')}. Move what both files need into a third file that both import.`;
}

// --- Binding imports at run time (src/evaluator; docs/modules.md "Errors") ---

/** Export names for a message: alphabetical, ignoring case (`gear, Teeth, toothDepth`). */
function exportList(names: Iterable<string>): string {
  const sorted = [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b));
  return sorted.length > 0 ? sorted.join(', ') : 'nothing';
}

export function noExportError(fileLabelText: string, name: string, exports: Iterable<string>): string {
  return `${fileLabelText} has no export named ${name}. It exports: ${exportList(exports)}.`;
}

export function declaredNotExportedError(fileLabelText: string, name: string): string {
  return `${fileLabelText} declares ${name} but doesn't export it. Put export in front of its declaration in ${fileLabelText}.`;
}

export function namespaceNoExportError(
  namespace: string,
  fileLabelText: string,
  name: string,
  exports: Iterable<string>,
): string {
  return `${namespace} has no export named ${name}. ${fileLabelText} exports: ${exportList(exports)}.`;
}

/** An import whose file the host didn't load (its own error is reported by the loader). */
export function moduleNotLoadedError(path: string): string {
  return `Cannot import "${path}": the file was not loaded.`;
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
