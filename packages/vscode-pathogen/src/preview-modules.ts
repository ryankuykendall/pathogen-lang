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

/**
 * A data file as postMessage carries it (docs/data-import.md): its text, not
 * its value. A value is Maps all the way down, which postMessage would turn
 * into `{}`, so the webview reads the text again (modulesForCompile).
 */
export interface DataMessage {
  path: string;
  text: string;
  name: string;
  importedFrom: unknown[];
}

/** The ModuleGraph as postMessage carries it: `files` and `data` as entries. */
export interface ModulesMessage {
  entry: string;
  order: string[];
  files: [string, unknown][];
  data: [string, DataMessage][];
}

/** A ModuleGraph (pathogen-lang), as far as the preview reads it. */
interface GraphLike {
  entry: string;
  order: string[];
  files: Map<string, { source: string }>;
  data?: Map<string, DataMessage & { value: unknown }>;
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
    options?: { maxDataBytes?: number },
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

/**
 * docs/modules.md "In each tool": "Without a main, it shows the file you're
 * editing; a module doesn't draw, so its preview is empty there. To see its
 * fns draw, open a program that imports it." (In a project with a main, the
 * preview shows a program instead: preview-programs.ts.)
 */
export const MODULE_PREVIEW_NOTICE =
  "This file is a module: a module doesn't draw, so its preview is empty. To see its fns draw, open a program that imports it.";

export async function previewModules(
  libs: { lib: PreviewLib; node: PreviewNodeLib },
  filePath: string | undefined,
  source: string,
  openText: (absolutePath: string) => string | undefined,
  /** The `pathogen.maxDataSize` setting, in bytes; 50 MB unless given. */
  maxDataBytes?: number,
): Promise<PreviewModules> {
  const notices = libs.lib.isModuleSource(source) ? [MODULE_PREVIEW_NOTICE] : [];
  const modules = await libs.node.resolveEditorModules(
    filePath ?? null,
    source,
    openText,
    maxDataBytes === undefined ? {} : { maxDataBytes },
  );
  const typed = filePath ? path.basename(filePath) : 'Untitled';
  const errors = modules.errors.map((error) => libs.lib.formatModuleLoadError(error as never, typed));
  const { graph } = modules;
  const data = [...(graph.data?.values() ?? [])];
  if (graph.files.size === 0 && data.length === 0) return { errors, notices, watched: [] };
  return {
    message: {
      entry: graph.entry,
      order: [...graph.order],
      files: [...graph.files.entries()],
      data: data.map(({ path: dataPath, text, name, importedFrom }): [string, DataMessage] => [
        dataPath,
        { path: dataPath, text, name, importedFrom },
      ]),
    },
    graph,
    errors,
    notices,
    watched: libs.node.editorModulePaths(modules as never),
  };
}

/**
 * One spelling per file, for matching an editor's path with a project folder
 * joined to a project path: the real path on disk (links followed, the
 * disk's letter case). A file not on disk (deleted, or not made yet) gets its
 * nearest folder that is, spelled the same way, then the rest as given: so a
 * file just deleted keeps the spelling it had, even under a link.
 */
export function samePathKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  let dir = resolved;
  let tail = '';
  for (;;) {
    try {
      const real = realpathSync.native(dir);
      return tail === '' ? real : path.join(real, tail);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return resolved;
      tail = tail === '' ? path.basename(dir) : path.join(path.basename(dir), tail);
      dir = parent;
    }
  }
}

/**
 * A `ModulesMessage` back as the graph compile() takes, each data file's text
 * read again with `readJson` (pathogen-lang's; the webview's script does the
 * same with its bundled copy). The extension host already read it without a
 * mistake, so a mistake here is left out: the host's load error says why.
 */
export function modulesForCompile<T>(
  message: ModulesMessage,
  readJson: (text: string) => { ok: true; value: unknown } | { ok: false },
): {
  entry: string;
  order: string[];
  files: Map<string, T>;
  data: Map<string, DataMessage & { value: never }>;
} {
  const data = new Map<string, DataMessage & { value: never }>();
  for (const [dataPath, file] of message.data ?? []) {
    const read = readJson(file.text);
    if (read.ok) data.set(dataPath, { ...file, value: read.value as never });
  }
  return { entry: message.entry, order: message.order, files: new Map(message.files as [string, T][]), data };
}
