// The public page's View source with several files (2e step 6; mockup v12 P1 to P5,
// note 59 answer 3a). The page serves every file's name and the main's text; the
// others' texts come from source.json when View source opens.
// - Before they come, the main shows, and the others wait: a program (from the list)
//   with its icon, any other file with a plain one, its kind unknown until its text.
// - When source.json comes, its files are the ones shown (a re-approval may have
//   changed them since the page loaded), through the snapshots page's mapping; the
//   file open stays open if it's still there, else the main.
// Pure: the engine's two calls come in as an argument (the highlight bundle's here).

import { isDataPath, snapshotViewerFiles, sourceFileKind } from './snapshot-viewer-files.js';
import { PROJECT_FILE } from './workspace-names.js';

import type { MiniWorkspaceFiles } from '../components/blog/mini-workspace.js';
import type { SourceFile } from '../components/shared/source-files.js';
import type { SnapshotFiles } from '../services/api.js';
import type { SnapshotFilesEngine } from './snapshot-viewer-files.js';

/** What the page serves (website/approval-source.ts ServedSource). */
export interface ServedSource {
  names: string[];
  folders: string[];
  entryPoints: string[];
  main: string | null;
}

/**
 * source.json's answer, as far as the viewer reads it. A data file past the 2 MB
 * of data it carries comes `deferred` (phase 3a): the page reads it from the API's
 * /approval-source/:workspaceId/file/:sha256 before showing the files.
 */
export interface SourceJson {
  workspaceId?: string;
  files: Record<string, { text?: string; unreadable?: boolean; deferred?: boolean; sha256?: string; size?: number }>;
  folders: string[];
  entryPoints: string[];
  code?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Whether the page's served data can be read. */
export function isServedSource(value: unknown): value is ServedSource {
  return (
    isRecord(value) &&
    isStrings(value.names) &&
    isStrings(value.folders) &&
    isStrings(value.entryPoints) &&
    (value.main === null || typeof value.main === 'string')
  );
}

/** Whether source.json's answer can be read. */
export function isSourceJson(value: unknown): value is SourceJson {
  return (
    isRecord(value) &&
    isRecord(value.files) &&
    Object.values(value.files).every(
      (f) =>
        isRecord(f) &&
        (typeof f.text === 'string' || f.unreadable === true || (f.deferred === true && typeof f.sha256 === 'string')),
    ) &&
    isStrings(value.folders) &&
    isStrings(value.entryPoints)
  );
}

function projectFile(entryPoints: readonly string[], engine: SnapshotFilesEngine | null): SourceFile | null {
  if (!engine) return null;
  try {
    return { path: PROJECT_FILE, text: engine.workspaceProjectFileText(entryPoints), kind: 'project' };
  } catch {
    return null;
  }
}

/** Before the other texts come: the main's text, the others loading or failed (P2, P4). */
export function waitingFiles(
  served: ServedSource,
  mainText: string,
  engine: SnapshotFilesEngine | null,
  pending: 'loading' | 'failed',
  open: string | null = null,
): MiniWorkspaceFiles {
  // A data file is known by its name: the braces show before its text comes.
  const waitingKind = (path: string): SourceFile['kind'] =>
    isDataPath(path, engine) ? 'data' : served.entryPoints.includes(path) ? 'program' : 'file';
  const files: SourceFile[] = served.names.map((path) =>
    path === served.main
      ? { path, text: mainText, kind: sourceFileKind(path, mainText, engine) }
      : { path, text: '', kind: waitingKind(path), pending },
  );
  const project = files.length > 1 ? projectFile(served.entryPoints, engine) : null;
  const list = project ? [...files, project] : files;
  const keep = open !== null && list.some((f) => f.path === open) ? open : served.main;
  // The main badge sits on the program the page opens on: the first one held.
  return { files: list, folders: [...served.folders], main: served.main, open: keep };
}

/** source.json's files, every one, opening on the file open if it's still there, else the main (P3). */
export function arrivedFiles(
  source: SourceJson,
  engine: SnapshotFilesEngine | null,
  open: string | null,
): MiniWorkspaceFiles {
  const main = source.entryPoints.find((path) => Object.hasOwn(source.files, path)) ?? null;
  const keep = open !== null && (Object.hasOwn(source.files, open) || open === PROJECT_FILE) ? open : main;
  const { viewer } = snapshotViewerFiles(
    {
      files: source.files as SnapshotFiles['files'],
      folders: source.folders,
      entryPoints: source.entryPoints,
      contentHash: '',
      program: keep,
      ...(source.code !== undefined ? { code: source.code } : {}),
    },
    engine,
  );
  // The main badge as before the texts came: the first program held.
  return { ...viewer, main };
}
