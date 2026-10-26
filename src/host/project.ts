/**
 * pathogen.json — the file that marks a project folder (docs/projects.md).
 * v1 knows one optional key, `main`. Unknown keys are errors so a typo such as
 * "mian" is caught instead of ignored. Finding the file on disk is a host's
 * job (src/node/); this module only validates its contents.
 */
import { resolveProjectPath } from './paths';

export const PROJECT_FILE_NAME = 'pathogen.json';

export interface ProjectFile {
  /** Project path of the program `pathogen-lang <folder>` compiles. */
  main?: string;
}

export type ParsedProjectFile = { ok: true; project: ProjectFile } | { ok: false; message: string };

const KNOWN_KEYS = ['main'] as const;
/** Keys accepted and ignored, so editor tooling (a JSON-schema hint) doesn't fail the file. */
const IGNORED_KEYS = ['$schema'] as const;

/**
 * Validate the text of a pathogen.json. `folderLabel` names the folder in
 * messages (an OS path on disk, a workspace name in the playground).
 */
export function parseProjectFile(text: string, folderLabel: string): ParsedProjectFile {
  const prefix = `${PROJECT_FILE_NAME} (${folderLabel})`;
  let data: unknown;
  try {
    // Older Windows editors start a UTF-8 file with a byte-order mark (U+FEFF).
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (err) {
    return { ok: false, message: `${prefix} is not valid JSON: ${(err as Error).message}` };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      ok: false,
      message: `${prefix} must contain a JSON object, such as {} or { "main": "main.pathogen" }.`,
    };
  }
  for (const key of Object.keys(data)) {
    if ((IGNORED_KEYS as readonly string[]).includes(key)) continue;
    if (!(KNOWN_KEYS as readonly string[]).includes(key)) {
      return { ok: false, message: `${prefix} has an unknown key "${key}". Known keys: ${KNOWN_KEYS.join(', ')}.` };
    }
  }

  const project: ProjectFile = {};
  if ('main' in data) {
    const main = resolveMain(data.main);
    if (main === null) {
      return {
        ok: false,
        message: `${prefix}: "main" must be a path inside the project folder, written with forward slashes, such as "main.pathogen".`,
      };
    }
    project.main = main;
  }
  return { ok: true, project };
}

/** `main` is relative to the folder holding pathogen.json — the project root. */
function resolveMain(value: unknown): string | null {
  if (typeof value !== 'string' || value === '' || value.includes('\\') || /^[A-Za-z]:/.test(value)) return null;
  const written = value.startsWith('./') || value.startsWith('../') || value.startsWith('/') ? value : `./${value}`;
  const resolved = resolveProjectPath(written, `/${PROJECT_FILE_NAME}`);
  return resolved.ok && resolved.path !== '/' ? resolved.path : null;
}
