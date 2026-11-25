// Files an answer sent without their text (phase 3a, note 80): a data file
// past the 2 MB of data a load or a viewer's answer carries comes `deferred`,
// with its hash, and the reader reads it through the route it may use:
// - the owner, GET /workspace/:id/file/:sha256 (and an admin, any file the
//   workspace ever named: a submission's, an approval's);
// - a visitor, an approved workspace's through /approval-source/:id/file/:sha256;
// - the owner, a snapshot's through /snapshot/:sid/file/:sha256.
// Pure and DOM-free, so node scripts can import it (scripts/backfill-approval-svgs.ts).

/** A file sent without its text: read it by its hash. */
export interface DeferredFile {
  sha256: string;
  size?: number;
  deferred: true;
  text?: undefined;
}

/** A deferred file, read: its text, or `unreadable` when it couldn't be (the reader says so in its place). */
export type ReadFile =
  { sha256: string; size?: number; text: string } | { sha256: string; size?: number; unreadable: true };

export function isDeferred(file: unknown): file is DeferredFile {
  if (typeof file !== 'object' || file === null) return false;
  const f = file as Record<string, unknown>;
  return f.deferred === true && typeof f.text !== 'string' && typeof f.sha256 === 'string';
}

/** At most this many are read at once. */
const AT_ONCE = 4;

/**
 * Each deferred file's text, read by its hash with `read`, a few at a time;
 * the same text at two paths is read once. A file that couldn't be read is
 * marked `unreadable`, and `failed` says why, by path; the others are read
 * anyway. Files with their text pass through as they are.
 */
export async function readDeferredFiles<F>(
  files: Record<string, F | DeferredFile>,
  read: (sha256: string) => Promise<string>,
): Promise<{ files: Record<string, F | ReadFile>; failed: Map<string, string> }> {
  const hashes = [
    ...new Set(
      Object.values(files)
        .filter(isDeferred)
        .map((f) => f.sha256),
    ),
  ];
  const texts = new Map<string, string>();
  const errors = new Map<string, string>();
  const queue = [...hashes];
  const reader = async (): Promise<void> => {
    for (let sha256 = queue.shift(); sha256 !== undefined; sha256 = queue.shift()) {
      try {
        texts.set(sha256, await read(sha256));
      } catch (err) {
        errors.set(sha256, (err as Error).message || 'it could not be read');
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, reader));
  const out: Record<string, F | ReadFile> = {};
  const failed = new Map<string, string>();
  for (const [path, file] of Object.entries(files)) {
    if (!isDeferred(file)) {
      out[path] = file;
      continue;
    }
    const size = file.size !== undefined ? { size: file.size } : {};
    const text = texts.get(file.sha256);
    if (text !== undefined) out[path] = { sha256: file.sha256, ...size, text };
    else {
      out[path] = { sha256: file.sha256, ...size, unreadable: true };
      failed.set(path, errors.get(file.sha256) ?? 'it could not be read');
    }
  }
  return { files: out, failed };
}

/**
 * An approved workspace's files as a visitor gets them (the Pages worker's
 * source.json), every deferred one read from the API's public
 * /approval-source/:id/file/:sha256: either every file with its text, or why
 * not. A source.json without `workspaceId` (one cached from before it named it,
 * for up to a minute) can't have its deferred files read.
 */
export async function readApprovalFiles<F>(
  answer: { workspaceId?: string; files: Record<string, F> },
  apiBase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ files: Record<string, F | ReadFile> } | { failed: string }> {
  if (!Object.values(answer.files).some(isDeferred)) return { files: answer.files };
  const id = answer.workspaceId;
  if (!id) return { failed: 'its larger data files couldn’t be read yet. Try again in a minute.' };
  const { files, failed } = await readDeferredFiles(
    answer.files as Record<string, F | DeferredFile>,
    fetchReader(
      (sha256) => `${apiBase}/approval-source/${encodeURIComponent(id)}/file/${sha256}`,
      // A public route: no cookies needed.
      { credentials: 'omit' },
      fetchImpl,
    ),
  );
  const [lost] = [...failed].sort(([a], [b]) => (a < b ? -1 : 1));
  return lost ? { failed: `${lost[0]} couldn’t be read (${lost[1]}).` } : { files };
}

/**
 * A reader over fetch: the response's text, or an error with the server's
 * message. `url` builds the address for a hash.
 */
export function fetchReader(
  url: (sha256: string) => string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): (sha256: string) => Promise<string> {
  return async (sha256) => {
    const response = await fetchImpl(url(sha256), init);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return response.text();
  };
}
