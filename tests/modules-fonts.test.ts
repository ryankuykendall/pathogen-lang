/**
 * Phase 1a, step 5d: fonts in imported files (docs/modules.md "Fonts in
 * imported files"). The shared loader reads every file's `@font` lines, each
 * file's `./` paths from its own folder; fonts are shared by family and
 * weight, and two files loading different fonts as one family and weight is
 * an error naming both.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ttfToWoff } from './host/font-bytes';
import { resolveFontsInFiles } from '../src/host/load-fonts';

import type { FontSourceFile } from '../src/host/load-fonts';
import type { FontHost } from '../src/host/types';

const ttf = new Uint8Array(readFileSync(join(__dirname, 'fixtures/fonts/Inter-Regular.ttf')));
/** The same font as WOFF: different bytes, so a different font under the same family name. */
const woff = ttfToWoff(ttf);

function fakeHost(files: Record<string, Uint8Array>): FontHost & { reads: string[]; requests: string[] } {
  const reads: string[] = [];
  const requests: string[] = [];
  return {
    projectLabel: '/Users/you/my-gears',
    reads,
    requests,
    async readFile(path) {
      reads.push(path);
      const bytes = files[path];
      return bytes ? { ok: true, bytes } : { ok: false, code: 'not-found', osPath: `/Users/you/my-gears${path}` };
    },
    async findLocalFont() {
      return null;
    },
    cache: {
      async get() {
        return null;
      },
      async put() {
        // Offline and uncached: nothing is ever downloaded to keep.
      },
    },
    offlineReason: '--offline',
  };
}

const MAIN = (source: string): FontSourceFile => ({ path: '/main.pathogen', source, label: 'main.pathogen' });
const LABELS = (source: string): FontSourceFile => ({
  path: '/parts/labels.pathogen',
  source,
  label: 'parts/labels.pathogen',
  imported: true,
});

const families = (fonts: { family: string; weight: number }[]): string[] => fonts.map((f) => `${f.family} ${f.weight}`);

describe('docs: fonts in imported files', () => {
  it("an imported file's @font lines load, with ./ starting from that file", async () => {
    const host = fakeHost({ '/parts/fonts/Inter.ttf': ttf });
    const result = await resolveFontsInFiles([MAIN('M 0 0'), LABELS('@font "./fonts/Inter.ttf";')], { host });
    expect(result.messages).toEqual([]);
    expect(families(result.fonts)).toEqual(['Inter 400']);
    expect(host.reads).toEqual(['/parts/fonts/Inter.ttf']);
  });

  it('two files writing @font "Inter"; use one font', async () => {
    // Offline and nothing installed: the family is skipped once, not twice.
    const host = fakeHost({});
    const result = await resolveFontsInFiles([MAIN('@font "Inter";'), LABELS('@font "Inter";')], { host });
    expect(result.messages.map((m) => [m.code, m.file])).toEqual([['font-load', undefined]]);
  });

  it("any file can use a family another file loads: a font file serves the other file's family name", async () => {
    const host = fakeHost({ '/fonts/Inter.ttf': ttf });
    const result = await resolveFontsInFiles([MAIN('@font "./fonts/Inter.ttf";'), LABELS('@font "Inter";')], { host });
    expect(result.messages).toEqual([]);
    expect(families(result.fonts)).toEqual(['Inter 400']);
    expect(host.requests).toEqual([]);
  });

  it('the same font file reached from two files by different paths is one font', async () => {
    const host = fakeHost({ '/fonts/Inter.ttf': ttf });
    const result = await resolveFontsInFiles(
      [MAIN('@font "./fonts/Inter.ttf";'), LABELS('@font "../fonts/Inter.ttf";')],
      {
        host,
      },
    );
    expect(result.messages).toEqual([]);
    expect(families(result.fonts)).toEqual(['Inter 400']);
  });

  it('two files loading different fonts as one family and weight are an error that names both', async () => {
    const host = fakeHost({ '/a/Inter.ttf': ttf, '/parts/b/Inter.ttf': woff });
    const result = await resolveFontsInFiles([MAIN('@font "./a/Inter.ttf";'), LABELS('@font "./b/Inter.ttf";')], {
      host,
    });
    expect(result.messages).toEqual([
      {
        severity: 'error',
        message:
          'Two files load different fonts as "Inter" 400: ./a/Inter.ttf (main.pathogen) and ./b/Inter.ttf (parts/labels.pathogen). Use the same font in both files.',
        line: 1,
        column: 1,
        file: 'parts/labels.pathogen',
      },
    ]);
  });

  it('…with three files, each later different one is reported against the first file', async () => {
    const host = fakeHost({ '/a/Inter.ttf': ttf, '/parts/b/Inter.ttf': woff, '/parts/c/Inter.ttf': woff });
    const third: FontSourceFile = {
      path: '/parts/c.pathogen',
      source: '@font "./c/Inter.ttf";',
      label: 'parts/c.pathogen',
      imported: true,
    };
    const result = await resolveFontsInFiles(
      [MAIN('@font "./a/Inter.ttf";'), LABELS('@font "./b/Inter.ttf";'), third],
      { host },
    );
    expect(result.messages.map((m) => [m.file, m.message])).toEqual([
      [
        'parts/labels.pathogen',
        'Two files load different fonts as "Inter" 400: ./a/Inter.ttf (main.pathogen) and ./b/Inter.ttf (parts/labels.pathogen). Use the same font in both files.',
      ],
      [
        'parts/c.pathogen',
        'Two files load different fonts as "Inter" 400: ./a/Inter.ttf (main.pathogen) and ./c/Inter.ttf (parts/c.pathogen). Use the same font in both files.',
      ],
    ]);
  });

  it('…at different weights they are two fonts, not a clash', async () => {
    const host = fakeHost({ '/a/Inter.ttf': ttf, '/parts/b/Inter.ttf': woff });
    const result = await resolveFontsInFiles([MAIN('@font "./a/Inter.ttf";'), LABELS('@font "./b/Inter.ttf" 700;')], {
      host,
    });
    expect(result.messages).toEqual([]);
    expect(families(result.fonts)).toEqual(['Inter 400', 'Inter 700']);
  });

  it('within one file two font files for one family are as before: the first is used, no error', async () => {
    const host = fakeHost({ '/a/Inter.ttf': ttf, '/b/Inter.ttf': woff });
    const result = await resolveFontsInFiles([MAIN('@font "./a/Inter.ttf";\n@font "./b/Inter.ttf";')], { host });
    expect(result.messages).toEqual([]);
    expect(families(result.fonts)).toEqual(['Inter 400']);
  });

  it("a mistake in an imported file's @font line names that file", async () => {
    const host = fakeHost({});
    const result = await resolveFontsInFiles([MAIN('M 0 0'), LABELS('\n@font "./fonts/Missing.ttf";')], { host });
    expect(result.messages).toEqual([
      {
        severity: 'error',
        message:
          '@font file "./fonts/Missing.ttf" was not found (looked for /Users/you/my-gears/parts/fonts/Missing.ttf).',
        line: 2,
        column: 1,
        file: 'parts/labels.pathogen',
      },
    ]);
  });
});
