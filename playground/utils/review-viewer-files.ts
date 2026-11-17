// The review modal's viewer files (2e step 5e): an entry's source as <mini-workspace>
// shows it, through the snapshots page's mapping. Apart from review-entry.ts, which stays
// DOM-free: this one reaches the viewer component (shownPathOf).

import { reviewMain, reviewMarks } from './review-entry.js';
import { snapshotViewerFiles } from './snapshot-viewer-files.js';

import type { MiniWorkspaceFiles } from '../components/blog/mini-workspace.js';
import type { ReviewSource } from './review-entry.js';
import type { SnapshotFilesEngine } from './snapshot-viewer-files.js';

/**
 * The viewer's files: every file, pathogen.json with several, opening on the program
 * that's compiled (the snapshots page's mapping), with a re-review's marks.
 */
export function reviewViewerFiles(source: ReviewSource, engine: SnapshotFilesEngine | null): MiniWorkspaceFiles {
  const { viewer } = snapshotViewerFiles(
    {
      files: source.files,
      folders: source.folders,
      entryPoints: source.entryPoints,
      contentHash: source.codeHash,
      program: reviewMain(source),
      ...(source.code !== undefined ? { code: source.code } : {}),
    },
    engine,
  );
  return { ...viewer, marks: source.changes ? reviewMarks(source.changes) : null };
}
