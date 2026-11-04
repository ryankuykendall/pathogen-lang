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
  "import must come before the file's other statements, @font and define included. Only comments and the module; line may come before it.";

export const EXPORT_PLACEMENT_MESSAGE = 'export goes in front of a const, fn or enum declaration.';

// --- Modules are libraries (docs/modules.md "Exporting") ---

/** `module;` after another statement, or below the top level. */
export const MODULE_FIRST_MESSAGE = "module; must be the file's first statement. Only comments may come before it.";

/** `export` in a file that doesn't start with `module;`. */
export const EXPORT_NEEDS_MODULE_MESSAGE =
  "export only works in a module. Remove export, or add module; at the top of the file to make it a module, which can't draw at its top level.";

/**
 * A module drawing while it loads: a path command, a drawing call (also
 * through a fn it calls), a layer, `apply`, text or `.subscribe(…)`.
 */
export const MODULE_DRAWS_MESSAGE =
  "A module can't draw while it loads. Draw in an exported fn, and call it from the file that imports this one.";

/** `define ViewBox` in a module. */
export const MODULE_VIEWBOX_MESSAGE =
  "A module has no drawing, so it can't define a ViewBox. The program that imports it sets the ViewBox.";

/** Reading `ctx` or `viewbox` while a module loads. */
export function moduleDrawingReadError(name: 'ctx' | 'viewbox'): string {
  return `A module has no drawing while it loads, so ${name} can't be read. Read it in an exported fn that the importing file calls; there it describes that file's drawing.`;
}

/** Importing a file that doesn't start with `module;`. */
export function notAModuleError(written: string): string {
  return `Cannot import "${written}": it isn't a module. To make it one, add module; at the top of that file and move its drawing into exported fns.`;
}

/** An import that doesn't have its path yet — what the editor sees while one is being typed. */
export const INCOMPLETE_IMPORT_MESSAGE =
  'Incomplete import — write it as import { name } from "./file.pathogen"; or import * as name from "./file.pathogen";';

export const EXPORT_LET_MESSAGE =
  "export let isn't allowed: an imported file's variables are fixed once it has loaded. Use export const.";

export function defaultImportError(name: string, path: string): string {
  return (
    `import ${name} from "${path}" isn't supported: Pathogen has no default export. ` +
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

// --- Values fixed once their file has loaded (docs/modules.md "What you import is fixed") ---

/** The kind of value a change hits, which picks the advice at the end of the message. */
export type FixedValueKind = 'array' | 'object' | 'cycler' | 'other';

/**
 * A change to a value that a file held when it finished loading. `own` is
 * true when the code making the change is in that same file (an exported fn
 * changing its file's values): the value "belongs to" the file. Otherwise it
 * "comes from" a file the running code imported.
 */
export function fixedValueError(
  name: string,
  file: string,
  kind: FixedValueKind,
  own: boolean,
  verb: 'change' | 'pick from' = 'change',
): string {
  if (own) {
    const advice =
      kind === 'array'
        ? 'Return a new array instead'
        : kind === 'object'
          ? 'Return a new object instead'
          : kind === 'cycler'
            ? 'Pass a Cycler in as a parameter instead'
            : 'Make a new one inside the fn, or pass one in as a parameter';
    return `Cannot ${verb} ${name} — it belongs to ${file}, whose values are fixed once it has loaded. ${advice}`;
  }
  // A fn's name can't have a dot: `kit.palette` suggests `export fn palette()`.
  const fnName = name.slice(name.lastIndexOf('.') + 1);
  const advice =
    kind === 'array'
      ? `Copy it first: [...${name}]`
      : kind === 'object'
        ? `Copy it first: { ...${name} }`
        : kind === 'cycler'
          ? `Export a fn that makes one instead: export fn ${fnName}() { return Cycler([…]); }`
          : 'Make your own, or export a fn that makes one';
  return `Cannot ${verb} ${name} — it comes from ${file}, and imported values are fixed. ${advice}`;
}

/** An exported fn giving one of its file's variables a new value after the file has loaded (decision 29). */
export function fixedVariableError(name: string, file: string): string {
  return `Cannot assign to ${name} — it belongs to ${file}, whose variables are fixed once it has loaded. Return the new value instead, or pass it in as a parameter`;
}

/** `kit.extra = 1` or `kit["extra"] = 1` on a `* as kit` namespace. */
export function fixedNamespaceError(name: string, file: string): string {
  return `Cannot change ${name} — it is imported from ${file}, and imported values are fixed. Declare a variable of your own with let, under another name`;
}

/**
 * The words every fixed-value message above carries after the file's name,
 * and the start of the module drawing messages (MODULE_DRAWS_MESSAGE and the
 * ones after it).
 */
const IMPORTED_VALUE_CLAUSE =
  /(?:, whose (?:values|variables) are fixed once it has loaded\. |, and imported values are fixed\. |A module can't draw while it loads\.|A module has no drawing)/;

/**
 * Whether `e` is one of the errors above: a change to a fixed value, or a
 * module drawing while it loads. A style value keeps its raw text when
 * evaluating it fails, so it lets these through, as it does a lexical-scope
 * miss: otherwise the raw text is rejected with a message about a disallowed
 * token. The test reads the words, so it still holds once the error has been
 * traced through other files.
 */
export function isImportedValueError(e: unknown): e is Error {
  return e instanceof Error && IMPORTED_VALUE_CLAUSE.test(e.message);
}

// --- Ids from other files (docs/modules.md "Ids from other files") ---

/** Two files whose paths give the same id prefix (`parts-gears.pathogen`, `parts/gears.pathogen`). */
export function idPrefixClashError(firstLabel: string, secondLabel: string, prefix: string): string {
  return `${firstLabel} and ${secondLabel} would both give their ids the prefix ${prefix}. Rename one of the files.`;
}

/** One of the compiled file's ids is an imported def's full id, and both reach the SVG. */
export function importedIdClashError(
  id: string,
  entryLabel: string,
  ownLine: number | undefined,
  written: string,
  fileLabelText: string,
  line: number | undefined,
): string {
  const at = (n: number | undefined): string => (n === undefined ? '' : ` line ${n}`);
  return `Duplicate defs ID '${id}': made in ${entryLabel}${at(ownLine)}, and as '${written}' in ${fileLabelText}${at(line)}. Rename one of them.`;
}

/** Two imported files whose prefix and id add up to the same full id (`a.pathogen`'s `b--x`, `a--b.pathogen`'s `x`). */
export function crossFileIdClashError(
  id: string,
  firstWritten: string,
  firstLabel: string,
  firstLine: number | undefined,
  written: string,
  label: string,
): string {
  const at = firstLine === undefined ? '' : ` line ${firstLine}`;
  return `Duplicate defs ID '${id}': made as '${firstWritten}' in ${firstLabel}${at}, and as '${written}' in ${label}. Rename one of them.`;
}

/** A raw `url(#…)` in the compiled file that matches only an imported def's id as written (a warning). */
export function importedRawRefWarning(written: string, fileLabelText: string, fullId: string): string {
  return `url(#${written}) matches no id in this file. The ${written} made in ${fileLabelText} is ${fullId} in your SVG; use the imported value instead.`;
}

// --- Fonts in imported files (docs/modules.md "Fonts in imported files") ---

/** Two files loading different font files as one family and weight. */
export function fontClashError(
  family: string,
  weight: number,
  firstWritten: string,
  firstLabel: string,
  secondWritten: string,
  secondLabel: string,
): string {
  return `Two files load different fonts as "${family}" ${weight}: ${firstWritten} (${firstLabel}) and ${secondWritten} (${secondLabel}). Use the same font in both files.`;
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
