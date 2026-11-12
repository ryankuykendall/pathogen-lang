// Making a planned change to the workspace the playground holds (phase 2d,
// step 4b; project-docs/modules/52-phase-2d-plan.md). The plans are pure
// (services/workspace-edits.ts); this is where one lands: every file, the
// folders and the program list in one store update, so nothing sees half a
// change. workspace-view does the rest: it opens the file the change names,
// saves, and redraws the preview when the program shown changed.

import { store } from '../state/store.js';
import { applyChange, StaleChangeError } from './workspace-edits.js';
import { workspaceNow } from './workspace-files.js';

import type { Change, WorkspaceState } from './workspace-edits.js';

/** The workspace as it stands, for planning a change: the open file's typed text, never pathogen.json. */
export function workspaceState(): WorkspaceState {
  const workspace = workspaceNow();
  return {
    files: Object.fromEntries(workspace.texts),
    folders: [...workspace.folders],
    entryPoints: [...workspace.entryPoints],
  };
}

/**
 * Make `change`. Refused, changing nothing, when it was planned for another
 * version of the workspace (StaleChangeError's message says how it differs).
 * A change that names a program to show (a workspace's first program) shows it.
 */
export function applyToWorkspace(change: Change): { ok: true; state: WorkspaceState } | { ok: false; message: string } {
  let next: WorkspaceState;
  try {
    next = applyChange(workspaceState(), change);
  } catch (err) {
    if (err instanceof StaleChangeError) return { ok: false, message: err.message };
    throw err;
  }
  store.update({
    workspaceFiles: next.files,
    workspaceFolders: next.folders,
    workspaceEntryPoints: next.entryPoints,
    ...(change.show !== undefined ? { shownProgram: change.show } : {}),
  });
  return { ok: true, state: next };
}
