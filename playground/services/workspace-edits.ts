// The workspace's edits (phase 2d, step 2; project-docs/modules/52-phase-2d-plan.md):
// new files and folders, rename, Move to…, duplicate, delete, Set as main, and
// what a program gaining or losing `module;` does to the program list. The
// contract is docs/workspace-files.md.
//
// Pure: each plan reads a workspace passed in (the open editors' live text, in
// step 3) and returns a Change and the Change that undoes it, or why it can't be
// done. Nothing here touches the store or the editor.
//
// - A Change is a list of steps. Import edits are kept as "the nth import of
//   these names written X becomes Y" (`import { gear } from "X"`), found again
//   from the parse tree when applied, so an Undo still lands after you've typed
//   elsewhere in the file, even another import of the same file. One whose
//   import was retyped is refused (StaleChangeError), and nothing changes. Two
//   imports alike in every way can't be told apart, and either may be the one
//   edited: they read the same either way.
// - Every plan's result goes through the engine's checkWorkspaceManifest, the
//   server's own rules. So the folders and entry points kept here are the
//   server's normal form, byte for byte, and the autosave hash settles (the 2c
//   class of bug), and the rules on names, letter case, depth and limits are
//   the server's, not a second copy.

import { emptyBoilerplate } from '../utils/examples.js';
import { PROJECT_FILE } from '../utils/workspace-names.js';
import { isDataFile } from './workspace-files.js';

type Lib = Window['PathogenLang'];

function lib(): Lib {
  const l = (window as { PathogenLang?: Lib }).PathogenLang;
  if (!l) throw new Error('The Pathogen library is not loaded, so the workspace cannot be changed.');
  return l;
}

/** The workspace's files as the edits see them. Workspace paths have no leading slash. */
export interface WorkspaceState {
  /** Every .pathogen file's text, by path. pathogen.json isn't one: it's written from entryPoints. */
  files: Record<string, string>;
  /** The folders with nothing in them, as the server keeps them; the others come from the file paths. */
  folders: string[];
  /** The programs, the main first (pathogen.json's entryPoints). */
  entryPoints: string[];
}

/**
 * One import path to replace: among the imports that import `clause` from
 * `written`, the nth (counting from 0) is to import from `text` instead.
 */
export interface ImportChange {
  written: string;
  text: string;
  /** What the import names, before its path, spaces collapsed: `import { gear } from`. */
  clause: string;
  nth: number;
  /**
   * How many imports alike (`written`, `clause`) the file had when planned. An
   * Undo can come after typing: one alike added or removed would make `nth`
   * name another import, so a different count refuses the change.
   */
  of?: number;
}

export type Step =
  | { kind: 'add'; path: string; text: string }
  /** `text` is the file's text when the change was planned: what undoing puts back. */
  | { kind: 'remove'; path: string; text: string }
  | { kind: 'move'; from: string; to: string }
  | { kind: 'imports'; path: string; changes: ImportChange[] }
  | { kind: 'folders'; before: string[]; after: string[] }
  | { kind: 'entryPoints'; before: string[]; after: string[] };

export interface Change {
  steps: Step[];
  /** What the toast says, if anything. */
  message?: string;
  /** The program the preview should show: a workspace's first program. */
  show?: string;
  /** The file to open in a tab. */
  open?: string;
  /** The files whose imports changed, by their paths after the change. */
  importsUpdated: string[];
}

export type Planned = { ok: true; change: Change; undo: Change } | { ok: false; message: string };

/**
 * Where `path` is once `change` is made: through its moves, in order, a
 * folder's move carrying what's in it. A path no move touches stays as it is
 * (deleted or not: the caller checks).
 */
export function pathAfterChange(path: string, change: Change): string {
  let at = path;
  for (const step of change.steps) {
    if (step.kind !== 'move') continue;
    if (at === step.from) at = step.to;
    else if (at.startsWith(`${step.from}/`)) at = step.to + at.slice(step.from.length);
  }
  return at;
}

/** A change made for another version of the workspace. Nothing is changed. */
export class StaleChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleChangeError';
  }
}

export { PROJECT_FILE };
const EXTENSION = '.pathogen';
/** What New module starts with (mockups v5, example/new-library.pathogen; "module", not "library", since 2026-11-13). */
const NEW_LIBRARY = 'module;\n\n// Export fns, consts and enums here, for other files to import.\n';

// ---------- paths ----------

const join = (folder: string, name: string): string => (folder ? `${folder}/${name}` : name);
const parentOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const where = (folder: string): string => (folder ? `${folder}/` : 'The top of the workspace');
const isUnder = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);
const shown = (path: string, isFolder: boolean): string => (isFolder ? `${path}/` : path);

/** Every folder: the ones the files sit in and the empty ones. */
function allFolders(state: WorkspaceState): Set<string> {
  const out = new Set<string>();
  const addWithParents = (folder: string) => {
    const parts = folder.split('/');
    for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('/'));
  };
  for (const path of Object.keys(state.files)) if (path.includes('/')) addWithParents(parentOf(path));
  for (const folder of state.folders) addWithParents(folder);
  return out;
}

/** Whether `path` is one of the workspace's folders (an empty one, or one holding files). */
export function isFolder(state: WorkspaceState, path: string): boolean {
  return allFolders(state).has(path);
}

/** The file or folder in `folder` whose name matches `name` without regard to letter case. */
function takenIn(state: WorkspaceState, folder: string, name: string, except?: string): string | null {
  const key = join(folder, name).toLowerCase();
  for (const path of Object.keys(state.files)) if (path !== except && path.toLowerCase() === key) return baseOf(path);
  for (const f of allFolders(state)) if (f !== except && f.toLowerCase() === key) return `${baseOf(f)}/`;
  return null;
}

/** A data file (`.json`, `.geojson`, `.topojson`, `.fold`), by its extension. */
const isData = (path: string): boolean => isDataFile(path);

/**
 * The extension a file keeps through Rename…: a data file's own (`.json`),
 * else `.pathogen` (docs/workspace-files.md "Rename…").
 */
export const extensionFor = (path: string): string => (isData(path) ? path.slice(path.lastIndexOf('.')) : EXTENSION);

/** A typed file name without the extension the field adds (`.pathogen` unless another is given). */
const stripExtension = (typed: string, extension = EXTENSION): string =>
  typed.toLowerCase().endsWith(extension.toLowerCase()) ? typed.slice(0, -extension.length) : typed;

/** Why the typed name (one or more names joined by "/") can't be used, or null. */
function typedNameProblem(typed: string): string | null {
  for (const segment of typed.split('/')) {
    const problem = lib().workspaceNameProblem(segment);
    if (problem) return problem;
  }
  return null;
}

/**
 * A program: a `.pathogen` file without `module;`. A data file never is,
 * whatever its text (phase 3a: typing in `gears.json` once added it to the
 * program list, and every save after was refused).
 */
const isProgram = (path: string, text: string): boolean => !isData(path) && !lib().isModuleSource(text);

const nameList = (paths: string[]): string =>
  paths.length > 1 ? `${paths.slice(0, -1).join(', ')} and ${paths[paths.length - 1]}` : (paths[0] ?? '');

/**
 * A free name beside `name` in `folder`, numbered as Keep both does:
 * `gears.pathogen` → `gears-2.pathogen`, then `-3`, skipping any name taken in
 * any letter case. The number goes after the whole name, so a copy of
 * `labels-2.pathogen` is `labels-2-2.pathogen`, and a year in a name is never
 * read as a count.
 */
export function keepBothName(state: WorkspaceState, folder: string, name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!takenIn(state, folder, candidate)) return candidate;
  }
}

// ---------- imports, by place among the imports alike in names and path ----------

interface ImportAt {
  written: string;
  /** Offsets of the path string, quotes included. */
  from: number;
  to: number;
  /** What it imports, before the path: `import { gear } from`, spaces collapsed. */
  clause: string;
}

/** The file's imports whose path string is closed (`from "./pa` while typing is not an import yet). */
function closedImports(text: string): ImportAt[] {
  return lib()
    .planImports(text)
    .filter((imp) => imp.to - imp.from >= 2 && text[imp.to - 1] === text[imp.from])
    .map((imp) => ({
      written: imp.written,
      from: imp.from,
      to: imp.to,
      clause: text.slice(imp.statementFrom, imp.from).replace(/\s+/g, ' ').trim(),
    }));
}

/** The imports before `index` that import the same names from `written`. */
const alikeBefore = (imports: ImportAt[], index: number, written: string, clause: string): number =>
  imports.slice(0, index).filter((i) => i.written === written && i.clause === clause).length;

/**
 * Where each change lands in `text`: the offsets of the path between its quotes,
 * for an editor to dispatch (step 3). Throws StaleChangeError when an import a
 * change names isn't there any more.
 */
export function importChangeOffsets(
  text: string,
  path: string,
  changes: readonly ImportChange[],
): { from: number; to: number; insert: string }[] {
  const imports = closedImports(text);
  const out = changes.map((change) => {
    const alike = imports.filter((i) => i.written === change.written && i.clause === change.clause);
    const imp = alike[change.nth];
    if (!imp || (change.of !== undefined && alike.length !== change.of)) {
      throw new StaleChangeError(
        `${path} no longer imports "${change.written}" where it did, so its imports were left as they are.`,
      );
    }
    return { from: imp.from + 1, to: imp.to - 1, insert: change.text };
  });
  const starts = new Set(out.map((o) => o.from));
  if (starts.size !== out.length) throw new StaleChangeError(`${path}: two changes name the same import.`);
  return out;
}

function applyImportChanges(text: string, path: string, changes: readonly ImportChange[]): string {
  let out = text;
  for (const edit of importChangeOffsets(text, path, changes).sort((a, b) => b.from - a.from)) {
    out = out.slice(0, edit.from) + edit.insert + out.slice(edit.to);
  }
  return out;
}

// ---------- applying a change ----------

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The workspace with `change` made. Throws StaleChangeError, and changes
 * nothing, when the workspace isn't the one the change was planned for: a file
 * it adds is already there, one it moves or edits is gone, or the folders or the
 * program list changed since (the UI drops a pending Undo when they do).
 */
export function applyChange(state: WorkspaceState, change: Change): WorkspaceState {
  const files: Record<string, string> = { ...state.files };
  let folders = state.folders;
  let entryPoints = state.entryPoints;
  for (const step of change.steps) {
    switch (step.kind) {
      case 'add':
        if (step.path in files) throw new StaleChangeError(`${step.path} is already in the workspace.`);
        files[step.path] = step.text;
        break;
      case 'remove':
        if (!(step.path in files)) throw new StaleChangeError(`${step.path} isn't in the workspace any more.`);
        delete files[step.path];
        break;
      case 'move': {
        if (!(step.from in files)) throw new StaleChangeError(`${step.from} isn't in the workspace any more.`);
        if (step.to in files) throw new StaleChangeError(`${step.to} is already in the workspace.`);
        const text = files[step.from];
        delete files[step.from];
        files[step.to] = text;
        break;
      }
      case 'imports':
        if (!(step.path in files)) throw new StaleChangeError(`${step.path} isn't in the workspace any more.`);
        files[step.path] = applyImportChanges(files[step.path], step.path, step.changes);
        break;
      case 'folders':
        if (!sameList(folders, step.before)) throw new StaleChangeError("The workspace's folders changed since.");
        folders = step.after;
        break;
      case 'entryPoints':
        if (!sameList(entryPoints, step.before)) throw new StaleChangeError('The program list changed since.');
        entryPoints = step.after;
        break;
    }
  }
  return { files, folders, entryPoints };
}

// ---------- planning ----------

/**
 * The folders and entry points of a workspace after a change, in the server's
 * normal form, or the server's reason for refusing it (a name that differs from
 * another only in letter case, a file that is also a folder, too deep, too many
 * files, too large).
 */
function normalForm(
  files: Record<string, string>,
  folders: string[],
  entryPoints: string[],
): { ok: true; folders: string[]; entryPoints: string[] } | { ok: false; message: string } {
  const encoder = new TextEncoder();
  const manifest = {
    files: Object.fromEntries(
      Object.entries(files).map(([path, text]) => [
        path,
        { sha256: '0'.repeat(64), size: encoder.encode(text).length },
      ]),
    ),
    folders,
    entryPoints,
  };
  const checked = lib().checkWorkspaceManifest(manifest);
  if (!checked.ok) return { ok: false, message: checked.message };
  return { ok: true, folders: checked.value.folders, entryPoints: checked.value.entryPoints };
}

/** The steps that undo `steps` (made on `before`), last first. */
function invertSteps(steps: readonly Step[], before: WorkspaceState): Step[] {
  const out: Step[] = [];
  let state = before;
  const inverses: Step[] = [];
  for (const step of steps) {
    let inverse: Step;
    switch (step.kind) {
      case 'add':
        inverse = { kind: 'remove', path: step.path, text: step.text };
        break;
      case 'remove':
        inverse = { kind: 'add', path: step.path, text: state.files[step.path] };
        break;
      case 'move':
        inverse = { kind: 'move', from: step.to, to: step.from };
        break;
      case 'imports': {
        // The same imports, by their place among the ones writing the new path.
        const pre = closedImports(state.files[step.path]);
        const nextState = applyChange(state, { steps: [step], importsUpdated: [] });
        const post = closedImports(nextState.files[step.path]);
        const changes = step.changes.map((change) => {
          const alike = pre.filter((i) => i.written === change.written && i.clause === change.clause);
          const index = pre.indexOf(alike[change.nth]);
          // Only the path changed, so the import keeps its place and its clause.
          const nth = alikeBefore(post, index, change.text, change.clause);
          const of = post.filter((i) => i.written === change.text && i.clause === change.clause).length;
          return { written: change.text, text: change.written, clause: change.clause, nth, of };
        });
        inverse = { kind: 'imports', path: step.path, changes };
        break;
      }
      case 'folders':
        inverse = { kind: 'folders', before: step.after, after: step.before };
        break;
      case 'entryPoints':
        inverse = { kind: 'entryPoints', before: step.after, after: step.before };
        break;
    }
    inverses.push(inverse);
    state = applyChange(state, { steps: [step], importsUpdated: [] });
  }
  for (let i = inverses.length - 1; i >= 0; i--) out.push(inverses[i]);
  return out;
}

/**
 * Finish a plan: check the workspace it leaves against the server's rules,
 * put its folders and program list in the server's normal form, and work out
 * the Undo. A workspace that had no programs and gets one shows it (the one
 * place that rule lives: New program, an upload, a library losing `module;`).
 */
function finish(
  state: WorkspaceState,
  fileSteps: Step[],
  rawFolders: string[],
  rawEntryPoints: string[],
  extra: Omit<Change, 'steps' | 'importsUpdated'> & { importsUpdated?: string[] },
): Planned {
  const files = applyChange(state, { steps: fileSteps, importsUpdated: [] }).files;
  const normal = normalForm(files, rawFolders, rawEntryPoints);
  if (!normal.ok) return { ok: false, message: normal.message };
  const steps = [...fileSteps];
  if (!sameList(normal.folders, state.folders)) {
    steps.push({ kind: 'folders', before: state.folders, after: normal.folders });
  }
  if (!sameList(normal.entryPoints, state.entryPoints)) {
    steps.push({ kind: 'entryPoints', before: state.entryPoints, after: normal.entryPoints });
  }
  const show =
    extra.show ?? (state.entryPoints.length === 0 && normal.entryPoints.length > 0 ? normal.entryPoints[0] : undefined);
  const change: Change = { ...extra, show, steps, importsUpdated: extra.importsUpdated ?? [] };
  if (change.show === undefined) delete change.show;
  const undo: Change = { steps: invertSteps(steps, state), importsUpdated: [] };
  return { ok: true, change, undo };
}

const refuse = (message: string): Planned => ({ ok: false, message });
const nothing = (): Planned => ({
  ok: true,
  change: { steps: [], importsUpdated: [] },
  undo: { steps: [], importsUpdated: [] },
});

/**
 * The file limit, said before the change is tried. The server's own check (in
 * finish) refuses the same workspace, but counts the files it would have:
 * "this one has 21". This says what you see now.
 */
function checkFileCount(state: WorkspaceState, adding: number): string | null {
  const limit = lib().WORKSPACE_LIMITS.files;
  const count = Object.keys(state.files).length;
  return count + adding > limit ? `A workspace can hold at most ${limit} files, and this one has ${count}.` : null;
}

/**
 * New program or New module (docs/workspace-files.md "Adding files and
 * folders"). `typed` is the name field's text: `.pathogen` is added, and a
 * slash makes folders (`shapes/star` in `parts/` is `parts/shapes/star.pathogen`).
 */
export function planNewFile(
  state: WorkspaceState,
  folder: string,
  typed: string,
  kind: 'program' | 'library',
): Planned {
  const name = stripExtension(typed.trim());
  // Each name as typed first ("can't be empty"), then the file's whole, .pathogen and all (its length).
  const problem = typedNameProblem(name) ?? lib().workspaceNameProblem(`${baseOf(name)}${EXTENSION}`);
  if (problem) return refuse(problem);
  const path = join(folder, `${name}${EXTENSION}`);
  // The first name already taken on the way down, a folder or the file.
  const parts = path.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const inFolder = parts.slice(0, i - 1).join('/');
    const taken = takenIn(state, inFolder, parts[i - 1]);
    const isLast = i === parts.length;
    if (taken && (isLast || !isFolder(state, join(inFolder, parts[i - 1])))) {
      return refuse(`${where(inFolder)} already has ${taken}.`);
    }
  }
  const full = checkFileCount(state, 1);
  if (full) return refuse(full);
  const text = kind === 'library' ? NEW_LIBRARY : emptyBoilerplate;
  const entryPoints = kind === 'program' ? [...state.entryPoints, path] : state.entryPoints;
  return finish(state, [{ kind: 'add', path, text }], state.folders, entryPoints, { open: path });
}

/** New folder: kept, empty, until files go in or it's deleted. A slash makes folders inside folders. */
export function planNewFolder(state: WorkspaceState, folder: string, typed: string): Planned {
  const name = typed.trim();
  const problem = typedNameProblem(name);
  if (problem) return refuse(problem);
  const path = join(folder, name);
  if (isFolder(state, path)) return refuse(`${where(parentOf(path))} already has ${baseOf(path)}/.`);
  const parts = path.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const inFolder = parts.slice(0, i - 1).join('/');
    const taken = takenIn(state, inFolder, parts[i - 1]);
    if (taken && (i === parts.length || !isFolder(state, join(inFolder, parts[i - 1])))) {
      return refuse(`${where(inFolder)} already has ${taken}.`);
    }
  }
  return finish(state, [], [...state.folders, path], state.entryPoints, {});
}

/**
 * Moves of files and folders together: the files' new paths, the imports that
 * keep reaching them (step 1's engine, src/host/move-imports.ts), the folders
 * they leave and take, and the program list.
 */
function planMoves(
  state: WorkspaceState,
  moves: { from: string; to: string }[],
  message: (updated: string[]) => string,
): Planned {
  const projectMoves = moves.map((m) => ({ from: `/${m.from}`, to: `/${m.to}` }));
  const after = (path: string): string => lib().pathAfterMoves(`/${path}`, projectMoves).slice(1);
  const projectFiles = Object.fromEntries(Object.entries(state.files).map(([p, t]) => [`/${p}`, t]));
  const edits = lib().importEditsForMoves(projectFiles, projectMoves);

  const steps: Step[] = [];
  const importsUpdated: string[] = [];
  for (const file of edits) {
    const path = file.file.slice(1);
    const text = state.files[path];
    const imports = closedImports(text);
    const changes = file.edits.map((edit) => {
      const index = imports.findIndex((i) => i.from + 1 === edit.from);
      const { clause } = imports[index];
      const nth = alikeBefore(imports, index, edit.written, clause);
      const of = imports.filter((i) => i.written === edit.written && i.clause === clause).length;
      return { written: edit.written, text: edit.text, clause, nth, of };
    });
    steps.push({ kind: 'imports', path, changes });
    importsUpdated.push(after(path));
  }
  for (const path of Object.keys(state.files)) {
    const to = after(path);
    if (to !== path) steps.push({ kind: 'move', from: path, to });
  }
  // A folder goes with a folder move; a file's own folder stays where it was, empty if it's the last.
  const folders = [...allFolders(state)].map((f) => after(f));
  const entryPoints = state.entryPoints.map((p) => after(p));
  return finish(state, steps, folders, entryPoints, {
    message: message(importsUpdated),
    importsUpdated,
  });
}

const updatedTail = (updated: string[]): string =>
  updated.length > 0 ? `, and updated the imports in ${nameList(updated)}.` : '.';

const fileWord = (n: number): string => (n === 1 ? '1 file' : `${n} files`);

/**
 * Rename…'s line under its field (mockup v7 screen F, states 2 and 5), for a
 * planned rename: the files a folder's rename moves, and the files whose
 * imports change. Undefined when no import changes and no file moves.
 */
export function renameHint(change: Change, isFolder: boolean): string | undefined {
  const moved = change.steps.filter((s) => s.kind === 'move').length;
  const updated = change.importsUpdated.length;
  const imports = updated > 0 ? `the imports in ${fileWord(updated)}` : '';
  if (isFolder && moved > 0) {
    const files = `Moves its ${moved === 1 ? 'file' : `${moved} files`}`;
    return imports ? `${files}, and updates ${imports}` : files;
  }
  return imports ? `Updates ${imports}` : undefined;
}

/**
 * Move to…'s last line (mockup v7 screen F, state 6), for a planned move of
 * `path` into `toFolder`: the files whose imports change, a moved file's own
 * last.
 */
export function moveHint(change: Change, path: string, toFolder: string, isFolder: boolean): string {
  const dest = toFolder ? `${toFolder}/` : 'the top';
  const updated = change.importsUpdated;
  if (updated.length === 0) return `Moving it to ${dest} changes no imports.`;
  if (isFolder) return `Moving it to ${dest} updates the imports in ${nameList(updated)}.`;
  const name = baseOf(path);
  const to = join(toFolder, name);
  const others = updated.filter((p) => p !== to);
  if (others.length === 0) return `Moving it to ${dest} updates ${name}’s own imports.`;
  const own = updated.includes(to) ? `, and ${name}’s own` : '';
  return `Moving it to ${dest} updates the imports in ${nameList(others)}${own}.`;
}

/**
 * The label by the pointer while a file or folder is dragged onto `toFolder`
 * (step 6b; mockup v7 screen F, state 7): the files whose imports change,
 * counted, a moved file's own included. Move to… names them (moveHint).
 */
export function moveLabel(change: Change, toFolder: string): string {
  const dest = toFolder ? `${toFolder}/` : 'the top';
  const count = change.importsUpdated.length;
  if (count === 0) return `Move to ${dest} · no imports change`;
  return `Move to ${dest} · updates the imports in ${count} ${count === 1 ? 'file' : 'files'}`;
}

/**
 * Where Rename… puts a file or folder given the name `typed`: a file keeps its
 * extension (`.pathogen`, or a data file's own), typed or not.
 */
export function renamedPath(path: string, typed: string, folder: boolean): string {
  const trimmed = typed.trim();
  if (folder) return join(parentOf(path), trimmed);
  const extension = extensionFor(path);
  return join(parentOf(path), `${stripExtension(trimmed, extension)}${extension}`);
}

/**
 * Rename… on a file or a folder: the name only. Not the folder it's in (that's
 * Move to…), and not a file's extension, which the field doesn't hold.
 */
export function planRename(state: WorkspaceState, path: string, typed: string): Planned {
  if (path === PROJECT_FILE) return refuse("pathogen.json can't be renamed: the playground writes it.");
  const folder = isFolder(state, path);
  if (!folder && !(path in state.files)) return refuse(`${path} isn't in the workspace.`);
  const trimmed = typed.trim();
  if (trimmed.includes('/')) {
    return refuse("A name can't hold a slash. To move it to another folder, use Move to….");
  }
  const extension = folder ? '' : extensionFor(path);
  const stem = folder ? trimmed : stripExtension(trimmed, extension);
  const name = `${stem}${extension}`;
  // The name as typed first ("can't be empty"), then whole, extension and all (its length).
  const problem = lib().workspaceNameProblem(stem) ?? lib().workspaceNameProblem(name);
  if (problem) return refuse(problem);
  const to = renamedPath(path, typed, folder);
  if (to === path) return nothing();
  const taken = takenIn(state, parentOf(path), name, path);
  if (taken) return refuse(`${where(parentOf(path))} already has ${taken}.`);
  const from = shown(path, folder);
  return planMoves(
    state,
    [{ from: path, to }],
    (updated) => `Renamed ${from} to ${shown(name, folder)}${updatedTail(updated)}`,
  );
}

/** Move to… (and dragging onto a folder in the tree): a file or folder into `toFolder` ('' is the top). */
export function planMove(state: WorkspaceState, path: string, toFolder: string): Planned {
  if (path === PROJECT_FILE) return refuse("pathogen.json can't be moved: the playground writes it.");
  const folder = isFolder(state, path);
  if (!folder && !(path in state.files)) return refuse(`${path} isn't in the workspace.`);
  if (toFolder !== '' && !isFolder(state, toFolder)) return refuse(`${toFolder}/ isn't a folder in the workspace.`);
  if (folder && isUnder(toFolder, path)) return refuse(`${path}/ can't move into itself.`);
  const to = join(toFolder, baseOf(path));
  if (to === path) return nothing();
  const taken = takenIn(state, toFolder, baseOf(path));
  if (taken) return refuse(`${where(toFolder)} already has ${taken}.`);
  const subject = shown(path, folder);
  return planMoves(
    state,
    [{ from: path, to }],
    (updated) => `Moved ${subject} to ${toFolder ? `${toFolder}/` : 'the top of the workspace'}${updatedTail(updated)}`,
  );
}

/** Duplicate: a copy beside the file, numbered as Keep both does. A copy of a program goes at the end of the list. */
export function planDuplicate(state: WorkspaceState, path: string): Planned {
  if (!(path in state.files)) return refuse(`${path} isn't a file in the workspace.`);
  const full = checkFileCount(state, 1);
  if (full) return refuse(full);
  const copy = join(parentOf(path), keepBothName(state, parentOf(path), baseOf(path)));
  const text = state.files[path];
  const entryPoints = isProgram(copy, text) ? [...state.entryPoints, copy] : state.entryPoints;
  return finish(state, [{ kind: 'add', path: copy, text }], state.folders, entryPoints, {});
}

/** One file of an upload, its clash (if any) answered (step 6a). */
export interface UploadEntry {
  /** Where it goes: a workspace path. */
  path: string;
  text: string;
  /** For a name already taken (in any letter case): replace that file, or add this one beside it, numbered (Keep both). */
  whenTaken: 'replace' | 'keep-both';
}

/** The names of files, joined for a message: "a.pathogen", "a.pathogen and b.pathogen", or the count past four. */
function namesFor(paths: string[]): string {
  return paths.length > 4 ? `${paths.length} files` : nameList(paths);
}

/** What an upload's toast says: what was added, and where, and what was replaced. */
function uploadMessage(folder: string, added: string[], replaced: string[], emptyFolders: string[] = []): string {
  const inFolder = (p: string): string => (folder && p.startsWith(`${folder}/`) ? p.slice(folder.length + 1) : p);
  const where = folder ? ` to ${folder}/` : '';
  const parts: string[] = [];
  if (added.length > 0) {
    const names = added.map(inFolder);
    parts.push(
      added.length > 1 && added.length <= 4
        ? `Added ${added.length} files${where}: ${nameList(names)}`
        : `Added ${namesFor(names)}${where}`,
    );
  }
  if (emptyFolders.length > 0) {
    const names = emptyFolders.map((f) => `${inFolder(f)}/`);
    const what = emptyFolders.length === 1 ? `the empty folder ${names[0]}` : `${emptyFolders.length} empty folders`;
    parts.push(parts.length > 0 ? what : `Added ${what}${where}`);
  }
  if (replaced.length > 0) {
    parts.push(`${parts.length > 0 ? 'replaced' : 'Replaced'} ${namesFor(replaced.map(inFolder))}`);
  }
  return `${parts.join(', and ')}.`;
}

/**
 * Upload files… , Upload folder… or a drop (docs/workspace-files.md
 * "Uploading files"), planned on the workspace as it stands once the clashes
 * are answered: a name taken since is a clash, one freed since an add. A
 * Replace is a remove and an add of the same path, so the Undo puts the old
 * text back. New programs go at the end of the list in the order they came; a
 * replaced file that becomes a module or a program leaves or joins it, as
 * typing `module;` does. One file opens in a tab. More files than the limit
 * refuses the whole upload, before anything is added (docs "Limits").
 * `folder` is where they were put, for the message.
 */
export function planUpload(
  state: WorkspaceState,
  entries: readonly UploadEntry[],
  folder: string,
  emptyFolders: readonly string[] = [],
): Planned {
  // A dropped folder's empty folders go in as they are; one there already, or holding a file by now, adds nothing.
  const newFolders = emptyFolders.filter((f) => !isFolder(state, f));
  if (entries.length === 0 && newFolders.length === 0) return nothing();
  let working: WorkspaceState = state;
  const steps: Step[] = [];
  const added: string[] = [];
  const replaced: string[] = [];
  let entryPoints = state.entryPoints;
  for (const entry of entries) {
    const at = parentOf(entry.path);
    const existing = Object.keys(working.files).find((p) => p.toLowerCase() === entry.path.toLowerCase());
    if (existing !== undefined && entry.whenTaken === 'replace' && existing in state.files) {
      steps.push({ kind: 'remove', path: existing, text: working.files[existing] });
      steps.push({ kind: 'add', path: existing, text: entry.text });
      replaced.push(existing);
      if (entryPoints[0] !== existing) {
        const next = entryPointsAfterEdit({ ...working, entryPoints }, existing, entry.text);
        if (next) entryPoints = next.entryPoints;
      }
      working = { ...working, files: { ...working.files, [existing]: entry.text } };
      continue;
    }
    const path = existing === undefined ? entry.path : join(at, keepBothName(working, at, baseOf(entry.path)));
    steps.push({ kind: 'add', path, text: entry.text });
    added.push(path);
    if (isProgram(path, entry.text)) entryPoints = [...entryPoints, path];
    working = { ...working, files: { ...working.files, [path]: entry.text } };
  }
  const limit = lib().WORKSPACE_LIMITS.files;
  const count = Object.keys(state.files).length;
  if (count + added.length > limit) {
    return refuse(
      `A workspace can hold at most ${limit} files: this one has ${count}, and the upload would make ${count + added.length}.`,
    );
  }
  const all = [...added, ...replaced];
  return finish(state, steps, [...state.folders, ...newFolders], entryPoints, {
    message: uploadMessage(folder, added, replaced, newFolders),
    ...(all.length === 1 ? { open: all[0] } : {}),
  });
}

/** The files an upload's change added or replaced, in the order of its entries (one add step each). */
export function uploadedPaths(change: Change): string[] {
  return change.steps.flatMap((step) => (step.kind === 'add' ? [step.path] : []));
}

/** What Delete… asks about: the files that go, and the files left that import them. */
export function deleteSummary(state: WorkspaceState, path: string): { files: string[]; importers: string[] } {
  const folder = isFolder(state, path);
  const gone = Object.keys(state.files).filter((p) => (folder ? isUnder(p, path) : p === path));
  const goneSet = new Set(gone.map((p) => `/${p}`));
  // Only .pathogen files import: a data file (up to 5 MB) is never parsed as Pathogen here.
  const importers = Object.keys(state.files).filter(
    (p) =>
      !goneSet.has(`/${p}`) &&
      !isData(p) &&
      closedImports(state.files[p]).some((imp) => {
        const resolved = lib().resolveProjectPath(imp.written, `/${p}`);
        return resolved.ok && goneSet.has(resolved.path);
      }),
  );
  return { files: gone, importers };
}

/** Delete… on a file or a folder, after the dialog. The folder it was in stays, empty if it's the last. */
export function planDelete(state: WorkspaceState, path: string): Planned {
  if (path === PROJECT_FILE) return refuse("pathogen.json can't be deleted: the playground writes it.");
  const folder = isFolder(state, path);
  if (!folder && !(path in state.files)) return refuse(`${path} isn't in the workspace.`);
  const { files: gone } = deleteSummary(state, path);
  const steps: Step[] = gone.map((p) => ({ kind: 'remove', path: p, text: state.files[p] }));
  // Every folder but a deleted one and the ones in it. So the folder the deleted
  // file or folder was in stays, empty if it was the last (the normal form keeps
  // only the empty ones).
  const folders = [...allFolders(state)].filter((f) => !(folder && isUnder(f, path)));
  const entryPoints = state.entryPoints.filter((p) => !gone.includes(p));
  const inIt = gone.length === 0 ? '' : ` and the ${gone.length === 1 ? 'file' : `${gone.length} files`} in it`;
  const subject = folder ? `${path}/${inIt}` : path;
  let message = `Deleted ${subject}.`;
  const mainGone = state.entryPoints.length > 0 && gone.includes(state.entryPoints[0]);
  if (state.entryPoints.length > 0 && entryPoints.length === 0) {
    message = `Deleted ${subject}. ${folder ? 'It held' : 'It was'} the last program, so the preview is empty until you add one.`;
  } else if (mainGone) {
    message = `Deleted ${subject}. ${entryPoints[0]} is the main now: it was next in entryPoints.`;
  }
  return finish(state, steps, folders, entryPoints, { message });
}

/** Set as main: the program goes to the front of the list; the others keep their order. */
export function planSetMain(state: WorkspaceState, path: string): Planned {
  if (!(path in state.files)) return refuse(`${path} isn't a file in the workspace.`);
  if (isData(path)) return refuse("A data file can't be the main.");
  if (!isProgram(path, state.files[path])) return refuse("A module can't be the main.");
  if (state.entryPoints[0] === path) return nothing();
  return finish(state, [], state.folders, [path, ...state.entryPoints.filter((p) => p !== path)], {});
}

/**
 * The program list after `path`'s text becomes `text` (docs/workspace-files.md
 * "pathogen.json" and "When the main is gone or can't draw", screen E of the
 * mockups). A program that gains `module;` leaves the
 * list, and goes back at the end when it loses it. The main stays first either
 * way, and the playground shows an error on it until `module;` comes out or
 * another program is set as main. Null when the list doesn't change. Call it
 * after each edit to a file of the workspace (the editor's); a data file's
 * edits never change the list.
 */
export function entryPointsAfterEdit(
  state: WorkspaceState,
  path: string,
  text: string,
): { entryPoints: string[]; show?: string } | null {
  if (state.entryPoints[0] === path) return null;
  if (isData(path)) return null;
  const listed = state.entryPoints.includes(path);
  const library = !isProgram(path, text);
  if (library && listed) return { entryPoints: state.entryPoints.filter((p) => p !== path) };
  if (!library && !listed) {
    const entryPoints = [...state.entryPoints, path];
    return state.entryPoints.length === 0 ? { entryPoints, show: path } : { entryPoints };
  }
  return null;
}

/** pathogen.json's text, as the tree's read-only file shows it and export writes it. */
export function projectFileText(entryPoints: readonly string[]): string {
  return lib().workspaceProjectFileText(entryPoints);
}
