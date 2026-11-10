// The files open in the editor's tabs (phase 2d, step 3;
// project-docs/modules/52-phase-2d-plan.md, docs/workspace-files.md "The file
// tree and tabs"). The store keeps the tabs in order (`openFiles`) and the one
// shown (`openFile`); `code` is that file's live text, and `workspaceFiles`
// holds every other file's. Switching tabs writes the outgoing file's text
// into `workspaceFiles` first, so the store always holds every file's latest
// text (services/workspace-files.ts reads the two together).

import { store } from '../state/store.js';

/** What a tab's icon shows. */
export type TabKind = 'program' | 'library' | 'json';

/** One tab: its file, its icon, and its label. */
export interface TabItem {
  path: string;
  kind: TabKind;
  /** The file's name, without `.pathogen`. */
  name: string;
  /** Its folder, when another open file has the same name (`parts`; `/` at the top); else null. */
  hint: string | null;
}

/** What the controller needs from the editor. */
export interface FileEditor {
  /**
   * Show `path`: its kept editor state (with its undo history), or a new one
   * holding `text`. A kept state whose text differs from `text` is brought to
   * it first.
   */
  showFile: (path: string, text: string) => void;
}

const PATHOGEN_EXT = '.pathogen';

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const folderParts = (path: string): string[] => path.split('/').slice(0, -1);

/** A tab's name: the file's name, without `.pathogen` (other files keep their extension). */
export function tabName(path: string): string {
  const name = baseName(path);
  return name.endsWith(PATHOGEN_EXT) ? name.slice(0, -PATHOGEN_EXT.length) : name;
}

/**
 * Each tab's label. When open files share a name, each gets as much of its
 * folder as tells them apart, VS Code's rule: `gears · parts` and
 * `gears · demos`; `gears · a/x` and `gears · b/x`; `/` for the top.
 */
export function tabLabels(paths: readonly string[]): { path: string; name: string; hint: string | null }[] {
  const byName = new Map<string, string[]>();
  for (const path of paths) {
    const name = tabName(path);
    byName.set(name, [...(byName.get(name) ?? []), path]);
  }
  const hints = new Map<string, string>();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const deepest = Math.max(...group.map((path) => folderParts(path).length));
    for (let depth = 1; depth <= Math.max(deepest, 1); depth++) {
      const tails = group.map((path) => folderParts(path).slice(-depth).join('/') || '/');
      if (new Set(tails).size === group.length || depth >= deepest) {
        group.forEach((path, i) => hints.set(path, tails[i]));
        break;
      }
    }
  }
  return paths.map((path) => ({ path, name: tabName(path), hint: hints.get(path) ?? null }));
}

/** The tabs after opening `path`: it joins at the end, unless it's open already. */
export function withTabOpened(openFiles: readonly string[], path: string): string[] {
  return openFiles.includes(path) ? [...openFiles] : [...openFiles, path];
}

/**
 * The tabs after closing `path`, and the file shown then: the same one, or,
 * if it was the one closed, the tab to its right, else to its left. Null for
 * the last tab, which can't be closed: the editor always shows a file.
 */
export function afterTabClosed(
  openFiles: readonly string[],
  active: string,
  path: string,
): { openFiles: string[]; active: string } | null {
  const index = openFiles.indexOf(path);
  if (index < 0 || openFiles.length < 2) return null;
  const rest = openFiles.filter((p) => p !== path);
  return { openFiles: rest, active: path === active ? rest[Math.min(index, rest.length - 1)] : active };
}

/** The tabs for the store's open files, each file's kind read from its text. */
export function tabItems(
  openFiles: readonly string[],
  textOf: (path: string) => string | undefined,
  isLibrary: (path: string, text: string) => boolean,
): TabItem[] {
  return tabLabels(openFiles).map(({ path, name, hint }) => {
    const text = textOf(path) ?? '';
    const kind: TabKind = !path.endsWith(PATHOGEN_EXT) ? 'json' : isLibrary(path, text) ? 'library' : 'program';
    return { path, kind, name, hint };
  });
}

/**
 * Show `path` in the editor and make it the open file, its tab added to
 * `openFiles`. False, changing nothing, when the workspace has no such file.
 */
function show(editor: FileEditor, path: string, openFiles: readonly string[]): boolean {
  const files = store.get('workspaceFiles') as Record<string, string>;
  const current = store.get('openFile') as string;
  if (!Object.hasOwn(files, path)) return false;
  const text = files[path];
  editor.showFile(path, text);
  store.update({
    // The outgoing file's live text, so the store keeps every file's latest.
    workspaceFiles: { ...files, [current]: store.get('code') as string },
    openFile: path,
    openFiles: withTabOpened(openFiles, path),
    code: text,
  });
  return true;
}

/**
 * Open a workspace file in a tab, or switch to its tab. False when the
 * workspace has no such file.
 */
export function openFile(editor: FileEditor, path: string): boolean {
  if (path === store.get('openFile')) return true;
  return show(editor, path, store.get('openFiles') as string[]);
}

/**
 * Close a tab. Closing the open file shows its neighbour. The file's editor
 * state is kept, so reopening it brings back its undo history while the
 * workspace is open (docs/workspace-files.md). The last tab stays.
 */
export function closeFile(editor: FileEditor, path: string): void {
  const next = afterTabClosed(store.get('openFiles') as string[], store.get('openFile') as string, path);
  if (!next) return;
  if (next.active === store.get('openFile')) store.update({ openFiles: next.openFiles });
  // (A neighbour the workspace no longer has leaves the tabs as they are.)
  else show(editor, next.active, next.openFiles);
}
