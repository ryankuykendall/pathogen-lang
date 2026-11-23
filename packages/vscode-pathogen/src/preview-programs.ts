/**
 * What VS Code's preview shows (2f; docs/projects.md "The preview in VS Code";
 * project-docs/modules/66-phase-2f-plan.md): in a project with a main, the
 * program you choose, kept per project while you move between its files, and
 * the program list behind the chip; anywhere else, the file you're editing.
 *
 * The rows' words and rules are the playground's (playground/services/
 * program-list.ts, error-place.ts, open-files.ts), which the extension can't
 * import; tests/vscode-preview-programs.test.ts pins each to its original.
 *
 * No `vscode` import: tests drive this with the real library on real folders.
 */
import * as path from 'node:path';

import { samePathKey } from './preview-modules';

import type { ProgramChipItem } from './program-chip-item';

/** A main row's words when the main doesn't exist (2f mockup v1, state 7; approved 2026-11-21). */
export const NOT_FOUND = 'Not found';

/** Said after the path of a program pathogen.json doesn't list (2f mockup v1, state 5). */
export const NOT_LISTED = 'not in pathogen.json';

/** A main row's words once it starts with `module;` (the playground's MODULE_MAIN). */
export const MODULE_MAIN = "A module now, so it can't draw as the main";

/** A blank tile's hover text (the playground's TOO_DETAILED). */
export const TOO_DETAILED = 'Too detailed to draw this small';

/** What reading a project's main gives (pathogen-lang/node `readProjectMain`). */
export type ProjectMainReadLike =
  | { ok: true; path: string; listed: boolean }
  | { ok: false; problem: string; message: string; path: string | null; listed: boolean };

/** What the rules need from `pathogen-lang` and `pathogen-lang/node`. */
export interface ProgramsLibs {
  lib: { isModuleSource: (source: string) => boolean };
  node: {
    findProjectRoot: (programDir: string) => { root: string; projectFile: string | null };
    loadProjectFileSync: (
      projectFile: string,
    ) => { ok: true; project: { entryPoints?: { path: string }[] } } | { ok: false; message: string };
    readProjectMain: (
      folder: string,
      options: { label?: string; openText?: (absolutePath: string) => string | undefined },
    ) => Promise<ProjectMainReadLike>;
  };
}

/** Files' text: an open tab's (unsaved edits count), else the disk's; undefined when neither has it. */
export interface Texts {
  /** An open tab's text only. */
  open: (absolutePath: string) => string | undefined;
  /** An open tab's text, else the disk's. */
  read: (absolutePath: string) => string | undefined;
}

/**
 * A project with a main: its pathogen.json has `entryPoints`, or there's a
 * main.pathogen beside it (docs/projects.md "The preview in VS Code").
 */
export interface Project {
  /** The folder holding pathogen.json. */
  root: string;
  /** One spelling of `root`, for telling projects apart (samePathKey). */
  key: string;
  /** The main's OS path; null when `entryPoints` breaks a rule of the list (empty, or a file twice). */
  main: string | null;
  /** Why the main can't be shown: its row's words (null for a broken list: no main row) and the CLI's message. */
  mainProblem: { row: string | null; message: string } | null;
  /** The programs pathogen.json lists, in order: the main first (even missing, or a module), then the others that exist and are programs. */
  listed: string[];
}

/** An OS path inside `root`, as the list writes it: "demos/train.pathogen". */
export const projectPath = (root: string, file: string): string => path.relative(root, file).split(path.sep).join('/');

/**
 * The project `file` belongs to, when it's a project with a main; else null,
 * and the preview shows the file you're editing, as before 2f. That's a file
 * with no pathogen.json in its folder or above, one whose pathogen.json has no
 * `entryPoints` and no main.pathogen beside it (a `{}` that only marks the
 * project folder), and one whose pathogen.json has an error (it shows at the
 * file's first import or `@font`).
 */
export async function readProject(file: string, libs: ProgramsLibs, texts: Texts): Promise<Project | null> {
  const { root, projectFile } = libs.node.findProjectRoot(path.dirname(file));
  if (projectFile === null) return null;
  const main = await libs.node.readProjectMain(root, { label: path.basename(root), openText: texts.open });
  if (!main.ok && main.problem === 'project-file') return null;
  // `{}` with no main.pathogen declares no main.
  if (!main.ok && main.problem === 'not-found' && !main.listed) return null;
  const parsed = libs.node.loadProjectFileSync(projectFile);
  if (!parsed.ok) return null;

  const abs = (projectPath: string): string => path.join(root, ...projectPath.split('/').filter(Boolean));
  const brokenList = !main.ok && main.problem === 'list';
  const mainFile = !brokenList && main.path !== null ? abs(main.path) : null;
  const mainProblem = main.ok
    ? null
    : { row: brokenList ? null : main.problem === 'module' ? MODULE_MAIN : NOT_FOUND, message: main.message };
  const listed: string[] = mainFile !== null ? [mainFile] : [];
  const seen = new Set(listed.map(samePathKey));
  for (const entry of parsed.project.entryPoints ?? []) {
    const file = abs(entry.path);
    const key = samePathKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    // As in the playground, a listed file that's missing or a module isn't offered; only the main stays.
    const text = texts.read(file);
    if (text !== undefined && !libs.lib.isModuleSource(text)) listed.push(file);
  }
  return { root, key: samePathKey(root), main: mainFile, mainProblem, listed };
}

/** What the preview shows. */
export type Shown =
  /** The file you're editing, as before 2f (not in a project with a main). */
  | { kind: 'file' }
  /** A program of a project with a main. */
  | { kind: 'program'; path: string; project: Project }
  /** A project with a main whose main can't be shown, and no other program chosen: the CLI's message. */
  | { kind: 'problem'; project: Project; message: string };

/**
 * How long a chosen program may be missing before it counts as deleted. A save
 * that replaces the file, or a checkout, takes it away for a moment: the
 * preview shows the main meanwhile, and the program again if it's back in time.
 */
export const MISSING_GRACE_MS = 2000;

/**
 * The program chosen in each project with a main, while the preview is open
 * (docs/projects.md "The preview in VS Code"): the preview button on a
 * program's tab chooses it, as does the program list; the button on a
 * module's tab chooses nothing. A choice that was deleted or became a module
 * is forgotten, so the preview goes back to the main.
 */
export class ProgramChoices {
  /** By project key: the program, and since when it's been missing (null: it's there). */
  private readonly chosen = new Map<string, { file: string; missingSince: number | null }>();

  constructor(
    private readonly isModuleSource: (source: string) => boolean,
    private readonly texts: Texts,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * What the preview shows while `file` (with `text`) is in the editor: its
   * project's choice, else its main. `pressed`: it was opened from `file`'s
   * tab (its preview button, or the command), which chooses a program.
   * `file` null: an untitled document, which shows itself.
   */
  show(file: string | null, text: string, project: Project | null, pressed: boolean): Shown {
    if (project === null || file === null) return { kind: 'file' };
    if (pressed && !this.isModuleSource(text)) this.choose(project, file);
    const choice = this.valid(project);
    if (choice !== null) return { kind: 'program', path: choice, project };
    if (project.main !== null && project.mainProblem === null) return { kind: 'program', path: project.main, project };
    return { kind: 'problem', project, message: project.mainProblem?.message ?? '' };
  }

  /** A program chosen in the list. */
  choose(project: Project, file: string): void {
    this.chosen.set(project.key, { file, missingSince: null });
  }

  /**
   * A file or folder renamed or moved in VS Code: a choice of it, or of a
   * file inside it, follows, and so does the choice of a project whose folder
   * moved. (One renamed outside VS Code counts as deleted.)
   */
  renamed(from: string, to: string): void {
    // `from` is gone: its key keeps the spelling it had (samePathKey), as the stored keys do.
    const fromKey = samePathKey(from);
    const moved = (key: string): string | null => {
      if (key === fromKey) return to;
      return key.startsWith(fromKey + path.sep) ? path.join(to, key.slice(fromKey.length + 1)) : null;
    };
    for (const [project, choice] of [...this.chosen]) {
      const file = moved(samePathKey(choice.file));
      if (file !== null) this.chosen.set(project, { file, missingSince: null });
      const folder = moved(project);
      if (folder !== null) {
        const kept = this.chosen.get(project)!;
        this.chosen.delete(project);
        this.chosen.set(samePathKey(folder), kept);
      }
    }
  }

  private valid(project: Project): string | null {
    const choice = this.chosen.get(project.key);
    if (choice === undefined) return null;
    // Missing for longer than a save takes: deleted, even if a file of that name comes back later.
    if (choice.missingSince !== null && this.now() - choice.missingSince >= MISSING_GRACE_MS) {
      this.chosen.delete(project.key);
      return null;
    }
    const text = this.texts.read(choice.file);
    if (text === undefined) {
      choice.missingSince ??= this.now();
      return null;
    }
    if (this.isModuleSource(text)) {
      this.chosen.delete(project.key);
      return null;
    }
    choice.missingSince = null;
    return choice.file;
  }
}

/** A program's drawing, as the drawings queue has it (preview-drawings.ts). */
export interface DrawnRow {
  /** Its row's words: "Error in parts/gears.pathogen line 9"; null when it draws. */
  error: string | null;
  /** A `data:` URL (the webview's CSP allows no other); null for a blank tile. */
  miniature: string | null;
  /** Out of date, and a draw will redraw it (the spinner). */
  updating: boolean;
  /** The OS paths of the files its imports reach; null before they're read. */
  files: readonly string[] | null;
  /** Too large to draw small, so its tile is blank on purpose. */
  tooLarge: boolean;
}

/**
 * The programs in the list, in order (OS paths): pathogen.json's, then the
 * file you're editing and the program shown when the list leaves them out,
 * by path. `editing` is the file in the editor when it's a program of this
 * project, else null.
 */
export function listedPrograms(
  project: Project,
  shown: string | null,
  editing: string | null,
  keyOf: (file: string) => string = samePathKey,
): string[] {
  const keys = new Set(project.listed.map(keyOf));
  const extra = new Map<string, string>();
  for (const file of [editing, shown]) {
    if (file === null) continue;
    const key = keyOf(file);
    if (!keys.has(key)) extra.set(key, file);
  }
  const byPath = (a: string, b: string): number => {
    const [pa, pb] = [projectPath(project.root, a), projectPath(project.root, b)];
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  };
  return [...project.listed, ...[...extra.values()].sort(byPath)];
}

/**
 * The chip's rows, as the playground draws them (program-list.ts
 * programItems), with VS Code's two additions: a program pathogen.json doesn't
 * list says so after its path, and a main that can't be shown says why
 * ("Not found", or MODULE_MAIN). `editingFile` is the file in the editor (any
 * file of this project, for the dots), `editingProgram` the same when it's a
 * program.
 */
export function programRows(
  project: Project,
  shown: string | null,
  editingFile: string | null,
  editingProgram: string | null,
  drawn: (file: string) => DrawnRow | undefined,
): { items: ProgramChipItem[]; files: string[] } {
  // Each path's key once: rows share the files they import, and a key reads the disk.
  const cache = new Map<string, string>();
  const keyOf = (file: string): string => {
    let key = cache.get(file);
    if (key === undefined) {
      key = samePathKey(file);
      cache.set(file, key);
    }
    return key;
  };
  const files = listedPrograms(project, shown, editingProgram, keyOf);
  const listed = new Set(project.listed.map(keyOf));
  const mainKey = project.main === null ? null : keyOf(project.main);
  const shownKey = shown === null ? null : keyOf(shown);
  const editingKey = editingFile === null ? null : keyOf(editingFile);
  // The dots only show while the file you're editing isn't the program shown.
  const dots = editingKey !== null && editingKey !== shownKey;
  const labels = tabLabels(files.map((f) => projectPath(project.root, f)));
  const items = files.map((file, i): ProgramChipItem => {
    const key = keyOf(file);
    const isMain = key === mainKey;
    const unshowable = isMain && project.mainProblem !== null;
    const row = unshowable ? undefined : drawn(file);
    const { path: rel, name, hint } = labels[i];
    return {
      path: rel,
      name,
      hint,
      badge: isMain && rel !== 'main.pathogen',
      error: unshowable ? project.mainProblem!.row : (row?.error ?? null),
      uses: dots ? usesOf(key, row?.files?.map(keyOf) ?? null, editingKey, shownKey) : null,
      updating: !unshowable && key !== shownKey && (row?.updating ?? false),
      miniature: row?.miniature ?? null,
      tileNote: row?.tooLarge ? TOO_DETAILED : null,
      note: listed.has(key) ? null : NOT_LISTED,
    };
  });
  return { items, files };
}

// --- The playground's rules, which tests/vscode-preview-programs.test.ts pins to the originals ---

/** The playground's usesOf (program-list.ts), on path keys. */
export function usesOf(
  file: string,
  files: readonly string[] | null,
  editing: string | null,
  shown: string | null,
): 'self' | 'import' | null {
  if (editing === null || editing === shown) return null;
  if (file === editing) return 'self';
  return files?.includes(editing) ? 'import' : null;
}

/** The playground's chipAlert (program-list.ts): the chip's red dot, as its title, or null for none. */
export function chipAlert(items: readonly ProgramChipItem[], shown: string | null): string | null {
  if (items.some((item) => item.error !== null && item.path !== shown)) return 'Another program has an error';
  const own = items.find((item) => item.path === shown && item.error === MODULE_MAIN);
  return own ? `${own.path}: ${MODULE_MAIN}` : null;
}

const PATHOGEN_EXT = '.pathogen';
const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
const folderParts = (p: string): string[] => p.split('/').slice(0, -1);
const tabName = (p: string): string => {
  const name = baseName(p);
  return name.endsWith(PATHOGEN_EXT) ? name.slice(0, -PATHOGEN_EXT.length) : name;
};

/**
 * The playground's tabLabels (open-files.ts): each name, and when two share
 * one, as much of each folder as tells them apart (`/` for the top).
 */
export function tabLabels(paths: readonly string[]): { path: string; name: string; hint: string | null }[] {
  const byName = new Map<string, string[]>();
  for (const p of paths) {
    const name = tabName(p);
    byName.set(name, [...(byName.get(name) ?? []), p]);
  }
  const hints = new Map<string, string>();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const deepest = Math.max(...group.map((p) => folderParts(p).length));
    for (let depth = 1; depth <= Math.max(deepest, 1); depth++) {
      const tails = group.map((p) => folderParts(p).slice(-depth).join('/') || '/');
      if (new Set(tails).size === group.length || depth >= deepest) {
        group.forEach((p, i) => hints.set(p, tails[i]));
        break;
      }
    }
  }
  return paths.map((p) => ({ path: p, name: tabName(p), hint: hints.get(p) ?? null }));
}
