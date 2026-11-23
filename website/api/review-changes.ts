// What changed since the approved version, for a re-review (2e step 5e; note 59
// answer 4, mockup v12 R3 and R4): the approved manifest against the submitted
// one, by hash. No text is read, so a listing can carry it for every entry.
// Both manifests come through readStoredFiles.

import type { WorkspaceManifest } from './workspace-files.js';

export type FileMark = 'new' | 'changed' | 'moved' | 'removed';

export interface FileChange {
  path: string;
  mark: FileMark;
  /** Where a moved file was. */
  from?: string;
}

export interface ReviewChanges {
  /** Each file that differs, in path order. */
  files: FileChange[];
  /** Empty folders added or removed (a folder that holds files is said by their lines). */
  foldersAdded: string[];
  foldersRemoved: string[];
  /** The program list, when it differs: pathogen.json changed, its order alone included. */
  programs: {
    mainBefore: string | null;
    mainAfter: string | null;
    added: string[];
    removed: string[];
    /** The same programs in another order. */
    orderOnly: boolean;
  } | null;
  /** For the card's line: files new, changed and removed. Moves and pathogen.json are left out. */
  counts: { new: number; changed: number; removed: number };
}

/** Every folder a manifest holds: the empty ones it lists, and every file's and folder's parents. */
function allFolders(manifest: WorkspaceManifest): Set<string> {
  const out = new Set<string>();
  const addParents = (path: string, self: boolean): void => {
    const parts = path.split('/');
    for (let i = 1; i < parts.length + (self ? 1 : 0); i++) out.add(parts.slice(0, i).join('/'));
  };
  for (const path of Object.keys(manifest.files)) addParents(path, false);
  for (const folder of manifest.folders) addParents(folder, true);
  return out;
}

/**
 * The empty folders: those holding no file and no other folder. A folder that
 * holds only an empty folder isn't empty, so `a/b` alone reports `a/b`, not `a` too.
 */
function emptyFolders(manifest: WorkspaceManifest): Set<string> {
  const holding = new Set<string>();
  const holdParents = (path: string): void => {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) holding.add(parts.slice(0, i).join('/'));
  };
  for (const path of Object.keys(manifest.files)) holdParents(path);
  for (const folder of manifest.folders) holdParents(folder);
  return new Set([...allFolders(manifest)].filter((folder) => !holding.has(folder)));
}

const sorted = (values: Iterable<string>): string[] => [...values].sort();

export function compareManifests(approved: WorkspaceManifest, submitted: WorkspaceManifest): ReviewChanges {
  const before = approved.files;
  const after = submitted.files;
  const files: FileChange[] = [];

  const gone = sorted(Object.keys(before).filter((path) => !(path in after)));
  const added = sorted(Object.keys(after).filter((path) => !(path in before)));
  for (const path of sorted(Object.keys(after))) {
    if (path in before && before[path].sha256 !== after[path].sha256) files.push({ path, mark: 'changed' });
  }

  // A move: an added path whose bytes match a path that's gone, one to one, in path order.
  // Empty files all share one hash, so an empty file gone and another added is a removal
  // and a new file, not a move.
  const unmatched = new Set(gone);
  for (const path of added) {
    const from =
      after[path].size === 0
        ? undefined
        : gone.find((old) => unmatched.has(old) && before[old].sha256 === after[path].sha256);
    if (from !== undefined) {
      unmatched.delete(from);
      files.push({ path, mark: 'moved', from });
    } else {
      files.push({ path, mark: 'new' });
    }
  }
  for (const path of unmatched) files.push({ path, mark: 'removed' });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // A folder that held files and is left empty shows neither added nor removed: its
  // files' removal lines say what happened.
  const foldersBefore = allFolders(approved);
  const foldersAfter = allFolders(submitted);
  const emptyBefore = emptyFolders(approved);
  const emptyAfter = emptyFolders(submitted);
  const foldersAdded = sorted([...foldersAfter].filter((f) => !foldersBefore.has(f) && emptyAfter.has(f)));
  const foldersRemoved = sorted([...foldersBefore].filter((f) => !foldersAfter.has(f) && emptyBefore.has(f)));

  const a = approved.entryPoints;
  const b = submitted.entryPoints;
  const sameList = a.length === b.length && a.every((path, i) => path === b[i]);
  const programsAdded = b.filter((path) => !a.includes(path));
  const programsRemoved = a.filter((path) => !b.includes(path));
  const programs = sameList
    ? null
    : {
        mainBefore: a[0] ?? null,
        mainAfter: b[0] ?? null,
        added: programsAdded,
        removed: programsRemoved,
        orderOnly: programsAdded.length === 0 && programsRemoved.length === 0,
      };

  const count = (mark: FileMark): number => files.filter((f) => f.mark === mark).length;
  return {
    files,
    foldersAdded,
    foldersRemoved,
    programs,
    counts: { new: count('new'), changed: count('changed'), removed: count('removed') },
  };
}
