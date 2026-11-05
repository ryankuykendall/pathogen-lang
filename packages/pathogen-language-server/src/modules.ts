/**
 * Imports for the language server (docs/modules.md "In each tool"). Each
 * open document's files are read when it is checked, through its open
 * buffers (resolveEditorModules, the same rule as the preview), and kept
 * until the next check. Requests (hover, completion, …) are synchronous and
 * only read what was kept, so they never wait for the disk.
 *
 * It also answers which open documents a change affects (those whose files
 * include the changed one), turns a project path back into a URI, and lists
 * the project's modules for completing an import's path.
 */
import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { editorModulePaths, listProjectModules, resolveEditorModules } from 'pathogen-lang/node';

import type { LanguageServiceOptions, ModuleLoadError } from 'pathogen-lang';
import type { EditorModules } from 'pathogen-lang/node';

interface Known {
  modules: EditorModules;
  /** The absolute paths of the files it imports. */
  paths: Set<string>;
}

export class DocumentModules {
  private readonly byUri = new Map<string, Known>();

  /** The project's modules by project folder, once listed. */
  private readonly projectFiles = new Map<string, readonly string[]>();

  /** Listings in progress, by project folder. */
  private readonly listing = new Map<string, Promise<readonly string[]>>();

  /**
   * `openText` is an open buffer's text by absolute path (undefined when the
   * file isn't open). `resolve` and `list` are replaced in tests.
   */
  constructor(
    private readonly openText: (absolutePath: string) => string | undefined,
    private readonly resolve: typeof resolveEditorModules = resolveEditorModules,
    private readonly list: typeof listProjectModules = listProjectModules,
  ) {}

  /**
   * Each document's latest refresh, so an older one that finishes later is
   * dropped. Numbered from one counter that only grows, so a read from before
   * a close and reopen can't pass for a new one.
   */
  private readonly latest = new Map<string, number>();

  private refreshes = 0;

  /** Read the document's imports again: when it is checked. Also starts listing its project. */
  async refresh(uri: string, source: string): Promise<EditorModules> {
    const mine = ++this.refreshes;
    this.latest.set(uri, mine);
    const modules = await this.resolve(filePathOf(uri), source, this.openText);
    // A newer refresh started meanwhile, or the document closed: theirs stands.
    if (this.latest.get(uri) === mine) {
      this.byUri.set(uri, { modules, paths: new Set(editorModulePaths(modules).map(samePathKey)) });
      if (modules.root !== null) void this.listProject(modules.root);
    }
    return modules;
  }

  /** What the language services may know about the document, from its last check. */
  optionsFor(uri: string): LanguageServiceOptions {
    const known = this.byUri.get(uri);
    if (!known) return {};
    const files = known.modules.root === null ? undefined : this.projectFiles.get(known.modules.root);
    return { modules: known.modules.graph, ...(files ? { projectFiles: files } : {}) };
  }

  /** What couldn't be loaded at the document's last check, for getDiagnostics. */
  loadErrors(uri: string): ModuleLoadError[] {
    return this.byUri.get(uri)?.modules.errors ?? [];
  }

  /** A project path (a Location's `file`) as a URI, in the document's project folder. */
  uriFor(uri: string, projectPath: string): string | null {
    const root = this.byUri.get(uri)?.modules.root;
    return root ? pathToFileURL(path.join(root, ...projectPath.split('/').filter(Boolean))).href : null;
  }

  /** A project path in the document's project folder, as the one spelling of its file (samePathKey). */
  keyFor(uri: string, projectPath: string): string | null {
    const root = this.byUri.get(uri)?.modules.root;
    return root ? samePathKey(path.join(root, ...projectPath.split('/').filter(Boolean))) : null;
  }

  /** The open documents whose results a change to `changedUri` affects: they import it, directly or not. */
  dependents(changedUri: string): string[] {
    const changed = filePathOf(changedUri);
    if (changed === null) return [];
    const key = samePathKey(changed);
    const out: string[] = [];
    for (const [uri, known] of this.byUri) {
      if (uri !== changedUri && known.paths.has(key)) out.push(uri);
    }
    return out;
  }

  /** The document's project, listed (for tests and a first completion that wants to wait). */
  async listed(uri: string): Promise<void> {
    const root = this.byUri.get(uri)?.modules.root;
    if (root) await this.listProject(root);
  }

  /** A file was created, changed or deleted on disk: project lists start over. */
  filesChanged(): void {
    this.projectFiles.clear();
    this.listing.clear();
  }

  /** A closed document's imports are let go, and a read still in flight for it is dropped. */
  forget(uri: string): void {
    this.byUri.delete(uri);
    this.latest.delete(uri);
  }

  private listProject(root: string): Promise<readonly string[]> {
    const known = this.projectFiles.get(root);
    if (known) return Promise.resolve(known);
    let pending = this.listing.get(root);
    if (!pending) {
      pending = this.list(root).then(
        (files) => {
          // Only if no change came in meanwhile (filesChanged clears `listing`).
          if (this.listing.get(root) === pending) this.projectFiles.set(root, files);
          this.listing.delete(root);
          return files;
        },
        () => {
          this.listing.delete(root);
          return [];
        },
      );
      this.listing.set(root, pending);
    }
    return pending;
  }
}

/** A document's file path; null for one that isn't a saved file (`untitled:`, or a URI with a host). */
export function filePathOf(uri: string): string | null {
  if (!uri.startsWith('file:')) return null;
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}

/** A document's file as its one spelling (samePathKey); null for one that isn't a saved file. */
export function fileKeyOf(uri: string): string | null {
  const filePath = filePathOf(uri);
  return filePath === null ? null : samePathKey(filePath);
}

/**
 * One spelling per file, for matching paths that came different ways (an
 * editor's URI, a project folder joined with a project path): the real path
 * on disk, which follows links and, on macOS and Windows, takes the disk's
 * letter case. A file not on disk yet keeps its resolved path.
 */
export function samePathKey(filePath: string): string {
  try {
    return realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}
