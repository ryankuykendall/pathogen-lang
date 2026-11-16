// The source of an approved workspace, for the Pages worker's detail page
// (/u/:handle/:slug) and its source.json. Since phase 2 an approval names its
// files by hash and their bytes are in R2 (project-docs/modules/48-storage-
// design-v2.md §4). The Pages worker has no R2 binding, on purpose, so it
// reads them from the API Worker's GET /approval-source/:id, as the page
// already reads its SVG from /approval-svg/:id. An approval saved before
// phase 2 still carries its one `code` string and needs no request.

import type { WorkspaceApproval } from './api/types.js';

/**
 * A file with its text, or, marked `unreadable`, one whose bytes couldn't be
 * read: the others still show (note 59, requirement 9).
 */
export type ApprovalSourceFile =
  | { sha256?: string; size?: number; text: string; unreadable?: undefined }
  | { sha256?: string; size?: number; text?: undefined; unreadable: true };

export interface ApprovalSource {
  files: Record<string, ApprovalSourceFile>;
  folders: string[];
  entryPoints: string[];
  /** The text of an approval that is just main.pathogen. */
  code?: string;
}

const MAIN_FILE = 'main.pathogen';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a response body is an approval source this module can read. */
function isApprovalSource(value: unknown): value is ApprovalSource {
  return (
    isRecord(value) &&
    isRecord(value.files) &&
    Object.values(value.files).every((f) => isRecord(f) && (typeof f.text === 'string' || f.unreadable === true)) &&
    Array.isArray(value.entryPoints) &&
    Array.isArray(value.folders)
  );
}

/**
 * The approval's files with their text, or null when they can't be read
 * right now (the API Worker is unreachable or answers an error). The caller
 * decides what a page shows without them.
 */
export async function readApprovalSource(
  approval: Pick<WorkspaceApproval, 'workspaceId' | 'code' | 'files'>,
  apiBase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApprovalSource | null> {
  if (approval.files === undefined) {
    const code = approval.code ?? '';
    return { files: { [MAIN_FILE]: { text: code } }, folders: [], entryPoints: [MAIN_FILE], code };
  }
  try {
    const res = await fetchImpl(`${apiBase}/approval-source/${encodeURIComponent(approval.workspaceId)}`);
    if (!res.ok) {
      console.warn(`[approval-source] ${approval.workspaceId}: the API answered ${res.status}`);
      return null;
    }
    const body: unknown = await res.json();
    if (!isApprovalSource(body)) {
      console.warn(`[approval-source] ${approval.workspaceId}: the API's answer isn't an approval source`);
      return null;
    }
    return body;
  } catch (err) {
    console.warn(`[approval-source] ${approval.workspaceId}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * The text the detail page shows: the main program's (the first entry point).
 * Null when the main's bytes couldn't be read: the page says so, as when the
 * source can't be read at all.
 */
export function mainSourceText(source: ApprovalSource): string | null {
  const main = source.entryPoints[0];
  const file = main !== undefined ? source.files[main] : undefined;
  if (file?.unreadable) return null;
  return file?.text ?? '';
}
