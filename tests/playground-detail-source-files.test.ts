// @vitest-environment jsdom
//
// The public page's View source with several files (2e step 6; mockup v12 P2 to P4;
// playground/utils/detail-source-files.ts and detail-source-mount.ts mountSourceFiles):
// - before source.json answers: the main's text (served with the page), the others
//   loading, a program with its icon and any other file plain, its kind unknown;
// - its answer: every file, each kind the engine's call, opening on the file open if
//   it's still there, else the main; a file the page didn't name (a re-approval since)
//   shows too;
// - a failed answer: the others say so, and Try again asks again.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { arrivedFiles, isServedSource, isSourceJson, waitingFiles } from '../playground/utils/detail-source-files.ts';

import type { SourceFiles } from '../playground/components/shared/source-files.js';

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const SIZES = 'circle(50, 50, 30);\n';
const ENGINE = {
  isModuleSource: (text: string) => text.startsWith('module;'),
  workspaceProjectFileText: (entryPoints: readonly string[]) => `{"entryPoints":${JSON.stringify(entryPoints)}}\n`,
};
const SERVED = {
  names: ['main.pathogen', 'parts/gears.pathogen', 'try-sizes.pathogen'],
  folders: [],
  entryPoints: ['main.pathogen', 'try-sizes.pathogen'],
  main: 'main.pathogen',
};
const SOURCE = {
  files: {
    'main.pathogen': { text: MAIN },
    'parts/gears.pathogen': { text: GEARS },
    'try-sizes.pathogen': { text: SIZES },
  },
  folders: [],
  entryPoints: ['main.pathogen', 'try-sizes.pathogen'],
};
const PJ = `{"entryPoints":["main.pathogen","try-sizes.pathogen"]}\n`;

describe('the files shown', () => {
  it('before the texts: the main, the others loading; a program’s kind from the list, any other plain', () => {
    expect(waitingFiles(SERVED, MAIN, ENGINE, 'loading')).toEqual({
      files: [
        { path: 'main.pathogen', text: MAIN, kind: 'program' },
        { path: 'parts/gears.pathogen', text: '', kind: 'file', pending: 'loading' },
        { path: 'try-sizes.pathogen', text: '', kind: 'program', pending: 'loading' },
        { path: 'pathogen.json', text: PJ, kind: 'project' },
      ],
      folders: [],
      main: 'main.pathogen',
      open: 'main.pathogen',
    });
    // Failed, the file open stays open.
    expect(waitingFiles(SERVED, MAIN, ENGINE, 'failed', 'parts/gears.pathogen').open).toBe('parts/gears.pathogen');
  });

  it('the first program listed isn’t held: the main badge and the text are on the first one held, before and after', () => {
    const served = { ...SERVED, entryPoints: ['gone.pathogen', 'main.pathogen'] };
    const before = waitingFiles(served, MAIN, ENGINE, 'loading');
    expect([before.main, before.open, before.files.find((f) => f.path === 'main.pathogen')?.text]).toEqual([
      'main.pathogen',
      'main.pathogen',
      MAIN,
    ]);
    const after = arrivedFiles({ ...SOURCE, entryPoints: ['gone.pathogen', 'main.pathogen'] }, ENGINE, null);
    expect([after.main, after.open]).toEqual(['main.pathogen', 'main.pathogen']);
  });

  it('the texts: every file, each kind the engine’s call, the file open kept, else the main', () => {
    const viewer = arrivedFiles(SOURCE, ENGINE, 'parts/gears.pathogen');
    expect(viewer.files.map((f) => [f.path, f.kind, f.text])).toEqual([
      ['main.pathogen', 'program', MAIN],
      ['parts/gears.pathogen', 'library', GEARS],
      ['try-sizes.pathogen', 'program', SIZES],
      ['pathogen.json', 'project', PJ],
    ]);
    expect(viewer.open).toBe('parts/gears.pathogen');
    expect(arrivedFiles(SOURCE, ENGINE, 'gone.pathogen').open).toBe('main.pathogen');
  });

  it('reads only what it can: the served data and source.json’s answer', () => {
    expect([isServedSource(SERVED), isServedSource({ ...SERVED, names: 'x' }), isServedSource(null)]).toEqual([
      true,
      false,
      false,
    ]);
    expect([
      isSourceJson(SOURCE),
      isSourceJson({ ...SOURCE, files: { 'a.pathogen': { size: 1 } } }),
      isSourceJson({ error: 'x' }),
    ]).toEqual([true, false, false]);
  });
});

describe('mountSourceFiles', () => {
  let answers: Response[];
  let asked: string[];

  beforeEach(() => {
    answers = [];
    asked = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url);
        return answers.shift() ?? new Response('{}', { status: 503 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function mounted(): Promise<SourceFiles> {
    const { mountSourceFiles } = await import('../playground/utils/detail-source-mount.ts');
    const details = document.createElement('details');
    const pre = document.createElement('pre');
    pre.className = 'detail-source-code';
    pre.textContent = MAIN;
    details.append(pre);
    document.body.append(details);
    // The highlight bundle the page serves, as the engine's two calls.
    expect(await mountSourceFiles(pre, SERVED, '/u/ada/gears/source.json', async () => ENGINE)).toEqual({
      mounted: true,
    });
    return details.querySelector('.detail-source-files source-files') as SourceFiles;
  }

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => {
        setTimeout(r, 0);
      });
    }
  };

  it('replaces the <pre> with the viewer, and fills it from source.json in one request', async () => {
    answers.push(new Response(JSON.stringify(SOURCE), { status: 200 }));
    const viewer = await mounted();
    await settle();
    expect(asked).toEqual(['/u/ada/gears/source.json']);
    expect(viewer.files.map((f) => [f.path, f.kind, f.pending ?? null])).toEqual([
      ['main.pathogen', 'program', null],
      ['parts/gears.pathogen', 'library', null],
      ['try-sizes.pathogen', 'program', null],
      ['pathogen.json', 'project', null],
    ]);
    expect(document.querySelector('pre')).toBeNull();
  });

  it('a failed request: the others say so; Try again asks again and fills them', async () => {
    answers.push(new Response('{}', { status: 503 }));
    const viewer = await mounted();
    await settle();
    expect(viewer.files.filter((f) => f.pending === 'failed').map((f) => f.path)).toEqual([
      'parts/gears.pathogen',
      'try-sizes.pathogen',
    ]);
    expect(viewer.files.find((f) => f.path === 'main.pathogen')?.text).toBe(MAIN);
    answers.push(new Response(JSON.stringify(SOURCE), { status: 200 }));
    viewer.dispatchEvent(new Event('source-files-retry', { bubbles: true, composed: true }));
    expect(viewer.files.filter((f) => f.pending === 'loading').length).toBe(2);
    await settle();
    expect([asked.length, viewer.files.some((f) => f.pending !== undefined)]).toEqual([2, false]);
  });

  it('without the highlight bundle it doesn’t mount: the main’s text stays, as without scripts', async () => {
    const { mountSourceFiles } = await import('../playground/utils/detail-source-mount.ts');
    const pre = document.createElement('pre');
    pre.textContent = MAIN;
    document.body.append(pre);
    const result = await mountSourceFiles(pre, SERVED, '/u/ada/gears/source.json', async () => {
      throw new Error('blocked');
    });
    expect([result.mounted, pre.isConnected, document.querySelector('source-files')]).toEqual([false, true, null]);
  });

  it('a re-approval since the page loaded: source.json’s files are the ones shown', async () => {
    const changed = {
      ...SOURCE,
      files: { ...SOURCE.files, 'parts/springs.pathogen': { text: 'module;\nexport const k = 2;\n' } },
    };
    answers.push(new Response(JSON.stringify(changed), { status: 200 }));
    const viewer = await mounted();
    await settle();
    expect(viewer.files.map((f) => f.path)).toContain('parts/springs.pathogen');
    expect(viewer.files.some((f) => f.pending !== undefined)).toBe(false);
  });
});
