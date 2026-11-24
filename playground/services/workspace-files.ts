// The workspace's files as the playground holds them (phase 2;
// project-docs/modules/51-phase-2c-plan.md, piece 3). The store keeps every
// .pathogen file's text by workspace path (`workspaceFiles`), and the editor
// keeps the open file's live text (`code`). Everything that compiles, saves or
// asks the language services reads the two together through here, so the
// open file's entry in `workspaceFiles` lagging behind `code` never matters.

import { store } from '../state/store.js';
import { MAIN_FILE, PROJECT_FILE } from '../utils/workspace-names.js';

export { MAIN_FILE };

/** The workspace at one moment: every file's text, the open file's from the editor. */
export interface WorkspaceTexts {
  /** Workspace path (no leading slash) → text. */
  texts: Map<string, string>;
  folders: string[];
  /** The programs, the main first (pathogen.json's entryPoints). */
  entryPoints: string[];
  /** The file in the editor; null with no file open (step 4d). */
  openFile: string | null;
}

/** The file in the editor, or null with every tab closed (2d, step 4d). */
export function openFileNow(): string | null {
  return (store.get('openFile') as string | null) ?? null;
}

/**
 * Whether the page holds a saved workspace, with its files in
 * `workspaceFiles`: not a scratch link or a new workspace not saved yet (one
 * file, its text only in `code`). A workspace whose every file was deleted is
 * still one: its tree, its Files toggle and its zero-state stay.
 */
export function holdsWorkspace(): boolean {
  return (store.get('workspaceId') as string | null) !== null;
}

/** The workspace's main: the first program in its list that it still holds. Null with no program. */
export function mainOf(files: Record<string, string>, entryPoints: readonly string[]): string | null {
  return entryPoints.find((p) => Object.hasOwn(files, p)) ?? null;
}

/** What a load answers (website/api: `files` with each text, or `code` from a server before phase 2). */
export interface WorkspaceAnswer {
  files?: Record<string, AnsweredFile>;
  folders?: string[];
  entryPoints?: string[];
  code?: string;
}

/**
 * Whether a workspace path is a data file (`.json`, `.geojson`, `.topojson`,
 * `.fold`), by its extension: never a program or a module, whatever its text.
 */
export function isDataFile(path: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.PathogenLang?.workspaceFileKind?.(path) === 'data';
}

/**
 * A file as a load answers it: its text, or, for a data file past the load's
 * budget (phase 3a step 5, note 80), `deferred`, to read by its hash.
 */
export interface AnsweredFile {
  text?: string;
  sha256?: string;
  size?: number;
  deferred?: boolean;
}

/** At most this many deferred files are read at once. */
const DEFERRED_READS = 4;

/**
 * The load's answer with each deferred file's text, read by its hash with
 * `read` (GET /workspace/:id/file/:sha256), a few at a time. The same text at
 * two paths is read once. A file that can't be read fails the load, naming
 * it: a workspace opened without it would drop it at the next save.
 */
export async function withDeferredTexts(
  answer: WorkspaceAnswer,
  read: (sha256: string) => Promise<string>,
): Promise<WorkspaceAnswer> {
  if (!answer.files) return answer;
  const deferred = Object.entries(answer.files).filter(
    ([, file]) => file.deferred === true && typeof file.text !== 'string' && typeof file.sha256 === 'string',
  );
  if (deferred.length === 0) return answer;
  const pathOf = new Map<string, string>();
  for (const [path, file] of deferred) if (!pathOf.has(file.sha256!)) pathOf.set(file.sha256!, path);
  const queue = [...pathOf.keys()];
  const texts = new Map<string, string>();
  const reader = async (): Promise<void> => {
    for (let sha256 = queue.shift(); sha256 !== undefined; sha256 = queue.shift()) {
      try {
        texts.set(sha256, await read(sha256));
      } catch (err) {
        // A new error, without the request's status: a 404 here is a lost
        // file, not a missing workspace.
        throw new Error(
          `Couldn't read ${pathOf.get(sha256)} (${(err as Error).message}). Reload the page to try again.`,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DEFERRED_READS, queue.length) }, reader));
  const files: Record<string, AnsweredFile> = {};
  for (const [path, file] of Object.entries(answer.files)) {
    const text = file.deferred === true && file.sha256 !== undefined ? texts.get(file.sha256) : undefined;
    files[path] = text === undefined ? file : { sha256: file.sha256, size: file.size, text };
  }
  return { ...answer, files };
}

/** The store's workspace fields for a loaded workspace, and the file the editor opens (none for an empty one). */
export function workspaceFromAnswer(answer: WorkspaceAnswer): {
  workspaceFiles: Record<string, string>;
  workspaceFolders: string[];
  workspaceEntryPoints: string[];
  openFile: string | null;
} {
  const workspaceFiles: Record<string, string> = {};
  if (answer.files) {
    for (const [path, file] of Object.entries(answer.files)) {
      if (typeof file.text === 'string') workspaceFiles[path] = file.text;
    }
  } else {
    workspaceFiles[MAIN_FILE] = answer.code ?? '';
  }
  const workspaceEntryPoints = answer.files ? (answer.entryPoints ?? []) : [MAIN_FILE];
  return {
    workspaceFiles,
    workspaceFolders: answer.folders ?? [],
    workspaceEntryPoints,
    openFile: fileToOpen(workspaceFiles, workspaceEntryPoints),
  };
}

/**
 * Files a load answered without their text, after withDeferredTexts: a kind
 * this playground can't hold as text (a font, in a later phase). A save sends
 * every file the workspace keeps, so it mustn't save a workspace holding any.
 * None can exist yet: the server takes .pathogen and data files, and a data
 * file's text is read by its hash.
 */
export function filesWithoutText(answer: WorkspaceAnswer): string[] {
  return Object.entries(answer.files ?? {})
    .filter(([, file]) => typeof file.text !== 'string')
    .map(([path]) => path)
    .sort();
}

/**
 * The file the editor opens on: the main, or main.pathogen, or the first
 * file. None for a workspace with no files (every one was deleted, and the
 * save went through): the editor opens on its zero-state (2d, step 4d), never
 * on a main.pathogen the workspace doesn't hold.
 */
export function fileToOpen(files: Record<string, string>, entryPoints: readonly string[]): string | null {
  const main = entryPoints.find((p) => p in files);
  if (main !== undefined) return main;
  if (MAIN_FILE in files) return MAIN_FILE;
  // A .pathogen file first; a data file only when the workspace holds nothing else.
  const paths = Object.keys(files).sort();
  return paths.find((p) => !isDataFile(p)) ?? paths[0] ?? null;
}

/**
 * Whether a path in the editor is one of the workspace's files. pathogen.json
 * isn't: it opens read-only, written from the entry points, and nothing that
 * saves, compiles or reads imports may ever see it.
 */
export function isWorkspaceFile(path: string | null): path is string {
  return path !== null && path !== PROJECT_FILE;
}

/**
 * `workspace` with `text` as its open file's: the one way to lay the editor's
 * text over a workspace, so pathogen.json in the editor never becomes a file.
 */
export function withOpenFileText(workspace: WorkspaceTexts, text: string): WorkspaceTexts {
  if (isWorkspaceFile(workspace.openFile)) workspace.texts.set(workspace.openFile, text);
  return workspace;
}

/** The workspace from the store's fields: the open file's text is the editor's. */
export function workspaceTexts(state: {
  workspaceFiles: Record<string, string>;
  workspaceFolders: string[];
  workspaceEntryPoints: string[];
  openFile: string | null;
  code: string;
}): WorkspaceTexts {
  // No workspace loaded (a scratch link, a new workspace): just its code, as
  // its one program. (Such a workspace always has its file open: its last
  // tab can't close.) A saved workspace with no files left reads as not
  // loaded too, which comes to the same: no file open, so no program.
  const loaded = Object.keys(state.workspaceFiles).length > 0;
  return withOpenFileText(
    {
      texts: new Map(Object.entries(state.workspaceFiles)),
      folders: state.workspaceFolders,
      entryPoints: loaded ? state.workspaceEntryPoints : isWorkspaceFile(state.openFile) ? [state.openFile] : [],
      openFile: state.openFile,
    },
    state.code,
  );
}

/**
 * The program the preview shows: the one chosen (the chip, in 2d), else the
 * main, else the open file, else the first file, never a data file. A chosen
 * program that no longer exists falls back to the main (docs/workspace-files.md:
 * "If the program shown is deleted, the preview goes back to the main"). One
 * of the workspace's files when it has any but data: never pathogen.json.
 * Otherwise main.pathogen, which has no text: the preview draws nothing.
 */
export function programToShow(workspace: WorkspaceTexts, chosen: string | null): string {
  if (chosen !== null && workspace.texts.has(chosen)) return chosen;
  const main = workspace.entryPoints.find((p) => workspace.texts.has(p));
  if (main !== undefined) return main;
  // Never a data file: it isn't a program, and compiling JSON as one only gives an error.
  const open = workspace.openFile;
  if (open !== null && workspace.texts.has(open) && !isDataFile(open)) return open;
  return [...workspace.texts.keys()].filter((p) => !isDataFile(p)).sort()[0] ?? MAIN_FILE;
}

/**
 * The text of the program the preview shows, as it stands now. Not always
 * the store's `code`, which is the file in the editor: a library, or another
 * program, can be open in a tab.
 */
export function shownProgramText(): string {
  const workspace = workspaceNow();
  return workspace.texts.get(programToShow(workspace, store.get('shownProgram') as string | null)) ?? '';
}

/** The workspace now, from the store. */
export function workspaceNow(): WorkspaceTexts {
  return workspaceTexts({
    workspaceFiles: store.get('workspaceFiles') as Record<string, string>,
    workspaceFolders: store.get('workspaceFolders') as string[],
    workspaceEntryPoints: store.get('workspaceEntryPoints') as string[],
    openFile: openFileNow(),
    code: store.get('code') as string,
  });
}
