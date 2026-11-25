// @vitest-environment jsdom
//
// A new workspace past what a create can send (phase 3a, step 8;
// playground/services/workspace-create.ts): created with what fits, the
// largest data files after it, each stored on its own, then one save naming
// every file by its hash. A failure after the create deletes the workspace.
// The cap here is 4 KB in place of 24 MB, so the files can be small.

import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createWorkspace, filesForAfter } from '../playground/services/workspace-create.js';

import type { CreateCalls, NewWorkspace } from '../playground/services/workspace-create.js';

// The API client reads its base as it loads.
vi.hoisted(() => {
  (globalThis as { __PATHOGEN_API_BASE__?: string }).__PATHOGEN_API_BASE__ = 'http://localhost:8787';
});

const CAP = 4096;
const create = { createWorkspace, filesForAfter };

beforeAll(async () => {
  const lib = await import('../src');
  (window as unknown as { PathogenLang: unknown }).PathogenLang = {
    ...lib,
    WORKSPACE_LIMITS: { ...lib.WORKSPACE_LIMITS, saveBodyBytes: CAP },
  };
});

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

/** Calls that keep what they were sent, as the server would. */
function fakeCalls(opts: { failStore?: boolean } = {}) {
  const log: { call: string; id?: string; body?: Record<string, unknown>; text?: string }[] = [];
  const calls: CreateCalls = {
    create: async (body) => {
      log.push({ call: 'create', body });
      const files = body.files as Record<string, { text: string }>;
      return {
        id: 'w1',
        slug: 'gears',
        files: Object.fromEntries(Object.entries(files).map(([p, f]) => [p, { sha256: sha(f.text), text: f.text }])),
      };
    },
    storeFile: async (id, text) => {
      log.push({ call: 'storeFile', id, text });
      if (opts.failStore) throw new Error('The connection was lost.');
      return { sha256: sha(text) };
    },
    update: async (id, body) => {
      log.push({ call: 'update', id, body });
      return {};
    },
    delete: async (id) => {
      log.push({ call: 'delete', id });
      return {};
    },
  };
  return { calls, log };
}

const workspace = (files: Record<string, string>): NewWorkspace => ({
  name: 'Gears',
  description: '',
  files: Object.fromEntries(Object.entries(files).map(([p, text]) => [p, { text }])),
  folders: ['drafts'],
  entryPoints: ['main.pathogen'],
  isPublic: false,
  preferences: {},
});

const MAIN = 'import gears from "./data/gears.json";\nfor (g in gears) circle(g.x, g.y, g.r);\n';

describe('createWorkspace', () => {
  it('a workspace within the cap: one create, as it is', async () => {
    const { calls, log } = fakeCalls();
    const made = await create.createWorkspace(workspace({ 'main.pathogen': MAIN, 'data/gears.json': '[]' }), calls);
    expect(made.id).toBe('w1');
    expect(log.map((l) => l.call)).toEqual(['create']);
    expect(Object.keys(log[0].body!.files as object)).toEqual(['main.pathogen', 'data/gears.json']);
  });

  it('past the cap: the largest data files follow, stored one at a time, then saved with every file by hash', async () => {
    const { calls, log } = fakeCalls();
    const big = 'x'.repeat(2000);
    const bigger = 'y'.repeat(2500);
    const files = {
      'main.pathogen': MAIN,
      'data/gears.json': '[1]',
      'data/big.json': big,
      'data/bigger.json': bigger,
    };
    await create.createWorkspace(workspace(files), calls);
    expect(log.map((l) => l.call)).toEqual(['create', 'storeFile', 'update']);
    // Only the largest had to wait: 2.5 KB out of 4.5 KB leaves room for the rest.
    expect(Object.keys(log[0].body!.files as object)).toEqual(['main.pathogen', 'data/gears.json', 'data/big.json']);
    expect(log[0].body!.entryPoints).toEqual(['main.pathogen']);
    expect(utf8(JSON.stringify(log[0].body))).toBeLessThanOrEqual(CAP);
    expect(log[1]).toEqual({ call: 'storeFile', id: 'w1', text: bigger });
    expect(log[2]).toEqual({
      call: 'update',
      id: 'w1',
      body: {
        files: {
          'main.pathogen': { sha256: sha(MAIN) },
          'data/gears.json': { sha256: sha('[1]') },
          'data/big.json': { sha256: sha(big) },
          'data/bigger.json': { sha256: sha(bigger) },
        },
        folders: ['drafts'],
        entryPoints: ['main.pathogen'],
      },
    });
  });

  it('a .pathogen file never waits, however large', () => {
    const after = create.filesForAfter(
      workspace({ 'main.pathogen': 'M 0 0;'.repeat(800), 'data/small.json': '[1]' }),
      CAP,
      (path) => path.endsWith('.json'),
    );
    expect(after).toEqual(['data/small.json']);
  });

  it('bytes, not characters: two-byte text is counted as it is sent', () => {
    // 1,500 characters, 3,000 bytes: two of them pass 4 KB only in bytes.
    const files = { 'data/a.json': 'é'.repeat(1500), 'data/b.json': 'é'.repeat(1400) };
    expect(create.filesForAfter(workspace(files), CAP, () => true)).toEqual(['data/a.json']);
  });

  it('a failure after the create deletes the workspace, and says why', async () => {
    const { calls, log } = fakeCalls({ failStore: true });
    const files = { 'main.pathogen': MAIN, 'data/big.json': 'x'.repeat(5000) };
    await expect(create.createWorkspace(workspace(files), calls)).rejects.toThrow('The connection was lost.');
    expect(log.map((l) => l.call)).toEqual(['create', 'storeFile', 'delete']);
  });
});

function utf8(text: string): number {
  return new TextEncoder().encode(text).length;
}
