// Workspace snapshots: the rendered SVG of a workspace plus the exact code
// that drew it, saved from the playground. User-facing contract:
// docs/snapshots.md. Design: project-docs/snapshots/primer.md.
//
// Storage:
//   D1 `snapshots` (migrations/0003_snapshots.sql) — metadata, per-workspace
//     sequence number `n`, and the per-account quota count.
//   R2 `THUMBNAILS` bucket — snapshots/{workspaceId}/{snapshotId}/
//     image.svg · code.pathogen · card.png
//
// Access: every route needs a signed-in session (anonymous X-User-Id
// workspaces can't take snapshots) and is owner-only. Snapshots are deleted
// with their workspace — see deleteSnapshotsForWorkspace, called from
// deleteWorkspace. (A future account-deletion path must call it for every
// workspace the account owns.)
//
// Both state-changing POSTs require the X-Pathogen-Snapshot header; PUT and
// DELETE are preflighted by the browser anyway. Like every handler in
// router.ts, responses here are CORS-naked; the Worker entry point applies
// the CORS policy.

import { getSessionUserId, readSessionTokenFromRequest } from '../auth/session.js';
import type { Env, Workspace } from './types.js';
import { errorResponse, generateNanoId, hashContent, jsonResponse, slugify } from './utils.js';

export const SNAPSHOT_LIMITS = {
  /** Snapshots per account, across all workspaces. */
  perUser: 500,
  /** Bytes of SVG per snapshot (same cap as the approval SVG). */
  svgBytes: 12 * 1024 * 1024,
  /** Bytes of Pathogen source per snapshot. */
  codeBytes: 1024 * 1024,
  /** Bytes of the PNG card thumbnail. */
  cardBytes: 1024 * 1024,
  nameChars: 120,
  noteChars: 2000,
} as const;

/**
 * Header the playground must send on both POSTs. A custom header makes the
 * request non-simple, so the browser runs a CORS preflight and the origin
 * allowlist applies (a bare FormData or empty POST would skip it and rely on
 * SameSite alone, which any *.pathogen.studio sibling satisfies).
 */
export const SNAPSHOT_UPLOAD_HEADER = 'X-Pathogen-Snapshot';

// Multipart overhead allowance on top of the three files' caps, for the
// early Content-Length check.
const MULTIPART_SLACK_BYTES = 64 * 1024;
// R2 deletes take at most 1000 keys per call.
const R2_DELETE_BATCH = 1000;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface SnapshotRow {
  id: string;
  user_id: string;
  workspace_id: string;
  n: number;
  name: string;
  note: string;
  width: number | null;
  height: number | null;
  background: string | null;
  svg_bytes: number;
  code_bytes: number;
  seed: string | null;
  created_at: number;
}

export interface SnapshotJson {
  id: string;
  workspaceId: string;
  n: number;
  name: string;
  note: string;
  width: number | null;
  height: number | null;
  background: string | null;
  svgBytes: number;
  codeBytes: number;
  seed: string | null;
  createdAt: string;
}

const SELECT_COLUMNS =
  'id, user_id, workspace_id, n, name, note, width, height, background, svg_bytes, code_bytes, seed, created_at';

function toJson(row: SnapshotRow): SnapshotJson {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    n: row.n,
    name: row.name,
    note: row.note,
    width: row.width,
    height: row.height,
    background: row.background,
    svgBytes: row.svg_bytes,
    codeBytes: row.code_bytes,
    seed: row.seed,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const R2_FILES = {
  svg: { name: 'image.svg', contentType: 'image/svg+xml' },
  code: { name: 'code.pathogen', contentType: 'text/plain; charset=utf-8' },
  card: { name: 'card.png', contentType: 'image/png' },
} as const;
type R2FileKind = keyof typeof R2_FILES;
const R2_FILE_KINDS = Object.keys(R2_FILES) as R2FileKind[];

function workspacePrefix(workspaceId: string): string {
  return `snapshots/${workspaceId}/`;
}

function r2Key(workspaceId: string, snapshotId: string, kind: R2FileKind): string {
  return `${workspacePrefix(workspaceId)}${snapshotId}/${R2_FILES[kind].name}`;
}

function snapshotKeys(workspaceId: string, snapshotId: string): string[] {
  return R2_FILE_KINDS.map((kind) => r2Key(workspaceId, snapshotId, kind));
}

/** Delete keys in batches of up to 1000 (one subrequest per batch). */
async function deleteKeys(env: Env, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += R2_DELETE_BATCH) {
    await env.THUMBNAILS.delete(keys.slice(i, i + R2_DELETE_BATCH));
  }
}

function isMissingTable(err: unknown): boolean {
  return /no such table/i.test(err instanceof Error ? err.message : String(err));
}

function migrationMissing(): Response {
  return jsonResponse(
    { error: 'Snapshots are not set up on this server (D1 migration 0003 not applied)', code: 'snapshots-unavailable' },
    503,
  );
}

function isUniqueViolation(err: unknown): boolean {
  return /unique/i.test(err instanceof Error ? err.message : String(err));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFiniteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function sessionUserId(request: Request, env: Env): Promise<string | null> {
  const token = readSessionTokenFromRequest(request);
  if (!token || !env.USERS_DB) return null;
  try {
    return await getSessionUserId(env.USERS_DB, token);
  } catch {
    return null;
  }
}

function signInRequired(): Response {
  return jsonResponse({ error: 'Sign in to save snapshots', code: 'snapshot-sign-in-required' }, 401);
}

function missingUploadHeader(): Response {
  return errorResponse(`Missing ${SNAPSHOT_UPLOAD_HEADER} header`, 400);
}

async function readWorkspace(env: Env, id: string): Promise<Workspace | null> {
  const json = await env.WORKSPACES.get(`workspace:${id}`);
  return json ? (JSON.parse(json) as Workspace) : null;
}

async function readOwnedSnapshot(
  request: Request,
  env: Env,
  snapshotId: string,
): Promise<{ row: SnapshotRow } | { error: Response }> {
  const userId = await sessionUserId(request, env);
  if (!userId) return { error: signInRequired() };
  let row: SnapshotRow | null;
  try {
    row = await env.USERS_DB.prepare(`SELECT ${SELECT_COLUMNS} FROM snapshots WHERE id = ?`)
      .bind(snapshotId)
      .first<SnapshotRow>();
  } catch (err) {
    if (isMissingTable(err)) return { error: migrationMissing() };
    throw err;
  }
  // Same 404 for "missing" and "someone else's" so ids can't be probed.
  if (!row || row.user_id !== userId) return { error: errorResponse('Snapshot not found', 404) };
  return { row };
}

/**
 * Number of snapshots a workspace holds. 0 when D1 has no snapshots table
 * (local dev without migration 0003); any other D1 failure throws, so callers
 * never mistake an outage for "no snapshots".
 */
export async function countSnapshotsForWorkspace(env: Env, workspaceId: string): Promise<number> {
  if (!env.USERS_DB) return 0;
  try {
    const row = await env.USERS_DB.prepare('SELECT COUNT(*) AS c FROM snapshots WHERE workspace_id = ?')
      .bind(workspaceId)
      .first<{ c: number }>();
    return row?.c ?? 0;
  } catch (err) {
    if (isMissingTable(err)) return 0;
    throw err;
  }
}

/**
 * Cascade for deleteWorkspace: remove every snapshot file and row of the
 * workspace. Returns the number of rows deleted. Files go first and in
 * batches: a workspace at the 500 cap holds 1500 files, and one delete per
 * file would exceed the Worker's subrequest budget. When the bucket supports
 * listing, the whole snapshots/{workspaceId}/ prefix is swept, which also
 * removes files left behind by an earlier failed save. Throws on a D1
 * failure other than a missing table, so the workspace is never deleted with
 * its snapshots left behind.
 */
export async function deleteSnapshotsForWorkspace(env: Env, workspaceId: string): Promise<number> {
  if (!env.USERS_DB) return 0;
  let rows: { id: string }[];
  try {
    rows = (
      await env.USERS_DB.prepare('SELECT id FROM snapshots WHERE workspace_id = ?')
        .bind(workspaceId)
        .all<{ id: string }>()
    ).results;
  } catch (err) {
    if (isMissingTable(err)) return 0;
    throw err;
  }

  const keys = new Set(rows.flatMap((r) => snapshotKeys(workspaceId, r.id)));
  if (env.THUMBNAILS.list) {
    let cursor: string | undefined;
    do {
      const page = await env.THUMBNAILS.list({ prefix: workspacePrefix(workspaceId), cursor });
      for (const object of page.objects) keys.add(object.key);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  await deleteKeys(env, [...keys]);

  if (rows.length > 0) {
    await env.USERS_DB.prepare('DELETE FROM snapshots WHERE workspace_id = ?').bind(workspaceId).run();
  }
  return rows.length;
}

async function readUpload(file: FormDataEntryValue | null): Promise<Uint8Array | null> {
  if (!file || typeof file === 'string') return null;
  return new Uint8Array(await file.arrayBuffer());
}

function hasPngMagic(bytes: Uint8Array): boolean {
  return PNG_MAGIC.every((b, i) => bytes[i] === b);
}

// Accepts what the playground's capture produces: an <svg> root, optionally
// behind an XML prolog. A DOCTYPE, leading comment or BOM is rejected — the
// capture never emits one.
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart().toLowerCase();
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tooLarge(code: string, error: string, bytes: number, limit: number): Response {
  return jsonResponse({ error, code, bytes, limit }, 413);
}

function quotaReached(): Response {
  return jsonResponse(
    {
      error: `You've used all ${SNAPSHOT_LIMITS.perUser} snapshots. Delete some to make room.`,
      code: 'snapshot-quota-reached',
      limit: SNAPSHOT_LIMITS.perUser,
    },
    409,
  );
}

export const snapshotHandlers = {
  // POST /workspace/:id/snapshots — FormData { svg, code, card, meta(JSON) }.
  async create(request: Request, env: Env, workspaceId: string): Promise<Response> {
    if (request.headers.get(SNAPSHOT_UPLOAD_HEADER) !== '1') return missingUploadHeader();
    const userId = await sessionUserId(request, env);
    if (!userId) return signInRequired();

    // Reject before buffering the body when the declared size can't fit.
    const maxBody =
      SNAPSHOT_LIMITS.svgBytes + SNAPSHOT_LIMITS.codeBytes + SNAPSHOT_LIMITS.cardBytes + MULTIPART_SLACK_BYTES;
    const declared = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declared) && declared > maxBody) {
      return tooLarge(
        'snapshot-svg-too-large',
        `This upload is ${formatMb(declared)}. Snapshots are limited to ${formatMb(SNAPSHOT_LIMITS.svgBytes)}.`,
        declared,
        SNAPSHOT_LIMITS.svgBytes,
      );
    }

    const workspace = await readWorkspace(env, workspaceId);
    if (!workspace) return errorResponse('Workspace not found', 404);
    if (workspace.userId !== userId) return errorResponse('Access denied', 403);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorResponse('Expected multipart form data', 400);
    }

    const svg = await readUpload(form.get('svg'));
    const code = await readUpload(form.get('code'));
    const card = await readUpload(form.get('card'));
    if (!svg || !code || !card) return errorResponse('Missing svg, code or card', 400);

    if (svg.byteLength > SNAPSHOT_LIMITS.svgBytes) {
      return tooLarge(
        'snapshot-svg-too-large',
        `This render is ${formatMb(svg.byteLength)}. Snapshots are limited to ${formatMb(SNAPSHOT_LIMITS.svgBytes)}.`,
        svg.byteLength,
        SNAPSHOT_LIMITS.svgBytes,
      );
    }
    if (code.byteLength > SNAPSHOT_LIMITS.codeBytes) {
      return tooLarge(
        'snapshot-code-too-large',
        `This program is ${formatMb(code.byteLength)}. Snapshots can hold up to ${formatMb(SNAPSHOT_LIMITS.codeBytes)} of code.`,
        code.byteLength,
        SNAPSHOT_LIMITS.codeBytes,
      );
    }
    if (card.byteLength > SNAPSHOT_LIMITS.cardBytes) return errorResponse('Card image is too large', 413);
    if (!looksLikeSvg(svg)) return errorResponse('svg is not an SVG document', 400);
    if (!hasPngMagic(card)) return errorResponse('card is not a PNG image', 400);

    let meta: Record<string, unknown> = {};
    const rawMeta = form.get('meta');
    if (typeof rawMeta === 'string' && rawMeta) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawMeta);
      } catch {
        return errorResponse('meta is not valid JSON', 400);
      }
      if (!isPlainObject(parsed)) return errorResponse('meta must be a JSON object', 400);
      meta = parsed;
    }
    const requestedName = typeof meta.name === 'string' ? meta.name.trim() : '';
    const note = typeof meta.note === 'string' ? meta.note.trim() : '';
    if (requestedName.length > SNAPSHOT_LIMITS.nameChars) {
      return errorResponse(`Name is limited to ${SNAPSHOT_LIMITS.nameChars} characters`, 400);
    }
    if (note.length > SNAPSHOT_LIMITS.noteChars) {
      return errorResponse(`Note is limited to ${SNAPSHOT_LIMITS.noteChars} characters`, 400);
    }
    const background = typeof meta.background === 'string' ? meta.background.slice(0, 200) : null;

    // Early quota check so a full account doesn't upload files for nothing.
    // The INSERT below re-checks atomically, which is what actually holds
    // the cap when saves race.
    let used: { c: number } | null;
    try {
      used = await env.USERS_DB.prepare('SELECT COUNT(*) AS c FROM snapshots WHERE user_id = ?')
        .bind(userId)
        .first<{ c: number }>();
    } catch (err) {
      if (isMissingTable(err)) return migrationMissing();
      throw err;
    }
    if ((used?.c ?? 0) >= SNAPSHOT_LIMITS.perUser) return quotaReached();

    // Files first, row second: a failed insert leaves files we can delete,
    // whereas a row without files would list a broken snapshot.
    const id = generateNanoId();
    const files: Record<R2FileKind, Uint8Array> = { svg, code, card };
    await Promise.all(
      R2_FILE_KINDS.map((kind) =>
        // readUpload's Uint8Array owns its whole buffer, so .buffer is exactly the file.
        env.THUMBNAILS.put(r2Key(workspaceId, id, kind), files[kind].buffer as ArrayBuffer, {
          httpMetadata: { contentType: R2_FILES[kind].contentType },
        }),
      ),
    );
    const cleanUp = async (): Promise<void> => deleteKeys(env, snapshotKeys(workspaceId, id));

    const createdAt = Date.now();
    // n = highest number in this workspace + 1. Two saves racing for the same
    // n hit UNIQUE(workspace_id, n); retry with a fresh read. The INSERT only
    // writes while the account is under the cap (0 changes = quota reached).
    let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      try {
        const max = await env.USERS_DB.prepare('SELECT MAX(n) AS m FROM snapshots WHERE workspace_id = ?')
          .bind(workspaceId)
          .first<{ m: number | null }>();
        const n = (max?.m ?? 0) + 1;
        const name = requestedName || `${workspace.name} #${n}`;
        const result = await env.USERS_DB.prepare(
          `INSERT INTO snapshots (${SELECT_COLUMNS})
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE (SELECT COUNT(*) FROM snapshots WHERE user_id = ?) < ?`,
        )
          .bind(
            id,
            userId,
            workspaceId,
            n,
            name,
            note,
            parseFiniteOrNull(meta.width),
            parseFiniteOrNull(meta.height),
            background,
            svg.byteLength,
            code.byteLength,
            null,
            createdAt,
            userId,
            SNAPSHOT_LIMITS.perUser,
          )
          .run();
        if (result.meta.changes === 0) {
          await cleanUp();
          return quotaReached();
        }
        inserted = true;
      } catch (err) {
        if (isUniqueViolation(err)) continue;
        await cleanUp();
        throw err;
      }
    }
    if (!inserted) {
      await cleanUp();
      return errorResponse('Could not assign a snapshot number; try again', 409);
    }

    // The workspace may have been deleted while this save was in flight; its
    // cascade could have run before our row existed. Undo rather than leave
    // a snapshot nobody can reach that still counts against the quota.
    if (!(await readWorkspace(env, workspaceId))) {
      await env.USERS_DB.prepare('DELETE FROM snapshots WHERE id = ?').bind(id).run();
      await cleanUp();
      return errorResponse('Workspace not found', 404);
    }

    const count = await countSnapshotsForWorkspace(env, workspaceId);
    const row = await env.USERS_DB.prepare(`SELECT ${SELECT_COLUMNS} FROM snapshots WHERE id = ?`)
      .bind(id)
      .first<SnapshotRow>();
    return jsonResponse({ snapshot: toJson(row!), count }, 201);
  },

  // GET /workspace/:id/snapshots — every snapshot of the workspace, newest first.
  async list(request: Request, env: Env, workspaceId: string): Promise<Response> {
    const userId = await sessionUserId(request, env);
    if (!userId) return signInRequired();
    const workspace = await readWorkspace(env, workspaceId);
    if (!workspace) return errorResponse('Workspace not found', 404);
    if (workspace.userId !== userId) return errorResponse('Access denied', 403);

    try {
      const { results } = await env.USERS_DB.prepare(
        `SELECT ${SELECT_COLUMNS} FROM snapshots WHERE workspace_id = ? ORDER BY n DESC`,
      )
        .bind(workspaceId)
        .all<SnapshotRow>();
      return jsonResponse({ snapshots: results.map(toJson), count: results.length });
    } catch (err) {
      if (isMissingTable(err)) return migrationMissing();
      throw err;
    }
  },

  // GET /snapshot/:sid — metadata.
  async get(request: Request, env: Env, snapshotId: string): Promise<Response> {
    const found = await readOwnedSnapshot(request, env, snapshotId);
    if ('error' in found) return found.error;
    return jsonResponse(toJson(found.row));
  },

  // GET /snapshot/:sid/(svg|code|card) — the stored files.
  async getFile(request: Request, env: Env, snapshotId: string, kind: string): Promise<Response> {
    if (!(kind in R2_FILES)) return errorResponse('Not found', 404);
    const found = await readOwnedSnapshot(request, env, snapshotId);
    if ('error' in found) return found.error;
    const fileKind = kind as R2FileKind;
    const object = await env.THUMBNAILS.get(r2Key(found.row.workspace_id, snapshotId, fileKind));
    if (!object) return errorResponse('Snapshot file not found', 404);

    const headers: Record<string, string> = {
      'Content-Type': R2_FILES[fileKind].contentType,
      // Owner-only content: never cache in shared caches. Files never change
      // after capture, so the owner's browser may keep them.
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    };
    if (fileKind === 'svg') {
      // User-derived SVG served from the API origin. The server does not
      // sanitize it, so block script execution if it's ever opened directly.
      headers['Content-Security-Policy'] = "script-src 'none'; sandbox";
    }
    return new Response(object.body, { headers });
  },

  // PUT /snapshot/:sid — { name?, note? }.
  async update(request: Request, env: Env, snapshotId: string): Promise<Response> {
    const found = await readOwnedSnapshot(request, env, snapshotId);
    if ('error' in found) return found.error;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Expected a JSON body', 400);
    }
    if (!isPlainObject(body)) return errorResponse('Expected a JSON object', 400);
    let { name, note } = found.row;
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) return errorResponse('Name must not be empty', 400);
      name = body.name.trim();
      if (name.length > SNAPSHOT_LIMITS.nameChars) {
        return errorResponse(`Name is limited to ${SNAPSHOT_LIMITS.nameChars} characters`, 400);
      }
    }
    if (body.note !== undefined) {
      if (typeof body.note !== 'string') return errorResponse('Note must be text', 400);
      note = body.note.trim();
      if (note.length > SNAPSHOT_LIMITS.noteChars) {
        return errorResponse(`Note is limited to ${SNAPSHOT_LIMITS.noteChars} characters`, 400);
      }
    }
    await env.USERS_DB.prepare('UPDATE snapshots SET name = ?, note = ? WHERE id = ?')
      .bind(name, note, snapshotId)
      .run();
    return jsonResponse(toJson({ ...found.row, name, note }));
  },

  // DELETE /snapshot/:sid — files first, so a failure leaves a retryable row
  // rather than orphaned files.
  async remove(request: Request, env: Env, snapshotId: string): Promise<Response> {
    const found = await readOwnedSnapshot(request, env, snapshotId);
    if ('error' in found) return found.error;
    await deleteKeys(env, snapshotKeys(found.row.workspace_id, snapshotId));
    await env.USERS_DB.prepare('DELETE FROM snapshots WHERE id = ?').bind(snapshotId).run();
    const count = await countSnapshotsForWorkspace(env, found.row.workspace_id);
    return jsonResponse({ success: true, count });
  },

  // POST /snapshot/:sid/workspace — new workspace from the snapshot's code.
  async startWorkspace(request: Request, env: Env, snapshotId: string): Promise<Response> {
    if (request.headers.get(SNAPSHOT_UPLOAD_HEADER) !== '1') return missingUploadHeader();
    const found = await readOwnedSnapshot(request, env, snapshotId);
    if ('error' in found) return found.error;
    const { row } = found;
    const source = await readWorkspace(env, row.workspace_id);
    if (!source) return errorResponse('Workspace not found', 404);
    const object = await env.THUMBNAILS.get(r2Key(row.workspace_id, row.id, 'code'));
    if (!object) return errorResponse('Snapshot code not found', 404);
    const code = await new Response(object.body).text();

    // "<workspace> — <snapshot name>", unless the snapshot name already
    // starts with the workspace name (the default "<workspace> #n").
    const name = source.name && !row.name.startsWith(source.name) ? `${source.name} — ${row.name}` : row.name;
    const id = generateNanoId();
    const now = new Date().toISOString();
    const workspace: Workspace = {
      id,
      slug: slugify(name),
      userId: row.user_id,
      name,
      description: '',
      code,
      isPublic: false,
      preferences: source.preferences ?? {},
      createdAt: now,
      updatedAt: now,
      contentHash: await hashContent(code),
      rev: 0,
      thumbnailAt: null,
      manualThumbnailAt: null,
      autoThumbnailAt: null,
    };
    await env.WORKSPACES.put(`workspace:${id}`, JSON.stringify(workspace));
    const idsJson = await env.WORKSPACES.get(`user:${row.user_id}:workspaces`);
    const ids: string[] = idsJson ? JSON.parse(idsJson) : [];
    ids.unshift(id);
    await env.WORKSPACES.put(`user:${row.user_id}:workspaces`, JSON.stringify(ids));
    return jsonResponse({ ...workspace, publicationState: 'unpublished' }, 201);
  },
};

/** Route snapshot paths; returns null when the path isn't a snapshot route. */
export async function routeSnapshotRequest(request: Request, env: Env, apiPath: string): Promise<Response | null> {
  const method = request.method;

  const wsMatch = apiPath.match(/^\/workspace\/([^/]+)\/snapshots$/);
  if (wsMatch) {
    if (method === 'POST') return snapshotHandlers.create(request, env, wsMatch[1]);
    if (method === 'GET') return snapshotHandlers.list(request, env, wsMatch[1]);
    return null;
  }

  const fileMatch = apiPath.match(/^\/snapshot\/([^/]+)\/(svg|code|card)$/);
  if (fileMatch && method === 'GET') return snapshotHandlers.getFile(request, env, fileMatch[1], fileMatch[2]);

  const startMatch = apiPath.match(/^\/snapshot\/([^/]+)\/workspace$/);
  if (startMatch && method === 'POST') return snapshotHandlers.startWorkspace(request, env, startMatch[1]);

  const snapMatch = apiPath.match(/^\/snapshot\/([^/]+)$/);
  if (snapMatch) {
    if (method === 'GET') return snapshotHandlers.get(request, env, snapMatch[1]);
    if (method === 'PUT') return snapshotHandlers.update(request, env, snapMatch[1]);
    if (method === 'DELETE') return snapshotHandlers.remove(request, env, snapMatch[1]);
  }
  return null;
}
