// A save the workspace's limits would refuse, found before it's sent (phase
// 3a step 7c; docs/workspace-files.md "Limits"; notes 74 and 75): a file
// past its kind's limit (1 MB a .pathogen file, 5 MB a data file), or the
// workspace past 50 MB in all. The playground doesn't send it: the save
// status reads "Not saved", and the error panel says why under the file's
// name, with any other errors. Nothing is lost, and it saves when it fits
// again. The limits are the server's own (WORKSPACE_LIMITS).
//
// A page served with a library too old to say (no `megabytes`) sends the
// save as before, and the server's own limits refuse it, in the save status.

import { utf8Length } from '../utils/format-bytes.js';

import type { WorkspaceTexts } from './workspace-files.js';

/** Why a save wasn't sent, and the file it's about (the panel's section heading). */
export interface SaveRefusal {
  file: string;
  message: string;
}

interface LimitsLib {
  WORKSPACE_LIMITS?: { fileBytes: Record<string, number>; workspaceBytes: number };
  workspaceFileKind?: (path: string) => string | null;
  megabytes?: (bytes: number) => string;
}

const KIND_NAMES: Record<string, string> = { pathogen: 'a .pathogen file', data: 'a data file' };

/**
 * Why `workspace` can't be saved as it stands, or null. The first file past
 * its limit, by path; else the workspace past its total, named under the
 * file in the editor (the one whose edit took it there), or the largest.
 *
 * Bytes are counted only where they could matter: UTF-8 takes 1 to 3 bytes a
 * UTF-16 unit, so a text whose length times 3 fits a limit fits it, and a
 * workspace whose lengths times 3 fit 50 MB fits it (every save of a usual
 * workspace costs a sum of lengths).
 */
export function saveRefusal(workspace: WorkspaceTexts): SaveRefusal | null {
  const lib = (typeof window === 'undefined' ? undefined : window.PathogenLang) as LimitsLib | undefined;
  const limits = lib?.WORKSPACE_LIMITS;
  const kindOf = lib?.workspaceFileKind;
  const mb = lib?.megabytes;
  if (!limits || typeof kindOf !== 'function' || typeof mb !== 'function') return null;
  const paths = [...workspace.texts.keys()].sort();
  let most = 0;
  for (const path of paths) {
    const text = workspace.texts.get(path)!;
    most += text.length * 3;
    const kind = kindOf(path);
    const limit = kind === null ? undefined : limits.fileBytes[kind];
    if (kind === null || limit === undefined || text.length * 3 <= limit) continue;
    const bytes = utf8Length(text);
    if (bytes > limit) {
      return {
        file: path,
        message: `Not saved: ${mb(bytes)}, more than the ${mb(limit)} ${KIND_NAMES[kind] ?? 'a file'} can be in a workspace. Your edits stay in the editor.`,
      };
    }
  }
  if (most <= limits.workspaceBytes) return null;
  // Near 50 MB or past it: counted.
  let total = 0;
  let largest = { path: paths[0], bytes: -1 };
  for (const path of paths) {
    const bytes = utf8Length(workspace.texts.get(path)!);
    total += bytes;
    if (bytes > largest.bytes) largest = { path, bytes };
  }
  if (total <= limits.workspaceBytes) return null;
  const open = workspace.openFile;
  return {
    file: open !== null && workspace.texts.has(open) ? open : largest.path,
    message: `Not saved: the workspace's files would be ${mb(total)}, more than the ${mb(limits.workspaceBytes)} a workspace can hold. Your edits stay in the editor.`,
  };
}
