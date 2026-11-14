// The program chip's list (phase 2d, step 5a; mockup v6 screen G,
// docs/workspace-files.md "The preview and the program list"). Pure: which
// programs the list holds and in what order, each row as the chip draws it,
// the chip's red dot, and what an edit that adds or takes out `module;` does
// to pathogen.json's list (screen E).

import { MAIN_FILE } from './workspace-files.js';
import { errorRowText } from './error-place.js';
import { tabLabels } from './open-files.js';
import { entryPointsAfterEdit } from './workspace-edits.js';

import type { ErrorPlace } from './error-place.js';
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
  /** Why its tile is blank, on hover (TOO_DETAILED); none otherwise. Step 5b. */
  tileNote?: string | null;
}

/** A blank tile's hover text: the drawing is too large to draw small (agreed 2026-11-13, note 52). */
export const TOO_DETAILED = 'Too detailed to draw this small';

/**
 * A main row's line once it starts with `module;` (mockup v6 screen E, state 4;
 * "module", not "library", and "can't draw as the main", since 2026-11-13: it
 * stays the main until you choose another, so it doesn't say it can't be one).
 */
export const MODULE_MAIN = "A module now, so it can't draw as the main";

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

/**
 * The dot (mockup v6 screen G): on the file you're editing ('self') and on
 * the programs whose imports reach it ('import'), from their `files`. Only
 * while the file you're editing isn't the program shown, as the mockup's
 * states draw it: then the preview already says what you're editing.
 */
export function usesOf(
  path: string,
  files: readonly string[] | null,
  editing: string | null,
  shown: string | null,
): 'self' | 'import' | null {
  if (editing === null || editing === shown) return null;
  if (path === editing) return 'self';
  return files?.includes(editing) ? 'import' : null;
}

/** A program's drawing, as services/program-drawings.ts has it (step 5b). */
export interface DrawnRow {
  error: string | null;
  miniature: string | null;
  updating: boolean;
  files: readonly string[] | null;
  tooLarge?: boolean;
}

/** Each program's row, as the chip draws it, with its drawing when `drawn` is given (step 5b). */
export function programItems(
  programs: readonly string[],
  { main, mainIsLibrary }: { main: string | null; mainIsLibrary: boolean },
  drawn?: { rows: ReadonlyMap<string, DrawnRow>; editing: string | null; shown: string | null },
): ProgramItem[] {
  return tabLabels(programs).map(({ path, name, hint }) => {
    const row = drawn?.rows.get(path);
    return {
      path,
      name,
      hint,
      badge: path === main && path !== MAIN_FILE,
      error: path === main && mainIsLibrary ? MODULE_MAIN : (row?.error ?? null),
      uses: drawn ? usesOf(path, row?.files ?? null, drawn.editing, drawn.shown) : null,
      updating: row?.updating ?? false,
      miniature: row?.miniature ?? null,
      tileNote: row?.tooLarge ? TOO_DETAILED : null,
    };
  });
}

/**
 * The chip's red dot, as its title, or null for none. Another program with an
 * error lights it; the program shown has the error panel instead. A main
 * that's become a library lights it even while shown: that's no compile error.
 */
export function chipAlert(items: readonly ProgramItem[], shown: string | null): string | null {
  if (items.some((item) => item.error !== null && item.path !== shown)) return 'Another program has an error';
  const own = items.find((item) => item.path === shown && item.error === MODULE_MAIN);
  return own ? `${own.path}: ${MODULE_MAIN}` : null;
}

/**
 * The tree's red dots (2d, step 7c; mockup v6 screen G, state 5): on each
 * program whose compile failed, saying where (its row's words), and on the
 * file where it failed, saying which program fails there; on a main that's a
 * module too. Every program, the one shown or not. A file several programs
 * fail in says each, one per line. Path → what hovering its dot says.
 */
export function treeErrorDots(
  rows: ReadonlyMap<string, { place: ErrorPlace | null }>,
  { main, mainIsLibrary }: { main: string | null; mainIsLibrary: boolean },
): Map<string, string> {
  const lines = new Map<string, string[]>();
  const add = (path: string, line: string): void => {
    const said = lines.get(path);
    if (said) said.push(line);
    else lines.set(path, [line]);
  };
  if (main !== null && mainIsLibrary) add(main, MODULE_MAIN);
  for (const [program, row] of rows) {
    const place = row.place;
    if (!place) continue;
    add(program, errorRowText(place));
    if (place.file !== program) {
      add(place.file, place.line === null ? `${program} fails here` : `${program} fails here, line ${place.line}`);
    }
  }
  return new Map([...lines].map(([path, said]) => [path, said.join('\n')]));
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
