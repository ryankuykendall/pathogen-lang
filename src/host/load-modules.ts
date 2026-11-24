/**
 * The pre-compile import step (docs/modules.md; phase 1a, step 2), shared by
 * every tool that has files: find each file's top-level imports, read the
 * files they name through the host, and hand the compile all of it, so the
 * evaluator never reads a file. It is the same split as fonts
 * (load-fonts.ts), and the path rules are docs/projects.md's, worded for
 * `import`.
 *
 * Nothing here touches a file system: a host reads project paths, so the
 * same code runs in Node (CLI, VS Code, the language server) and, later, in
 * the playground with a workspace's files.
 */
import { resolveProjectPath, respell } from './paths';
import { dataFormatOf, suggestedDataName } from '../data/data-files';
import { readJson } from '../data/json-reader';
import {
  dataNeedsNameError,
  dataNotTextError,
  dataTooLargeError,
  defaultImportError,
  fileLabel,
  importBackslashError,
  importCaseMismatchError,
  importComputerPathError,
  importCycleError,
  importDataNoExtensionError,
  importFolderError,
  importLeavesProjectError,
  importNoExtensionError,
  importNotAFileError,
  importNotAPathError,
  importNotFoundError,
  importNotImportableError,
  importUnreadableError,
  megabytes,
  notAModuleError,
  unsavedFileImportError,
} from '../module-messages';
import { isModuleSource } from '../parser/module-source';
import { parser as lezerParser } from '../parser/pathogen.generated';

import type { SyntaxNode } from '@lezer/common';

import type { HostReadResult, ProjectFileHost } from './types';
import type { DataValue, JsonReadResult } from '../data/json-reader';
import type { ImportForm } from '../module-messages';

export type { ImportForm };

/** One import as written: the path and where its string is. */
export interface PlannedImport {
  /** The path exactly as written between the quotes. */
  written: string;
  /** 1-based position of the path string (its opening quote). */
  line: number;
  column: number;
  /** Document offsets of the path string, quotes included. */
  from: number;
  to: number;
  /**
   * Where the import statement starts (its `import`). The text from here to
   * `from` is what it imports (`import { gear } from `), which tells two imports
   * of one path apart.
   */
  statementFrom: number;
  /** How it names what it imports: braces, `* as`, or a name alone (a data file). */
  form: ImportForm;
  /** The name a `* as` or a data import binds; absent for braces. */
  name?: string;
}

/** The form of an import declaration in the parse tree, and the name it binds for `* as` and a data import. */
function importFormOf(node: SyntaxNode, source: string): { form: ImportForm; name?: string } {
  const named = (child: SyntaxNode | null | undefined): string | undefined =>
    child ? source.slice(child.from, child.to) : undefined;
  const namespace = node.getChild('NamespaceImport');
  if (namespace) return { form: 'namespace', name: named(namespace.getChild('VariableName')) };
  const data = node.getChild('DefaultImport');
  if (data) return { form: 'default', name: named(data.getChild('VariableName')) };
  return { form: 'named' };
}

/**
 * The file's top-level imports, in source order. Read from the parse tree
 * alone, so a file with other mistakes still yields its imports; an import
 * inside a function, or one with no path yet, is the parser's to report.
 */
export function planImports(source: string): PlannedImport[] {
  const imports: PlannedImport[] = [];
  const tree = lezerParser.parse(source);
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== 'ImportDeclaration') continue;
    const path = node.getChild('String');
    if (!path) continue;
    const before = source.slice(0, path.from).split('\n');
    imports.push({
      // Raw text between the quotes, as in the AST: an import path processes no escapes.
      written: source.slice(path.from + 1, path.to - 1),
      line: before.length,
      column: before[before.length - 1].length + 1,
      from: path.from,
      to: path.to,
      statementFrom: node.from,
      ...importFormOf(node, source),
    });
  }
  return imports;
}

// Whether a file says it is a module: one home, which the highlight bundle shares.
export { isModuleSource };

const WEB_ADDRESS = /^[a-z][a-z0-9+.-]*:/i;
const DRIVE_PATH = /^[A-Za-z]:[\\/]/;

/**
 * A written path that can't be an import in this form, with the message that
 * says how to fix it, or null when it is well formed (the file may still not
 * exist): a `.pathogen` path for braces or `* as`, a data file's path for a
 * name alone (docs/modules.md and docs/data-import.md "Errors", the path
 * rows). `name` is what a `* as` or data import binds, which the messages
 * reuse.
 */
export function importPathMistake(written: string, form: ImportForm = 'named', name?: string): string | null {
  if (DRIVE_PATH.test(written) || written.startsWith('~')) return importComputerPathError(written);
  if (written.includes('\\')) {
    const fixed = written.replace(/\\/g, '/');
    return importBackslashError(written, /^\.{0,2}\//.test(fixed) ? fixed : `./${fixed}`);
  }
  // `.`, `..`, `./`, `./parts/`, `../..`: a folder, however it is spelled.
  const fileName = written.slice(written.lastIndexOf('/') + 1);
  if (fileName === '' || fileName === '.' || fileName === '..') return importFolderError(written);
  if (!written.startsWith('./') && !written.startsWith('../') && !written.startsWith('/')) {
    // A file name written without ./ gets the fix; a package name, a scheme
    // (`std:…`) or a web address is something only later releases may mean.
    const looksLikeFile = !written.startsWith('@') && !WEB_ADDRESS.test(written) && /[./]/.test(written);
    return looksLikeFile ? importNotAPathError(written) : importNotAFileError(written);
  }
  const isModulePath = fileName.endsWith('.pathogen');
  const isDataPath = dataFormatOf(fileName) !== null;
  if (form === 'default') {
    if (isModulePath) return defaultImportError(name ?? 'name', written);
    if (isDataPath) return null;
    return fileName.includes('.') ? importNotImportableError(written) : importDataNoExtensionError(written);
  }
  if (isModulePath) return null;
  if (isDataPath) {
    return dataNeedsNameError(written, form === 'namespace' && name ? name : suggestedDataName(written));
  }
  return fileName.includes('.') ? importNotImportableError(written) : importNoExtensionError(written);
}

/** An imported file, read and ready to compile. */
export interface ModuleFile {
  /** Project path: `/parts/gears.pathogen`. */
  path: string;
  source: string;
  /** Its imports, each with the project path it names. */
  imports: (PlannedImport & { path: string })[];
  /**
   * The imports by which the compile first reached this file, nearest first,
   * ending in the compiled file: an error in its own code is reported with
   * these `imported from` lines.
   */
  importedFrom: ImportSite[];
}

/** One step of the chain that led to a file: the import that names it. */
export interface ImportSite {
  /** Project path of the file the import is written in. */
  file: string;
  line: number;
  column: number;
}

export interface ModuleLoadError {
  message: string;
  /** Where the mistake is: the file and the position of the import's path. */
  file: string;
  line: number;
  column: number;
  /**
   * The imports that led to `file`, nearest first and ending in the compiled
   * file. Empty when the mistake is in the compiled file itself.
   */
  importedFrom: ImportSite[];
}

/** A data file the program imports (docs/data-import.md), read and ready. */
export interface DataFile {
  /** Project path: `/data/gears.json`. */
  path: string;
  /** Its text, byte-order mark dropped. */
  text: string;
  /**
   * Its value as Pathogen values, read once. Fixed: the compile makes every
   * change to it an error, so one value can serve every compile that reads
   * the same text (docs/data-import.md "What you import is fixed").
   */
  value: DataValue;
  /** The imports by which the compile first reached it, nearest first, ending in the compiled file. */
  importedFrom: ImportSite[];
  /** The name the first import gave it, which messages about changing it use. */
  name: string;
}

export interface ModuleGraph {
  /** Project path of the compiled file (`/main.pathogen`; `/<inline>` for -e). */
  entry: string;
  /** Every module the program imports, directly or not, by project path. Not the entry, not data files. */
  files: Map<string, ModuleFile>;
  /** The imported modules in the order they run: each after everything it imports. */
  order: string[];
  /**
   * Every data file the program imports, directly or through modules, by
   * project path. Kept apart from `files`: they hold no Pathogen. Absent in a
   * graph built before data imports, which is one with none.
   */
  data?: Map<string, DataFile>;
}

export interface ResolveModulesResult {
  graph: ModuleGraph;
  /** Every path, read and cycle mistake found, in the order they were met. */
  errors: ModuleLoadError[];
  /**
   * The project paths of the files it tried to read and couldn't (missing,
   * not text, not a module, too large, a JSON mistake): a change to one of
   * them may fix the program, so an editor checks it again then.
   */
  unread: string[];
}

export interface ResolveModulesOptions {
  host: ProjectFileHost;
  /** Project path of the compiled file. Its `./` paths start in its folder. */
  entry: string;
  /**
   * The largest data file to read, in bytes (DEFAULT_MAX_DATA_BYTES unless
   * raised: `--max-data-size`, VS Code's `pathogen.maxDataSize`).
   */
  maxDataBytes?: number;
}

/** A data file can be up to 50 MB on disk unless raised (docs/data-import.md, docs/cli.md "Data files"). */
export const DEFAULT_MAX_DATA_BYTES = 50 * 1024 * 1024;

/**
 * Data files read recently, by project and path, with the text each was read
 * from: an editor resolves imports on every keystroke, and a data file that
 * hasn't changed is the same text (note 76, decision 7). A hit hands back the
 * same value, which is safe because data values are fixed.
 *
 * Kept to about DATA_CACHE_HEAP bytes of values, the least recently used
 * going first; the file just read always stays. A value takes about six times
 * its text in memory (note 77: 57 MB of records took 360 MB), more for many
 * tiny objects, so the budget counts VALUE_PER_CHAR bytes for each character.
 */
const dataCache = new Map<string, { text: string; result: JsonReadResult }>();
const DATA_CACHE_HEAP = 512 * 1024 * 1024;
const VALUE_PER_CHAR = 8;

function readDataText(key: string, text: string): JsonReadResult {
  const hit = dataCache.get(key);
  dataCache.delete(key);
  if (hit?.text === text) {
    dataCache.set(key, hit);
    return hit.result;
  }
  const result = readJson(text);
  dataCache.set(key, { text, result });
  let total = 0;
  for (const entry of dataCache.values()) total += entry.text.length * VALUE_PER_CHAR;
  for (const [older, entry] of dataCache) {
    if (total <= DATA_CACHE_HEAP || older === key) break;
    dataCache.delete(older);
    total -= entry.text.length * VALUE_PER_CHAR;
  }
  return result;
}

/** Why a data file couldn't be read: the host's answer, too large, or not UTF-8. */
type DataReadFailure = Exclude<HostReadResult, { ok: true }> | 'not-text' | { tooLarge: number };

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** A file's text: the host's own when it holds one (a workspace in memory), else its bytes decoded; null when they aren't UTF-8. */
function textOf(read: { bytes: Uint8Array; text?: string }): string | null {
  if (read.text === undefined) return decodeText(read.bytes);
  return read.text.startsWith(BYTE_ORDER_MARK) ? read.text.slice(1) : read.text;
}

/**
 * A file's size to compare with `max`. A text the host holds counts only when
 * it could pass `max` (UTF-8 takes at most 3 bytes a UTF-16 unit); short of
 * that its length is enough to know it doesn't.
 */
function sizeAgainst(read: { bytes: Uint8Array; text?: string }, max: number): number {
  if (read.text !== undefined && read.text.length * 3 <= max) return read.text.length;
  return read.bytes.length;
}

/** Decode a file's bytes as UTF-8 text, or null when they aren't. */
function decodeText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.startsWith('﻿') ? text.slice(1) : text;
  } catch {
    return null;
  }
}

/**
 * Read every file the program imports, following imports in imported files,
 * and report each mistake at the import that makes it. A file is read once
 * however many files import it; a file that can't be read is an error at
 * every import that names it, so each importing file shows its own. A cycle
 * is reported once, at the import that closes it, naming every file on the
 * way round.
 */
export async function resolveModules(
  entrySource: string,
  options: ResolveModulesOptions,
): Promise<ResolveModulesResult> {
  const { host, entry } = options;
  const files = new Map<string, ModuleFile>();
  const order: string[] = [];
  const errors: ModuleLoadError[] = [];
  // Why a path couldn't be read, kept so every import of it gets its own
  // message (worded as that import writes the path) without reading it again.
  const failed = new Map<string, Exclude<HostReadResult, { ok: true }> | 'not-text' | 'not-module'>();
  // Each cycle once. Keyed by the files in it, so two cycles through the same
  // files in different orders count as one: fixing either breaks both.
  const reportedCycles = new Set<string>();

  const readFailure = (
    written: string,
    why: Exclude<HostReadResult, { ok: true }> | 'not-text' | 'not-module',
  ): string => {
    if (why === 'not-text') return importUnreadableError(written, 'it is not UTF-8 text');
    if (why === 'not-module') return notAModuleError(written);
    if (why.code === 'escapes-root') return importLeavesProjectError(written, host.projectLabel);
    if (why.code === 'case-mismatch') return importCaseMismatchError(written, respell(written, why.actual));
    if (why.code === 'not-found') return importNotFoundError(written, why.osPath);
    if (why.code === 'folder') return importFolderError(written);
    // Only a data file's read has a size limit; kept for completeness.
    if (why.code === 'too-large') return importUnreadableError(written, `it is ${megabytes(why.size)}`);
    return importUnreadableError(written, why.detail);
  };

  const maxDataBytes = options.maxDataBytes ?? DEFAULT_MAX_DATA_BYTES;
  const data = new Map<string, DataFile>();
  // Why a data file couldn't be read, as `failed` is for modules; 'reported'
  // for a JSON mistake, which is an error in the file itself, so once is enough.
  const failedData = new Map<string, DataReadFailure | 'reported'>();
  const dataFailure = (written: string, why: DataReadFailure): string => {
    if (why === 'not-text') return dataNotTextError(written);
    if ('tooLarge' in why) return dataTooLargeError(written, why.tooLarge, maxDataBytes);
    if (why.code === 'too-large') return dataTooLargeError(written, why.size, maxDataBytes);
    return readFailure(written, why);
  };

  const errorAt = (
    message: string,
    file: string,
    at: { line: number; column: number },
    importedFrom: ImportSite[],
  ): void => {
    errors.push({ message, file, line: at.line, column: at.column, importedFrom });
  };

  /**
   * Read a data file (once) at the project path an import names
   * (docs/data-import.md). Reading it can fail at the import (too large, not
   * UTF-8, the path's own mistakes) or in the file (a JSON mistake, at its
   * line and column, traced back through the imports that led there).
   */
  const visitData = async (
    from: string,
    planned: PlannedImport,
    path: string,
    chain: ImportSite[],
  ): Promise<string | null> => {
    if (data.has(path)) return path;
    const earlier = failedData.get(path);
    if (earlier !== undefined) {
      if (earlier !== 'reported') errorAt(dataFailure(planned.written, earlier), from, planned, chain);
      return null;
    }
    const fail = (why: DataReadFailure): null => {
      failedData.set(path, why);
      errorAt(dataFailure(planned.written, why), from, planned, chain);
      return null;
    };
    const read = await host.readFile(path, { maxBytes: maxDataBytes });
    if (!read.ok) return fail(read);
    const size = sizeAgainst(read, maxDataBytes);
    if (size > maxDataBytes) return fail({ tooLarge: size });
    const text = textOf(read);
    if (text === null) return fail('not-text');
    const importedFrom: ImportSite[] = [{ file: from, line: planned.line, column: planned.column }, ...chain];
    // By project too: one language server can hold several projects with the same paths.
    const parsed = readDataText(`${host.projectLabel}\0${path}`, text);
    if (!parsed.ok) {
      failedData.set(path, 'reported');
      errors.push({ message: parsed.message, file: path, line: parsed.line, column: parsed.column, importedFrom });
      return null;
    }
    const name = planned.name ?? suggestedDataName(planned.written);
    data.set(path, { path, text, value: parsed.value, importedFrom, name });
    return path;
  };

  /**
   * Read one import's file (once) and everything it imports. `stack` is the
   * chain of files being read, entry first, to catch cycles; `chain` is the
   * import sites that led to `from`, nearest first, for messages.
   */
  const visit = async (
    from: string,
    planned: PlannedImport,
    stack: string[],
    chain: ImportSite[],
  ): Promise<string | null> => {
    const mistake = importPathMistake(planned.written, planned.form, planned.name);
    if (mistake) {
      errorAt(mistake, from, planned, chain);
      return null;
    }
    const resolved = resolveProjectPath(planned.written, from);
    if (!resolved.ok) {
      errorAt(importLeavesProjectError(planned.written, host.projectLabel), from, planned, chain);
      return null;
    }
    const path = resolved.path;
    // A data file imports nothing, so it can't be part of a cycle.
    if (planned.form === 'default') return visitData(from, planned, path, chain);
    const cycleAt = stack.indexOf(path);
    if (cycleAt !== -1) {
      const cycle = [...stack.slice(cycleAt), path];
      const key = cycle.slice(0, -1).sort().join('\n');
      if (!reportedCycles.has(key)) {
        reportedCycles.add(key);
        errorAt(importCycleError(cycle), from, planned, chain);
      }
      return null;
    }
    if (files.has(path)) return path;
    const earlier = failed.get(path);
    if (earlier) {
      errorAt(readFailure(planned.written, earlier), from, planned, chain);
      return null;
    }

    const read = await host.readFile(path);
    if (!read.ok) {
      failed.set(path, read);
      errorAt(readFailure(planned.written, read), from, planned, chain);
      return null;
    }
    const source = textOf(read);
    if (source === null) {
      failed.set(path, 'not-text');
      errorAt(readFailure(planned.written, 'not-text'), from, planned, chain);
      return null;
    }
    // Only a module can be imported: a program's drawing has nowhere to go.
    if (!isModuleSource(source)) {
      failed.set(path, 'not-module');
      errorAt(readFailure(planned.written, 'not-module'), from, planned, chain);
      return null;
    }

    const site: ImportSite = { file: from, line: planned.line, column: planned.column };
    const file: ModuleFile = { path, source, imports: [], importedFrom: [site, ...chain] };
    files.set(path, file);
    for (const inner of planImports(source)) {
      const innerPath = await visit(path, inner, [...stack, path], file.importedFrom);
      if (innerPath) file.imports.push({ ...inner, path: innerPath });
    }
    order.push(path);
    return path;
  };

  for (const planned of planImports(entrySource)) {
    await visit(entry, planned, [entry], []);
  }
  return { graph: { entry, files, order, data }, errors, unread: [...failed.keys(), ...failedData.keys()] };
}

/** A data file as a message carries it: its text, not its value. */
export type DataFileMessage = Omit<DataFile, 'value'>;

/** A ModuleGraph as a message carries it (graphForMessage). */
export interface ModuleGraphMessage extends Omit<ModuleGraph, 'data'> {
  data?: Map<string, DataFileMessage | DataFile>;
}

/**
 * A graph for postMessage: data files as text only (phase 3a step 6). A
 * structured clone would copy each data value, several times its file's
 * size, on every compile; the text is one string, and graphFromMessage reads
 * it again once per text.
 */
export function graphForMessage(graph: ModuleGraph): ModuleGraphMessage {
  if (!graph.data || graph.data.size === 0) return graph;
  const data = new Map<string, DataFileMessage>();
  for (const [path, file] of graph.data) {
    const { value: _value, ...asText } = file;
    data.set(path, asText);
  }
  return { ...graph, data };
}

/**
 * A graph a message carried, ready to compile: each data file's text read
 * again, through the loader's cache under `cacheLabel` (the reader's own
 * name for the project), so a text already read gives the same value. A data
 * file whose text doesn't read is left out: the sender's load error says why.
 */
export function graphFromMessage(message: ModuleGraphMessage, cacheLabel: string): ModuleGraph {
  if (!message.data || message.data.size === 0) return message as ModuleGraph;
  const data = new Map<string, DataFile>();
  for (const [path, file] of message.data) {
    if ('value' in file) {
      data.set(path, file);
      continue;
    }
    const read = readDataText(`${cacheLabel}\0${path}`, file.text);
    if (read.ok) data.set(path, { ...file, value: read.value });
  }
  return { ...message, data };
}

/**
 * A host whose files read as their open editor buffers, so the language
 * server and the preview see unsaved edits (docs/modules.md "In each tool").
 * The disk read still runs first and decides everything about the path —
 * letter case, links that leave the project, a folder — so a buffer can only
 * stand in for a file that is really there.
 */
export function withOpenDocuments(
  host: ProjectFileHost,
  openText: (path: string) => string | undefined,
): ProjectFileHost {
  return {
    projectLabel: host.projectLabel,
    readFile: async (path, options) => {
      const read = await host.readFile(path, options);
      // A file too large on disk is still a file there: its open buffer, which
      // the loader measures in turn, stands in for it.
      const text = read.ok || read.code === 'too-large' ? openText(path) : undefined;
      return text === undefined ? read : { ok: true, bytes: new TextEncoder().encode(text) };
    },
  };
}

/**
 * A load error as the CLI prints it (docs/modules.md "Errors in other
 * files"): the file and position, then one `imported from` line per import
 * that led there, every file named by its path from the project folder, as
 * run-time errors name them. In the compiled file itself it reads like an
 * `@font` error, `<typed>:line:col: error: …`, with the path as typed.
 */
export function formatModuleLoadError(error: ModuleLoadError, typedEntry: string): string {
  if (error.importedFrom.length === 0) return `${typedEntry}:${error.line}:${error.column}: error: ${error.message}`;
  return `Error: ${describeInImportedFile(error.file, error, error.message, error.importedFrom)}`;
}

/**
 * A message from an imported file, as the editors and the CLI show it: the
 * file and position, then one `imported from` line per import that led
 * there (docs/modules.md "Errors in other files").
 */
export function describeInImportedFile(
  file: string,
  at: { line?: number; column?: number },
  message: string,
  importedFrom: readonly ImportSite[],
): string {
  const column = at.column === undefined ? '' : `, col ${at.column}`;
  const position = at.line === undefined ? '' : ` line ${at.line}${column}`;
  const trail = importedFrom.map((site) => `  imported from ${fileLabel(site.file)} line ${site.line}`);
  return [`${fileLabel(file)}${position}: ${message}`, ...trail].join('\n');
}

/**
 * The imports of a file that isn't saved yet, each as a load error at its
 * path: with no folder to start from, none of them can be read (docs/modules.md
 * "In each tool"). The editors show them as for any import that can't load.
 */
export function unsavedImportErrors(source: string): ModuleLoadError[] {
  return planImports(source).map((planned) => ({
    message: unsavedFileImportError(planned.written),
    file: '/<unsaved>',
    line: planned.line,
    column: planned.column,
    importedFrom: [],
  }));
}
