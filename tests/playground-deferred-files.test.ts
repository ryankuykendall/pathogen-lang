// Files an answer sent without their text (phase 3a; playground/utils/deferred-files.ts):
// each deferred data file read by its hash, the same hash once, a few at a time; one
// that can't be read marked `unreadable`, with why; files with their text untouched.

import { describe, expect, it } from 'vitest';

import { fetchReader, isDeferred, readDeferredFiles } from '../playground/utils/deferred-files.js';

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
