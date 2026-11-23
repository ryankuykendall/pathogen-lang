// A workspace that holds files, through the API (storage step 3;
// project-docs/modules/48-storage-design-v2.md, 50-storage-decisions-and-plan.md).
// Records from before phase 2 (one `code` string) are seeded straight into KV,
// to check they're refused since the reader for them went (note 71).

import { describe, expect, it } from 'vitest';

import { MemoryR2 } from './memory-r2';
import { storedRecord, storedText } from './workspace-helpers';
import { listRereviewQueue } from '../../website/api/moderation';
import { handleApiRequest } from '../../website/api/router';
import { hashContent } from '../../website/api/utils';
import { contentHashOf, entryForText, OLD_SHAPE_MESSAGE } from '../../website/api/workspace-files';
import { COPY_MAX_FILES, copyStoredFiles } from '../../website/api/workspace-store';
import { MemoryKV } from '../auth/helpers';

import type { Env, KVNamespace } from '../../website/api/types';

const ADMIN_TOKEN = 'admin-secret';

function makeEnv(): { env: Env; kv: KVNamespace; r2: MemoryR2 } {
  const kv = new MemoryKV() as unknown as KVNamespace;
  const r2 = new MemoryR2();
  const env = {
    WORKSPACES: kv,
    THUMBNAILS: r2,
    USERS_DB: undefined as unknown as Env['USERS_DB'],
    ADMIN_TOKEN,
  } as Env;
  return { env, kv, r2 };
}

async function call(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
  userId = 'u1',
): Promise<{ status: number; data: Record<string, unknown>; headers: Headers }> {
  const res = await handleApiRequest(
    new Request(`https://api.pathogen.studio${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(userId ? { 'X-User-Id': userId } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    env,
    path.split('?')[0],
  );
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { text };
  }
  return { status: res.status, data, headers: res.headers };
}

const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';

async function createWithFiles(env: Env): Promise<string> {
  const res = await call(env, 'POST', '/workspace', {
    name: 'Gears',
    files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } },
    folders: ['examples'],
    entryPoints: ['main.pathogen'],
  });
  expect(res.status).toBe(201);
  return res.data.id as string;
}

/** A record saved before phase 2: one `code` string and the old hash. */
async function seedLegacy(
  kv: KVNamespace,
  id: string,
  code: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const now = '2026-10-01T00:00:00.000Z';
  await kv.put(
    `workspace:${id}`,
    JSON.stringify({
      id,
      slug: 'old',
      userId: 'u1',
      name: 'Old',
      description: '',
      code,
      isPublic: false,
      preferences: {},
      createdAt: now,
      updatedAt: now,
      contentHash: await hashContent(code),
      rev: 3,
      thumbnailAt: null,
      manualThumbnailAt: null,
      autoThumbnailAt: null,
      ...extra,
    }),
  );
  await kv.put('user:u1:workspaces', JSON.stringify([id]));
}

describe('creating and loading a workspace with files', () => {
  it('stores a manifest in KV and each file in R2 under the workspace', async () => {
    const { env, kv, r2 } = makeEnv();
    const id = await createWithFiles(env);
    const record = await storedRecord(kv, id);
    expect(record).not.toHaveProperty('code');
    expect(record.files).toEqual({
      'main.pathogen': await entryForText(MAIN),
      'parts/gears.pathogen': await entryForText(GEARS),
    });
    expect([record.folders, record.entryPoints]).toEqual([['examples'], ['main.pathogen']]);
    expect(record.contentHash).toBe(
      await contentHashOf({ files: record.files!, folders: ['examples'], entryPoints: ['main.pathogen'] }),
    );
    expect(await storedText(kv, r2, id, 'parts/gears.pathogen')).toBe(GEARS);
  });

  it('a load returns every file with its text, and no `code` for a workspace with several files', async () => {
    const { env, kv } = makeEnv();
    const id = await createWithFiles(env);
    const { data } = await call(env, 'GET', `/workspace/${id}`);
    expect(data.files).toEqual({
      'main.pathogen': { ...(await entryForText(MAIN)), text: MAIN },
      'parts/gears.pathogen': { ...(await entryForText(GEARS)), text: GEARS },
    });
    expect([data.folders, data.entryPoints, data.contentHash]).toEqual([
      ['examples'],
      ['main.pathogen'],
      (await storedRecord(kv, id)).contentHash,
    ]);
    expect(data).not.toHaveProperty('code');
  });

  it("today's playground creates with one `code` string: a workspace that is just main.pathogen, loaded back as `code`", async () => {
    const { env, kv } = makeEnv();
    const created = await call(env, 'POST', '/workspace', { name: 'One', code: 'M 0 0' });
    expect(created.status).toBe(201);
    expect(created.data.code).toBe('M 0 0');
    const id = created.data.id as string;
    expect((await storedRecord(kv, id)).entryPoints).toEqual(['main.pathogen']);
    expect((await call(env, 'GET', `/workspace/${id}`)).data.code).toBe('M 0 0');
  });

  it('a load reads each .pathogen file once from R2: 20 calls at the 20-file limit, and a 21st file is refused', async () => {
    const { env, r2 } = makeEnv();
    const filesOf = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}.pathogen`, { text: `// ${i}` }]));
    const body = (n: number) => ({ name: 'Big', files: filesOf(n), entryPoints: ['f0.pathogen'] });
    const created = await call(env, 'POST', '/workspace', body(20));
    expect(created.status).toBe(201);
    r2.resetCalls();
    const loaded = await call(env, 'GET', `/workspace/${created.data.id as string}`);
    expect(loaded.status).toBe(200);
    expect(r2.totalCalls()).toBe(20);

    const tooMany = await call(env, 'POST', '/workspace', body(21));
    expect([tooMany.status, tooMany.data.error]).toEqual([
      400,
      'A workspace can hold at most 20 files; this one has 21.',
    ]);
  });

  it("refuses a name the rules don't allow, with the rule's message", async () => {
    const { env } = makeEnv();
    const res = await call(env, 'POST', '/workspace', { name: 'Bad', files: { 'my gear.pathogen': { text: '' } } });
    expect([res.status, res.data.error]).toEqual([
      400,
      '"my gear.pathogen" can use only letters a–z and A–Z, digits, -, _ and ., and must start with a letter or a digit.',
    ]);
  });
});

describe('saving', () => {
  it('writes only the files whose text changed, and never checks the ones the manifest already names', async () => {
    const { env, kv, r2 } = makeEnv();
    const id = await createWithFiles(env);
    const gears = await entryForText(GEARS);
    r2.resetCalls();
    const res = await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': { text: `${MAIN}gear(6);\n` }, 'parts/gears.pathogen': gears },
      baseRev: 0,
    });
    expect([res.status, res.data.rev]).toEqual([200, 1]);
    expect(r2.calls).toEqual({ get: 0, put: 1, head: 0, list: 0, delete: 0 });
    expect(await storedText(kv, r2, id)).toBe(`${MAIN}gear(6);\n`);
    // Folders and entry points not sent stay as they were.
    expect((await storedRecord(kv, id)).folders).toEqual(['examples']);
  });

  it('a rename sends the same bytes by hash under a new path', async () => {
    const { env, kv, r2 } = makeEnv();
    const id = await createWithFiles(env);
    const res = await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': await entryForText(MAIN), 'parts/cogs.pathogen': await entryForText(GEARS) },
    });
    expect(res.status).toBe(200);
    expect(Object.keys((await storedRecord(kv, id)).files!)).toEqual(['main.pathogen', 'parts/cogs.pathogen']);
    expect(await storedText(kv, r2, id, 'parts/cogs.pathogen')).toBe(GEARS);
  });

  it('a hash the workspace has never stored is refused, and nothing changes', async () => {
    const { env, kv } = makeEnv();
    const id = await createWithFiles(env);
    const before = await storedRecord(kv, id);
    const unknown = 'c'.repeat(64);
    const res = await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': { sha256: unknown, size: 3 } },
    });
    expect([res.status, res.data.error]).toEqual([
      400,
      `"main.pathogen" names a file this workspace doesn't have (sha256 ${unknown}). Send its text instead.`,
    ]);
    expect(await storedRecord(kv, id)).toEqual(before);
  });

  it("a file sent by hash takes its size from storage, not the client's claim, so the size limits hold", async () => {
    const { env, kv, r2 } = makeEnv();
    const id = await createWithFiles(env);
    const gears = await entryForText(GEARS);
    // A stored file the manifest names: its size comes from the manifest.
    await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { sha256: gears.sha256, size: 0 } },
    });
    expect((await storedRecord(kv, id)).files!['parts/gears.pathogen']).toEqual(gears);

    // Bytes over the 1 MB limit already under the prefix (a crafted put): the
    // size is read with a head, and the limit refuses them.
    const big = 'x'.repeat(1024 * 1024 + 1);
    const bigEntry = await entryForText(big);
    await r2.put(`files/${id}/${bigEntry.sha256}`, big);
    const before = await storedRecord(kv, id);
    const res = await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': { text: MAIN }, 'big.pathogen': { sha256: bigEntry.sha256, size: 1 } },
    });
    expect([res.status, res.data.error]).toEqual([
      400,
      '"big.pathogen" is larger than 1 MB, the most a file of its kind can be.',
    ]);
    expect(await storedRecord(kv, id)).toEqual(before);
  });

  it("a save that sends files doesn't revert an admin's publish that landed while it wrote", async () => {
    const { env, kv, r2 } = makeEnv();
    const id = await createWithFiles(env);
    // The admin's write lands between the save's first read and its manifest write.
    const put = r2.put.bind(r2);
    r2.put = async (...args) => {
      const record = await storedRecord(kv, id);
      await kv.put(`workspace:${id}`, JSON.stringify({ ...record, isPublic: true, flagged: true }));
      return put(...args);
    };
    const res = await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': { text: 'gear(2);' }, 'parts/gears.pathogen': { text: GEARS } },
      baseRev: 0,
    });
    expect(res.status).toBe(200);
    const after = await storedRecord(kv, id);
    expect([after.isPublic, after.flagged, after.rev]).toEqual([true, true, 1]);
    expect(await storedText(kv, r2, id)).toBe('gear(2);');
  });

  it('a save with unchanged files and a new name still renames', async () => {
    const { env, kv } = makeEnv();
    const id = await createWithFiles(env);
    const res = await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } },
      name: 'Cogs',
      baseRev: 0,
    });
    expect([res.status, res.data.skipped, res.data.rev, res.data.name]).toEqual([200, undefined, 0, 'Cogs']);
    expect((await storedRecord(kv, id)).name).toBe('Cogs');
  });

  it('an unchanged save is skipped: no rev bump', async () => {
    const { env } = makeEnv();
    const id = await createWithFiles(env);
    const res = await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } },
      folders: ['examples'],
      entryPoints: ['main.pathogen'],
      baseRev: 0,
    });
    expect([res.data.skipped, res.data.rev]).toEqual([true, 0]);
  });

  it("a tab from before the workspace held several files can't save its one string over them: a conflict", async () => {
    const { env, kv } = makeEnv();
    const id = await createWithFiles(env);
    const before = await storedRecord(kv, id);
    const res = await call(env, 'PUT', `/workspace/${id}`, { code: 'gear(1);', baseRev: 0 });
    expect([res.status, res.data.conflict, res.data.error]).toEqual([
      409,
      true,
      'This workspace now holds several files. Reload the page to edit it.',
    ]);
    expect(await storedRecord(kv, id)).toEqual(before);
  });

  it('a rename or a preferences change carries over the latest files, as the code-only test does for code', async () => {
    const { env, kv } = makeEnv();
    const id = await createWithFiles(env);
    await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': { text: 'gear(9);' }, 'parts/gears.pathogen': { text: GEARS } },
      baseRev: 0,
    });
    const saved = await storedRecord(kv, id);
    const res = await call(env, 'PUT', `/workspace/${id}`, { name: 'Renamed', preferences: { gridSize: 5 } });
    expect(res.status).toBe(200);
    const after = await storedRecord(kv, id);
    expect([after.files, after.folders, after.entryPoints, after.contentHash, after.rev]).toEqual([
      saved.files,
      saved.folders,
      saved.entryPoints,
      saved.contentHash,
      saved.rev,
    ]);
    expect(after.name).toBe('Renamed');
    expect(res.data).not.toHaveProperty('code');
  });
});

// Production has none since the migration (note 71: 228 records, all in today's
// shape, 2026-11-23), so the reader for them is gone. A stray one must say so
// and stay exactly as it is: nothing reads it as a program, and nothing writes
// over it.
describe('a record from before phase 2 is refused, and left as it is', () => {
  const refused = (data: Record<string, unknown>): boolean => String(data.error ?? '').includes(OLD_SHAPE_MESSAGE);

  it('a load says why it fails', async () => {
    const { env, kv } = makeEnv();
    await seedLegacy(kv, 'old1', 'M 1 1');
    const res = await call(env, 'GET', '/workspace/old1');
    expect(res.status).toBe(500);
    expect(refused(res.data)).toBe(true);
  });

  it('a save, of `code` or of files, a rename and a copy all fail, and write nothing', async () => {
    const { env, kv, r2 } = makeEnv();
    await seedLegacy(kv, 'old2', 'M 2 2');
    const before = await storedRecord(kv, 'old2');
    const attempts = [
      await call(env, 'PUT', '/workspace/old2', { code: 'M 2 3', baseRev: 3 }),
      await call(env, 'PUT', '/workspace/old2', {
        files: { 'main.pathogen': { text: 'M 2 4' }, 'lib.pathogen': { text: 'module;\n' } },
        baseRev: 3,
      }),
      await call(env, 'PUT', '/workspace/old2', { name: 'Renamed' }),
      await call(env, 'POST', '/workspace/old2/copy', {}),
    ];
    for (const res of attempts) {
      expect(res.status).toBe(500);
      expect(refused(res.data)).toBe(true);
    }
    expect(await storedRecord(kv, 'old2')).toEqual(before);
    expect(r2.keys('files/')).toEqual([]);
    expect(JSON.parse((await kv.get('user:u1:workspaces'))!)).toEqual(['old2']);
  });

  it("an approval from before phase 2 doesn't give its source to the public page", async () => {
    const { env, kv } = makeEnv();
    await seedLegacy(kv, 'old6', 'M 6 6', { isPublic: true });
    await kv.put(
      'approval:old6',
      JSON.stringify({ workspaceId: 'old6', userId: 'u1', code: 'M 6 6', codeHash: await hashContent('M 6 6'), slug: 'old' }),
    );
    const res = await call(env, 'GET', '/approval-source/old6', undefined, '');
    expect(res.status).toBe(500);
    expect(refused(res.data)).toBe(true);
  });
});

describe('deleting and copying', () => {
  it('deleting removes the files, the thumbnails and a re-review entry', async () => {
    const { env, kv, r2 } = makeEnv();
    const id = await createWithFiles(env);
    await r2.put(`${id}/256.png`, 'png');
    await kv.put('queue:rereview', JSON.stringify([{ workspaceId: id }, { workspaceId: 'other' }]));
    const res = await call(env, 'DELETE', `/workspace/${id}`);
    expect(res.status).toBe(200);
    expect([r2.keys(`files/${id}/`), r2.keys(`${id}/`)]).toEqual([[], []]);
    expect(await listRereviewQueue(env)).toEqual([{ workspaceId: 'other' }]);
  });

  it("a copy gets its own copies of the files, and isn't flagged", async () => {
    const { env, kv, r2 } = makeEnv();
    const id = await createWithFiles(env);
    const record = await storedRecord(kv, id);
    await kv.put(`workspace:${id}`, JSON.stringify({ ...record, flagged: true }));
    const res = await call(env, 'POST', `/workspace/${id}/copy`, {});
    expect(res.status).toBe(201);
    const copyId = res.data.id as string;
    expect(await storedText(kv, r2, copyId, 'parts/gears.pathogen')).toBe(GEARS);
    expect(await storedRecord(kv, copyId)).not.toHaveProperty('flagged');
    expect(res.data.files).toEqual((await call(env, 'GET', `/workspace/${id}`)).data.files);
  });

  it('a copy costs two R2 calls a file, the response included: 40 at the 20-file limit', async () => {
    const { env, r2 } = makeEnv();
    const files = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${i}.pathogen`, { text: `// ${i}` }]));
    const res = await call(env, 'POST', '/workspace', { name: 'Big', files, entryPoints: ['f0.pathogen'] });
    expect(res.status).toBe(201);
    r2.resetCalls();
    const copied = await call(env, 'POST', `/workspace/${res.data.id as string}/copy`, {});
    expect(copied.status).toBe(201);
    expect(r2.calls).toEqual({ get: 20, put: 20, head: 0, list: 0, delete: 0 });
    expect(Object.keys(copied.data.files as object)).toHaveLength(20);
  });

  it('copyStoredFiles refuses, before any call, more files than one request can copy (a backstop if the limit is raised)', async () => {
    const { env, r2 } = makeEnv();
    const entries = await Promise.all(
      Array.from({ length: COPY_MAX_FILES + 1 }, async (_, i) => [`f${i}.pathogen`, await entryForText(`// ${i}`)]),
    );
    const manifest = { files: Object.fromEntries(entries), folders: [], entryPoints: ['f0.pathogen'] };
    const result = await copyStoredFiles(env, 'from', 'to', { manifest, hash: 'h' });
    expect(result).toEqual({
      ok: false,
      message: `This workspace has ${COPY_MAX_FILES + 1} different files; a copy can take at most ${COPY_MAX_FILES} at once.`,
    });
    expect(r2.totalCalls()).toBe(0);
  });

  it('a copy takes the name and the description it is given, and keeps the files, the folders and the main', async () => {
    const { env, kv, r2 } = makeEnv();
    const created = await call(env, 'POST', '/workspace', {
      name: 'Gears',
      description: 'The original',
      files: {
        'main.pathogen': { text: MAIN },
        'parts/gears.pathogen': { text: GEARS },
        'demos/gears.pathogen': { text: MAIN.replace('./parts', '../parts') },
      },
      folders: ['parts', 'demos', 'empty'],
      entryPoints: ['demos/gears.pathogen', 'main.pathogen'],
    });
    const id = created.data.id as string;
    const res = await call(env, 'POST', `/workspace/${id}/copy`, { name: 'Mine', description: 'My copy' });
    expect(res.status).toBe(201);
    const copy = await storedRecord(kv, res.data.id as string);
    expect([copy.name, copy.slug, copy.description]).toEqual(['Mine', 'mine', 'My copy']);
    expect(res.data.entryPoints).toEqual(['demos/gears.pathogen', 'main.pathogen']);
    expect(res.data.folders).toEqual(expect.arrayContaining(['empty']));
    expect(await storedText(kv, r2, res.data.id as string, 'demos/gears.pathogen')).toBe(
      MAIN.replace('./parts', '../parts'),
    );
    // The original is as it was.
    const original = await storedRecord(kv, id);
    expect([original.name, original.description]).toEqual(['Gears', 'The original']);
  });

  it("without a description (or with one that isn't text), the copy keeps the original's", async () => {
    const { env, kv } = makeEnv();
    const created = await call(env, 'POST', '/workspace', {
      name: 'Gears',
      description: 'The original',
      code: 'M 0 0',
    });
    const id = created.data.id as string;
    const plain = await call(env, 'POST', `/workspace/${id}/copy`, {});
    const odd = await call(env, 'POST', `/workspace/${id}/copy`, { description: 42 });
    expect((await storedRecord(kv, plain.data.id as string)).description).toBe('The original');
    expect((await storedRecord(kv, odd.data.id as string)).description).toBe('The original');
  });

  it("a name that isn't text, or is blank, gives the copy the original's name with (Copy)", async () => {
    const { env, kv } = makeEnv();
    const created = await call(env, 'POST', '/workspace', { name: 'Gears', code: 'M 0 0' });
    const id = created.data.id as string;
    for (const name of [7, '   ']) {
      const res = await call(env, 'POST', `/workspace/${id}/copy`, { name });
      expect(res.status).toBe(201);
      expect((await storedRecord(kv, res.data.id as string)).name).toBe('Gears (Copy)');
    }
  });

  it('a copy carries no publishing state: private, not approved, no re-review waiting', async () => {
    const { env, kv } = makeEnv();
    const id = await createWithFiles(env);
    const record = await storedRecord(kv, id);
    await kv.put(
      `workspace:${id}`,
      JSON.stringify({ ...record, isPublic: true, publicationState: 'approved', rereviewPending: true }),
    );
    const res = await call(env, 'POST', `/workspace/${id}/copy`, {});
    const copy = await storedRecord(kv, res.data.id as string);
    expect(copy.isPublic).toBe(false);
    expect(copy).not.toHaveProperty('publicationState');
    expect(copy).not.toHaveProperty('rereviewPending');
  });

});

describe('GET /workspace/:id/file/:sha256', () => {
  it('serves a file to its owner, cacheable for good', async () => {
    const { env } = makeEnv();
    const id = await createWithFiles(env);
    const { sha256 } = await entryForText(GEARS);
    const res = await call(env, 'GET', `/workspace/${id}/file/${sha256}`);
    expect([res.status, res.data.text]).toEqual([200, GEARS]);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
  });

  it("refuses another user on a private workspace, and a hash the workspace doesn't name", async () => {
    const { env } = makeEnv();
    const id = await createWithFiles(env);
    const { sha256 } = await entryForText(GEARS);
    expect((await call(env, 'GET', `/workspace/${id}/file/${sha256}`, undefined, 'u2')).status).toBe(403);
    expect((await call(env, 'GET', `/workspace/${id}/file/${'d'.repeat(64)}`)).status).toBe(404);
    expect((await call(env, 'GET', `/workspace/${id}/file/not-a-hash`)).status).toBe(404);
  });

  it("an admin may read a file the live workspace no longer names (a submission's, an approval's)", async () => {
    const { env } = makeEnv();
    const id = await createWithFiles(env);
    const old = await entryForText(GEARS);
    await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: 'module;\n' } },
    });
    expect((await call(env, 'GET', `/workspace/${id}/file/${old.sha256}`, undefined, 'u2')).status).toBe(403);
    const admin = await call(env, 'GET', `/workspace/${id}/file/${old.sha256}?token=${ADMIN_TOKEN}`, undefined, 'u2');
    expect([admin.status, admin.data.text]).toEqual([200, GEARS]);
  });

  it('refuses a record from before phase 2, with the message', async () => {
    const { env, kv } = makeEnv();
    await seedLegacy(kv, 'old8', 'M 8 8');
    const res = await call(env, 'GET', `/workspace/old8/file/${(await entryForText('M 8 8')).sha256}`);
    expect(res.status).toBe(500);
    expect(String(res.data.error)).toContain(OLD_SHAPE_MESSAGE);
  });
});
