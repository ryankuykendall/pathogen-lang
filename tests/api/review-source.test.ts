// The review screen's source of an entry (2e step 5e): GET /admin/review/:id/source?queue=…
// gives the waiting entry's files with their text, for the card, the modal and Approve; a
// re-review also says what changed since the approved version, and the Re-review listing
// carries the same for its cards.

import { describe, expect, it, vi } from 'vitest';

import { approve, call, makeHarness, submitted } from './publishing-harness';
import { entryForText } from '../../website/api/workspace-files';

import type { Harness } from './publishing-harness';

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const FILES = { 'main.pathogen': { text: MAIN }, 'parts/gears.pathogen': { text: GEARS } };

async function submittedWithFiles(h: Harness): Promise<string> {
  const created = await call(h, 'POST', '/workspace', {
    name: 'Gears',
    files: FILES,
    folders: ['parts'],
    entryPoints: ['main.pathogen'],
  });
  const id = created.data.id as string;
  expect((await call(h, 'POST', `/workspace/${id}/submit-for-review`)).status).toBe(200);
  return id;
}

describe('GET /admin/review/:id/source', () => {
  it('a new entry: every file with its text, the folders and the programs; no changes', async () => {
    const h = await makeHarness();
    const id = await submittedWithFiles(h);
    const res = await call(h, 'GET', `/admin/review/${id}/source?queue=review`, undefined, 'admin-session');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      workspaceId: id,
      name: 'Gears',
      files: {
        'main.pathogen': { ...(await entryForText(MAIN)), text: MAIN },
        'parts/gears.pathogen': { ...(await entryForText(GEARS)), text: GEARS },
      },
      // A manifest lists only empty folders; parts/ comes from its file's path.
      folders: [],
      entryPoints: ['main.pathogen'],
    });
    expect(res.data).not.toHaveProperty('changes');
  });

  it('a re-review: the edit, and what changed since the approved version', async () => {
    const h = await makeHarness();
    const id = await submittedWithFiles(h);
    await approve(h, id);
    const edited = `${GEARS}// deeper teeth\n`;
    await call(h, 'PUT', `/workspace/${id}`, {
      files: { ...FILES, 'parts/gears.pathogen': { text: edited } },
      folders: ['parts'],
      entryPoints: ['main.pathogen'],
    });
    const res = await call(h, 'GET', `/admin/review/${id}/source?queue=rereview`, undefined, 'admin-token');
    expect(res.status).toBe(200);
    expect((res.data.files as Record<string, { text: string }>)['parts/gears.pathogen'].text).toBe(edited);
    expect(res.data.changes).toEqual({
      files: [{ path: 'parts/gears.pathogen', mark: 'changed' }],
      foldersAdded: [],
      foldersRemoved: [],
      programs: null,
      counts: { new: 0, changed: 1, removed: 0 },
    });
    expect(typeof res.data.approvedAt).toBe('string');

    // The Re-review listing carries the same for its card, reading no text.
    const listed = await call(h, 'GET', '/admin/queue/rereview', undefined, 'admin-token');
    const [entry] = listed.data.entries as Record<string, unknown>[];
    expect([entry.workspaceId, entry.changes, entry.approvedAt]).toEqual([id, res.data.changes, res.data.approvedAt]);
  });

  it('an approval that can’t be read says so (changesError), never “nothing changed”', async () => {
    const h = await makeHarness();
    const id = await submittedWithFiles(h);
    await approve(h, id);
    await call(h, 'PUT', `/workspace/${id}`, { files: { ...FILES, 'main.pathogen': { text: `${MAIN}gear(6);\n` } } });
    // A record that reads, whose file entry doesn't: the comparison fails.
    const approval = JSON.parse((await h.kv.get(`approval:${id}`)) ?? '{}') as Record<string, unknown>;
    await h.kv.put(`approval:${id}`, JSON.stringify({ ...approval, files: { 'main.pathogen': null } }));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listed = await call(h, 'GET', '/admin/queue/rereview', undefined, 'admin-token');
    const [entry] = listed.data.entries as Record<string, unknown>[];
    expect([entry.workspaceId, entry.changes, typeof entry.changesError]).toEqual([id, undefined, 'string']);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('a workspace waiting in both queues: each names its own entry', async () => {
    const h = await makeHarness();
    const id = await submittedWithFiles(h);
    await approve(h, id);
    await call(h, 'PUT', `/workspace/${id}`, { files: { ...FILES, 'main.pathogen': { text: `${MAIN}gear(6);\n` } } });
    // An older server left the re-review on Make private; made public again, it's a submission too.
    const rereviewRaw = await h.kv.get('queue:rereview');
    await call(h, 'PUT', `/workspace/${id}`, { isPublic: false });
    await h.kv.put('queue:rereview', rereviewRaw ?? '[]');
    await call(h, 'PUT', `/workspace/${id}`, { files: { ...FILES, 'main.pathogen': { text: `${MAIN}gear(8);\n` } } });
    await call(h, 'PUT', `/workspace/${id}`, { isPublic: true });
    const main = async (queue: string): Promise<string> =>
      (
        (await call(h, 'GET', `/admin/review/${id}/source?queue=${queue}`, undefined, 'admin-token')).data
          .files as Record<string, { text: string }>
      )['main.pathogen'].text;
    expect([await main('review'), await main('rereview')]).toEqual([`${MAIN}gear(8);\n`, `${MAIN}gear(6);\n`]);
  });

  it('is an admin’s; names a queue; 404s with nothing waiting there', async () => {
    const h = await makeHarness();
    const id = await submitted(h);
    expect((await call(h, 'GET', `/admin/review/${id}/source?queue=review`, undefined, 'owner')).status).toBe(401);
    expect((await call(h, 'GET', `/admin/review/${id}/source`, undefined, 'admin-token')).status).toBe(400);
    expect((await call(h, 'GET', `/admin/review/${id}/source?queue=rereview`, undefined, 'admin-token')).status).toBe(
      404,
    );
  });

  it('a file that can’t be read is marked, and the others still read', async () => {
    const h = await makeHarness();
    const id = await submittedWithFiles(h);
    const gears = await entryForText(GEARS);
    await h.r2.delete(`files/${id}/${gears.sha256}`);
    const res = await call(h, 'GET', `/admin/review/${id}/source?queue=review`, undefined, 'admin-token');
    expect(res.data.files).toEqual({
      'main.pathogen': { ...(await entryForText(MAIN)), text: MAIN },
      'parts/gears.pathogen': { ...gears, unreadable: true },
    });
  });
});
