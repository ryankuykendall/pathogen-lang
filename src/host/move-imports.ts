/**
 * Rewriting import paths when files move (docs/workspace-files.md "Renaming,
 * moving and deleting"). Renaming or moving a file updates the imports that
 * name it in the other files, and a moved file's own `./` and `../` imports,
 * so every import still reaches the same file. Moving a folder moves
 * everything in it.
 *
 * Pure: it reads sources and returns edits; the caller applies them and
 * renames the files. Paths are project paths (`/parts/gears.pathogen`), as
 * in the module graph. The playground's workspace keys drop the slash.
 *
 * Imports are read from the parse tree (planImports), so a path in a comment
 * or a string is never touched. An import the loader would refuse (a path
 * mistake, a path above the top, a string not closed yet) is left as written.
 */
import { importPathMistake, planImports } from './load-modules';
import { projectDirname, resolveProjectPath } from './paths';

/** One move: a file, or a folder and everything in it. Project paths. */
export interface PathMove {
  from: string;
  to: string;
}

/** One import path to replace: the text between its quotes. */
export interface ImportPathEdit {
  /** Offsets of the path between the quotes. */
  from: number;
  to: number;
  /** The path as written now: what `from`..`to` holds. */
  written: string;
  /** The path that reaches the same file after the moves. */
  text: string;
  /** 1-based position of the path's first character. */
  line: number;
  column: number;
}

/** The import edits in one file, named by its path before the moves. */
export interface FileImportEdits {
  file: string;
  edits: ImportPathEdit[];
}

/**
 * A project path as the graph writes it: a leading slash, then names, with no
 * empty, `.` or `..` part and no trailing slash. Anything else would map to
 * the wrong place without an error, so it is refused.
 */
function checkProjectPath(path: string): void {
  const parts = path.split('/').slice(1);
  const ok =
    path.startsWith('/') && parts.length > 0 && parts.every((part) => part !== '' && part !== '.' && part !== '..');
  if (!ok) {
    throw new Error(
      `"${path}" is not a project path: a project path starts with "/" and names a file or folder, with no empty, "." or ".." part and no trailing "/" (/parts/gears.pathogen).`,
    );
  }
}

/** Each path moves at most once: two moves of the same path can't both happen. */
function checkMoves(moves: readonly PathMove[]): void {
  const seen = new Set<string>();
  for (const move of moves) {
    checkProjectPath(move.from);
    checkProjectPath(move.to);
    if (seen.has(move.from)) throw new Error(`"${move.from}" is moved twice.`);
    seen.add(move.from);
  }
}

/**
 * Where a path is after the moves. Every path is mapped against the paths
 * before any move, so a swap (a → b, b → a) works. A path inside a moved
 * folder moves with it; when a folder and a file in it both move, the file's
 * own move wins.
 */
export function pathAfterMoves(path: string, moves: readonly PathMove[]): string {
  checkProjectPath(path);
  checkMoves(moves);
  let best: PathMove | null = null;
  for (const move of moves) {
    const inside = path === move.from || path.startsWith(`${move.from}/`);
    if (inside && (!best || move.from.length > best.from.length)) best = move;
  }
  return best ? best.to + path.slice(best.from.length) : path;
}

/** The written path from a file to a project path: `./parts/gears.pathogen`, `../kit.pathogen`. */
function relativePath(fromFile: string, target: string): string {
  const from = projectDirname(fromFile).split('/').filter(Boolean);
  const to = target.split('/').filter(Boolean);
  let shared = 0;
  // The file name itself is never a folder to share.
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;
  const up = from.length - shared;
  const rest = to.slice(shared).join('/');
  return up === 0 ? `./${rest}` : `${'../'.repeat(up)}${rest}`;
}

/**
 * The edits that keep every import reaching the same file once `moves` are
 * made. Only files that change are listed, in the order `files` gives them,
 * each with its edits in source order.
 *
 * Two files that would end at the same path are refused. Whether a new path
 * is allowed at all (its name, a name that differs only in letter case from
 * another, the limits) is the caller's to check first: the workspace's rules
 * (`src/workspace/files.ts`) are not this function's.
 */
export function importEditsForMoves(
  files: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
  moves: readonly PathMove[],
): FileImportEdits[] {
  checkMoves(moves);
  const entries = files instanceof Map ? [...files.entries()] : Object.entries(files);
  const landed = new Map<string, string>();
  for (const [file] of entries) {
    checkProjectPath(file);
    const after = pathAfterMoves(file, moves);
    const other = landed.get(after);
    if (other !== undefined) throw new Error(`"${other}" and "${file}" would both be "${after}".`);
    landed.set(after, file);
  }
  const out: FileImportEdits[] = [];
  for (const [file, source] of entries) {
    if (!file.endsWith('.pathogen')) continue;
    const fileAfter = pathAfterMoves(file, moves);
    const edits: ImportPathEdit[] = [];
    for (const planned of planImports(source)) {
      const quote = source[planned.from];
      // A string not closed yet (`from "./pa` while typing) has no path to move.
      if (planned.to - planned.from < 2 || source[planned.to - 1] !== quote) continue;
      const written = planned.written;
      if (importPathMistake(written) !== null) continue;
      const resolved = resolveProjectPath(written, file);
      if (!resolved.ok) continue;
      const target = pathAfterMoves(resolved.path, moves);
      // Still reaching the same file from where this file will be: keep its spelling.
      const reached = resolveProjectPath(written, fileAfter);
      if (reached.ok && reached.path === target) continue;
      const text = written.startsWith('/') ? target : relativePath(fileAfter, target);
      edits.push({
        from: planned.from + 1,
        to: planned.to - 1,
        written,
        text,
        line: planned.line,
        column: planned.column + 1,
      });
    }
    if (edits.length > 0) out.push({ file, edits });
  }
  return out;
}

/**
 * A file's text with its import edits made. Edits made for another version
 * of the text are refused rather than written into the wrong place: each
 * edit's `written` must still be where it was.
 */
export function applyImportEdits(source: string, edits: readonly ImportPathEdit[]): string {
  let text = source;
  // From the end back, so each edit's offsets still hold when it is made.
  const ordered = [...edits].sort((a, b) => b.from - a.from);
  ordered.forEach((edit, i) => {
    const quote = source[edit.from - 1];
    const quoted = (quote === '"' || quote === "'") && source[edit.to] === quote;
    if (!quoted || source.slice(edit.from, edit.to) !== edit.written) {
      throw new Error(
        `The import at line ${edit.line} has changed since its edit was made (expected "${edit.written}"). Make the edits again from the current text.`,
      );
    }
    // The edit after this one in the text must start after this one ends.
    const later = ordered[i - 1];
    if (later && later.from <= edit.to) throw new Error(`Two import edits overlap at line ${edit.line}.`);
    text = text.slice(0, edit.from) + edit.text + text.slice(edit.to);
  });
  return text;
}
