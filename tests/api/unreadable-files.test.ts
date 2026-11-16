// A file that can't be read (2e step 5d; project-docs/modules/59-phase-2e-several-files-
// requirements.md, requirement 9): the reads that show files (the approved source the
// public page reads, the admin's read of an approval, a snapshot's /files, in
// snapshots.test.ts) mark that file `unreadable`, without text, and still read the
// others. The reads that save or copy files (the editor's load, a copy) still fail
// rather than lose one.

import { describe, expect, it } from 'vitest';

import { approve, call, makeHarness, send, submitted } from './publishing-harness';
import { readTextsLeniently } from '../../website/api/file-store';
import { entryForText } from '../../website/api/workspace-files';
import { mainSourceText, readApprovalSource } from '../../website/approval-source';

import type { Harness } from './publishing-harness';

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';

/** An approved workspace of two files, whose module's bytes are then lost. */
async function approvedWithLostModule(h: Harness): Promise<{ id: string; main: object; gears: object }> {
  const created = await call(h, 'POST', '/workspace', {
    name: 'Gears',
    files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } },
    folders: ['parts'],
    entryPoints: ['main.pathogen'],
  });
  const id = created.data.id as string;
  expect((await call(h, 'POST', `/workspace/${id}/submit-for-review`)).status).toBe(200);
  await approve(h, id);
  const gears = await entryForText(GEARS);
  await h.r2.delete(`files/${id}/${gears.sha256}`);
  return { id, main: await entryForText(MAIN), gears };
}

describe('readTextsLeniently', () => {
  it('reads every text it can, and names the hashes it can’t', async () => {
    const h = await makeHarness();
    await h.r2.put('files/ws1/aaa', 'A');
    const { texts, missing } = await readTextsLeniently(h.env, 'ws1', ['aaa', 'bbb', 'aaa']);
    expect([[...texts], [...missing]]).toEqual([[['aaa', 'A']], ['bbb']]);
  });
});

describe('the reads that show files mark one that can’t be read', () => {
  it('the public page’s source and the admin’s read: the module marked, the main still read', async () => {
    const h = await makeHarness();
    const { id, main, gears } = await approvedWithLostModule(h);
    const expected = {
      'main.pathogen': { ...main, text: MAIN },
      'parts/gears.pathogen': { ...gears, unreadable: true },
    };
    const source = await call(h, 'GET', `/approval-source/${id}`, undefined, 'signed-out');
    expect([source.status, source.data.files]).toEqual([200, expected]);
    const admin = await call(h, 'GET', `/admin/approval/${id}`, undefined, 'admin-token');
    expect([admin.status, admin.data.files]).toEqual([200, expected]);
  });

  it('a source with a lost file isn’t cached, so a repair shows at once; a whole one is', async () => {
    const h = await makeHarness();
    const { id, gears } = await approvedWithLostModule(h);
    const lost = await send(h, 'GET', `/approval-source/${id}`, 'signed-out');
    expect(lost.headers.get('Cache-Control')).toBe('no-store');
    await h.r2.put(`files/${id}/${(gears as { sha256: string }).sha256}`, GEARS);
    const whole = await send(h, 'GET', `/approval-source/${id}`, 'signed-out');
    expect(whole.headers.get('Cache-Control')).toBe('public, s-maxage=60, max-age=30');
  });

  it('a workspace that is just main.pathogen, its main lost: marked, with no `code`', async () => {
    const h = await makeHarness();
    const id = await submitted(h, 'Spiral', 'circle(1, 1, 1);\n');
    await approve(h, id);
    const main = await entryForText('circle(1, 1, 1);\n');
    await h.r2.delete(`files/${id}/${main.sha256}`);
    const source = await call(h, 'GET', `/approval-source/${id}`, undefined, 'signed-out');
    expect(source.status).toBe(200);
    expect(source.data.files).toEqual({ 'main.pathogen': { ...main, unreadable: true } });
    expect(source.data).not.toHaveProperty('code');
  });

  it('the editor’s load still fails rather than open without the file (a save would lose it)', async () => {
    const h = await makeHarness();
    const { id } = await approvedWithLostModule(h);
    const load = await call(h, 'GET', `/workspace/${id}`);
    expect(load.status).toBe(500);
  });
});

describe('the public page reads a source with a file that can’t be read', () => {
  const fetchOf =
    (body: unknown): typeof fetch =>
    async () =>
      new Response(JSON.stringify(body), { status: 200 });
  const approval = { workspaceId: 'w1', files: {} };

  it('accepts it, and shows no main text when the main is the one lost', async () => {
    const lostModule = {
      files: { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { sha256: 'b', unreadable: true } },
      folders: ['parts'],
      entryPoints: ['main.pathogen'],
    };
    const source = await readApprovalSource(approval, 'http://api.test', fetchOf(lostModule));
    expect(source).toEqual(lostModule);
    expect(mainSourceText(source!)).toBe(MAIN);

    const lostMain = {
      files: { 'main.pathogen': { sha256: 'a', unreadable: true } },
      folders: [],
      entryPoints: ['main.pathogen'],
    };
    const withoutMain = await readApprovalSource(approval, 'http://api.test', fetchOf(lostMain));
    expect(mainSourceText(withoutMain!)).toBeNull();
  });

  it('still refuses a file with neither text nor the mark', async () => {
    const odd = { files: { 'main.pathogen': { sha256: 'a' } }, folders: [], entryPoints: ['main.pathogen'] };
    expect(await readApprovalSource(approval, 'http://api.test', fetchOf(odd))).toBeNull();
  });
});
