// The file tree's rows (phase 2d, step 4a; docs/workspace-files.md "The file
// tree and tabs", mockup v6 screen O): folders first, then files, each sorted
// by name as VS Code sorts them, and pathogen.json last at the top level.
// Pure, so the order and the folding are tested without a DOM
// (tests/playground-file-tree.test.ts); components/file-tree.ts draws them.

// No services or store: the shared code viewer (components/shared/source-files.ts)
// orders files with this on pages without them.
import { MAIN_FILE, PROJECT_FILE } from './workspace-names.js';

export type TreeFileKind = 'program' | 'library';

/** What the + menu adds. */
export type NewEntryKind = TreeFileKind | 'folder';

/** A .pathogen file of the workspace, by its workspace path (no leading slash). */
export interface TreeFile {
  path: string;
  kind: TreeFileKind;
}

interface RowBase {
  /** The folder's or file's workspace path. */
  path: string;
  /** What the row shows: the last part of the path. */
  name: string;
  /** 1 at the top of the workspace (aria-level). */
  level: number;
  /** Its place among its siblings, and their number (aria-posinset, aria-setsize). */
  posinset: number;
  setsize: number;
}

export type TreeRow =
  | (RowBase & { type: 'folder'; expanded: boolean; empty: boolean })
  | (RowBase & { type: 'file'; kind: TreeFileKind; main: boolean })
  /** The line under an open folder that holds nothing. Not a tree item. */
  | { type: 'empty'; path: string; name: string; level: number }
  /**
   * The name field of New program, New library or New folder (step 4b): first
   * in its folder. Or Rename…'s (step 4c-2): in place of the row it renames,
   * `renaming` its path and `name` its name. Not a tree item.
   */
  | { type: 'input'; path: string; name: string; level: number; kind: NewEntryKind; renaming?: string }
  /** pathogen.json: read-only, written from the entry points. */
  | (RowBase & { type: 'project' });

const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const parentOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/** By name, letter case aside and numbers by value (`a2` before `a10`); ties by the exact text. */
function byName(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * The rows to draw. `folders` are the workspace's folders as the store keeps
 * them (the empty ones; the others come from the files' paths). A folder in
 * `collapsed` hides everything in it. `main` is the first entry point: it gets
 * a badge unless it's `main.pathogen`, which is the main by convention.
 * `naming` puts the name field first in its folder ('' for the top), in place
 * of an empty folder's "Empty" line; with `renaming`, in place of that row (a
 * folder's files stay under it).
 */
export function treeRows(
  files: readonly TreeFile[],
  folders: readonly string[],
  options: {
    collapsed: ReadonlySet<string>;
    main: string | null;
    naming?: { folder: string; kind: NewEntryKind; renaming?: string } | null;
  },
): TreeRow[] {
  const renaming = options.naming?.renaming ?? null;
  const naming = renaming === null ? (options.naming ?? null) : null;
  const renameField = (path: string, level: number, kind: NewEntryKind): TreeRow => ({
    type: 'input',
    path,
    name: baseOf(path),
    level,
    kind,
    renaming: path,
  });
  // Every folder, with the folders it's in.
  const allFolders = new Set<string>();
  const addFolder = (folder: string): void => {
    for (let f = folder; f !== '' && !allFolders.has(f); f = parentOf(f)) allFolders.add(f);
  };
  for (const file of files) addFolder(parentOf(file.path));
  for (const folder of folders) addFolder(folder);

  const subfolders = new Map<string, string[]>();
  const filesIn = new Map<string, TreeFile[]>();
  for (const folder of allFolders) {
    const parent = parentOf(folder);
    subfolders.set(parent, [...(subfolders.get(parent) ?? []), folder]);
  }
  for (const file of files) {
    const parent = parentOf(file.path);
    filesIn.set(parent, [...(filesIn.get(parent) ?? []), file]);
  }

  const rows: TreeRow[] = [];
  const walk = (folder: string, level: number, extra: number): number => {
    const dirs = [...(subfolders.get(folder) ?? [])].sort((a, b) => byName(baseOf(a), baseOf(b)));
    const leaves = [...(filesIn.get(folder) ?? [])].sort((a, b) => byName(baseOf(a.path), baseOf(b.path)));
    const setsize = dirs.length + leaves.length + extra;
    if (naming?.folder === folder) rows.push({ type: 'input', path: folder, name: '', level, kind: naming.kind });
    let posinset = 0;
    for (const dir of dirs) {
      posinset += 1;
      const empty = (subfolders.get(dir) ?? []).length === 0 && (filesIn.get(dir) ?? []).length === 0;
      const expanded = !options.collapsed.has(dir);
      if (dir === renaming) rows.push(renameField(dir, level, 'folder'));
      else rows.push({ type: 'folder', path: dir, name: baseOf(dir), level, posinset, setsize, expanded, empty });
      if (!expanded) continue;
      if (empty && naming?.folder !== dir) rows.push({ type: 'empty', path: dir, name: 'Empty', level: level + 1 });
      else walk(dir, level + 1, 0);
    }
    for (const file of leaves) {
      posinset += 1;
      if (file.path === renaming) {
        rows.push(renameField(file.path, level, file.kind));
        continue;
      }
      const main = file.path === options.main && file.path !== MAIN_FILE;
      const name = baseOf(file.path);
      rows.push({ type: 'file', path: file.path, name, level, posinset, setsize, kind: file.kind, main });
    }
    return setsize;
  };
  // The top level has one more item: pathogen.json, last.
  const top = walk('', 1, 1);
  rows.push({ type: 'project', path: PROJECT_FILE, name: PROJECT_FILE, level: 1, posinset: top, setsize: top });
  return rows;
}
