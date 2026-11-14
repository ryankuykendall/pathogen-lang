// GET /workspaces marks a workspace with no program (2d, step 9a; mockup v7
// screen X, state 5; docs/workspace-files.md "When the main is gone or can't
// draw"): your Workspaces page
// labels its card "No programs" and holds back Make Public. The record already
// holds pathogen.json's list, so the listing reads nothing more.
//
// - `entryPoints: []`: no program, so `noPrograms: true`;
// - a list with a program: no flag;
// - a record from before phase 2 (`code`, no list) is one main.pathogen, a
//   program: no flag.

import { describe, expect, it } from 'vitest';

import { handleApiRequest } from '../../website/api/router';
import type { Env, KVNamespace } from '../../website/api/types';
import { MemoryKV } from '../auth/helpers';

function makeEnv(): { env: Env; kv: MemoryKV } {
  const kv = new MemoryKV();
  const env = {
    WORKSPACES: kv as unknown as KVNamespace,
    USERS_DB: undefined as unknown as Env['USERS_DB'],
  } as Env;
  return { env, kv };
}

const USER = 'user-1';

async function putRecord(kv: MemoryKV, id: string, fields: Record<string, unknown>): Promise<void> {
  const record = {
    id,
    slug: id,
    name: id,
    description: '',
    isPublic: false,
    userId: USER,
    createdAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T00:00:00.000Z',
    ...fields,
  };
  await (kv as unknown as KVNamespace).put(`workspace:${id}`, JSON.stringify(record));
}

async function list(env: Env): Promise<Array<{ id: string; noPrograms?: boolean }>> {
  const res = await handleApiRequest(
    new Request('https://api.pathogen.studio/workspaces', { method: 'GET', headers: { 'X-User-Id': USER } }),
    env,
    '/workspaces',
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Array<{ id: string; noPrograms?: boolean }>;
}

const entry = { sha256: 'a'.repeat(64), size: 5 };

describe('the workspace listing marks a workspace with no program', () => {
  it('flags an empty list, and only that', async () => {
    const { env, kv } = makeEnv();
    await putRecord(kv, 'empty', { files: { 'parts/gears.pathogen': entry }, folders: ['parts'], entryPoints: [] });
    await putRecord(kv, 'drawing', {
      files: { 'main.pathogen': entry, 'parts/gears.pathogen': entry },
      folders: ['parts'],
      entryPoints: ['main.pathogen'],
    });
    await putRecord(kv, 'older', { code: 'M 0 0' });
    await (kv as unknown as KVNamespace).put(`user:${USER}:workspaces`, JSON.stringify(['empty', 'drawing', 'older']));

    const listed = await list(env);
    expect(listed.map((w) => [w.id, w.noPrograms])).toEqual([
      ['empty', true],
      ['drawing', undefined],
      ['older', undefined],
    ]);
  });
});
