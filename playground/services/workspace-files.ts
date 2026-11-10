// The workspace's files as the playground holds them (phase 2;
// project-docs/modules/51-phase-2c-plan.md, piece 3). The store keeps every
// .pathogen file's text by workspace path (`workspaceFiles`), and the editor
// keeps the open file's live text (`code`). Everything that compiles, saves or
// asks the language services reads the two together through here, so the
// open file's entry in `workspaceFiles` lagging behind `code` never matters.

import { store } from '../state/store.js';

export const MAIN_FILE = 'main.pathogen';

/** The workspace at one moment: every file's text, the open file's from the editor. */
export interface WorkspaceTexts {
  /** Workspace path (no leading slash) → text. */
  texts: Map<string, string>;
  folders: string[];
  /** The programs, the main first (pathogen.json's entryPoints). */
  entryPoints: string[];
  /** The file in the editor. */
  openFile: string;
}

/** What a load answers (website/api: `files` with each text, or `code` from a server before phase 2). */
export interface WorkspaceAnswer {
  files?: Record<string, { text?: string }>;
  folders?: string[];
  entryPoints?: string[];
  code?: string;
}

/** The store's workspace fields for a loaded workspace, and the file the editor opens. */
export function workspaceFromAnswer(answer: WorkspaceAnswer): {
  workspaceFiles: Record<string, string>;
  workspaceFolders: string[];
  workspaceEntryPoints: string[];
  openFile: string;
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
 * file. In 2c the editor shows one file; the tabs come with 2d.
 */
export function fileToOpen(files: Record<string, string>, entryPoints: readonly string[]): string {
  const main = entryPoints.find((p) => p in files);
  if (main !== undefined) return main;
  if (MAIN_FILE in files) return MAIN_FILE;
  return Object.keys(files).sort()[0] ?? MAIN_FILE;
}

/** The workspace from the store's fields: the open file's text is the editor's. */
export function workspaceTexts(state: {
  workspaceFiles: Record<string, string>;
  workspaceFolders: string[];
  workspaceEntryPoints: string[];
  openFile: string;
  code: string;
}): WorkspaceTexts {
  const texts = new Map(Object.entries(state.workspaceFiles));
  texts.set(state.openFile, state.code);
  // No workspace loaded (a scratch link, a new workspace): just its code, as
  // its one program.
  const loaded = Object.keys(state.workspaceFiles).length > 0;
  return {
    texts,
    folders: state.workspaceFolders,
    entryPoints: loaded ? state.workspaceEntryPoints : [state.openFile],
    openFile: state.openFile,
  };
}

/**
 * The program the preview shows: the one chosen (the chip, in 2d), else the
 * main, else the open file. A chosen program that no longer exists falls back
 * to the main (docs/workspace-files.md: "If the program shown is deleted, the
 * preview goes back to the main").
 */
export function programToShow(workspace: WorkspaceTexts, chosen: string | null): string {
  if (chosen !== null && workspace.texts.has(chosen)) return chosen;
  return workspace.entryPoints.find((p) => workspace.texts.has(p)) ?? workspace.openFile;
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
    openFile: store.get('openFile') as string,
    code: store.get('code') as string,
  });
}
