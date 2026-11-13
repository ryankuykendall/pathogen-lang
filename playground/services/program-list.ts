// The program chip's list (phase 2d, step 5a; mockup v6 screen G,
// docs/workspace-files.md "The preview and the program list"). Pure: which
// programs the list holds and in what order, each row as the chip draws it,
// the chip's red dot, and what an edit that adds or takes out `module;` does
// to pathogen.json's list (screen E).

import { MAIN_FILE } from './workspace-files.js';
import { tabLabels } from './open-files.js';
import { entryPointsAfterEdit } from './workspace-edits.js';

import type { Change, WorkspaceState } from './workspace-edits.js';

/** One program in the chip's list. */
export interface ProgramItem {
  path: string;
  /** The file's name without `.pathogen`, and its folder when two programs share the name (the tabs' rule). */
  name: string;
  hint: string | null;
  /** The `main` badge: on a main that isn't main.pathogen. */
  badge: boolean;
  /** Why it doesn't draw, as its row says it; null when it does. */
  error: string | null;
  /** The dot: it's the file you're editing ('self'), or it uses it ('import'). Step 5b. */
  uses: 'self' | 'import' | null;
  /** Its miniature is being redrawn after an edit. Step 5b. */
  updating: boolean;
  /** Its miniature's URL; null for a blank tile. Step 5b. */
  miniature: string | null;
}

/** A main row's line once `module;` made it a library (mockup v6 screen E, state 4). */
export const LIBRARY_MAIN = "A library now, so it can't be the main";

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The programs the list holds, in its order: pathogen.json's list, the main
 * first even once it's become a library (it stays the main until you choose
 * another), then any program the list doesn't name (an older save), by path.
 * Libraries never.
 */
export function programsOf(
  texts: ReadonlyMap<string, string>,
  entryPoints: readonly string[],
  isLibrary: (path: string, text: string) => boolean,
): string[] {
  const listed = entryPoints.filter((p) => texts.has(p));
  const kept = listed.filter((p, i) => i === 0 || !isLibrary(p, texts.get(p)!));
  const unlisted = [...texts.keys()].filter((p) => !listed.includes(p) && !isLibrary(p, texts.get(p)!)).sort(byPath);
  return [...kept, ...unlisted];
}

/** Each program's row, as the chip draws it. */
export function programItems(
  programs: readonly string[],
  { main, mainIsLibrary }: { main: string | null; mainIsLibrary: boolean },
): ProgramItem[] {
  return tabLabels(programs).map(({ path, name, hint }) => ({
    path,
    name,
    hint,
    badge: path === main && path !== MAIN_FILE,
    error: path === main && mainIsLibrary ? LIBRARY_MAIN : null,
    uses: null,
    updating: false,
    miniature: null,
  }));
}

/**
 * The chip's red dot, as its title, or null for none. Another program with an
 * error lights it; the program shown has the error panel instead. A main
 * that's become a library lights it even while shown: that's no compile error.
 */
export function chipAlert(items: readonly ProgramItem[], shown: string | null): string | null {
  if (items.some((item) => item.error !== null && item.path !== shown)) return 'Another program has an error';
  const own = items.find((item) => item.path === shown && item.error === LIBRARY_MAIN);
  return own ? `${own.path}: ${LIBRARY_MAIN}` : null;
}

/**
 * pathogen.json's list after the files in `edited` changed (each as `state`
 * has it now): a program that gained `module;` leaves, one that lost it goes
 * back at the end, and the main stays (entryPointsAfterEdit). The change to
 * make, as one step, or null when the list stays. `show` is a workspace's
 * first program, which the preview then shows.
 */
export function programListChange(state: WorkspaceState, edited: readonly string[]): Change | null {
  let entryPoints = state.entryPoints;
  let show: string | undefined;
  for (const path of edited) {
    if (!(path in state.files)) continue;
    const next = entryPointsAfterEdit({ ...state, entryPoints }, path, state.files[path]);
    if (next === null) continue;
    entryPoints = next.entryPoints;
    show ??= next.show;
  }
  const same =
    entryPoints.length === state.entryPoints.length && entryPoints.every((p, i) => p === state.entryPoints[i]);
  if (same) return null;
  return {
    steps: [{ kind: 'entryPoints', before: [...state.entryPoints], after: entryPoints }],
    importsUpdated: [],
    ...(show !== undefined ? { show } : {}),
  };
}
