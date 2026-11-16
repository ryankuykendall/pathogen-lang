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
  files?: Record<string, { text?: string }>;
  folders?: string[];
  entryPoints?: string[];
  code?: string;
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
 * Files a load answered without their text: not .pathogen (a data file or a
 * font, after phase 2). This playground can't hold them, and a save sends
 * every file the workspace keeps, so it mustn't save a workspace holding any.
 * None can exist yet: the server takes only .pathogen files and returns each
 * one's text.
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
  return Object.keys(files).sort()[0] ?? null;
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
 * main, else the open file, else the first file. A chosen program that no
 * longer exists falls back to the main (docs/workspace-files.md: "If the
 * program shown is deleted, the preview goes back to the main"). Always one
 * of the workspace's files when it has any: never pathogen.json. With none,
 * main.pathogen, which has no text: the preview draws nothing.
 */
export function programToShow(workspace: WorkspaceTexts, chosen: string | null): string {
  if (chosen !== null && workspace.texts.has(chosen)) return chosen;
  const main = workspace.entryPoints.find((p) => workspace.texts.has(p));
  if (main !== undefined) return main;
  if (workspace.openFile !== null && workspace.texts.has(workspace.openFile)) return workspace.openFile;
  return [...workspace.texts.keys()].sort()[0] ?? MAIN_FILE;
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
