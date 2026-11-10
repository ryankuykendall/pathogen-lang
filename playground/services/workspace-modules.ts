// The import graph the editor's language services use for the open file
// (project-docs/modules/51-phase-2c-plan.md, pieces 5 and 6): completion,
// hover, signature help and diagnostics get `{ modules, projectFiles }` from
// here, as VS Code's language server gives them per document
// (packages/pathogen-language-server/src/modules.ts).
//
// The language services are synchronous; reading imports is not. So the
// graph is kept here and refreshed in the background, and a request uses the
// latest one. It's rebuilt only when what it depends on changes: another
// file's text, the open file, or the open file's import lines. A keystroke
// that touches none of those keeps the same graph object, so the engine's
// per-file analysis cache (analyzeFile, keyed by ModuleFile) holds (note 38:
// rebuilding per keystroke would re-analyze every file).

import { store } from '../state/store.js';
import { workspaceNow } from './workspace-files.js';

import type { WorkspaceTexts } from './workspace-files.js';

type Lib = Window['PathogenLang'];
type Resolved = Awaited<ReturnType<Lib['resolveModules']>>;
type ModuleGraph = Resolved['graph'];
type ModuleLoadError = Resolved['errors'][number];

/** What the language services take for the open file. */
export interface OpenFileModules {
  modules: ModuleGraph;
  loadErrors: ModuleLoadError[];
  /** Every library in the workspace, by project path: what an import path can complete to. */
  projectFiles: string[];
}

/**
 * The library, once it has loaded (a page before then has no graph). Checked
 * at run time: a page can be served with a bundle older than these functions.
 */
function lib(): Lib | null {
  const l = (window as { PathogenLang?: Lib }).PathogenLang;
  const ready =
    typeof l?.createMemoryProjectHost === 'function' &&
    typeof l.resolveModules === 'function' &&
    typeof l.planImports === 'function' &&
    typeof l.isModuleSource === 'function';
  return ready ? l : null;
}

let current: { key: string; value: OpenFileModules } | null = null;
let building: { key: string; done: Promise<OpenFileModules | null> } | null = null;

/** What the graph depends on: the open file, its import lines, and every other file's text. */
export function graphKey(workspace: WorkspaceTexts, planImports: (source: string) => { written: string }[]): string {
  const open = workspace.texts.get(workspace.openFile) ?? '';
  const others = [...workspace.texts]
    .filter(([path]) => path !== workspace.openFile)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([workspace.openFile, planImports(open).map((p) => p.written), others, workspace.folders]);
}

async function build(workspace: WorkspaceTexts, l: Lib, label: string): Promise<OpenFileModules> {
  const host = l.createMemoryProjectHost(workspace.texts, { label, folders: workspace.folders });
  const source = workspace.texts.get(workspace.openFile) ?? '';
  const { graph, errors } = await l.resolveModules(source, { host, entry: `/${workspace.openFile}` });
  const projectFiles = [...workspace.texts]
    .filter(([path, text]) => path !== workspace.openFile && l.isModuleSource(text))
    .map(([path]) => `/${path}`)
    .sort();
  return { modules: graph, loadErrors: errors, projectFiles };
}

/**
 * The graph for the workspace as it stands, built if it changed. Resolves to
 * null without the library. Concurrent calls for the same state share one build.
 */
export async function refreshOpenFileModules(
  workspace: WorkspaceTexts = workspaceNow(),
): Promise<OpenFileModules | null> {
  const l = lib();
  if (!l) return null;
  const key = graphKey(workspace, l.planImports);
  if (current?.key === key) return current.value;
  if (building?.key === key) return building.done;
  const label = (store.get('workspaceName') as string | null) ?? 'this workspace';
  const done = build(workspace, l, label).then((value) => {
    // A newer state may have started building meanwhile; only the latest is kept.
    if (building?.key === key) {
      current = { key, value };
      building = null;
    }
    return value;
  });
  building = { key, done };
  return done;
}

/** The latest graph, synchronously: what a completion or hover request uses. Empty before the first build. */
export function openFileModules(): OpenFileModules | null {
  return current?.value ?? null;
}

/**
 * The graph only if it matches the workspace as it stands: for placing a
 * compile's errors, where a stale graph could point at the wrong import.
 */
export function currentOpenFileModules(workspace: WorkspaceTexts = workspaceNow()): OpenFileModules | null {
  const l = lib();
  if (!l || !current) return null;
  return current.key === graphKey(workspace, l.planImports) ? current.value : null;
}

/**
 * `{ modules, projectFiles }` for completion, hover, signature help and
 * definition. The latest graph built, which may lag an edit to an import line
 * or another file by the debounce and a build (about 50 ms and up): fine for
 * suggestions. Placing errors uses currentOpenFileModules, which checks.
 */
export function languageServiceOptions(): { modules?: ModuleGraph; projectFiles?: string[] } {
  const value = openFileModules();
  return value ? { modules: value.modules, projectFiles: value.projectFiles } : {};
}

/**
 * The import graph of a program of the workspace, for placing its compile's
 * errors: the open file's (kept, as above) when it's the open file, else
 * built for it now. The preview can show a program while you edit another
 * file (a library, or another program), and its errors belong to its graph
 * (project-docs/modules/51-phase-2c-plan.md, "Noted for 2d").
 */
export async function programModules(
  path: string,
  workspace: WorkspaceTexts = workspaceNow(),
): Promise<OpenFileModules | null> {
  if (path === workspace.openFile) return refreshOpenFileModules(workspace);
  const l = lib();
  if (!l) return null;
  const label = (store.get('workspaceName') as string | null) ?? 'this workspace';
  return build({ ...workspace, openFile: path }, l, label);
}

/** Forget the graph (a workspace switch). */
export function resetOpenFileModules(): void {
  current = null;
  building = null;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Keep the graph current as the workspace changes: a short debounce after
 * each change. Returns the unsubscribe function.
 */
export function watchOpenFileModules(): () => void {
  // A failed read leaves the last graph in place; the console says why.
  const refresh = (): void => {
    refreshOpenFileModules().catch((err: unknown) => console.warn('[workspace-modules] import graph not built:', err));
  };
  const unsubscribe = store.subscribe(['code', 'workspaceFiles', 'openFile', 'workspaceFolders'], () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh();
    }, 50);
  });
  refresh();
  return () => {
    unsubscribe();
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
  };
}
