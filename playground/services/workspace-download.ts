// Download workspace (phase 2g, note 70; docs/workspace-files.md "Downloading
// a workspace"): a .zip of the workspace as a project folder. One folder named
// after the workspace (fitted to the name rules, as an upload's names are)
// holds its pathogen.json, written by the workspace's one writer, and every
// file and folder, empty folders included. The texts are what the editor
// holds, edits not saved yet included: the caller passes workspaceNow().

import { fittedName } from './uploads.js';
import { projectFileText } from './workspace-edits.js';
import { writeZip } from './zip.js';

import type { ZipInput } from './zip.js';

/** What a download takes from the workspace. */
export interface WorkspaceForDownload {
  /** The workspace's name: "Gear studies". */
  name: string;
  /** Workspace path → text. */
  texts: ReadonlyMap<string, string>;
  /** The folders with nothing in them; the others come from the file paths. */
  folders: readonly string[];
  /** The programs, the main first. */
  entryPoints: readonly string[];
}

const PROJECT_FILE = 'pathogen.json';
const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The .zip's name and its one folder's: the workspace's name fitted to the name rules ("Gear studies" → "Gear-studies"). */
export function downloadFolderName(name: string): string {
  return fittedName(name.trim() === '' ? 'workspace' : name.trim(), false);
}

/**
 * The workspace as a .zip: its folder first, then pathogen.json, then every
 * folder and file in order of their paths (a folder before what's in it).
 */
export function workspaceZip(
  workspace: WorkspaceForDownload,
  when: Date = new Date(),
): { fileName: string; bytes: Uint8Array } {
  const top = downloadFolderName(workspace.name);
  const encoder = new TextEncoder();
  const folders = new Set<string>();
  const addFolders = (path: string, includeLast: boolean): void => {
    const segments = path.split('/').filter((s) => s !== '');
    const upTo = includeLast ? segments.length : segments.length - 1;
    for (let i = 1; i <= upTo; i++) folders.add(segments.slice(0, i).join('/'));
  };
  for (const path of workspace.texts.keys()) addFolders(path, false);
  for (const folder of workspace.folders) addFolders(folder, true);
  const rest: { key: string; entry: ZipInput }[] = [
    ...[...folders].map((folder) => ({ key: `${folder}/`, entry: { path: `${top}/${folder}/` } })),
    ...[...workspace.texts].map(([path, text]) => ({
      key: path,
      entry: { path: `${top}/${path}`, bytes: encoder.encode(text) },
    })),
  ].sort((a, b) => byPath(a.key, b.key));
  const entries: ZipInput[] = [
    { path: `${top}/` },
    { path: `${top}/${PROJECT_FILE}`, bytes: encoder.encode(projectFileText(workspace.entryPoints)) },
    ...rest.map((r) => r.entry),
  ];
  return { fileName: `${top}.zip`, bytes: writeZip(entries, when) };
}

/** Hand a file to the browser's downloads, as Export does without a save picker. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked a moment later: revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
