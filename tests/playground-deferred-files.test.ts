// Files an answer sent without their text (phase 3a; playground/utils/deferred-files.ts):
// each deferred data file read by its hash, the same hash once, a few at a time; one
// that can't be read marked `unreadable`, with why; files with their text untouched.

import { describe, expect, it } from 'vitest';

import { fetchReader, isDeferred, readApprovalFiles, readDeferredFiles } from '../playground/utils/deferred-files.js';

describe('readDeferredFiles', () => {
  it('reads each deferred file by its hash, once a hash, and leaves the rest as they are', async () => {
    const asked: string[] = [];
    const { files, failed } = await readDeferredFiles(
      {
        'main.pathogen': { sha256: 'm', size: 5, text: 'M 0 0' },
        'data/a.json': { sha256: 'a', size: 3, deferred: true },
        'data/copy-of-a.json': { sha256: 'a', size: 3, deferred: true },
        'data/b.json': { sha256: 'b', deferred: true },
      },
      async (sha256) => {
        asked.push(sha256);
        return `[${sha256}]`;
      },
    );
    expect(asked.sort()).toEqual(['a', 'b']);
    expect(files).toEqual({
      'main.pathogen': { sha256: 'm', size: 5, text: 'M 0 0' },
      'data/a.json': { sha256: 'a', size: 3, text: '[a]' },
      'data/copy-of-a.json': { sha256: 'a', size: 3, text: '[a]' },
      'data/b.json': { sha256: 'b', text: '[b]' },
    });
    expect(failed.size).toBe(0);
  });

  it('a file that can’t be read is marked unreadable, with why; the others are read anyway', async () => {
    const { files, failed } = await readDeferredFiles(
      {
        'data/lost.json': { sha256: 'l', size: 9, deferred: true },
        'data/ok.json': { sha256: 'o', size: 2, deferred: true },
      },
      async (sha256) => {
        if (sha256 === 'l') throw new Error('File not found');
        return '[]';
      },
    );
    expect(files).toEqual({
      'data/lost.json': { sha256: 'l', size: 9, unreadable: true },
      'data/ok.json': { sha256: 'o', size: 2, text: '[]' },
    });
    expect([...failed]).toEqual([['data/lost.json', 'File not found']]);
  });

  it('reads at most four at once', async () => {
    let running = 0;
    let most = 0;
    const files = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`data/d${i}.json`, { sha256: `h${i}`, deferred: true as const }]),
    );
    await readDeferredFiles(files, async () => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => {
        setTimeout(r, 5);
      });
      running--;
      return '[]';
    });
    expect(most).toBe(4);
  });

  it('isDeferred: only a file marked deferred, with a hash and no text', () => {
    expect(isDeferred({ sha256: 'a', deferred: true })).toBe(true);
    expect(isDeferred({ sha256: 'a', deferred: true, text: '[]' })).toBe(false);
    expect(isDeferred({ deferred: true })).toBe(false);
    expect(isDeferred({ sha256: 'a', text: '[]' })).toBe(false);
    expect(isDeferred(null)).toBe(false);
  });
});

describe('readApprovalFiles (a visitor’s route)', () => {
  it('reads a deferred file from /approval-source/:id/file/:sha256 without cookies', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response('[3]');
    }) as unknown as typeof fetch;
    const read = await readApprovalFiles(
      {
        workspaceId: 'w 1',
        files: { 'main.pathogen': { text: 'M 0 0' }, 'data/b.json': { sha256: 'b1', deferred: true } },
      },
      'https://api.test',
      fake,
    );
    expect(read).toEqual({
      files: { 'main.pathogen': { text: 'M 0 0' }, 'data/b.json': { sha256: 'b1', text: '[3]' } },
    });
    expect(calls).toEqual([['https://api.test/approval-source/w%201/file/b1', { credentials: 'omit' }]]);
  });

  it('nothing deferred: nothing asked; no workspace named, or a read that fails: why', async () => {
    const never = (async () => {
      throw new Error('not asked');
    }) as unknown as typeof fetch;
    const plain = { files: { 'main.pathogen': { text: 'M 0 0' } } };
    expect(await readApprovalFiles(plain, 'https://api.test', never)).toEqual({ files: plain.files });
    const deferred = { files: { 'data/b.json': { sha256: 'b1', deferred: true } } };
    expect(await readApprovalFiles(deferred, 'https://api.test', never)).toEqual({
      failed: 'its larger data files couldn’t be read yet. Try again in a minute.',
    });
    const missing = (async () =>
      new Response(JSON.stringify({ error: 'File not found' }), { status: 404 })) as unknown as typeof fetch;
    expect(await readApprovalFiles({ ...deferred, workspaceId: 'w1' }, 'https://api.test', missing)).toEqual({
      failed: 'data/b.json couldn’t be read (File not found).',
    });
  });
});

describe('fetchReader', () => {
  it('the text at the address for a hash; an error with the server’s message', async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return url.endsWith('/bad')
        ? new Response(JSON.stringify({ error: 'File not found' }), { status: 404 })
        : new Response('[1, 2]');
    }) as unknown as typeof fetch;
    const read = fetchReader((sha256) => `https://api.example/workspace/w1/file/${sha256}`, {}, fake);
    expect(await read('good')).toBe('[1, 2]');
    await expect(read('bad')).rejects.toThrow('File not found');
    expect(urls).toEqual(['https://api.example/workspace/w1/file/good', 'https://api.example/workspace/w1/file/bad']);
  });
});
