// Workspace snapshots API (docs/snapshots.md, website/api/snapshots.ts).
//
// Unlike the other API suites, D1 here is a real SQLite database (node:sqlite)
// built from the actual migration files, so the snapshot SQL — COUNT/MAX,
// UNIQUE(workspace_id, n), ordering, cascades — runs for real rather than
// against a pattern-matching fake.
//
// Contracts covered:
//   - signed-in session required (anonymous X-User-Id owners are refused),
//     owner-only access, and the X-Pathogen-Snapshot upload header
//   - per-workspace numbering (#1, #2…, max+1, retry on a UNIQUE race),
//     default name "<workspace> #n"
//   - limits: 12 MB SVG, 1 MB code, PNG card check, 500 per account
//   - files served with the right type; SVG with script-blocking CSP
//   - rename / note, delete (row + R2 files), workspace delete cascade
//   - start a new workspace from a snapshot's code

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { handleApiRequest } from '../../website/api/router';
import { SNAPSHOT_LIMITS } from '../../website/api/snapshots';
import type {
  D1Database,
  D1PreparedStatement,
  Env,
  KVNamespace,
  R2Bucket,
  R2Object,
  Workspace,
} from '../../website/api/types';

import { MemoryKV } from '../auth/helpers';

const sqlite = await import('node:sqlite').catch(() => null);

type Sqlite = InstanceType<NonNullable<typeof sqlite>['DatabaseSync']>;

// D1 adapter over node:sqlite. D1 is SQLite, so the same SQL runs unchanged.
class SqliteD1 implements D1Database {
  constructor(readonly db: Sqlite) {}

  // Test hook: rewrite the next matching query's result (simulates a race).
  intercept: ((sql: string, args: unknown[]) => unknown) | null = null;

  prepare(query: string): D1PreparedStatement {
    return new SqliteStatement(this, query, []);
  }

  async exec(query: string): Promise<unknown> {
    this.db.exec(query);
    return null;
  }
}

class SqliteStatement implements D1PreparedStatement {
  constructor(
    private d1: SqliteD1,
    private query: string,
    private args: unknown[],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqliteStatement(this.d1, this.query, values);
  }

  async first<T>(): Promise<T | null> {
    const hooked = this.d1.intercept?.(this.query, this.args);
    if (hooked !== undefined) return hooked as T;
    const row = this.d1.db.prepare(this.query).get(...(this.args as never[]));
    return (row ? { ...row } : null) as T | null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const rows = this.d1.db.prepare(this.query).all(...(this.args as never[]));
    return { results: rows.map((r) => ({ ...r })) as T[] };
  }

  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    const info = this.d1.db.prepare(this.query).run(...(this.args as never[]));
    return { success: true, meta: { changes: Number(info.changes) } };
  }
}

class MemoryR2 implements R2Bucket {
  private store = new Map<string, Uint8Array>();

  async get(key: string): Promise<R2Object | null> {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return { body: new Response(value).body! };
  }

  async put(key: string, value: ReadableStream | ArrayBuffer | string): Promise<void> {
    if (this.failPutsFor && key.endsWith(this.failPutsFor)) throw new Error('R2 put failed');
    if (typeof value === 'string') this.store.set(key, new TextEncoder().encode(value));
    else if (value instanceof ArrayBuffer) this.store.set(key, new Uint8Array(value.slice(0)));
    else this.store.set(key, new Uint8Array(await new Response(value).arrayBuffer()));
  }

  // Mirrors the real binding: one call may delete up to 1000 keys, and list()
  // pages by prefix. Calls are counted so tests can check the subrequest cost.
  deleteCalls = 0;
  listCalls = 0;
  failPutsFor: string | null = null;

  async delete(keys: string | string[]): Promise<void> {
    this.deleteCalls++;
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length > 1000) throw new Error('R2: at most 1000 keys per delete');
    for (const key of list) this.store.delete(key);
  }

  async list(options: { prefix?: string; cursor?: string; limit?: number } = {}) {
    this.listCalls++;
    const all = this.keys(options.prefix ?? '');
    const start = Number(options.cursor ?? 0);
    const page = all.slice(start, start + (options.limit ?? 1000));
    const next = start + page.length;
    return {
      objects: page.map((key) => ({ key })),
      truncated: next < all.length,
      cursor: next < all.length ? String(next) : undefined,
    };
  }

  keys(prefix = ''): string[] {
    return [...this.store.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  text(key: string): string | undefined {
    const v = this.store.get(key);
    return v && new TextDecoder().decode(v);
  }
}

const MIGRATIONS_DIR = join(__dirname, '../../migrations');
const BASE = 'https://api.pathogen.studio';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><circle cx="200" cy="200" r="50"/></svg>';
const CODE = 'define ViewBox(0, 0, 400, 400);\ncircle(200, 200, randomRange(20, 80));\n';

interface Ctx {
  env: Env;
  kv: MemoryKV;
  r2: MemoryR2;
  d1: SqliteD1;
}

function makeEnv(): Ctx {
  const db = new sqlite!.DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  const d1 = new SqliteD1(db);
  const kv = new MemoryKV();
  const r2 = new MemoryR2();
  const env = {
    WORKSPACES: kv,
    THUMBNAILS: r2,
    USERS_DB: d1,
  } as Env;
  return { env, kv, r2, d1 };
}

function signIn(ctx: Ctx, userId: string): string {
  const token = `tok-${userId}`;
  const now = Date.now();
  ctx.d1.db
    .prepare(
      'INSERT INTO users (id, email, email_lower, handle, display_name, created_at, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(userId, `${userId}@x.test`, `${userId}@x.test`, userId, userId, now, now);
  ctx.d1.db
    .prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, now, now + 3_600_000);
  return `pathogen_session=${token}`;
}

async function call(
  ctx: Ctx,
  method: string,
  path: string,
  init: { cookie?: string; headers?: Record<string, string>; body?: BodyInit } = {},
) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.cookie) headers.Cookie = init.cookie;
  return handleApiRequest(new Request(BASE + path, { method, headers, body: init.body }), ctx.env, path);
}

async function createWorkspace(ctx: Ctx, cookie: string, name = 'Scatter Rings'): Promise<string> {
  const res = await call(ctx, 'POST', '/workspace', {
    cookie,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code: CODE, preferences: { background: '#ffffff' } }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

function snapshotForm(
  over: { svg?: BlobPart; code?: BlobPart; card?: BlobPart; meta?: Record<string, unknown> } = {},
): FormData {
  const form = new FormData();
  form.append('svg', new Blob([over.svg ?? SVG], { type: 'image/svg+xml' }), 'image.svg');
  form.append('code', new Blob([over.code ?? CODE], { type: 'text/plain' }), 'code.pathogen');
  form.append('card', new Blob([over.card ?? PNG], { type: 'image/png' }), 'card.png');
  form.append('meta', JSON.stringify(over.meta ?? { width: 400, height: 400, background: '#ffffff' }));
  return form;
}

async function postSnapshot(
  ctx: Ctx,
  cookie: string | undefined,
  wsId: string,
  form = snapshotForm(),
  headers: Record<string, string> = { 'X-Pathogen-Snapshot': '1' },
) {
  return call(ctx, 'POST', `/workspace/${wsId}/snapshots`, { cookie, headers, body: form });
}

interface SnapshotBody {
  snapshot: {
    id: string;
    n: number;
    name: string;
    note: string;
    workspaceId: string;
    svgBytes: number;
    codeBytes: number;
    width: number;
    height: number;
    background: string;
  };
  count: number;
}

describe.skipIf(!sqlite)('snapshots API', () => {
  let ctx: Ctx;
  let alice: string;
  let ws: string;

  beforeEach(async () => {
    ctx = makeEnv();
    alice = signIn(ctx, 'alice');
    ws = await createWorkspace(ctx, alice);
  });

  describe('access', () => {
    it('refuses a request with no session', async () => {
      const res = await postSnapshot(ctx, undefined, ws);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: 'snapshot-sign-in-required' });
    });

    it('refuses an anonymous X-User-Id owner even for their own workspace', async () => {
      const res = await call(ctx, 'POST', '/workspace', {
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'anon-123' },
        body: JSON.stringify({ name: 'Anon', code: CODE }),
      });
      const anonWs = ((await res.json()) as { id: string }).id;
      const snap = await call(ctx, 'POST', `/workspace/${anonWs}/snapshots`, {
        headers: { 'X-User-Id': 'anon-123', 'X-Pathogen-Snapshot': '1' },
        body: snapshotForm(),
      });
      expect(snap.status).toBe(401);
    });

    it('requires the X-Pathogen-Snapshot header so the upload is preflighted', async () => {
      const res = await postSnapshot(ctx, alice, ws, snapshotForm(), {});
      expect(res.status).toBe(400);
      expect(ctx.r2.keys('snapshots/')).toEqual([]);
    });

    it("refuses snapshots of someone else's workspace", async () => {
      const bob = signIn(ctx, 'bob');
      const res = await postSnapshot(ctx, bob, ws);
      expect(res.status).toBe(403);
    });

    it("hides another user's snapshot behind the same 404 as a missing one", async () => {
      const created = (await (await postSnapshot(ctx, alice, ws)).json()) as SnapshotBody;
      const bob = signIn(ctx, 'bob');
      for (const path of [
        `/snapshot/${created.snapshot.id}`,
        `/snapshot/${created.snapshot.id}/svg`,
        '/snapshot/nope',
      ]) {
        const res = await call(ctx, 'GET', path, { cookie: bob });
        expect(res.status).toBe(404);
      }
      expect((await call(ctx, 'DELETE', `/snapshot/${created.snapshot.id}`, { cookie: bob })).status).toBe(404);
      expect((await call(ctx, 'GET', `/workspace/${ws}/snapshots`, { cookie: bob })).status).toBe(403);
    });
  });

  describe('create', () => {
    it('stores the three files and a row, numbered #1 with the default name', async () => {
      const res = await postSnapshot(ctx, alice, ws);
      expect(res.status).toBe(201);
      const body = (await res.json()) as SnapshotBody;
      expect(body.count).toBe(1);
      expect(body.snapshot).toMatchObject({
        workspaceId: ws,
        n: 1,
        name: 'Scatter Rings #1',
        note: '',
        width: 400,
        height: 400,
        background: '#ffffff',
        svgBytes: new TextEncoder().encode(SVG).byteLength,
        codeBytes: new TextEncoder().encode(CODE).byteLength,
      });
      const prefix = `snapshots/${ws}/${body.snapshot.id}/`;
      expect(ctx.r2.keys(prefix)).toEqual([`${prefix}card.png`, `${prefix}code.pathogen`, `${prefix}image.svg`]);
      expect(ctx.r2.text(`${prefix}image.svg`)).toBe(SVG);
      expect(ctx.r2.text(`${prefix}code.pathogen`)).toBe(CODE);
    });

    it('keeps a supplied name and note, and numbers the next snapshot #2', async () => {
      await postSnapshot(ctx, alice, ws);
      const res = await postSnapshot(
        ctx,
        alice,
        ws,
        snapshotForm({ meta: { name: '  dense bottom-left ', note: 'keep this one' } }),
      );
      const body = (await res.json()) as SnapshotBody;
      expect(body.snapshot).toMatchObject({ n: 2, name: 'dense bottom-left', note: 'keep this one' });
      expect(body.count).toBe(2);
    });

    it('numbers per workspace, not per account', async () => {
      const other = await createWorkspace(ctx, alice, 'Tide Lines');
      await postSnapshot(ctx, alice, ws);
      await postSnapshot(ctx, alice, ws);
      const res = await postSnapshot(ctx, alice, other);
      expect(((await res.json()) as SnapshotBody).snapshot).toMatchObject({ n: 1, name: 'Tide Lines #1' });
    });

    it('takes the highest number + 1, so deleting an older one never reuses a number', async () => {
      const first = (await (await postSnapshot(ctx, alice, ws)).json()) as SnapshotBody;
      await postSnapshot(ctx, alice, ws);
      await call(ctx, 'DELETE', `/snapshot/${first.snapshot.id}`, { cookie: alice });
      const next = (await (await postSnapshot(ctx, alice, ws)).json()) as SnapshotBody;
      expect(next.snapshot.n).toBe(3);
    });

    it('retries when a concurrent save takes the same number', async () => {
      await postSnapshot(ctx, alice, ws); // #1 exists
      let maxReads = 0;
      ctx.d1.intercept = (sql) => {
        if (!sql.startsWith('SELECT MAX(n)')) return undefined;
        maxReads++;
        return maxReads === 1 ? { m: 0 } : undefined; // first read is stale: pretends #1 is free
      };
      const res = await postSnapshot(ctx, alice, ws);
      expect(res.status).toBe(201);
      expect(((await res.json()) as SnapshotBody).snapshot.n).toBe(2);
      expect(maxReads).toBe(2); // the stale insert hit UNIQUE and the handler re-read
    });
  });

  describe('limits', () => {
    it('rejects an SVG over 12 MB with a size message and stores nothing', async () => {
      const big = `<svg xmlns="http://www.w3.org/2000/svg">${' '.repeat(SNAPSHOT_LIMITS.svgBytes)}</svg>`;
      const res = await postSnapshot(ctx, alice, ws, snapshotForm({ svg: big }));
      expect(res.status).toBe(413);
      expect(await res.json()).toMatchObject({ code: 'snapshot-svg-too-large', limit: 12 * 1024 * 1024 });
      expect(ctx.r2.keys('snapshots/')).toEqual([]);
    });

    it('rejects more than 1 MB of code', async () => {
      const res = await postSnapshot(ctx, alice, ws, snapshotForm({ code: 'x'.repeat(SNAPSHOT_LIMITS.codeBytes + 1) }));
      expect(res.status).toBe(413);
      expect(await res.json()).toMatchObject({ code: 'snapshot-code-too-large' });
    });

    it('accepts exactly 1 MB of code', async () => {
      const res = await postSnapshot(ctx, alice, ws, snapshotForm({ code: 'x'.repeat(SNAPSHOT_LIMITS.codeBytes) }));
      expect(res.status).toBe(201);
    });

    it('rejects a card that is not a PNG and an svg that is not SVG', async () => {
      expect((await postSnapshot(ctx, alice, ws, snapshotForm({ card: 'GIF89a' }))).status).toBe(400);
      expect(
        (await postSnapshot(ctx, alice, ws, snapshotForm({ svg: '<html><script>x</script></html>' }))).status,
      ).toBe(400);
    });

    it('accepts an SVG with an XML prolog', async () => {
      const res = await postSnapshot(ctx, alice, ws, snapshotForm({ svg: `<?xml version="1.0"?>\n${SVG}` }));
      expect(res.status).toBe(201);
    });

    it('refuses the 501st snapshot on the account, counting every workspace', async () => {
      const insert = ctx.d1.db.prepare(
        'INSERT INTO snapshots (id, user_id, workspace_id, n, name, note, svg_bytes, code_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (let i = 1; i <= SNAPSHOT_LIMITS.perUser; i++)
        insert.run(`seed${i}`, 'alice', `other-ws-${i % 7}`, i, `s${i}`, '', 1, 1, i);
      const res = await postSnapshot(ctx, alice, ws);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: 'snapshot-quota-reached', limit: 500 });

      ctx.d1.db.prepare("DELETE FROM snapshots WHERE id = 'seed1'").run();
      expect((await postSnapshot(ctx, alice, ws)).status).toBe(201);
    });
  });

  describe('read', () => {
    it('lists newest first with the count, and the workspace reports its count to the owner', async () => {
      await postSnapshot(ctx, alice, ws, snapshotForm({ meta: { name: 'one' } }));
      await postSnapshot(ctx, alice, ws, snapshotForm({ meta: { name: 'two' } }));
      const list = (await (await call(ctx, 'GET', `/workspace/${ws}/snapshots`, { cookie: alice })).json()) as {
        snapshots: { n: number; name: string }[];
        count: number;
      };
      expect(list.count).toBe(2);
      expect(list.snapshots.map((s) => [s.n, s.name])).toEqual([
        [2, 'two'],
        [1, 'one'],
      ]);

      const wsRes = (await (await call(ctx, 'GET', `/workspace/${ws}`, { cookie: alice })).json()) as {
        snapshotCount?: number;
      };
      expect(wsRes.snapshotCount).toBe(2);
    });

    it('serves the SVG with its type, nosniff, private caching and a script-blocking CSP', async () => {
      const { snapshot } = (await (await postSnapshot(ctx, alice, ws)).json()) as SnapshotBody;
      const res = await call(ctx, 'GET', `/snapshot/${snapshot.id}/svg`, { cookie: alice });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
      expect(res.headers.get('Content-Security-Policy')).toBe("script-src 'none'; sandbox");
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Cache-Control')).toBe('private, max-age=86400');
      expect(await res.text()).toBe(SVG);

      const code = await call(ctx, 'GET', `/snapshot/${snapshot.id}/code`, { cookie: alice });
      expect(code.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
      expect(await code.text()).toBe(CODE);

      const card = await call(ctx, 'GET', `/snapshot/${snapshot.id}/card`, { cookie: alice });
      expect(card.headers.get('Content-Type')).toBe('image/png');
      expect(new Uint8Array(await card.arrayBuffer())).toEqual(PNG);
    });
  });

  describe('update and delete', () => {
    it('renames and edits the note; an empty name is refused', async () => {
      const { snapshot } = (await (await postSnapshot(ctx, alice, ws)).json()) as SnapshotBody;
      const put = async (body: unknown) =>
        call(ctx, 'PUT', `/snapshot/${snapshot.id}`, {
          cookie: alice,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

      const renamed = await put({ name: 'sparse', note: 'print candidate' });
      expect(renamed.status).toBe(200);
      expect(await renamed.json()).toMatchObject({ name: 'sparse', note: 'print candidate', n: 1 });
      expect((await put({ name: '   ' })).status).toBe(400);
      const noteOnly = await put({ note: '' });
      expect(await noteOnly.json()).toMatchObject({ name: 'sparse', note: '' });
    });

    it('deletes the row and all three files', async () => {
      const { snapshot } = (await (await postSnapshot(ctx, alice, ws)).json()) as SnapshotBody;
      const res = await call(ctx, 'DELETE', `/snapshot/${snapshot.id}`, { cookie: alice });
      expect(await res.json()).toEqual({ success: true, count: 0 });
      expect(ctx.r2.keys('snapshots/')).toEqual([]);
      expect((await call(ctx, 'GET', `/snapshot/${snapshot.id}`, { cookie: alice })).status).toBe(404);
    });

    it("deleting a workspace deletes its snapshots and files, and leaves other workspaces' alone", async () => {
      const other = await createWorkspace(ctx, alice, 'Tide Lines');
      await postSnapshot(ctx, alice, ws);
      await postSnapshot(ctx, alice, ws);
      const kept = (await (await postSnapshot(ctx, alice, other)).json()) as SnapshotBody;

      const res = await call(ctx, 'DELETE', `/workspace/${ws}`, { cookie: alice });
      expect(await res.json()).toEqual({ success: true, deletedSnapshots: 2 });
      expect(ctx.r2.keys(`snapshots/${ws}/`)).toEqual([]);
      const remaining = ctx.d1.db
        .prepare('SELECT id FROM snapshots')
        .all()
        .map((r) => r.id);
      expect(remaining).toEqual([kept.snapshot.id]);
      expect(ctx.r2.keys(`snapshots/${other}/`)).toHaveLength(3);
    });

    it('copying a workspace does not copy its snapshots', async () => {
      await postSnapshot(ctx, alice, ws);
      const copy = await call(ctx, 'POST', `/workspace/${ws}/copy`, {
        cookie: alice,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const copyId = ((await copy.json()) as { id: string }).id;
      const list = (await (await call(ctx, 'GET', `/workspace/${copyId}/snapshots`, { cookie: alice })).json()) as {
        count: number;
      };
      expect(list.count).toBe(0);
    });
  });

  describe('start new workspace', () => {
    async function start(snapshotId: string): Promise<Workspace> {
      const res = await call(ctx, 'POST', `/snapshot/${snapshotId}/workspace`, {
        cookie: alice,
        headers: { 'X-Pathogen-Snapshot': '1' },
      });
      expect(res.status).toBe(201);
      return (await res.json()) as Workspace;
    }

    it("creates a private workspace with the snapshot's code, first in the owner's list", async () => {
      const edited = 'define ViewBox(0, 0, 400, 400);\nrect(0, 0, 10, 10);\n';
      const { snapshot } = (await (
        await postSnapshot(ctx, alice, ws, snapshotForm({ code: edited, meta: { name: 'dense bottom-left' } }))
      ).json()) as SnapshotBody;
      const created = await start(snapshot.id);
      expect(created).toMatchObject({
        name: 'Scatter Rings — dense bottom-left',
        code: edited,
        isPublic: false,
        userId: 'alice',
        rev: 0,
      });
      expect(created.preferences).toEqual({ background: '#ffffff' });

      const ids = JSON.parse((await ctx.kv.get('user:alice:workspaces'))!) as string[];
      expect(ids[0]).toBe(created.id);
      // The snapshot stays with the original workspace.
      const list = (await (await call(ctx, 'GET', `/workspace/${ws}/snapshots`, { cookie: alice })).json()) as {
        count: number;
      };
      expect(list.count).toBe(1);
    });

    it('does not repeat the workspace name when the snapshot kept its default name', async () => {
      const { snapshot } = (await (await postSnapshot(ctx, alice, ws)).json()) as SnapshotBody;
      expect((await start(snapshot.id)).name).toBe('Scatter Rings #1');
    });
  });
  describe('review hardening', () => {
    it("rejects another user's PUT, DELETE, file read and start-workspace with 404", async () => {
      const { snapshot } = (await (await postSnapshot(ctx, alice, ws)).json()) as SnapshotBody;
      const bob = signIn(ctx, 'bob');
      const json = { 'Content-Type': 'application/json' };
      expect(
        (await call(ctx, 'PUT', `/snapshot/${snapshot.id}`, { cookie: bob, headers: json, body: '{"name":"x"}' }))
          .status,
      ).toBe(404);
      expect((await call(ctx, 'DELETE', `/snapshot/${snapshot.id}`, { cookie: bob })).status).toBe(404);
      expect((await call(ctx, 'GET', `/snapshot/${snapshot.id}/code`, { cookie: bob })).status).toBe(404);
      expect(
        (
          await call(ctx, 'POST', `/snapshot/${snapshot.id}/workspace`, {
            cookie: bob,
            headers: { 'X-Pathogen-Snapshot': '1' },
          })
        ).status,
      ).toBe(404);
      // Nothing changed for the owner.
      const own = (await (await call(ctx, 'GET', `/snapshot/${snapshot.id}`, { cookie: alice })).json()) as {
        name: string;
      };
      expect(own.name).toBe('Scatter Rings #1');
    });

    it('requires the upload header on start-workspace too (no simple cross-site POST)', async () => {
      const { snapshot } = (await (await postSnapshot(ctx, alice, ws)).json()) as SnapshotBody;
      const res = await call(ctx, 'POST', `/snapshot/${snapshot.id}/workspace`, { cookie: alice });
      expect(res.status).toBe(400);
      expect(JSON.parse((await ctx.kv.get('user:alice:workspaces'))!)).toEqual([ws]);
    });

    it('answers 400, not 500, for non-object JSON in meta or a PUT body', async () => {
      for (const meta of ['null', '[1,2]', '"text"']) {
        const form = snapshotForm();
        form.set('meta', meta);
        expect((await postSnapshot(ctx, alice, ws, form)).status).toBe(400);
      }
      const { snapshot } = (await (await postSnapshot(ctx, alice, ws)).json()) as SnapshotBody;
      for (const body of ['null', '[]', 'not json']) {
        const res = await call(ctx, 'PUT', `/snapshot/${snapshot.id}`, {
          cookie: alice,
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        expect(res.status).toBe(400);
      }
    });

    it('rejects an oversized declared Content-Length before reading the body', async () => {
      const res = await handleApiRequest(
        new Request(`${BASE}/workspace/${ws}/snapshots`, {
          method: 'POST',
          headers: { Cookie: alice, 'X-Pathogen-Snapshot': '1', 'Content-Length': String(20 * 1024 * 1024) },
          body: 'x',
        }),
        ctx.env,
        `/workspace/${ws}/snapshots`,
      );
      expect(res.status).toBe(413);
    });

    it('holds the 500 cap when saves race (the insert itself checks the count)', async () => {
      const insert = ctx.d1.db.prepare(
        'INSERT INTO snapshots (id, user_id, workspace_id, n, name, note, svg_bytes, code_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (let i = 1; i < SNAPSHOT_LIMITS.perUser; i++)
        insert.run(`seed${i}`, 'alice', 'elsewhere', i, `s${i}`, '', 1, 1, i);
      // Every save sees the stale "499 used" from the early check, as racing
      // saves would; only the conditional INSERT can hold the cap.
      ctx.d1.intercept = (sql) =>
        sql.startsWith('SELECT COUNT(*) AS c FROM snapshots WHERE user_id') ? { c: 0 } : undefined;
      const results = await Promise.all([1, 2, 3, 4].map(async () => postSnapshot(ctx, alice, ws)));
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
      const total = ctx.d1.db.prepare("SELECT COUNT(*) AS c FROM snapshots WHERE user_id = 'alice'").get() as {
        c: number;
      };
      expect(total.c).toBe(SNAPSHOT_LIMITS.perUser);
      // Losers cleaned up their files: only the winner's three remain.
      expect(ctx.r2.keys(`snapshots/${ws}/`)).toHaveLength(3);
    });

    it('gives up after repeated number collisions and removes the uploaded files', async () => {
      await postSnapshot(ctx, alice, ws); // #1 exists
      ctx.d1.intercept = (sql) => (sql.startsWith('SELECT MAX(n)') ? { m: 0 } : undefined); // always stale
      const res = await postSnapshot(ctx, alice, ws);
      expect(res.status).toBe(409);
      expect(ctx.r2.keys(`snapshots/${ws}/`)).toHaveLength(3); // only #1's files
    });

    it('stores no row when an R2 upload fails', async () => {
      ctx.r2.failPutsFor = 'card.png';
      await expect(postSnapshot(ctx, alice, ws)).rejects.toThrow('R2 put failed');
      const rows = ctx.d1.db.prepare('SELECT COUNT(*) AS c FROM snapshots').get() as { c: number };
      expect(rows.c).toBe(0);
    });

    it('undoes a save whose workspace was deleted mid-flight', async () => {
      ctx.d1.intercept = (sql) => {
        if (sql.startsWith('SELECT MAX(n)')) void ctx.kv.delete(`workspace:${ws}`); // delete lands during the save
        return undefined;
      };
      const res = await postSnapshot(ctx, alice, ws);
      expect(res.status).toBe(404);
      const rows = ctx.d1.db.prepare('SELECT COUNT(*) AS c FROM snapshots').get() as { c: number };
      expect(rows.c).toBe(0);
      expect(ctx.r2.keys('snapshots/')).toEqual([]);
    });

    it('deletes a large workspace in batched R2 calls, sweeping stray files under its prefix', async () => {
      const insert = ctx.d1.db.prepare(
        'INSERT INTO snapshots (id, user_id, workspace_id, n, name, note, svg_bytes, code_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (let i = 1; i <= 400; i++) {
        insert.run(`big${i}`, 'alice', ws, i, `s${i}`, '', 1, 1, i);
        for (const file of ['image.svg', 'code.pathogen', 'card.png'])
          await ctx.r2.put(`snapshots/${ws}/big${i}/${file}`, 'x');
      }
      await ctx.r2.put(`snapshots/${ws}/stray-from-failed-save/image.svg`, 'x');
      ctx.r2.deleteCalls = 0;

      const res = await call(ctx, 'DELETE', `/workspace/${ws}`, { cookie: alice });
      expect(await res.json()).toEqual({ success: true, deletedSnapshots: 400 });
      expect(ctx.r2.keys('snapshots/')).toEqual([]);
      // 1201 keys → 2 batched deletes, not 1201 single ones. (deleteWorkspace's
      // own approval.svg cleanup adds one more.)
      expect(ctx.r2.deleteCalls).toBe(3);
    });

    it('answers 503 for list and create when the snapshots table is missing, and still loads the workspace', async () => {
      ctx.d1.db.exec('DROP TABLE snapshots');
      const list = await call(ctx, 'GET', `/workspace/${ws}/snapshots`, { cookie: alice });
      expect(list.status).toBe(503);
      expect(await list.json()).toMatchObject({ code: 'snapshots-unavailable' });
      expect((await postSnapshot(ctx, alice, ws)).status).toBe(503);
      expect(ctx.r2.keys('snapshots/')).toEqual([]);
      const wsRes = (await (await call(ctx, 'GET', `/workspace/${ws}`, { cookie: alice })).json()) as {
        snapshotCount?: number;
      };
      expect(wsRes.snapshotCount).toBe(0);
      expect((await call(ctx, 'DELETE', `/workspace/${ws}`, { cookie: alice })).status).toBe(200);
    });
  });
});
