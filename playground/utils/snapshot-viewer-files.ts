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

/** What the engine (window.PathogenLang) tells about files. */
export interface SnapshotFilesEngine {
  isModuleSource: (text: string) => boolean;
  workspaceProjectFileText: (entryPoints: readonly string[]) => string;
}

export interface SnapshotViewerFiles {
  /** mini-workspace's `sourceFiles`. */
  viewer: MiniWorkspaceFiles;
  /** The file the panel opens on: its path and text (Export's legend). */
  drawing: { path: string | null; text: string };
}

function kindOf(text: string, engine: SnapshotFilesEngine | null): SourceFile['kind'] {
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
  const pathogen: SourceFile[] = Object.entries(files.files).map(([path, { text }]) => ({
    path,
    text,
    kind: kindOf(text, engine),
  }));
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
