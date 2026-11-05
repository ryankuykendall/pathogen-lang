/**
 * The files the preview's document imports (docs/modules.md "In each tool"),
 * read in the extension host with the shared resolver (pathogen-lang/node
 * `resolveEditorModules`, the language server's rule too), open buffers first.
 * The webview compiles with them, so they cross postMessage as plain data:
 * a ModuleGraph's `files` is a Map, which postMessage would turn into `{}`.
 *
 * No `vscode` import: tests drive this with the real library.
 */
import { realpathSync } from 'node:fs';
import * as path from 'node:path';

/** The ModuleGraph as postMessage carries it: `files` as entries. */
export interface ModulesMessage {
  entry: string;
  order: string[];
  files: [string, unknown][];
}

/** A ModuleGraph (pathogen-lang), as far as the preview reads it. */
interface GraphLike {
  entry: string;
  order: string[];
  files: Map<string, { source: string }>;
}

/** What the preview needs from `pathogen-lang`. */
export interface PreviewLib {
  isModuleSource: (source: string) => boolean;
  formatModuleLoadError: (error: never, typedEntry: string) => string;
}

/** What the preview needs from `pathogen-lang/node`. */
export interface PreviewNodeLib {
  resolveEditorModules: (
    filePath: string | null,
    source: string,
    openText: (absolutePath: string) => string | undefined,
  ) => Promise<{ root: string | null; entry: string; graph: GraphLike; errors: unknown[] }>;
  editorModulePaths: (modules: never) => string[];
}

/** What a document's imports give the preview. */
export interface PreviewModules {
  /** The files, for the `update` message; none when the document imports nothing. */
  message?: ModulesMessage;
  /** The graph itself, for loading the imported files' fonts. */
  graph?: GraphLike;
  /** What couldn't be loaded, in the CLI's words. Like a font error, it stops the compile. */
  errors: string[];
  /** Shown above the preview: why a module's preview is empty. */
  notices: string[];
  /** The absolute paths of the files it imports: an edit to one draws the preview again. */
  watched: string[];
}

/** docs/modules.md "In each tool": "A module doesn't draw, so its preview is empty; to see its fns draw, open a program that imports it." */
export const MODULE_PREVIEW_NOTICE =
  "This file is a module: a module doesn't draw, so its preview is empty. To see its fns draw, open a program that imports it.";

export async function previewModules(
  libs: { lib: PreviewLib; node: PreviewNodeLib },
  filePath: string | undefined,
  source: string,
  openText: (absolutePath: string) => string | undefined,
): Promise<PreviewModules> {
  const notices = libs.lib.isModuleSource(source) ? [MODULE_PREVIEW_NOTICE] : [];
  const modules = await libs.node.resolveEditorModules(filePath ?? null, source, openText);
  const typed = filePath ? path.basename(filePath) : 'Untitled';
  const errors = modules.errors.map((error) => libs.lib.formatModuleLoadError(error as never, typed));
  const { graph } = modules;
  if (graph.files.size === 0) return { errors, notices, watched: [] };
  return {
    message: { entry: graph.entry, order: [...graph.order], files: [...graph.files.entries()] },
    graph,
    errors,
    notices,
    watched: libs.node.editorModulePaths(modules as never),
  };
}

/**
 * One spelling per file, for matching an editor's path with a project folder
 * joined to a project path: the real path on disk (links followed, the
 * disk's letter case). A file not on disk keeps its resolved path.
 */
export function samePathKey(filePath: string): string {
  try {
    return realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

/** A `ModulesMessage` back as the graph compile() takes (the webview's script does the same). */
export function modulesForCompile<T>(message: ModulesMessage): {
  entry: string;
  order: string[];
  files: Map<string, T>;
} {
  return { entry: message.entry, order: message.order, files: new Map(message.files as [string, T][]) };
}
