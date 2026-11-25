// A new workspace from a project folder or a .zip (phase 2g, note 70;
// docs/workspace-files.md "A workspace from a project"; notes 68 and 69).
//
// Picking turns what was chosen or dropped into a ProjectPick: the project's
// files with paths from its top. A .zip whose entries sit in one folder, as
// Download workspace makes it, is read from inside that folder; macOS's
// __MACOSX folder and names that start with a dot are dropped first.
//
// Planning reads the pick the way the approved docs describe, and gives what
// POST /workspace takes (files, empty folders, entryPoints) or why nothing is
// added:
// - It stops when the project's pathogen.json can't be read at all (the
//   checks every tool makes, parseProjectFile), with the CLI's message, and
//   when more than 20 .pathogen files are left after what's left out.
// - It goes on when only the list's use-time checks fail: an entry naming a
//   missing file, a module or a file left out is dropped, and the page says so.
// - What's left out, and why, is what an upload leaves out (uploads.ts).
// - Names are made to fit the name rules as an upload's are, but unlike an
//   upload, the imports and entryPoints that name them follow, and two names
//   the same once fitted (or differing only in letter case) give the second,
//   in order of their paths, a number, as Keep both does.
// The server refuses a bad manifest rather than dropping an entry, so the
// plan's lists are complete and clean (checkManifest accepts every plan).

import { readZip, ZipError } from './zip.js';
import {
  canHold,
  fittedName,
  kindReason,
  MAX_PICKED,
  overLimit,
  pickedFromDrop,
  pickedFromInput,
  textOf,
  tooLargeReason,
  withoutName,
} from './uploads.js';

import type { ZipEntry } from './zip.js';
import type { CapturedDrop, DroppedEntry, LeftOut, PickedFile, Renamed } from './uploads.js';

type Lib = Window['PathogenLang'];

function lib(): Lib {
  const l = (window as { PathogenLang?: Lib }).PathogenLang;
  if (!l) throw new Error('The Pathogen library is not loaded, so a project cannot be imported.');
  return l;
}

/** A file of the project, with the reason it can't be read when the .zip says so (encrypted, an unknown compression). */
export interface ProjectFilePicked extends PickedFile {
  problem?: string | null;
}

/** What was picked, with every path from the project's top. */
export interface ProjectPick {
  kind: 'folder' | 'zip';
  /** The folder's name, or the .zip's file name: "gears", "gears.zip". */
  picked: string;
  files: ProjectFilePicked[];
  /** Folders with nothing in them (a .zip's, or a dropped folder's). */
  emptyFolders: string[];
  /** A folder held more files than are read (MAX_PICKED). */
  truncated: boolean;
}

/** Why nothing could be picked: shown in place of the card. */
export interface PickRefusal {
  ok: false;
  message: string;
}

/** An entryPoints entry the workspace can't use, taken out of the list. */
export interface DroppedListEntry {
  /** As pathogen.json writes it. */
  written: string;
  why: 'missing' | 'module' | 'left-out';
}

interface Summary {
  /** The card's title: "gears/" for a folder, "gears.zip" for a .zip. */
  title: string;
  /** The name field's value: the folder's name, or the .zip's without ".zip". */
  name: string;
  /** "5 files in 2 folders". */
  what: string;
}

/** What comes in: everything POST /workspace takes, and what the card shows. */
export interface ImportPlan extends Summary {
  ok: true;
  files: Record<string, { text: string }>;
  /** The folders with nothing in them. */
  folders: string[];
  /** Every program, the main first. */
  entryPoints: string[];
  modules: string[];
  /** The data files (phase 3a): listed after the modules. */
  dataFiles: string[];
  /** Where the program list came from: the project's pathogen.json, none, or one whose list held nothing usable. */
  list: 'listed' | 'none' | 'unusable';
  /** With a list: the programs it doesn't name, which join the end. */
  unlisted: string[];
  /** The pathogen.json the workspace writes, shown when the project has none. */
  generated: string | null;
  /** Each name changed to fit the name rules, or numbered: as picked, and where it goes. */
  renamed: Renamed[];
  /** Each file left out, and why: the page's "Not added" list. */
  leftOut: LeftOut[];
  dropped: DroppedListEntry[];
}

/** Why nothing was added. */
export interface ImportRefusal extends Summary {
  ok: false;
  message: string;
  /** The CLI's message about the project's pathogen.json, shown below `message`. */
  said: string | null;
  leftOut: LeftOut[];
}

const DROP_ONE = 'Drop one project folder, or one .zip.';
const NOTHING = 'There’s no file here that a workspace can take, so nothing was added.';
const PROJECT_FILE = 'pathogen.json';
const MAIN = 'main.pathogen';
const MACOS_FOLDER = '__MACOSX';

const join = (folder: string, name: string): string => (folder ? `${folder}/${name}` : name);
/** Order of their paths: plain code-unit order, the same on every computer. */
const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const segmentsOf = (path: string): string[] => path.split('/').filter((s) => s !== '');
/** Left out without a word: names that start with a dot (`.git/`, `.DS_Store`, a `..` climb) and macOS's __MACOSX. */
const silent = (segments: readonly string[]): boolean =>
  segments.length === 0 || segments[0] === MACOS_FOLDER || segments.some((s) => s.startsWith('.'));
const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const whatOf = (files: number, folders: number, one = 'file', many = 'files'): string =>
  folders > 0 ? `${count(files, one, many)} in ${count(folders, 'folder', 'folders')}` : count(files, one, many);

/** The folders a set of file paths and empty folders make, each counted once. */
function folderCount(files: readonly string[], empty: readonly string[]): number {
  const all = new Set<string>();
  const add = (folderSegments: readonly string[]): void => {
    for (let i = 1; i <= folderSegments.length; i++) all.add(folderSegments.slice(0, i).join('/'));
  };
  for (const path of files) add(segmentsOf(path).slice(0, -1));
  for (const folder of empty) add(segmentsOf(folder));
  return all.size;
}

/**
 * The sentence the page shows for an entry taken out of the list. `code`
 * marks the file names (the page sets them in code type; plain text keeps them as they are).
 */
export function droppedSentence(entry: DroppedListEntry, code: (name: string) => string = (name) => name): string {
  const which =
    entry.why === 'missing'
      ? 'which isn’t in the project'
      : entry.why === 'module'
        ? 'which is a module'
        : 'which isn’t added';
  return `${code(PROJECT_FILE)} lists ${code(entry.written)}, ${which}, so the program list leaves it out.`;
}

/** A free name beside the ones taken, numbered as Keep both does: `gears.pathogen` → `gears-2.pathogen`; a folder `parts` → `parts-2`. */
function numbered(name: string, isFile: boolean, taken: (name: string) => boolean): string {
  const dot = isFile ? name.lastIndexOf('.') : -1;
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken(candidate)) return candidate;
  }
}

// ---------- picking ----------

/** Choose folder…: the browser gives each file's path from the picked folder (`gears/main.pathogen`). */
export function pickFromFolderInput(files: ArrayLike<File>): ProjectPick | PickRefusal {
  const { picked, truncated } = pickedFromInput(files);
  if (picked.length === 0) return { ok: false, message: NOTHING };
  const top = picked[0].path.split('/')[0];
  const inside = (path: string): string => (path.startsWith(`${top}/`) ? path.slice(top.length + 1) : path);
  return {
    kind: 'folder',
    picked: top,
    files: picked.map((file) => ({ ...file, path: inside(file.path) })),
    emptyFolders: [],
    truncated,
  };
}

/**
 * A drop on the import's drop area: one folder, or one .zip. `drop` is what
 * captureDrop took while the drop event lasted.
 */
export async function pickFromDrop(drop: CapturedDrop): Promise<ProjectPick | PickRefusal> {
  if (Math.max(drop.entries.length, drop.files.length) !== 1) return { ok: false, message: DROP_ONE };
  const entry: DroppedEntry | null = drop.entries[0] ?? null;
  if (entry?.isDirectory) {
    const top = entry.name;
    const { picked, folders, truncated } = await pickedFromDrop({ entries: [entry], files: [null] });
    const inside = (path: string): string => (path.startsWith(`${top}/`) ? path.slice(top.length + 1) : path);
    return {
      kind: 'folder',
      picked: top,
      files: picked.map((file) => ({ ...file, path: inside(file.path) })),
      emptyFolders: folders.filter((f) => f !== top).map(inside),
      truncated,
    };
  }
  let file: File | null = drop.files[0] ?? null;
  if (!file && entry?.isFile && entry.file) {
    const fileOf = entry.file;
    file = await new Promise<File | null>((resolve) => fileOf(resolve, () => resolve(null)));
  }
  if (file && /\.zip$/i.test(file.name)) return pickFromZip(file);
  return { ok: false, message: DROP_ONE };
}

/** Choose .zip…, or a dropped .zip. Reads only its directory here; each file is read when the plan needs it. */
export async function pickFromZip(file: Blob & { name: string }): Promise<ProjectPick | PickRefusal> {
  let entries: ZipEntry[];
  try {
    entries = await readZip(file);
  } catch (err) {
    const why = err instanceof ZipError ? err.message : 'it couldn’t be read.';
    return { ok: false, message: `This .zip can’t be read, so nothing was added: ${why}` };
  }
  const usable = entries.filter((e) => !silent(segmentsOf(e.path)));
  // All in one folder, as Download workspace makes it: read from inside that folder.
  const tops = new Set(usable.map((e) => segmentsOf(e.path)[0]));
  let prefix = '';
  if (tops.size === 1) {
    const [top] = tops;
    if (!usable.some((e) => !e.folder && segmentsOf(e.path).length === 1)) prefix = `${top}/`;
  }
  const inner = usable
    .map((e) => ({ ...e, path: segmentsOf(e.path).join('/') }))
    .filter((e) => prefix === '' || e.path.startsWith(prefix))
    .map((e) => ({ ...e, path: e.path.slice(prefix.length) }))
    .filter((e) => e.path !== '');
  const folders = inner.filter((e) => e.folder).map((e) => e.path);
  return {
    kind: 'zip',
    picked: file.name,
    files: inner
      .filter((e) => !e.folder)
      .map((e) => ({ path: e.path, size: e.size, read: e.read, problem: e.problem })),
    emptyFolders: [...new Set(folders)].filter((f) => !inner.some((o) => o.path.startsWith(`${f}/`))),
    truncated: false,
  };
}

// ---------- planning ----------

interface Kept {
  /** Its path as picked, from the project's top. */
  picked: string;
  /** Where it goes in the workspace. */
  path: string;
  text: string;
}

/**
 * What a new workspace made from `pick` holds, or why nothing is added. Reads
 * the project's pathogen.json and its .pathogen files (no more than the limit
 * allows); nothing else is read.
 */
export async function planImport(pick: ProjectPick): Promise<ImportPlan | ImportRefusal> {
  const l = lib();
  const limits = l.WORKSPACE_LIMITS;
  const isZip = pick.kind === 'zip';
  const label = pick.picked;
  const title = isZip ? label : `${label}/`;
  const name = isZip ? label.replace(/\.zip$/i, '') : label;
  const leftOut: LeftOut[] = [];
  const allPicked = new Set<string>();

  // 1. What can come in, by kind and size, before reading anything.
  let projectFile: ProjectFilePicked | null = null;
  const candidates: { picked: string; file: ProjectFilePicked }[] = [];
  // A .zip can hold the same path twice: the last copy comes in, as unzip takes it, and the page says so.
  const byPicked = new Map<string, ProjectFilePicked>();
  for (const file of pick.files) {
    const path = segmentsOf(file.path).join('/');
    if (byPicked.has(path) && !silent(segmentsOf(path))) {
      leftOut.push({ name: path, reason: 'is in the project twice: the last copy comes in.' });
    }
    byPicked.set(path, file);
  }
  const files = [...byPicked.values()].sort((a, b) => byPath(a.path, b.path));
  for (const file of files) {
    const segments = segmentsOf(file.path);
    const path = segments.join('/');
    if (path !== '') allPicked.add(path.toLowerCase());
    if (silent(segments)) continue;
    const fileName = segments[segments.length - 1];
    if (segments.length === 1 && fileName.toLowerCase() === PROJECT_FILE) {
      projectFile = file;
      continue;
    }
    if (!canHold(fileName)) {
      leftOut.push({ name: path, reason: kindReason(fileName, segments.slice(0, -1).join('/')) });
      continue;
    }
    if (file.problem) {
      leftOut.push({ name: path, reason: file.problem });
      continue;
    }
    if (overLimit(fileName, file.size)) {
      leftOut.push({ name: path, reason: tooLargeReason(fileName, file.size) });
      continue;
    }
    candidates.push({ picked: path, file });
  }
  const emptyFolders = pick.emptyFolders
    .map((f) => segmentsOf(f))
    .filter((segments) => !silent(segments))
    .map((segments) => segments.join('/'));
  const summary = (): Summary => ({
    title,
    name,
    what: whatOf(
      candidates.length,
      folderCount(
        candidates.map((c) => c.picked),
        emptyFolders,
      ),
    ),
  });
  const sortedLeftOut = (): LeftOut[] => {
    const lines = [...leftOut].sort((a, b) => byPath(a.name, b.name));
    return pick.truncated
      ? [{ name: 'The folder', reason: `holds more than ${MAX_PICKED} files: only the first were read.` }, ...lines]
      : lines;
  };
  const refuse = (message: string, said: string | null = null, what?: string): ImportRefusal => ({
    ok: false,
    ...summary(),
    ...(what !== undefined ? { what } : {}),
    message,
    said,
    leftOut: sortedLeftOut(),
  });

  // 2. The project's pathogen.json: when it can't be read, nothing is added.
  let entries: { written: string; path: string }[] | undefined;
  if (projectFile) {
    const malformed = (said: string): ImportRefusal =>
      refuse(
        `This project’s ${PROJECT_FILE} can’t be read, so nothing was added. Fix the file, then choose the ${isZip ? '.zip' : 'folder'} again:`,
        said,
      );
    const prefix = `${PROJECT_FILE} (${label})`;
    if (projectFile.problem) return malformed(`${prefix} ${projectFile.problem}`);
    if (projectFile.size > limits.fileBytes.pathogen) {
      return malformed(`${prefix} is larger than ${limits.fileBytes.pathogen / (1024 * 1024)} MB.`);
    }
    let read: ReturnType<typeof textOf>;
    try {
      read = textOf(await projectFile.read());
    } catch (err) {
      return malformed(`${prefix} ${err instanceof ZipError ? err.message : 'couldn’t be read.'}`);
    }
    if ('problem' in read) return malformed(`${prefix} isn't text.`);
    const parsed = l.parseProjectFile(read.text, label);
    if (!parsed.ok) return malformed(parsed.message);
    entries = parsed.project.entryPoints;
  }

  // 3. The limits, counted before any file is read, as an upload counts:
  //    20 files and 50 MB, .pathogen and data files together, not counting what's left out.
  //    A file found not to be UTF-8 text only when it's read (step 4) has counted.
  const counted = (): string =>
    whatOf(
      candidates.length,
      folderCount(
        candidates.map((c) => c.picked),
        [],
      ),
    );
  if (candidates.length > limits.files) {
    return refuse(
      `A workspace can hold at most ${limits.files} files, and this project has ${candidates.length}. Nothing was added. To bring part of it in, import a folder holding fewer files.`,
      null,
      counted(),
    );
  }
  const bytes = candidates.reduce((sum, c) => sum + c.file.size, 0);
  if (bytes > limits.workspaceBytes) {
    return refuse(
      `A workspace can hold at most ${l.megabytes(limits.workspaceBytes)}, and this project’s files are ${l.megabytes(bytes)}. Nothing was added. To bring part of it in, import a folder holding less.`,
      null,
      counted(),
    );
  }

  // 4. Read each file's text: a .pathogen file's or a data file's.
  const texts = new Map<string, string>();
  for (const candidate of candidates) {
    let read: ReturnType<typeof textOf>;
    try {
      read = textOf(await candidate.file.read(), candidate.picked);
    } catch (err) {
      read = { problem: err instanceof ZipError ? err.message : 'couldn’t be read.' };
    }
    if ('problem' in read) leftOut.push({ name: candidate.picked, reason: read.problem });
    else texts.set(candidate.picked, read.text);
  }
  if (texts.size === 0) return refuse(NOTHING);

  // 5. Names made to fit, in order of their paths; the second of two the same gets a number.
  const takenIn = new Map<string, Set<string>>();
  const claim = (folder: string, wanted: string, isFile: boolean): string => {
    let taken = takenIn.get(folder);
    if (!taken) takenIn.set(folder, (taken = new Set()));
    const names = taken;
    const chosen = names.has(wanted.toLowerCase())
      ? numbered(wanted, isFile, (n) => names.has(n.toLowerCase()))
      : wanted;
    names.add(chosen.toLowerCase());
    return chosen;
  };
  const folderTo = new Map<string, string>([['', '']]);
  const placeFolder = (segments: readonly string[]): string => {
    let picked = '';
    let at = '';
    for (const segment of segments) {
      const next = join(picked, segment);
      let to = folderTo.get(next);
      if (to === undefined) {
        to = join(at, claim(at, fittedName(segment, false), false));
        folderTo.set(next, to);
      }
      picked = next;
      at = to;
    }
    return at;
  };
  const items = [
    ...[...texts.keys()].map((path) => ({ path, folder: false })),
    ...emptyFolders.map((path) => ({ path, folder: true })),
  ].sort((a, b) => byPath(a.path, b.path));
  const kept: Kept[] = [];
  const keptFolders: string[] = [];
  const renamed: Renamed[] = [];
  for (const item of items) {
    const segments = segmentsOf(item.path);
    if (item.folder) {
      const to = placeFolder(segments);
      const problem = l.workspacePathProblem(to, 'folder');
      if (problem) {
        leftOut.push({ name: `${item.path}/`, reason: withoutName(problem) });
        continue;
      }
      if (!keptFolders.includes(to)) keptFolders.push(to);
      if (to !== item.path) renamed.push({ from: `${item.path}/`, to: `${to}/` });
      continue;
    }
    const folder = placeFolder(segments.slice(0, -1));
    const to = join(folder, claim(folder, fittedName(segments[segments.length - 1], true), true));
    const problem = l.workspacePathProblem(to, 'file');
    if (problem) {
      leftOut.push({ name: item.path, reason: withoutName(problem) });
      continue;
    }
    kept.push({ picked: item.path, path: to, text: texts.get(item.path)! });
    if (to !== item.path) renamed.push({ from: item.path, to });
  }
  if (kept.length === 0) return refuse(NOTHING);

  // 6. The imports that name a renamed file follow it, and a moved file's own relative imports still reach theirs.
  const moves = kept.filter((k) => k.path !== k.picked).map((k) => ({ from: `/${k.picked}`, to: `/${k.path}` }));
  if (moves.length > 0) {
    const sources = new Map(kept.map((k) => [`/${k.picked}`, k.text]));
    const byPicked = new Map(kept.map((k) => [`/${k.picked}`, k]));
    for (const { file, edits } of l.importEditsForMoves(sources, moves)) {
      const k = byPicked.get(file)!;
      k.text = l.applyImportEdits(k.text, edits);
    }
  }

  // 7. Programs, modules and data files; the program list from pathogen.json, or as without one.
  //    A data file is never a program, and never read as Pathogen.
  const isData = (path: string): boolean => l.workspaceFileKind(path) === 'data';
  const isModule = new Map(kept.map((k) => [k.path, !isData(k.path) && l.isModuleSource(k.text)]));
  const programs = kept
    .filter((k) => !isData(k.path) && !isModule.get(k.path))
    .map((k) => k.path)
    .sort(byPath);
  const modules = kept
    .filter((k) => isModule.get(k.path))
    .map((k) => k.path)
    .sort(byPath);
  const dataFiles = kept
    .filter((k) => isData(k.path))
    .map((k) => k.path)
    .sort(byPath);
  const exact = new Map(kept.map((k) => [k.picked, k]));
  const anyCase = new Map<string, Kept>();
  for (const k of kept) if (!anyCase.has(k.picked.toLowerCase())) anyCase.set(k.picked.toLowerCase(), k);
  const listed: string[] = [];
  const dropped: DroppedListEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries ?? []) {
    const path = entry.path.slice(1);
    if (seen.has(path)) continue;
    seen.add(path);
    const k = exact.get(path) ?? anyCase.get(path.toLowerCase());
    if (!k) {
      dropped.push({ written: entry.written, why: allPicked.has(path.toLowerCase()) ? 'left-out' : 'missing' });
      continue;
    }
    if (isModule.get(k.path)) {
      dropped.push({ written: entry.written, why: 'module' });
      continue;
    }
    if (!listed.includes(k.path)) listed.push(k.path);
  }
  const list: ImportPlan['list'] = entries === undefined ? 'none' : listed.length > 0 ? 'listed' : 'unusable';
  const entryPoints =
    listed.length > 0
      ? [...listed, ...programs.filter((p) => !listed.includes(p))]
      : [...programs.filter((p) => p === MAIN), ...programs.filter((p) => p !== MAIN)];

  return {
    ok: true,
    title,
    name,
    what: whatOf(
      kept.length,
      folderCount(
        kept.map((k) => k.path),
        keptFolders,
      ),
    ),
    files: Object.fromEntries(kept.map((k) => [k.path, { text: k.text }])),
    folders: keptFolders,
    entryPoints,
    modules,
    dataFiles,
    list,
    unlisted: list === 'listed' ? programs.filter((p) => !listed.includes(p)) : [],
    generated: list === 'none' ? l.workspaceProjectFileText(entryPoints) : null,
    renamed,
    leftOut: sortedLeftOut(),
    dropped,
  };
}
