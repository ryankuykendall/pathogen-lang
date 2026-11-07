/**
 * pathogen.json — the file that marks a project folder (docs/projects.md).
 * Its one key, `entryPoints`, lists the project's programs in order, the main
 * first; without it the main is main.pathogen. Unknown keys are errors, so a
 * typo such as "entrypoints" is caught instead of ignored. Finding the file on
 * disk is a host's job (src/node/); this module only checks its contents.
 *
 * The checks come in two kinds (docs/projects.md "entryPoints is checked in
 * two ways"). `parseProjectFile` checks the shape, whenever any tool reads the
 * file. `projectMain` checks the list's other rules, only where the list is
 * used (today the CLI's folder compile), so a mistake there never stops a file
 * compiled by name.
 */
import { resolveProjectPath } from './paths';

export const PROJECT_FILE_NAME = 'pathogen.json';

/** The main by convention, when pathogen.json has no `entryPoints`. */
export const CONVENTIONAL_MAIN = '/main.pathogen';

export interface ProjectEntry {
  /** As written in pathogen.json, for messages. */
  written: string;
  /** Its project path: "/main.pathogen". */
  path: string;
}

export interface ProjectFile {
  /** `entryPoints` in order; absent when the file has no such key. */
  entryPoints?: ProjectEntry[];
}

export type ParsedProjectFile = { ok: true; project: ProjectFile } | { ok: false; message: string };

const KNOWN_KEYS = ['entryPoints'] as const;
/** Keys accepted and ignored, so editor tooling (a JSON-schema hint) doesn't fail the file. */
const IGNORED_KEYS = ['$schema'] as const;
const EXTENSION = '.pathogen';

/**
 * Check the shape of a pathogen.json. `folderLabel` names the folder in
 * messages (an OS path on disk, a workspace name in the playground).
 */
export function parseProjectFile(text: string, folderLabel: string): ParsedProjectFile {
  const prefix = `${PROJECT_FILE_NAME} (${folderLabel})`;
  const fail = (message: string): ParsedProjectFile => ({ ok: false, message });
  let data: unknown;
  try {
    // Older Windows editors start a UTF-8 file with a byte-order mark (U+FEFF).
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (err) {
    return fail(`${prefix} is not valid JSON: ${(err as Error).message}`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return fail(`${prefix} must contain a JSON object, such as {} or { "entryPoints": ["main.pathogen"] }.`);
  }
  const record = data as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if ((IGNORED_KEYS as readonly string[]).includes(key) || (KNOWN_KEYS as readonly string[]).includes(key)) continue;
    // `main` was this file's key until November 2026 (never in an npm release).
    if (key === 'main') {
      return fail(
        'entryPoints' in record
          ? `${prefix}: "main" is no longer a key; remove it. The first entry in "entryPoints" is the main.`
          : `${prefix}: "main" is now "entryPoints", a list whose first entry is the main. Replace it with "entryPoints": [${asListItem(record.main)}].`,
      );
    }
    const meant = KNOWN_KEYS.find((known) => known.toLowerCase() === key.toLowerCase());
    if (meant) return fail(`${prefix} has an unknown key "${key}". Did you mean "${meant}"?`);
    return fail(`${prefix} has an unknown key "${key}". Known keys: ${KNOWN_KEYS.join(', ')}.`);
  }

  const project: ProjectFile = {};
  if ('entryPoints' in record) {
    const list = record.entryPoints;
    if (!Array.isArray(list)) {
      return fail(`${prefix}: "entryPoints" must be a list of paths, such as [${asListItem(list)}].`);
    }
    const entries: ProjectEntry[] = [];
    for (const [index, value] of list.entries()) {
      const path = typeof value === 'string' ? resolveEntry(value) : null;
      const shown = `"entryPoints" entry ${index + 1}, ${JSON.stringify(value)},`;
      if (path === null) {
        return fail(
          `${prefix}: ${shown} must be a path inside the project folder, written with forward slashes, such as "main.pathogen".`,
        );
      }
      if (!path.endsWith(EXTENSION)) {
        const written = value as string;
        // `Poster.PATHOGEN` names another file (paths are case-sensitive); suggest the extension's spelling.
        const fixed = written.toLowerCase().endsWith(EXTENSION)
          ? `${written.slice(0, -EXTENSION.length)}${EXTENSION}`
          : `${written}${EXTENSION}`;
        return fail(`${prefix}: ${shown} has no .pathogen extension. Write the file's full name: "${fixed}".`);
      }
      entries.push({ written: value as string, path });
    }
    project.entryPoints = entries;
  }
  return { ok: true, project };
}

export type ProjectMain = { ok: true; path: string; listed: boolean } | { ok: false; message: string };

/**
 * The project's main: the first entry in `entryPoints`, or main.pathogen when
 * there's no list (`listed` says which). Checks the rules that apply where the
 * list is used: it can't be empty or name a file twice. Whether the main
 * exists, with its letter case, and is a program is for the caller to check
 * against the files, with the messages below.
 */
export function projectMain(project: ProjectFile, folderLabel: string): ProjectMain {
  const prefix = `${PROJECT_FILE_NAME} (${folderLabel})`;
  const entries = project.entryPoints;
  if (entries === undefined) return { ok: true, path: CONVENTIONAL_MAIN, listed: false };
  if (entries.length === 0) {
    return {
      ok: false,
      message: `${prefix}: "entryPoints" is empty. List at least one program, or leave the key out to use main.pathogen.`,
    };
  }
  const firstAt = new Map<string, number>();
  for (const [index, entry] of entries.entries()) {
    const earlier = firstAt.get(entry.path);
    if (earlier !== undefined) {
      return {
        ok: false,
        message: `${prefix}: "entryPoints" lists the same file twice: entry ${earlier + 1}, "${entries[earlier].written}", and entry ${index + 1}, "${entry.written}".`,
      };
    }
    firstAt.set(entry.path, index);
  }
  return { ok: true, path: entries[0].path, listed: true };
}

// --- The messages a folder compile gives about its main (docs/projects.md Errors) ---
// `folder` is the folder as the user named it; `main` is the main's project path
// without its leading slash ("src/poster.pathogen").

/** The main doesn't exist; `osPath` is where it was looked for. */
export function mainMissingMessage(folder: string, main: string, listed: boolean, osPath: string): string {
  const where = `The main of ${folder}, ${main}, doesn't exist (looked for ${osPath}).`;
  return listed
    ? `${where} pathogen.json lists it first in "entryPoints": add the file, or put another program first.`
    : `${where} Add it, list your program in pathogen.json ("entryPoints": ["your-program.pathogen"]), or compile a file directly.`;
}

/** The main differs from the file on disk only in letter case; `actual` is the disk's spelling. */
export function mainCaseMessage(folder: string, main: string, actual: string): string {
  return `The main of ${folder}, ${main}, differs from the file on disk only in letter case: ${actual}. Paths are case-sensitive on every system.`;
}

/** The main starts with `module;`, so it doesn't draw. */
export function mainIsModuleMessage(folder: string, main: string, listed: boolean): string {
  const what = `The main of ${folder}, ${main}, is a module (it starts with module;), and a module doesn't draw.`;
  return listed
    ? `${what} Take out module;, or put a program first in pathogen.json's "entryPoints".`
    : `${what} Take out module;, list a program in pathogen.json ("entryPoints": ["your-program.pathogen"]), or compile a file directly.`;
}

/** The main is reached through a symbolic link that leads outside the project folder. */
export function mainLeavesMessage(folder: string, main: string, root: string): string {
  return `The main of ${folder}, ${main}, leaves the project folder (${root}) through a symbolic link. Move the file into the project folder.`;
}

/**
 * An entry is relative to the folder holding pathogen.json, the project root:
 * null when it isn't a path inside it, or is written as a folder (`dir/`).
 */
function resolveEntry(value: string): string | null {
  if (value === '' || value.endsWith('/') || value.includes('\\') || /^[A-Za-z]:/.test(value)) return null;
  const written = value.startsWith('./') || value.startsWith('../') || value.startsWith('/') ? value : `./${value}`;
  const resolved = resolveProjectPath(written, `/${PROJECT_FILE_NAME}`);
  return resolved.ok && resolved.path !== '/' ? resolved.path : null;
}

/** A value shown as the first item of a suggested list: itself when it would pass as an entry, else main.pathogen. */
function asListItem(value: unknown): string {
  return typeof value === 'string' && resolveEntry(value)?.endsWith(EXTENSION)
    ? JSON.stringify(value)
    : '"main.pathogen"';
}
