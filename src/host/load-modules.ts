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
import {
  fileLabel,
  importBackslashError,
  importCaseMismatchError,
  importComputerPathError,
  importCycleError,
  importFolderError,
  importLeavesProjectError,
  importNoExtensionError,
  importNotAFileError,
  importNotAPathError,
  importNotFoundError,
  importOtherExtensionError,
  importUnreadableError,
} from '../module-messages';
import { parser as lezerParser } from '../parser/pathogen.generated';

import type { HostReadResult, ProjectFileHost } from './types';

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
    });
  }
  return imports;
}

const WEB_ADDRESS = /^[a-z][a-z0-9+.-]*:/i;
const DRIVE_PATH = /^[A-Za-z]:[\\/]/;

/**
 * A written path that can't be an import, with the message that says how to
 * fix it, or null when it is a well-formed `.pathogen` path (it may still not
 * exist). docs/modules.md "Errors", the path rows.
 */
export function importPathMistake(written: string): string | null {
  if (DRIVE_PATH.test(written) || written.startsWith('~')) return importComputerPathError(written);
  if (written.includes('\\')) {
    const fixed = written.replace(/\\/g, '/');
    return importBackslashError(written, /^\.{0,2}\//.test(fixed) ? fixed : `./${fixed}`);
  }
  // `.`, `..`, `./`, `./parts/`, `../..`: a folder, however it is spelled.
  const name = written.slice(written.lastIndexOf('/') + 1);
  if (name === '' || name === '.' || name === '..') return importFolderError(written);
  if (!written.startsWith('./') && !written.startsWith('../') && !written.startsWith('/')) {
    // A file name written without ./ gets the fix; a package name, a scheme
    // (`std:…`) or a web address is something only later releases may mean.
    const looksLikeFile = !written.startsWith('@') && !WEB_ADDRESS.test(written) && /[./]/.test(written);
    return looksLikeFile ? importNotAPathError(written) : importNotAFileError(written);
  }
  if (!name.includes('.')) return importNoExtensionError(written);
  if (!name.endsWith('.pathogen')) return importOtherExtensionError(written);
  return null;
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

export interface ModuleGraph {
  /** Project path of the compiled file (`/main.pathogen`; `/<inline>` for -e). */
  entry: string;
  /** Every file the program imports, directly or not, by project path. Not the entry. */
  files: Map<string, ModuleFile>;
  /** The imported files in the order they run: each after everything it imports. */
  order: string[];
}

export interface ResolveModulesResult {
  graph: ModuleGraph;
  /** Every path, read and cycle mistake found, in the order they were met. */
  errors: ModuleLoadError[];
}

export interface ResolveModulesOptions {
  host: ProjectFileHost;
  /** Project path of the compiled file. Its `./` paths start in its folder. */
  entry: string;
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
  const failed = new Map<string, Exclude<HostReadResult, { ok: true }> | 'not-text'>();
  // Each cycle once. Keyed by the files in it, so two cycles through the same
  // files in different orders count as one: fixing either breaks both.
  const reportedCycles = new Set<string>();

  const readFailure = (written: string, why: Exclude<HostReadResult, { ok: true }> | 'not-text'): string => {
    if (why === 'not-text') return importUnreadableError(written, 'it is not UTF-8 text');
    if (why.code === 'escapes-root') return importLeavesProjectError(written, host.projectLabel);
    if (why.code === 'case-mismatch') return importCaseMismatchError(written, respell(written, why.actual));
    if (why.code === 'not-found') return importNotFoundError(written, why.osPath);
    if (why.code === 'folder') return importFolderError(written);
    return importUnreadableError(written, why.detail);
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
    const mistake = importPathMistake(planned.written);
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
    const source = decodeText(read.bytes);
    if (source === null) {
      failed.set(path, 'not-text');
      errorAt(readFailure(planned.written, 'not-text'), from, planned, chain);
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
  return { graph: { entry, files, order }, errors };
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
    readFile: async (path) => {
      const read = await host.readFile(path);
      const text = read.ok ? openText(path) : undefined;
      return text === undefined ? read : { ok: true, bytes: new TextEncoder().encode(text) };
    },
  };
}

/**
 * A load error as the CLI prints it (docs/modules.md "Errors in other
 * files"): the file and position, then one `imported from` line per import
 * that led there. In the compiled file itself, `file:line:col: error:` as for
 * `@font`.
 */
export function formatModuleLoadError(error: ModuleLoadError, entryLabel: string): string {
  if (error.importedFrom.length === 0) return `${entryLabel}:${error.line}:${error.column}: error: ${error.message}`;
  const where = `${fileLabel(error.file)} line ${error.line}, col ${error.column}: ${error.message}`;
  const trail = error.importedFrom.map((site) => {
    const label =
      site.file === error.importedFrom[error.importedFrom.length - 1].file ? entryLabel : fileLabel(site.file);
    return `  imported from ${label} line ${site.line}`;
  });
  return [`Error: ${where}`, ...trail].join('\n');
}
