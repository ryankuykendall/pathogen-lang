// Phase 3a, step 5: data files in a workspace, through the API
// (docs/workspace-files.md "Data files" and "Limits"; note 76). A workspace
// holds .pathogen files and data files (.json, .geojson, .topojson, .fold): 5 MB a
// data file, 50 MB in all, 20 files. A load sends data files' text up to
// DATA_INLINE_BYTES in all; the rest come back `deferred`, for the client to
// read one at a time by hash, so a load never holds 50 MB of text in the
// Worker (note 50's memory fix).

import { describe, expect, it } from 'vitest';

import { MemoryR2 } from './memory-r2';
import { approve, call as harnessCall, makeHarness, send } from './publishing-harness';
import { readCapped, TOO_LARGE } from '../../website/api/request-body';
import { handleApiRequest } from '../../website/api/router';
import { entryForText } from '../../website/api/workspace-files';
import { DATA_INLINE_BYTES, SAVE_BODY_BYTES } from '../../website/api/workspace-store';
import { mainSourceText, readApprovalSource } from '../../website/approval-source';
import { MemoryKV } from '../auth/helpers';

import type { Env } from '../../website/api/types';

function makeEnv(): Env {
  return {
    WORKSPACES: new MemoryKV(),
    THUMBNAILS: new MemoryR2(),
    USERS_DB: undefined as unknown as Env['USERS_DB'],
    ADMIN_TOKEN: 'admin-secret',
  };
}

async function call(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: Record<string, unknown>; text: string }> {
  const res = await handleApiRequest(
    new Request(`https://api.pathogen.studio${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'u1' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    env,
    path.split('?')[0],
  );
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = {};
  }
  return { status: res.status, data, text };
}

const MAIN = 'import gears from "./data/gears.json";\nlog(gears.length);\n';
const GEARS = '[{ "name": "drive", "radius": 40 }, { "name": "idler", "radius": 28 }]';
const MB = 1024 * 1024;

interface LoadedFile {
  sha256: string;
  size: number;
  text?: string;
  deferred?: true;
}

async function create(env: Env, files: Record<string, { text: string }>): Promise<string> {
  const res = await call(env, 'POST', '/workspace', { name: 'Gears', files, entryPoints: ['main.pathogen'] });
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  return res.data.id as string;
}

describe('a workspace holds data files', () => {
  it('created with a data file, a load sends its text', async () => {
    const env = makeEnv();
    const id = await create(env, { 'main.pathogen': { text: MAIN }, 'data/gears.json': { text: GEARS } });
    const loaded = await call(env, 'GET', `/workspace/${id}`);
    const files = loaded.data.files as Record<string, LoadedFile>;
    expect(files['data/gears.json']).toMatchObject({ text: GEARS, size: GEARS.length });
    expect(files['data/gears.json'].deferred).toBeUndefined();
    expect(files['main.pathogen'].text).toBe(MAIN);
  });

  it('every data extension; another kind is refused with what a workspace holds', async () => {
    const env = makeEnv();
    const ok = await call(env, 'POST', '/workspace', {
      name: 'Kinds',
      files: {
        'main.pathogen': { text: 'M 0 0' },
        'a.json': { text: '1' },
        'b.geojson': { text: '{}' },
        'c.topojson': { text: '{}' },
        'd.fold': { text: '{}' },
      },
      entryPoints: ['main.pathogen'],
    });
    expect(ok.status).toBe(201);
    const refused = await call(env, 'POST', '/workspace', {
      name: 'Text',
      files: { 'main.pathogen': { text: 'M 0 0' }, 'notes.txt': { text: 'x' } },
      entryPoints: ['main.pathogen'],
    });
    expect([refused.status, refused.data.error]).toEqual([
      400,
      '"notes.txt": a workspace holds .pathogen files and data files (.json, .geojson, .topojson and .fold).',
    ]);
  });

  it('a data file is at most 5 MB', async () => {
    const env = makeEnv();
    const id = await create(env, { 'main.pathogen': { text: MAIN } });
    const exactly = `"${'x'.repeat(5 * MB - 2)}"`;
    const saved = await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': { text: MAIN }, 'data/gears.json': { text: exactly } },
      entryPoints: ['main.pathogen'],
    });
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    const over = await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': { text: MAIN }, 'data/gears.json': { text: `${exactly} ` } },
      entryPoints: ['main.pathogen'],
    });
    expect([over.status, over.data.error]).toEqual([
      400,
      '"data/gears.json" is larger than 5 MB, the most a file of its kind can be.',
    ]);
  });

  it('a data file is never a program', async () => {
    const env = makeEnv();
    const res = await call(env, 'POST', '/workspace', {
      name: 'Gears',
      files: { 'main.pathogen': { text: MAIN }, 'data/gears.json': { text: GEARS } },
      entryPoints: ['data/gears.json'],
    });
    expect([res.status, res.data.error]).toEqual([
      400,
      '"entryPoints" lists "data/gears.json", which isn\'t a .pathogen file.',
    ]);
  });
});

type BodyStream = NonNullable<Request['body']>;

/** A body that arrives in pieces with no Content-Length, as a chunked upload does. */
function chunked(chunks: number, chunkBytes: number): BodyStream {
  let sent = 0;
  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- a request body, as Request itself takes one; the suite's Node has it
  return new ReadableStream({
    pull(controller) {
      if (sent === chunks) {
        controller.close();
        return;
      }
      sent += 1;
      controller.enqueue(new Uint8Array(chunkBytes).fill(0x31));
    },
  });
}

function streamedRequest(path: string, method: string, body: BodyStream): Request {
  return new Request(`https://api.pathogen.studio${path}`, {
    method,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-User-Id': 'u1' },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('a body is read only up to its route’s cap (phase 3a step 5)', () => {
  it('readCapped: a declared length over the cap, or a body that passes it as it arrives', async () => {
    const asText = async (r: Response): Promise<string> => r.text();
    const declared = new Request('https://x.test', {
      method: 'POST',
      headers: { 'content-length': '11' },
      body: '12345678901',
    });
    expect(await readCapped(declared, 10, asText)).toBe(TOO_LARGE);
    const streamed = streamedRequest('/', 'POST', chunked(3, 4));
    expect(await readCapped(streamed, 10, asText)).toBe(TOO_LARGE);
    const within = streamedRequest('/', 'POST', chunked(2, 5));
    expect(await readCapped(within, 10, asText)).toBe('1111111111');
    const malformed = new Request('https://x.test', { method: 'POST', body: '{' });
    await expect(readCapped(malformed, 10, async (r) => (await r.json()) as unknown)).rejects.toThrow();
  });

  it('a file stored by itself, sent in pieces past 5 MB, is refused', async () => {
    const env = makeEnv();
    const id = await create(env, { 'main.pathogen': { text: MAIN } });
    const res = await handleApiRequest(
      streamedRequest(`/workspace/${id}/file`, 'PUT', chunked(6, MB)),
      env,
      `/workspace/${id}/file`,
    );
    expect([res.status, ((await res.json()) as { error: string }).error]).toEqual([413, 'A file can be at most 5 MB.']);
  });

  it(`a save or a create over ${SAVE_BODY_BYTES / MB} MB is refused, and says how to send large files`, async () => {
    const env = makeEnv();
    const id = await create(env, { 'main.pathogen': { text: MAIN } });
    const huge = { 'main.pathogen': { text: MAIN }, 'data/huge.json': { text: `"${'x'.repeat(SAVE_BODY_BYTES)}"` } };
    const saved = await call(env, 'PUT', `/workspace/${id}`, { files: huge, entryPoints: ['main.pathogen'] });
    expect([saved.status, saved.data.error]).toEqual([
      413,
      'A save can send at most 24 MB. Send larger files one at a time with PUT /workspace/:id/file, then save them by their sha256.',
    ]);
    const created = await call(env, 'POST', '/workspace', {
      name: 'Huge',
      files: huge,
      entryPoints: ['main.pathogen'],
    });
    expect([created.status, created.data.error]).toEqual([
      413,
      'A new workspace can start with at most 24 MB. Create it with less, then send larger files one at a time with PUT /workspace/:id/file and save them by their sha256.',
    ]);
  });

  it('a whole workspace of 20 .pathogen files of 1 MB still fits one create', async () => {
    const env = makeEnv();
    const files: Record<string, { text: string }> = {};
    // Short lines, so JSON's \n escapes add a seventh: about 23 MB of body.
    for (let i = 0; i < 20; i++) {
      const line = `M ${i} 0\n`;
      files[`p${String(i).padStart(2, '0')}.pathogen`] = { text: line.repeat(Math.floor(MB / line.length)) };
    }
    const res = await call(env, 'POST', '/workspace', { name: 'Full', files, entryPoints: ['p00.pathogen'] });
    expect(res.status, JSON.stringify(res.data).slice(0, 200)).toBe(201);
  });
});

describe('an approved workspace’s data file past the budget, for a visitor (phase 3a step 5)', () => {
  it('its source sends it deferred, a visitor reads it by hash, and the detail page accepts the source', async () => {
    const h = await makeHarness();
    const big = `[${'1,'.repeat(1.25 * MB)}1]`; // 2.5 MB: past DATA_INLINE_BYTES
    const created = await harnessCall(h, 'POST', '/workspace', {
      name: 'Gears',
      files: { 'main.pathogen': { text: MAIN }, 'data/gears.json': { text: big } },
      folders: ['data'],
      entryPoints: ['main.pathogen'],
    });
    const id = created.data.id as string;
    expect((await harnessCall(h, 'POST', `/workspace/${id}/submit-for-review`)).status).toBe(200);
    await approve(h, id);

    const entry = await entryForText(big);
    const source = await harnessCall(h, 'GET', `/approval-source/${id}`, undefined, 'signed-out');
    const files = source.data.files as Record<string, LoadedFile>;
    expect(files['data/gears.json']).toEqual({ sha256: entry.sha256, size: entry.size, deferred: true });

    const read = await send(h, 'GET', `/approval-source/${id}/file/${entry.sha256}`, 'signed-out');
    expect([read.status, await read.text()]).toEqual([200, big]);
    expect(read.headers.get('Cache-Control')).toBe('public, s-maxage=60, max-age=30');
    // The live workspace's route is the owner's; a hash the approval doesn't name isn't served.
    expect((await send(h, 'GET', `/workspace/${id}/file/${entry.sha256}`, 'signed-out')).status).toBe(403);
    const unnamed = (await entryForText('[]')).sha256;
    expect((await send(h, 'GET', `/approval-source/${id}/file/${unnamed}`, 'signed-out')).status).toBe(404);

    // The Pages worker's reader takes the source, and the main's text still shows.
    const page = await readApprovalSource(
      { workspaceId: id },
      'http://api.test',
      async () => new Response(JSON.stringify(source.data), { status: 200 }),
    );
    expect(page?.files['data/gears.json']).toEqual(files['data/gears.json']);
    expect(mainSourceText(page!)).toBe(MAIN);
  });

  it('unpublished, its files are no longer served', async () => {
    const h = await makeHarness();
    const created = await harnessCall(h, 'POST', '/workspace', {
      name: 'Gears',
      files: { 'main.pathogen': { text: MAIN }, 'data/gears.json': { text: GEARS } },
      folders: ['data'],
      entryPoints: ['main.pathogen'],
    });
    const id = created.data.id as string;
    expect((await harnessCall(h, 'POST', `/workspace/${id}/submit-for-review`)).status).toBe(200);
    await approve(h, id);
    const record = JSON.parse((await h.kv.get(`workspace:${id}`))!) as Record<string, unknown>;
    await h.kv.put(`workspace:${id}`, JSON.stringify({ ...record, isPublic: false }));
    const sha256 = (await entryForText(GEARS)).sha256;
    expect((await send(h, 'GET', `/approval-source/${id}/file/${sha256}`, 'signed-out')).status).toBe(404);
  });
});

/** PUT /workspace/:id/file with a raw body, as the playground sends one file. */
async function putFile(
  env: Env,
  id: string,
  body: string | Uint8Array,
  userId = 'u1',
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await handleApiRequest(
    new Request(`https://api.pathogen.studio/workspace/${id}/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-User-Id': userId },
      body,
    }),
    env,
    `/workspace/${id}/file`,
  );
  return { status: res.status, data: (await res.json()) as Record<string, unknown> };
}

describe('one file stored by itself, then saved by its hash (a large upload in pieces)', () => {
  it('stored, saved by hash, loaded', async () => {
    const env = makeEnv();
    const id = await create(env, { 'main.pathogen': { text: MAIN } });
    const text = `[${'7,'.repeat(MB)}7]`; // 2 MB
    const stored = await putFile(env, id, text);
    expect(stored).toEqual({ status: 201, data: expect.objectContaining({ size: text.length }) as unknown });
    const sha256 = stored.data.sha256 as string;
    const saved = await call(env, 'PUT', `/workspace/${id}`, {
      files: { 'main.pathogen': { text: MAIN }, 'data/gears.json': { sha256 } },
      entryPoints: ['main.pathogen'],
    });
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    const read = await call(env, 'GET', `/workspace/${id}/file/${sha256}`);
    expect(read.text).toBe(text);
  });

  it('over 5 MB, not UTF-8, or not the owner: refused', async () => {
    const env = makeEnv();
    const id = await create(env, { 'main.pathogen': { text: MAIN } });
    const over = await putFile(env, id, 'x'.repeat(5 * MB + 1));
    expect([over.status, over.data.error]).toEqual([413, 'A file can be at most 5 MB.']);
    const binary = await putFile(env, id, new Uint8Array([0x5b, 0xff, 0xfe, 0x5d]));
    expect([binary.status, binary.data.error]).toEqual([400, "The file isn't UTF-8 text."]);
    const stranger = await putFile(env, id, '[]', 'u2');
    expect(stranger.status).toBe(403);
  });
});

describe('a load sends data texts up to a budget, and the rest by hash', () => {
  it(`over ${DATA_INLINE_BYTES / MB} MB of data, a file comes back deferred, and its text by its hash`, async () => {
    const env = makeEnv();
    const big = `[${'1,'.repeat(MB / 2)}1]`; // 1 MB and 3 bytes: two of them pass the budget
    const id = await create(env, {
      'main.pathogen': { text: MAIN },
      'data/gears.json': { text: GEARS },
      'data/big.json': { text: big },
      // Another text: the same text is one stored file, sent once.
      'data/more.json': { text: big.replace(/1]$/, '2]') },
    });
    const loaded = await call(env, 'GET', `/workspace/${id}`);
    const files = loaded.data.files as Record<string, LoadedFile>;
    // In path order: big.json fits the budget, more.json doesn't, gears.json is small.
    const sent = Object.entries(files)
      .filter(([path]) => path.endsWith('.json'))
      .map(([path, f]) => [path, f.deferred === true ? 'deferred' : f.text?.length]);
    expect(sent).toEqual([
      ['data/big.json', big.length],
      ['data/gears.json', GEARS.length],
      ['data/more.json', 'deferred'],
    ]);
    expect(files['data/more.json'].text).toBeUndefined();
    const read = await call(env, 'GET', `/workspace/${id}/file/${files['data/more.json'].sha256}`);
    expect([read.status, read.text.length]).toEqual([200, big.length]);
  });

  it('a copy of the workspace sends its data the same way', async () => {
    const env = makeEnv();
    const id = await create(env, { 'main.pathogen': { text: MAIN }, 'data/gears.json': { text: GEARS } });
    const copied = await call(env, 'POST', `/workspace/${id}/copy`, {});
    expect(copied.status, JSON.stringify(copied.data)).toBe(201);
    const files = copied.data.files as Record<string, LoadedFile>;
    expect(files['data/gears.json'].text).toBe(GEARS);
    const reloaded = await call(env, 'GET', `/workspace/${copied.data.id as string}`);
    expect((reloaded.data.files as Record<string, LoadedFile>)['data/gears.json'].text).toBe(GEARS);
  });
});
