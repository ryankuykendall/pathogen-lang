// The snapshots page's code panel (2e, step 3c; note 59, mockups v13 and v14):
// a snapshot's files as <mini-workspace> shows them, and the file the panel
// opens on, the program that drew the image, which Export's legend lists too.
// Pure: the engine's two calls come in as an argument, so tests need no page.
//
// - Each file's kind is the engine's call (`module;`), not a regex.
// - pathogen.json comes last, as the workspace's tree shows it, when there are
//   several files. One file shows the code alone, as snapshots made before 2e do.
// - The file opened is the snapshot's program, else the main; after that the
//   viewer's own rule (shownPathOf), so the panel and the legend always agree.

import { shownPathOf } from '../components/shared/source-files.js';
import { MAIN_FILE, PROJECT_FILE } from './workspace-names.js';

import type { MiniWorkspaceFiles } from '../components/blog/mini-workspace.js';
import type { SourceFile } from '../components/shared/source-files.js';
import type { SnapshotFiles } from '../services/api.js';

/** What the engine (window.PathogenLang, or the public page's highlight bundle) tells about files. */
export interface SnapshotFilesEngine {
  isModuleSource: (text: string) => boolean;
  workspaceProjectFileText: (entryPoints: readonly string[]) => string;
  /** A file's kind by its extension: `data` for a data file (phase 3a). An older bundle may lack it. */
  workspaceFileKind?: (path: string) => string | null;
}

export interface SnapshotViewerFiles {
  /** mini-workspace's `sourceFiles`. */
  viewer: MiniWorkspaceFiles;
  /** The file the panel opens on: its path and text (Export's legend). */
  drawing: { path: string | null; text: string };
}

/** More characters than a .pathogen file's 1 MB can hold (a character is at least one byte). */
const PATHOGEN_FILE_CHARS = 1024 * 1024;

/** Whether a file is a data file, by the engine's rule. */
export function isDataPath(path: string, engine: SnapshotFilesEngine | null): boolean {
  try {
    return engine?.workspaceFileKind?.(path) === 'data';
  } catch {
    return false;
  }
}

/**
 * A file's kind as the viewer draws it: a data file by its extension, never
 * parsed as Pathogen (it can be 5 MB of JSON); else a module or a program, the
 * engine's call.
 */
export function sourceFileKind(path: string, text: string, engine: SnapshotFilesEngine | null): SourceFile['kind'] {
  if (isDataPath(path, engine)) return 'data';
  // A .pathogen file is 1 MB at most: a longer text (a data file, with a highlight bundle
  // cached from before it knew data files) isn't parsed on the main thread.
  if (text.length > PATHOGEN_FILE_CHARS) return 'program';
  try {
    return engine?.isModuleSource(text) ? 'library' : 'program';
  } catch {
    return 'program';
  }
}

/** pathogen.json as the tree writes it; null if the engine can't, so the page shows the rest. */
function projectFile(entryPoints: readonly string[], engine: SnapshotFilesEngine | null): SourceFile | null {
  if (!engine) return null;
  try {
    return { path: PROJECT_FILE, text: engine.workspaceProjectFileText(entryPoints), kind: 'project' };
  } catch {
    return null;
  }
}

export function snapshotViewerFiles(files: SnapshotFiles, engine: SnapshotFilesEngine | null): SnapshotViewerFiles {
  // A file the server couldn't read (2e step 5d; note 59, requirement 9) keeps its
  // place and says so in the viewer; the others show as saved. Its kind can't be
  // known, so it's drawn with the viewer's warning, not a kind's icon.
  const pathogen: SourceFile[] = Object.entries(files.files).map(([path, file]) =>
    typeof file.text === 'string'
      ? { path, text: file.text, kind: sourceFileKind(path, file.text, engine) }
      : { path, text: '', kind: 'program', unreadable: true },
  );
  // A snapshot from before phase 2 may answer with its one text alone.
  if (pathogen.length === 0 && files.code !== undefined) {
    pathogen.push({ path: MAIN_FILE, text: files.code, kind: 'program' });
  }
  // An older answer may leave the lists out: none, then.
  const entryPoints = files.entryPoints ?? [];
  const project = pathogen.length > 1 ? projectFile(entryPoints, engine) : null;
  const list = project ? [...pathogen, project] : pathogen;
  const main = entryPoints[0] ?? null;
  const open = shownPathOf(list, files.program ?? main);
  return {
    viewer: { files: list, folders: [...(files.folders ?? [])], main, open },
    drawing: { path: open, text: list.find((f) => f.path === open)?.text ?? '' },
  };
}
