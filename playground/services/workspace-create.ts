// A new workspace from files that may pass what a create can send (phase 3a,
// step 8; LIMITS.saveBodyBytes, 24 MB): a project's import, or Open as new
// workspace, can bring 50 MB of data files. Past the cap, the workspace is
// created with what fits, the largest data files left out; each of those is
// stored on its own (PUT /workspace/:id/file, 5 MB at most), and one save
// names every file by its hash. This is the route the server's own refusal
// gives ("Create it with less, then send larger files one at a time…").
//
// A failure after the create deletes the workspace, so nothing half-made is
// left: the page says why, and nothing was added.

import { utf8Length } from '../utils/format-bytes.js';

import { workspaceApi } from './api.js';

/** What a new workspace starts with: the body of POST /workspace. */
export interface NewWorkspace {
  name: string;
  description: string;
  files: Record<string, { text: string }>;
  folders?: string[];
  entryPoints?: string[];
  isPublic: boolean;
  preferences: Record<string, unknown>;
}

/** What the server answers a create with: the files carry their hashes. */
export interface CreatedWorkspace {
  id: string;
  slug?: string;
  files?: Record<string, { sha256?: string }>;
}

/** The calls it makes (the API's, or a test's). */
export interface CreateCalls {
  create: (workspace: Record<string, unknown>) => Promise<unknown>;
  storeFile: (id: string, text: string) => Promise<{ sha256: string }>;
  update: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  delete: (id: string) => Promise<unknown>;
}

interface LimitsLib {
  WORKSPACE_LIMITS?: { saveBodyBytes?: number };
  workspaceFileKind?: (path: string) => string | null;
}

/** Room under the cap for what a request adds that the body doesn't hold. */
const SLACK = 1024;

/**
 * Which files a create leaves for after, the largest data files first, so
 * that what's left fits `cap` bytes of JSON. Only data files go (a .pathogen
 * file is 1 MB at most, and 20 of them fit). Empty when it all fits.
 */
export function filesForAfter(workspace: NewWorkspace, cap: number, isData: (path: string) => boolean): string[] {
  const json = JSON.stringify(workspace);
  // UTF-8 takes at most 3 bytes a UTF-16 unit: a short body needs no count.
  if (json.length * 3 <= cap) return [];
  let size = utf8Length(json);
  if (size <= cap) return [];
  const largest = Object.entries(workspace.files)
    .filter(([path]) => isData(path))
    // The entry as the JSON holds it, `"path":{"text":"…"}`, and its comma.
    .map(([path, file]) => ({
      path,
      bytes: utf8Length(JSON.stringify(path)) + 1 + utf8Length(JSON.stringify(file)) + 1,
    }))
    .sort((a, b) => b.bytes - a.bytes || (a.path < b.path ? -1 : 1));
  const after: string[] = [];
  for (const { path, bytes } of largest) {
    if (size <= cap) break;
    after.push(path);
    size -= bytes;
  }
  return after;
}

/** Create the workspace, within the cap: the files that don't fit follow, stored one at a time, then saved by hash. */
export async function createWorkspace(
  workspace: NewWorkspace,
  calls: CreateCalls = workspaceApi,
): Promise<CreatedWorkspace> {
  const lib = (typeof window === 'undefined' ? undefined : window.PathogenLang) as LimitsLib | undefined;
  const limit = lib?.WORKSPACE_LIMITS?.saveBodyBytes;
  const kindOf = lib?.workspaceFileKind;
  // A library too old to say: sent as it is, and the server's limit answers.
  const after =
    limit === undefined || typeof kindOf !== 'function'
      ? []
      : filesForAfter(workspace, limit - SLACK, (path) => kindOf(path) === 'data');
  if (after.length === 0) return (await calls.create({ ...workspace })) as CreatedWorkspace;

  const later = new Set(after);
  const first = Object.fromEntries(Object.entries(workspace.files).filter(([path]) => !later.has(path)));
  const created = (await calls.create({ ...workspace, files: first })) as CreatedWorkspace;
  try {
    const named: Record<string, { text: string } | { sha256: string }> = {};
    for (const [path, file] of Object.entries(first)) {
      const sha256 = created.files?.[path]?.sha256;
      named[path] = sha256 ? { sha256 } : file;
    }
    for (const path of after) {
      named[path] = { sha256: (await calls.storeFile(created.id, workspace.files[path].text)).sha256 };
    }
    await calls.update(created.id, {
      files: named,
      folders: workspace.folders ?? [],
      entryPoints: workspace.entryPoints ?? [],
    });
  } catch (err) {
    // Nothing half-made: the workspace goes, and the page says why.
    await calls.delete(created.id).catch(() => undefined);
    throw err;
  }
  return created;
}
