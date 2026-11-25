// @vitest-environment jsdom
//
// A save past a limit, found before it's sent (phase 3a step 7c;
// docs/workspace-files.md "Limits"; notes 74 and 75): its words, as the error
// panel says them under the file's name.

import { beforeAll, describe, expect, it } from 'vitest';

import { saveRefusal } from '../playground/services/save-limits.js';

import type { WorkspaceTexts } from '../playground/services/workspace-files.js';

beforeAll(async () => {
  (window as unknown as { PathogenLang: unknown }).PathogenLang = await import('../src');
});

const MB = 1024 * 1024;
const workspace = (texts: Record<string, string>, openFile: string | null = null): WorkspaceTexts => ({
  texts: new Map(Object.entries(texts)),
  folders: [],
  entryPoints: ['main.pathogen'],
  openFile,
});

describe('a save past a limit', () => {
  it('a data file over 5 MB: its size, the limit, and that the edits stay (the docs’ example)', () => {
    const trips = `"${'x'.repeat(Math.ceil(5.35 * MB))}"`;
    expect(saveRefusal(workspace({ 'main.pathogen': 'M 0 0', 'data/trips.json': trips }))).toEqual({
      file: 'data/trips.json',
      message:
        'Not saved: 5.4 MB, more than the 5 MB a data file can be in a workspace. Your edits stay in the editor.',
    });
  });

  it('a .pathogen file over 1 MB, as note 75 words it', () => {
    const big = `// ${'x'.repeat(Math.ceil(1.15 * MB))}\n`;
    expect(saveRefusal(workspace({ 'main.pathogen': big }))).toEqual({
      file: 'main.pathogen',
      message:
        'Not saved: 1.2 MB, more than the 1 MB a .pathogen file can be in a workspace. Your edits stay in the editor.',
    });
  });

  it('the workspace over 50 MB: under the file in the editor', () => {
    const texts: Record<string, string> = { 'main.pathogen': 'M 0 0' };
    for (let i = 0; i < 11; i++) texts[`data/d${i}.json`] = `"${'x'.repeat(5 * MB - 2)}"`;
    expect(saveRefusal(workspace(texts, 'data/d3.json'))).toEqual({
      file: 'data/d3.json',
      message:
        // 11 files of 5 MB and main's 5 bytes: sizes round up, so it never reads as at a limit.
        "Not saved: the workspace's files would be 55.1 MB, more than the 50 MB a workspace can hold. Your edits stay in the editor.",
    });
  });

  it('a library too old to say (no megabytes): the save goes, and the server’s limits refuse it', async () => {
    const engine = await import('../src');
    const global = window as unknown as { PathogenLang: unknown };
    global.PathogenLang = { ...engine, megabytes: undefined };
    try {
      expect(saveRefusal(workspace({ 'main.pathogen': `// ${'x'.repeat(2 * MB)}` }))).toBeNull();
    } finally {
      global.PathogenLang = engine;
    }
  });

  it('none at the limits: 5 MB exactly, counted in UTF-8 bytes', () => {
    // 5 MB of two-byte characters is 2.5 M characters: the count is in bytes, as the server's.
    const accented = `"${'é'.repeat((5 * MB) / 2 - 1)}"`;
    expect(saveRefusal(workspace({ 'main.pathogen': 'M 0 0', 'data/a.json': accented }))).toBeNull();
    expect(saveRefusal(workspace({ 'main.pathogen': 'M 0 0', 'data/a.json': `${accented} ` }))?.file).toBe(
      'data/a.json',
    );
  });
});
