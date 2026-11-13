// Making a planned change to the workspace the playground holds (phase 2d,
// steps 4b and 4c; project-docs/modules/52-phase-2d-plan.md). The plans are
// pure (services/workspace-edits.ts); this is where one lands, in ONE store
// update, so no subscriber ever sees half a change: every file, the folders,
// the program list, the program shown, and what the editor holds.
//
// - A file moved or renamed keeps its tab, its place among the tabs and its
//   editor state, undo history and all; the program shown follows it.
// - The imports rewritten in other files (and a moved file's own) reach the
//   editor as small edits OUTSIDE each file's undo history: Cmd-Z in a file
//   must never point an import back at a name that's gone (note 53, question
//   3). The toast's Undo is what puts names and imports back together.
// - A deleted file's tab closes. If it was the file in the editor, the tab to
//   its right shows, else to its left; with no tab left, no file (the editor's
//   zero-state, step 4d). Its text is never written back, and its editor state
//   is forgotten, so a new file with its name starts afresh.
// - With no file open, a change reaches only the editor's kept states.
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
import {
  applyChange,
  importChangeOffsets,
  PROJECT_FILE,
  projectFileText,
  StaleChangeError,
} from './workspace-edits.js';
import { openFileNow, programToShow, workspaceNow } from './workspace-files.js';

import type { FileEditor } from './open-files.js';
import type { Change, WorkspaceState } from './workspace-edits.js';

/** One edit to a file's text: the editor applies it as it is, outside the undo history. */
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/** What a change needs from the editor. */
export interface ChangeEditor extends FileEditor {
  /** Drop these files' kept states, undo history and all. */
  forgetFiles: (paths: string[]) => void;
  /** Put new text in the file shown, outside its undo history (pathogen.json, written from the entry points). */
  refreshShown: (text: string) => void;
  /** Files moved or renamed, in order: their kept states and the file shown go with them. */
  renameFiles: (moves: { from: string; to: string }[]) => void;
  /** Files whose text was replaced whole (an upload's Replace): each starts afresh, undo history and all. */
  replaceFiles: (files: { path: string; text: string }[]) => void;
  /**
   * A file's import rewrites (by its path after the change), outside its undo
   * history, without telling anyone (the store update says it all). `before`
   * is the text the edits were made for; if the editor holds other text for
   * the file, it takes `after` whole.
   */
  editFile: (path: string, edits: TextEdit[], before: string, after: string) => void;
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
 * else to its left; with no tab left, none (the zero-state, step 4d).
 */
function survivor(tabs: readonly string[], active: string, gone: (p: string) => boolean): string | null {
  const at = tabs.indexOf(active);
  const right = tabs.slice(at + 1).find((p) => !gone(p));
  const left = [...tabs.slice(0, Math.max(at, 0))].reverse().find((p) => !gone(p));
  return right ?? left ?? null;
}

/**
 * The change, step by step: the workspace after it, its moves in order, and
 * each import rewrite with the offsets in the text it was made for. A step's
 * paths are the ones its workspace has at that point (an Undo's imports name
 * the paths its moves just put back), so they're read as they come.
 */
function walk(before: WorkspaceState, change: Change) {
  const moves: { at: number; from: string; to: string }[] = [];
  const rewrites: { at: number; path: string; edits: TextEdit[]; before: string; after: string }[] = [];
  let state = before;
  change.steps.forEach((step, at) => {
    const next = applyChange(state, { steps: [step], importsUpdated: [] });
    if (step.kind === 'move') moves.push({ at, from: step.from, to: step.to });
    if (step.kind === 'imports') {
      const text = state.files[step.path];
      rewrites.push({
        at,
        path: step.path,
        edits: importChangeOffsets(text, step.path, step.changes),
        before: text,
        after: next.files[step.path],
      });
    }
    state = next;
  });
  /** Where a path at step `at` ends up once the change is made. */
  const follow = (path: string, at = -1): string => {
    let p = path;
    for (const move of moves) if (move.at > at && move.from === p) p = move.to;
    return p;
  };
  return { next: state, moves, rewrites, follow };
}

/**
 * Make `change`. Refused, changing nothing, when it was planned for another
 * version of the workspace (StaleChangeError's message says how it differs).
 * Without an editor (a test, or nothing open), only the workspace changes.
 */
export function applyToWorkspace(change: Change, editor?: ChangeEditor): ApplyResult {
  const before = workspaceState();
  let walked: ReturnType<typeof walk>;
  try {
    walked = walk(before, change);
  } catch (err) {
    if (err instanceof StaleChangeError) return { ok: false, message: err.message };
    throw err;
  }
  const { next, moves, rewrites, follow } = walked;
  // Deleted: gone, and not moved somewhere.
  const removed = Object.keys(before.files).filter((p) => !(follow(p) in next.files));
  const gone = new Set(removed);
  const isGone = (p: string): boolean => gone.has(p);
  const updates: Record<string, unknown> = {
    workspaceFiles: next.files,
    workspaceFolders: next.folders,
    workspaceEntryPoints: next.entryPoints,
  };

  // The program shown.
  const shown = store.get('shownProgram') as string | null;
  const oldMain = before.entryPoints[0];
  if (change.show !== undefined) updates.shownProgram = change.show;
  else if (shown !== null && gone.has(shown)) updates.shownProgram = null;
  else if (shown !== null && follow(shown) !== shown) updates.shownProgram = follow(shown);
  else if (shown === null && oldMain !== undefined && follow(oldMain) !== next.entryPoints[0]) {
    // The main moves (not just its name): keep the preview on what it shows
    // now, if that's still here and isn't the new main anyway. (With no main
    // before, there's nothing to keep: the preview follows the new one.)
    const now = follow(programToShow(workspaceNow(), null));
    if (now in next.files && now !== next.entryPoints[0]) updates.shownProgram = now;
  }

  // The editor: moved files' states go with them first, so nothing later
  // shows a file by a path the editor doesn't know yet.
  if (moves.length > 0) editor?.renameFiles(moves.map(({ from, to }) => ({ from, to })));
  // Import rewrites, by each file's path after the change.
  for (const rewrite of rewrites) {
    editor?.editFile(follow(rewrite.path, rewrite.at), rewrite.edits, rewrite.before, rewrite.after);
  }
  // Files replaced whole (a remove and an add of one path: an upload's Replace, or its Undo) start afresh.
  const removedSteps = new Set(change.steps.flatMap((step) => (step.kind === 'remove' ? [step.path] : [])));
  const replaced = change.steps.flatMap((step) =>
    step.kind === 'add' && removedSteps.has(step.path) && step.path in next.files ? [step.path] : [],
  );
  if (replaced.length > 0) editor?.replaceFiles(replaced.map((path) => ({ path, text: next.files[path] })));

  // The tabs, and the file in the editor (none: the zero-state).
  const openFiles = store.get('openFiles') as string[];
  const active = openFileNow();
  const activeGone = active !== null && isGone(active);
  // The tabs in order: each moved one by its new path, a deleted one (for now) by its old.
  const tabs = openFiles.map((p) => (isGone(p) ? p : follow(p)));
  let kept = tabs.filter((_, i) => !isGone(openFiles[i]));
  let shownFile = active === null || activeGone ? active : follow(active);
  if (active !== null && activeGone) {
    shownFile = survivor(tabs, active, isGone);
    if (shownFile === null) {
      editor?.showNone();
      updates.code = '';
    } else {
      const text = shownFile === PROJECT_FILE ? projectFileText(next.entryPoints) : next.files[shownFile];
      editor?.showFile(shownFile, text);
      kept = withTabOpened(kept, shownFile);
      updates.code = text;
    }
  } else if (
    shownFile !== null &&
    shownFile !== PROJECT_FILE &&
    next.files[shownFile] !== (store.get('code') as string)
  ) {
    // The open file's own imports were rewritten (the editor has them already).
    updates.code = next.files[shownFile];
  }
  if (shownFile !== active) updates.openFile = shownFile;
  if (!sameList(kept, openFiles)) updates.openFiles = kept;

  // pathogen.json in the editor follows the program list.
  if (shownFile === PROJECT_FILE && !activeGone && !sameList(before.entryPoints, next.entryPoints)) {
    const text = projectFileText(next.entryPoints);
    editor?.refreshShown(text);
    updates.code = text;
  }

  store.update(updates);
  if (removed.length > 0) editor?.forgetFiles(removed);
  return { ok: true, state: next, removed };
}
