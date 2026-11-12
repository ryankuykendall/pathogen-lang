// Making a planned change to the workspace the playground holds (phase 2d,
// steps 4b and 4c; project-docs/modules/52-phase-2d-plan.md). The plans are
// pure (services/workspace-edits.ts); this is where one lands, in ONE store
// update, so no subscriber ever sees half a change: every file, the folders,
// the program list, the program shown, and what the editor holds.
//
// - A deleted file's tab closes. If it was the file in the editor, the tab to
//   its right shows (else to its left; with no tab left, the main; with no
//   file left, pathogen.json, until step 4d's "No file open"). Its text is
//   never written back, and its editor state, undo history and all, is
//   forgotten, so a new file with its name starts afresh.
// - Setting the main leaves the preview on the program it shows (docs: "Setting
//   the main doesn't change what the preview shows"): `shownProgram: null`
//   means "the main", so it's pinned first. A deleted program shown goes back
//   to the main.
// - pathogen.json in the editor follows the program list.
//
// workspace-view does the rest: it opens the file the change names, saves, and
// redraws the preview.

import { store } from '../state/store.js';
import { withTabOpened } from './open-files.js';
import { applyChange, PROJECT_FILE, projectFileText, StaleChangeError } from './workspace-edits.js';
import { programToShow, workspaceNow } from './workspace-files.js';

import type { FileEditor } from './open-files.js';
import type { Change, WorkspaceState } from './workspace-edits.js';

/** What a change needs from the editor. */
export interface ChangeEditor extends FileEditor {
  /** Drop these files' kept states, undo history and all. */
  forgetFiles: (paths: string[]) => void;
  /** Put new text in the file shown, outside its undo history (pathogen.json, written from the entry points). */
  refreshShown: (text: string) => void;
}

export type ApplyResult = { ok: true; state: WorkspaceState; removed: string[] } | { ok: false; message: string };

/** The workspace as it stands, for planning a change: the open file's typed text, never pathogen.json. */
export function workspaceState(): WorkspaceState {
  const workspace = workspaceNow();
  return {
    files: Object.fromEntries(workspace.texts),
    folders: [...workspace.folders],
    entryPoints: [...workspace.entryPoints],
  };
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The file the editor shows instead of one just deleted: the tab to its right,
 * else to its left; with no tab left, the main, else the first file; with no
 * file left, pathogen.json (until step 4d's "No file open").
 */
function survivor(openFiles: readonly string[], active: string, next: WorkspaceState, gone: Set<string>): string {
  const at = openFiles.indexOf(active);
  const right = openFiles.slice(at + 1).find((p) => !gone.has(p));
  const left = [...openFiles.slice(0, Math.max(at, 0))].reverse().find((p) => !gone.has(p));
  const main = next.entryPoints.find((p) => p in next.files);
  return right ?? left ?? main ?? Object.keys(next.files).sort()[0] ?? PROJECT_FILE;
}

/**
 * Make `change`. Refused, changing nothing, when it was planned for another
 * version of the workspace (StaleChangeError's message says how it differs).
 * Without an editor (a test, or nothing open), only the workspace changes.
 */
export function applyToWorkspace(change: Change, editor?: ChangeEditor): ApplyResult {
  const before = workspaceState();
  let next: WorkspaceState;
  try {
    next = applyChange(before, change);
  } catch (err) {
    if (err instanceof StaleChangeError) return { ok: false, message: err.message };
    throw err;
  }
  const removed = Object.keys(before.files).filter((p) => !(p in next.files));
  const gone = new Set(removed);
  const updates: Record<string, unknown> = {
    workspaceFiles: next.files,
    workspaceFolders: next.folders,
    workspaceEntryPoints: next.entryPoints,
  };

  // The program shown.
  const shown = store.get('shownProgram') as string | null;
  if (change.show !== undefined) updates.shownProgram = change.show;
  else if (shown !== null && gone.has(shown)) updates.shownProgram = null;
  else if (shown === null && before.entryPoints.length > 0 && before.entryPoints[0] !== next.entryPoints[0]) {
    // The main moves: keep the preview on what it shows now, if that's still
    // here and isn't the new main anyway. (With no main before, there's
    // nothing to keep: the preview follows the new one.)
    const now = programToShow(workspaceNow(), null);
    if (now in next.files && now !== next.entryPoints[0]) updates.shownProgram = now;
  }

  // The tabs, and the file in the editor.
  const openFiles = store.get('openFiles') as string[];
  const active = store.get('openFile') as string;
  let tabs = openFiles.filter((p) => !gone.has(p));
  let shownFile = active;
  if (gone.has(active)) {
    shownFile = survivor(openFiles, active, next, gone);
    const text = shownFile === PROJECT_FILE ? projectFileText(next.entryPoints) : next.files[shownFile];
    editor?.showFile(shownFile, text);
    tabs = withTabOpened(tabs, shownFile);
    updates.openFile = shownFile;
    updates.code = text;
  }
  if (!sameList(tabs, openFiles)) updates.openFiles = tabs;

  // pathogen.json in the editor follows the program list.
  if (shownFile === PROJECT_FILE && !gone.has(active) && !sameList(before.entryPoints, next.entryPoints)) {
    const text = projectFileText(next.entryPoints);
    editor?.refreshShown(text);
    updates.code = text;
  }

  store.update(updates);
  if (removed.length > 0) editor?.forgetFiles(removed);
  return { ok: true, state: next, removed };
}
