// The review screen's reading of a queue entry (2e step 5e; note 59, mockups v12 R1 to R6,
// v14): GET /admin/review/:id/source's answer, turned into what the card, the modal and
// Approve need. Pure, so tests need no page.
// - The main is the first program the entry holds: what's compiled and approved.
// - A file that can't be read (2e step 5d) keeps Approve off: nobody has seen it.
// - A re-review's changes become the card's line, the modal's box and the viewer's marks.

import { snapshotViewerFiles } from './snapshot-viewer-files.js';

import type { MiniWorkspaceFiles } from '../components/blog/mini-workspace.js';
import type { SourceFileMarks } from '../components/shared/source-files.js';
import type { WorkspaceCompileInput } from '../services/compiler-worker.js';
import type { SnapshotFilesEngine } from './snapshot-viewer-files.js';

/** One file of an entry: its text, or marked unreadable. */
export type ReviewFile =
  | { sha256: string; size: number; text: string; unreadable?: undefined }
  | { sha256: string; size: number; text?: undefined; unreadable: true };

/** website/api/review-changes.ts's ReviewChanges, as the answer carries it. */
export interface ReviewChanges {
  files: { path: string; mark: 'new' | 'changed' | 'moved' | 'removed'; from?: string }[];
  foldersAdded: string[];
  foldersRemoved: string[];
  programs: {
    mainBefore: string | null;
    mainAfter: string | null;
    added: string[];
    removed: string[];
    orderOnly: boolean;
  } | null;
  counts: { new: number; changed: number; removed: number };
}

/** GET /admin/review/:id/source's answer. */
export interface ReviewSource {
  workspaceId: string;
  name: string;
  files: Record<string, ReviewFile>;
  folders: string[];
  entryPoints: string[];
  codeHash: string;
  code?: string;
  changes?: ReviewChanges;
  approvedAt?: string;
  changesError?: string;
}

const PROJECT_FILE = 'pathogen.json';

/** A queue listing's entry, as far as its source goes (GET /admin/queue/…). */
export interface ListedEntry {
  workspaceId: string;
  name: string;
  codeHash: string;
  files?: Record<string, { sha256: string; size: number; text?: string; unreadable?: boolean }>;
  folders?: string[];
  entryPoints?: string[];
  code?: string;
  changes?: ReviewChanges;
  approvedAt?: string;
  changesError?: string;
}

/**
 * An entry's source from the listing itself, when the listing carries every file's text
 * (an entry of just main.pathogen); null when the source route must be asked.
 */
export function sourceFromListing(entry: ListedEntry): ReviewSource | null {
  const listed = Object.entries(entry.files ?? {});
  if (listed.length === 0) return null;
  const files: Record<string, ReviewFile> = {};
  for (const [path, file] of listed) {
    if (typeof file.text !== 'string' || file.unreadable === true) return null;
    files[path] = { sha256: file.sha256, size: file.size, text: file.text };
  }
  return {
    workspaceId: entry.workspaceId,
    name: entry.name,
    files,
    folders: entry.folders ?? [],
    entryPoints: entry.entryPoints ?? [],
    codeHash: entry.codeHash,
    ...(entry.code !== undefined ? { code: entry.code } : {}),
    ...(entry.changes ? { changes: entry.changes } : {}),
    ...(entry.approvedAt ? { approvedAt: entry.approvedAt } : {}),
    ...(entry.changesError ? { changesError: entry.changesError } : {}),
  };
}

/** GET /admin/approval/:id's answer, as far as its source goes. */
export interface ApprovalFiles {
  files?: Record<string, ReviewFile>;
  folders?: string[];
  entryPoints?: string[];
  codeHash?: string;
  code?: string;
}

/**
 * An approval's source, for the Approved and Featured tabs' modal, Regenerate and Set
 * thumbnail: its files, or an approval carrying only its one text read as main.pathogen.
 */
export function sourceFromApproval(workspaceId: string, name: string, answer: ApprovalFiles): ReviewSource {
  const listed = answer.files ?? {};
  const files: Record<string, ReviewFile> =
    Object.keys(listed).length > 0 || answer.code === undefined
      ? listed
      : { 'main.pathogen': { sha256: '', size: new TextEncoder().encode(answer.code).length, text: answer.code } };
  const entryPoints =
    answer.entryPoints && answer.entryPoints.length > 0
      ? answer.entryPoints
      : Object.hasOwn(files, 'main.pathogen')
        ? ['main.pathogen']
        : [];
  return {
    workspaceId,
    name,
    files,
    folders: answer.folders ?? [],
    entryPoints,
    codeHash: answer.codeHash ?? '',
    ...(answer.code !== undefined ? { code: answer.code } : {}),
  };
}

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

/** The program that's compiled and approved: the first the entry holds. */
export function reviewMain(source: Pick<ReviewSource, 'files' | 'entryPoints'>): string | null {
  return source.entryPoints.find((path) => Object.hasOwn(source.files, path)) ?? null;
}

/** The files that couldn't be read, in path order. */
export function unreadableFiles(source: Pick<ReviewSource, 'files'>): string[] {
  return Object.entries(source.files)
    .filter(([, file]) => file.unreadable === true)
    .map(([path]) => path)
    .sort();
}

/**
 * What compiles the entry's drawing: the main's text and the workspace it imports
 * from, as the preview compiles it. Null with no main, or with any file unread.
 */
export function reviewCompileInput(
  source: Pick<ReviewSource, 'files' | 'folders' | 'entryPoints' | 'name'>,
): { main: string; text: string; workspace: WorkspaceCompileInput } | null {
  const main = reviewMain(source);
  if (main === null || unreadableFiles(source).length > 0) return null;
  const files = new Map<string, string>();
  for (const [path, file] of Object.entries(source.files)) files.set(path, file.text ?? '');
  return {
    main,
    text: files.get(main) ?? '',
    workspace: { files, folders: source.folders, entry: main, label: source.name || 'this workspace' },
  };
}

/** How many files the card and the list count: with several, pathogen.json too. */
export function reviewFileCount(files: Record<string, unknown> | undefined): number {
  const n = Object.keys(files ?? {}).length;
  return n > 1 ? n + 1 : n;
}

/** The card's line: "1 changed, 1 new, 1 removed", or "no file's text changed". */
export function changesSummary(changes: ReviewChanges): string {
  const { changed, removed } = changes.counts;
  const added = changes.counts.new;
  const parts = [
    changed ? `${changed} changed` : '',
    added ? `${added} new` : '',
    removed ? `${removed} removed` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'no file’s text changed';
}

/** One line of the modal's box: its words (as HTML) and the file it opens, if any. */
export interface ChangeLine {
  mark: 'new' | 'changed' | 'moved' | 'removed';
  html: string;
  /** The file a click opens; none for a removed file or a folder. */
  file: string | null;
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const code = (s: string): string => `<code>${esc(s)}</code>`;
const list = (paths: string[]): string => paths.map(code).join(', ');

/** The modal's box: what changed since the approved version, a line each (v12 R3, R4). */
export function changeLines(changes: ReviewChanges): ChangeLine[] {
  const lines: ChangeLine[] = [];
  for (const f of changes.files) {
    if (f.mark === 'changed') lines.push({ mark: 'changed', html: `${code(f.path)} changed`, file: f.path });
    else if (f.mark === 'new') lines.push({ mark: 'new', html: `${code(f.path)} is new`, file: f.path });
    else if (f.mark === 'moved')
      lines.push({ mark: 'moved', html: `${code(f.from ?? '')} moved to ${code(f.path)}`, file: f.path });
    else lines.push({ mark: 'removed', html: `${code(f.path)} was removed`, file: null });
  }
  for (const folder of changes.foldersAdded) {
    lines.push({ mark: 'new', html: `A folder was added: ${code(`${folder}/`)}, empty`, file: null });
  }
  for (const folder of changes.foldersRemoved) {
    lines.push({ mark: 'removed', html: `A folder was removed: ${code(`${folder}/`)}, empty`, file: null });
  }
  const p = changes.programs;
  if (p) {
    const why: string[] = [];
    if (p.mainAfter !== p.mainBefore) {
      why.push(
        p.mainAfter
          ? `${code(p.mainAfter)} is the new main${p.mainBefore ? ` (was ${code(p.mainBefore)})` : ''}`
          : 'no program is left',
      );
    }
    if (p.added.length > 0) why.push(`${list(p.added)} joined it`);
    if (p.removed.length > 0) why.push(`${list(p.removed)} left it`);
    if (why.length === 0 && p.orderOnly) why.push('its order changed');
    lines.push({
      mark: 'changed',
      html: `The program list: ${why.join('; ')}, so ${code(PROJECT_FILE)} changed`,
      file: PROJECT_FILE,
    });
  }
  return lines;
}

/** The viewer's marks for a re-review (2e step 5e, piece 2). */
export function reviewMarks(changes: ReviewChanges): SourceFileMarks {
  const files: SourceFileMarks['files'] = {};
  const removed: string[] = [];
  for (const f of changes.files) {
    if (f.mark === 'removed') removed.push(f.path);
    else files[f.path] = f.from ? { mark: f.mark, from: f.from } : { mark: f.mark };
  }
  if (changes.programs) files[PROJECT_FILE] = { mark: 'changed' };
  return { files, removed, foldersAdded: [...changes.foldersAdded] };
}
