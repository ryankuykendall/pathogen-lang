/**
 * The path rule every host shares (docs/projects.md § Writing paths).
 *
 * A *project path* is a POSIX string rooted at the project folder: `/` is the
 * project folder itself, `/fonts/a.ttf` a file inside it. Hosts map project
 * paths to their own storage (an OS path, a workspace file); nothing here
 * touches a file system, so the same rule runs in Node, a Worker and a webview.
 */

/** CSS generic families — names of font *categories*, not fonts. */
export const GENERIC_FONT_FAMILIES: ReadonlySet<string> = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

export type FontSourceKind =
  { kind: 'file'; path: string } | { kind: 'family'; family: string } | { kind: 'invalid'; message: string };

const FONT_FILE_EXTENSION = /\.(ttf|otf|woff2?)$/i;
const DRIVE_PATH = /^[A-Za-z]:[\\/]/;
const WEB_ADDRESS = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Decide what an `@font` source is: a file path (`./`, `../`, `/`), a font
 * family name, or a mistake with a message that says how to fix it.
 */
export function classifyFontSource(source: string): FontSourceKind {
  if (WEB_ADDRESS.test(source)) {
    return {
      kind: 'invalid',
      message: `@font "${source}" is a web address. @font takes a font family name or a file path inside the project folder.`,
    };
  }
  if (DRIVE_PATH.test(source) || source.startsWith('~')) {
    return {
      kind: 'invalid',
      message: `@font path "${source}" is a path on your computer. Write paths relative to the file (./ or ../) or the project folder (/).`,
    };
  }
  if (source.includes('\\')) {
    return {
      kind: 'invalid',
      message: `@font path "${source}" uses a backslash. Write paths with forward slashes on every system: "${asWrittenPath(source.replace(/\\/g, '/'))}".`,
    };
  }
  if (source.startsWith('./') || source.startsWith('../') || source.startsWith('/')) {
    return { kind: 'file', path: source };
  }
  if (source.includes('/') || FONT_FILE_EXTENSION.test(source)) {
    return {
      kind: 'invalid',
      message: `@font "${source}" looks like a file name but isn't a path. File paths start with ./, ../ or / — did you mean "${asWrittenPath(source)}"?`,
    };
  }
  if (GENERIC_FONT_FAMILIES.has(source.toLowerCase())) {
    return {
      kind: 'invalid',
      message: `@font "${source}": ${source} is a CSS generic family, not a font. Name a font family instead, such as @font "Noto Serif";`,
    };
  }
  return { kind: 'family', family: source };
}

/** Prefix `./` unless the path already starts like a written path. */
function asWrittenPath(path: string): string {
  return path.startsWith('./') || path.startsWith('../') || path.startsWith('/') ? path : `./${path}`;
}

/** The folder part of a project path: `/parts/rack.pathogen` → `/parts`. */
export function projectDirname(projectPath: string): string {
  const cut = projectPath.lastIndexOf('/');
  return cut <= 0 ? '/' : projectPath.slice(0, cut);
}

export type ResolvedProjectPath = { ok: true; path: string } | { ok: false; error: 'escapes-root' };

/**
 * Resolve a written path (`./…`, `../…`, `/…`) against the project path of
 * the file it is written in. A `..` that would climb above the project folder
 * is an error — even when the rest of the path would come back inside.
 */
export function resolveProjectPath(written: string, fromFile: string): ResolvedProjectPath {
  const base = written.startsWith('/') ? [] : projectDirname(fromFile).split('/').filter(Boolean);
  const segments = [...base];
  for (const part of written.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segments.length === 0) return { ok: false, error: 'escapes-root' };
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return { ok: true, path: `/${segments.join('/')}` };
}

/** The file name without its extension: `/fonts/Baumans-Regular.ttf` → `Baumans-Regular`. */
export function projectPathStem(projectPath: string): string {
  const name = projectPath.slice(projectPath.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
