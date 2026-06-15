// Locks down the uncropped "hero" thumbnail used by the workspace detail page.
//
// The detail page falls back to a thumbnail <img> when a workspace has no inline
// approval.svg. The square card thumbnails (256/512/1024) center-crop to a square,
// which clips non-square artwork (e.g. a `define ViewBox(0, 0, 8000, 4800)` piece).
// The hero is a single uncropped, source-aspect-ratio image stored at ${id}/hero.png:
//
//   - PUT ?kind=hero writes a single `hero` form field to ${id}/hero.png (no meta)
//   - GET /thumbnail/:id/hero serves hero.png, falling back to the square 1024
//     (manual first, then auto/legacy) so hero-less workspaces still return an image
//   - DELETE ?kind=all removes hero.png alongside the square layers; ?kind=manual
//     leaves it untouched

import { describe, expect, it } from 'vitest';

import { handleApiRequest } from '../../website/api/router';
import type { Env, KVNamespace, R2Bucket, R2Object } from '../../website/api/types';
import { MemoryKV } from '../auth/helpers';

class MemoryR2 implements R2Bucket {
  private store = new Map<string, string>();

  async get(key: string): Promise<R2Object | null> {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return { body: new Response(value).body! };
  }

  async put(key: string, value: ReadableStream | ArrayBuffer | string): Promise<void> {
    if (typeof value === 'string') {
      this.store.set(key, value);
    } else if (value instanceof ArrayBuffer) {
      this.store.set(key, new TextDecoder().decode(value));
    } else {
      this.store.set(key, await new Response(value).text());
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  async seed(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  keys(): string[] {
    return [...this.store.keys()].sort();
  }
}

function makeEnv(): { env: Env; kv: MemoryKV; r2: MemoryR2 } {
  const kv = new MemoryKV();
  const r2 = new MemoryR2();
  const env = {
    WORKSPACES: kv as unknown as KVNamespace,
    THUMBNAILS: r2 as unknown as R2Bucket,
    USERS_DB: undefined as unknown as Env['USERS_DB'],
  } as Env;
  return { env, kv, r2 };
}

async function createWorkspace(env: Env, userId: string): Promise<string> {
  const res = await handleApiRequest(
    new Request('https://api.pathogen.studio/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ name: 'tw', code: '' }),
    }),
    env,
    '/workspace',
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function uploadHero(env: Env, id: string, userId: string, payload: string): Promise<Response> {
  const fd = new FormData();
  fd.append('hero', new Blob([payload], { type: 'image/png' }), 'hero.png');
  return handleApiRequest(
    new Request(`https://api.pathogen.studio/workspace/${id}/thumbnail?kind=hero`, {
      method: 'PUT',
      headers: { 'X-User-Id': userId },
      body: fd,
    }),
    env,
    `/workspace/${id}/thumbnail`,
  );
}

async function uploadSquare(env: Env, id: string, userId: string, kind: 'manual' | 'auto'): Promise<Response> {
  const fd = new FormData();
  fd.append('1024', new Blob(['png-1024'], { type: 'image/png' }), '1024.png');
  fd.append('512', new Blob(['png-512'], { type: 'image/png' }), '512.png');
  fd.append('256', new Blob(['png-256'], { type: 'image/png' }), '256.png');
  return handleApiRequest(
    new Request(`https://api.pathogen.studio/workspace/${id}/thumbnail?kind=${kind}`, {
      method: 'PUT',
      headers: { 'X-User-Id': userId },
      body: fd,
    }),
    env,
    `/workspace/${id}/thumbnail`,
  );
}

async function getHero(env: Env, id: string): Promise<Response> {
  return handleApiRequest(
    new Request(`https://api.pathogen.studio/thumbnail/${id}/hero`, { method: 'GET' }),
    env,
    `/thumbnail/${id}/hero`,
  );
}

async function deleteKind(env: Env, id: string, userId: string, kind: 'manual' | 'auto' | 'all'): Promise<Response> {
  return handleApiRequest(
    new Request(`https://api.pathogen.studio/workspace/${id}/thumbnail?kind=${kind}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId },
    }),
    env,
    `/workspace/${id}/thumbnail`,
  );
}

async function readThumbMeta(kv: MemoryKV, id: string): Promise<{
  thumbnailAt: string | null;
  manualThumbnailAt: string | null;
  autoThumbnailAt: string | null;
}> {
  const json = await (kv as unknown as KVNamespace).get(`thumbmeta:${id}`);
  if (!json) return { thumbnailAt: null, manualThumbnailAt: null, autoThumbnailAt: null };
  return JSON.parse(json);
}

describe('thumbnail hero (uncropped detail-page image)', () => {
  it('PUT ?kind=hero writes ${id}/hero.png and no square keys', async () => {
    const { env, r2 } = makeEnv();
    const id = await createWorkspace(env, 'user-1');

    const res = await uploadHero(env, id, 'user-1', 'hero-img');
    expect(res.status).toBe(200);

    expect(r2.has(`${id}/hero.png`)).toBe(true);
    expect(r2.has(`${id}/1024.png`)).toBe(false);
    expect(r2.has(`${id}/manual-1024.png`)).toBe(false);
  });

  it('PUT ?kind=hero does not stamp any thumbnail timestamps', async () => {
    const { env, kv } = makeEnv();
    const id = await createWorkspace(env, 'user-1');

    await uploadHero(env, id, 'user-1', 'hero-img');

    const meta = await readThumbMeta(kv, id);
    expect(meta.thumbnailAt).toBeNull();
    expect(meta.manualThumbnailAt).toBeNull();
    expect(meta.autoThumbnailAt).toBeNull();
  });

  it('PUT ?kind=hero rejected when the hero field is missing', async () => {
    const { env } = makeEnv();
    const id = await createWorkspace(env, 'user-1');

    const res = await handleApiRequest(
      new Request(`https://api.pathogen.studio/workspace/${id}/thumbnail?kind=hero`, {
        method: 'PUT',
        headers: { 'X-User-Id': 'user-1' },
        body: new FormData(),
      }),
      env,
      `/workspace/${id}/thumbnail`,
    );
    expect(res.status).toBe(400);
  });

  it('GET /hero serves the hero image when present', async () => {
    const { env } = makeEnv();
    const id = await createWorkspace(env, 'user-1');
    await uploadHero(env, id, 'user-1', 'hero-img');

    const res = await getHero(env, id);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(await res.text()).toBe('hero-img');
  });

  it('GET /hero prefers the hero image over the square layers', async () => {
    const { env, r2 } = makeEnv();
    const id = await createWorkspace(env, 'user-1');
    await r2.seed(`${id}/manual-1024.png`, 'manual-square');
    await r2.seed(`${id}/1024.png`, 'auto-square');
    await uploadHero(env, id, 'user-1', 'hero-img');

    const res = await getHero(env, id);
    expect(await res.text()).toBe('hero-img');
  });

  it('GET /hero falls back to the manual square 1024 when no hero exists', async () => {
    const { env, r2 } = makeEnv();
    const id = await createWorkspace(env, 'user-1');
    await r2.seed(`${id}/manual-1024.png`, 'manual-square');
    await r2.seed(`${id}/1024.png`, 'auto-square');

    const res = await getHero(env, id);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('manual-square');
  });

  it('GET /hero falls back to the auto/legacy square 1024 when neither hero nor manual exists', async () => {
    const { env } = makeEnv();
    const id = await createWorkspace(env, 'user-1');
    await uploadSquare(env, id, 'user-1', 'auto');

    const res = await getHero(env, id);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('png-1024');
  });

  it('GET /hero 404s when nothing exists', async () => {
    const { env } = makeEnv();
    const id = await createWorkspace(env, 'user-1');

    const res = await getHero(env, id);
    expect(res.status).toBe(404);
  });

  it('DELETE ?kind=all removes the hero image', async () => {
    const { env, r2 } = makeEnv();
    const id = await createWorkspace(env, 'user-1');
    await uploadSquare(env, id, 'user-1', 'auto');
    await uploadHero(env, id, 'user-1', 'hero-img');

    const del = await deleteKind(env, id, 'user-1', 'all');
    expect(del.status).toBe(200);
    expect(r2.has(`${id}/hero.png`)).toBe(false);
    expect(r2.keys().filter((k) => k.startsWith(`${id}/`))).toEqual([]);
  });

  it('DELETE ?kind=auto leaves the hero image intact', async () => {
    const { env, r2 } = makeEnv();
    const id = await createWorkspace(env, 'user-1');
    await uploadSquare(env, id, 'user-1', 'auto');
    await uploadHero(env, id, 'user-1', 'hero-img');

    const del = await deleteKind(env, id, 'user-1', 'auto');
    expect(del.status).toBe(200);
    expect(r2.has(`${id}/1024.png`)).toBe(false);
    expect(r2.has(`${id}/hero.png`)).toBe(true);
  });

  it('DELETE ?kind=manual leaves the hero image intact', async () => {
    const { env, r2 } = makeEnv();
    const id = await createWorkspace(env, 'user-1');
    await uploadSquare(env, id, 'user-1', 'manual');
    await uploadHero(env, id, 'user-1', 'hero-img');

    const del = await deleteKind(env, id, 'user-1', 'manual');
    expect(del.status).toBe(200);
    expect(r2.has(`${id}/manual-1024.png`)).toBe(false);
    expect(r2.has(`${id}/hero.png`)).toBe(true);
  });
});
