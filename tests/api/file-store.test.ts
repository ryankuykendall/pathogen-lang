// A workspace's file bytes in R2 (website/api/file-store.ts;
// project-docs/modules/48-storage-design-v2.md §1, §3).

import { describe, expect, it } from 'vitest';

import { MemoryR2 } from './memory-r2';
import { copyFiles, deleteWorkspaceFiles, fileKey, hasFile, putText, readTexts } from '../../website/api/file-store';
import { entryForText } from '../../website/api/workspace-files';

import type { Env } from '../../website/api/types';

function makeEnv(): { env: Env; r2: MemoryR2 } {
  const r2 = new MemoryR2();
  return { env: { THUMBNAILS: r2 } as Env, r2 };
}

describe('the file store', () => {
  it('stores a text under the workspace, by its hash', async () => {
    const { env, r2 } = makeEnv();
    const entry = await putText(env, 'ws1', 'M 0 0\n');
    expect(entry).toEqual(await entryForText('M 0 0\n'));
    expect(r2.keys()).toEqual([`files/ws1/${entry.sha256}`]);
    expect(fileKey('ws1', entry.sha256)).toBe(`files/ws1/${entry.sha256}`);
  });

  it('reads texts back, each hash once', async () => {
    const { env, r2 } = makeEnv();
    const a = await putText(env, 'ws1', 'a');
    const b = await putText(env, 'ws1', 'b');
    r2.resetCalls();
    const texts = await readTexts(env, 'ws1', [a.sha256, b.sha256, a.sha256]);
    expect([...texts.entries()]).toEqual([
      [a.sha256, 'a'],
      [b.sha256, 'b'],
    ]);
    expect(r2.calls.get).toBe(2);
  });

  it('a missing blob is an error that names it', async () => {
    const { env } = makeEnv();
    await expect(readTexts(env, 'ws1', ['f'.repeat(64)])).rejects.toThrow(
      `File ${'f'.repeat(64)} of workspace ws1 is missing from storage`,
    );
  });

  it("another workspace's blob isn't this workspace's", async () => {
    const { env } = makeEnv();
    const a = await putText(env, 'ws1', 'a');
    expect([await hasFile(env, 'ws1', a.sha256), await hasFile(env, 'ws2', a.sha256)]).toEqual([true, false]);
  });

  it("copies blobs to another workspace's prefix", async () => {
    const { env, r2 } = makeEnv();
    const a = await putText(env, 'ws1', 'a');
    await copyFiles(env, 'ws1', 'ws2', [a.sha256]);
    expect(r2.text(`files/ws2/${a.sha256}`)).toBe('a');
  });

  it('deletes the whole prefix in batches of 1,000, leaving other workspaces alone', async () => {
    const { env, r2 } = makeEnv();
    for (let i = 0; i < 1500; i++) await putText(env, 'big', `file ${i}`);
    await putText(env, 'other', 'kept');
    r2.resetCalls();
    expect(await deleteWorkspaceFiles(env, 'big')).toBe(1500);
    expect(r2.keys('files/big/')).toEqual([]);
    expect(r2.keys('files/other/')).toHaveLength(1);
    expect([r2.calls.list, r2.calls.delete]).toEqual([2, 2]);
  });
});
