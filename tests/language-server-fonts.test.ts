/**
 * The language server's fonts for diagnostics
 * (packages/pathogen-language-server/src/fonts.ts): loaded like the CLI, so
 * the Problems panel shows what a real compile would — without ever making
 * diagnostics wait for a download. `pathogen-lang` resolves to the sources
 * (vitest.config.ts); the download path runs through a stand-in, never the
 * network.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { scriptedGoogle } from './host/font-bytes';
import { DiagnosticFonts, resolveWith, RETRY_AFTER_MS } from '../packages/pathogen-language-server/src/fonts';
import { DiagnosticSeverity, getDiagnostics, resolveFonts, resolveModules, StringTextDocument } from '../src';
import { createNodeFontHost, createNodeProjectHost } from '../src/node';

import type { Where } from '../packages/pathogen-language-server/src/fonts';
import type { ResolveFontsResult } from '../src';

const TMP = join(__dirname, 'tmp');
/** macOS and Windows by default: this file is found under another letter case. */
const caseInsensitiveFs = existsSync(__filename.toUpperCase());
let project: string;
let programUri: string;

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  project = mkdtempSync(join(TMP, 'lsp-fonts-'));
  mkdirSync(join(project, 'fonts'));
  writeFileSync(join(project, 'pathogen.json'), '{}\n');
  copyFileSync(
    join(__dirname, '..', 'fonts', 'Baumans', 'Baumans-Regular.ttf'),
    join(project, 'fonts', 'Baumans-Regular.ttf'),
  );
  programUri = pathToFileURL(join(project, 'poster.pathogen')).href;
});

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

describe('fonts for diagnostics', () => {
  it('loads a project font at once, and the problems after a font call reach the Problems panel', async () => {
    const source = [
      '@font "./fonts/Baumans-Regular.ttf";',
      'let s = #{ font-family: Baumans-Regular; font-size: 48; };',
      'let g = PathBlock.fromGlyph("A", s);',
      'M calc(0/0) 10',
    ].join('\n');
    const fonts = await new DiagnosticFonts(() => undefined).forDocument(programUri, source);
    expect(fonts?.messages).toEqual([]);
    const diags = getDiagnostics(new StringTextDocument(source), fonts ? { fonts } : {});
    expect(diags.map((d) => [d.severity, d.range.start.line, d.source])).toEqual([
      [DiagnosticSeverity.Warning, 3, 'pathogen-evaluator'],
    ]);
  });

  it.skipIf(!caseInsensitiveFs)(
    'a document path spelled in another letter case than on disk still loads its project fonts',
    async () => {
      // VS Code hands over Windows paths as `c:\…` for `C:\…`; on this
      // system, an all-caps path to the same file plays that part.
      const shoutedUri = pathToFileURL(join(project, 'poster.pathogen').toUpperCase()).href;
      const fonts = await new DiagnosticFonts(() => undefined).forDocument(
        shoutedUri,
        '@font "./fonts/Baumans-Regular.ttf";\nM 0 0',
      );
      expect([fonts?.messages, [...(fonts?.registry?.fonts.keys() ?? [])]]).toEqual([[], ['Baumans-Regular']]);
    },
  );

  it.skipIf(!caseInsensitiveFs)(
    'a program in a folder spelled differently from the disk still finds the files beside it',
    async () => {
      // `./` paths start at the program's folder, which must be spelled as on
      // disk to match: opened as POSTERS/ for posters/, nothing may differ.
      const posters = join(project, 'posters');
      mkdirSync(posters, { recursive: true });
      copyFileSync(join(project, 'fonts', 'Baumans-Regular.ttf'), join(posters, 'Baumans-Regular.ttf'));
      try {
        const uri = pathToFileURL(join(project, 'POSTERS', 'main.pathogen')).href;
        const fonts = await new DiagnosticFonts(() => undefined).forDocument(
          uri,
          '@font "./Baumans-Regular.ttf";\nM 0 0',
        );
        expect([fonts?.messages, [...(fonts?.registry?.fonts.keys() ?? [])]]).toEqual([[], ['Baumans-Regular']]);
      } finally {
        rmSync(posters, { recursive: true });
      }
    },
  );

  it('a font file that is missing is an error at its @font line', async () => {
    const source = 'M 0 0\n@font "./fonts/Missing.ttf";';
    const fonts = await new DiagnosticFonts(() => undefined).forDocument(programUri, source);
    const diags = getDiagnostics(new StringTextDocument(source), fonts ? { fonts } : {});
    expect(diags.map((d) => [d.severity, d.range.start.line, d.source, d.message])).toEqual([
      [
        DiagnosticSeverity.Error,
        1,
        'pathogen-fonts',
        `@font file "./fonts/Missing.ttf" was not found (looked for ${join(project, 'fonts', 'Missing.ttf')}).`,
      ],
    ]);
  });

  it('a source without @font needs no loading (and no parse)', async () => {
    let calls = 0;
    const fonts = new DiagnosticFonts(
      () => undefined,
      async () => {
        calls += 1;
        throw new Error('not expected');
      },
    );
    expect(await fonts.forDocument(programUri, 'M 0 0 L 10 10')).toEqual({ messages: [] });
    expect(calls).toBe(0);
  });

  it('a font file added after an error is picked up on the next check', async () => {
    const fonts = new DiagnosticFonts(() => undefined);
    const source = 'M 0 0\n@font "./fonts/Later.ttf";';
    expect((await fonts.forDocument(programUri, source))?.messages.map((m) => m.severity)).toEqual(['error']);
    copyFileSync(join(project, 'fonts', 'Baumans-Regular.ttf'), join(project, 'fonts', 'Later.ttf'));
    try {
      const after = await fonts.forDocument(programUri, source);
      expect([after?.messages, !!after?.registry]).toEqual([[], true]);
    } finally {
      rmSync(join(project, 'fonts', 'Later.ttf'));
    }
  });
});

// Phase 1a step 6c part 4: docs/modules.md "Fonts in imported files", in the
// editor as in the CLI (resolveFontsInFiles over the document's graph).
describe('fonts in imported files', () => {
  const MAIN = [
    'import { ready } from "./parts/labels.pathogen";',
    'let s = #{ font-family: Baumans-Regular; font-size: 48; };',
    'let g = PathBlock.fromGlyph("A", s);',
    '',
  ].join('\n');
  const labels = (fontPath: string) => `module;\n@font "${fontPath}";\nexport const ready = 1;\n`;

  async function graphWith(labelsSource: string) {
    mkdirSync(join(project, 'parts'), { recursive: true });
    writeFileSync(join(project, 'parts', 'labels.pathogen'), labelsSource);
    const { graph, errors } = await resolveModules(MAIN, {
      host: createNodeProjectHost(project),
      entry: '/poster.pathogen',
    });
    expect(errors).toEqual([]);
    return graph;
  }

  it("an imported file's @font loads for the document, its ./ path from its own folder", async () => {
    const graph = await graphWith(labels('../fonts/Baumans-Regular.ttf'));
    const fonts = await new DiagnosticFonts(() => undefined).forDocument(programUri, MAIN, graph);
    expect([fonts?.messages, [...(fonts?.registry?.fonts.keys() ?? [])]]).toEqual([[], ['Baumans-Regular']]);
    expect(getDiagnostics(new StringTextDocument(MAIN), { fonts, modules: graph })).toEqual([]);
  });

  it('a missing font file in an imported file shows on the import that leads there', async () => {
    const graph = await graphWith(labels('../fonts/Missing.ttf'));
    const fonts = await new DiagnosticFonts(() => undefined).forDocument(programUri, MAIN, graph);
    const diags = getDiagnostics(new StringTextDocument(MAIN), { ...(fonts ? { fonts } : {}), modules: graph });
    expect(diags[0]).toMatchObject({
      severity: DiagnosticSeverity.Error,
      source: 'pathogen-fonts',
      range: { start: { line: 0, character: 22 } },
      message: `parts/labels.pathogen line 2, col 1: @font file "../fonts/Missing.ttf" was not found (looked for ${join(project, 'fonts', 'Missing.ttf')}).\n  imported from poster.pathogen line 1`,
    });
  });

  it('a broken pathogen.json: reported here for a document without imports, and left to its imports otherwise', async () => {
    const broken = mkdtempSync(join(TMP, 'lsp-fonts-broken-'));
    mkdirSync(join(broken, 'fonts'));
    copyFileSync(join(project, 'fonts', 'Baumans-Regular.ttf'), join(broken, 'fonts', 'Baumans-Regular.ttf'));
    writeFileSync(join(broken, 'pathogen.json'), '{ "main": "poster.pathogen" }\n');
    const uri = pathToFileURL(join(broken, 'poster.pathogen')).href;
    try {
      const fontsOnly = await new DiagnosticFonts(() => undefined).forDocument(
        uri,
        '@font "./fonts/Baumans-Regular.ttf";\nM 0 0',
      );
      expect(fontsOnly?.messages).toEqual([
        {
          severity: 'error',
          message: `pathogen.json (${broken}): "main" is now "entryPoints", a list whose first entry is the main. Replace it with "entryPoints": ["poster.pathogen"].`,
        },
      ]);
      // resolveEditorModules reports it at the import (tests/node-editor-modules.test.ts), so it shows once.
      const withImports = await new DiagnosticFonts(() => undefined).forDocument(
        uri,
        'import { gear } from "./parts/gears.pathogen";\n@font "./fonts/Baumans-Regular.ttf";\nM 0 0',
      );
      expect([withImports?.messages, [...(withImports?.registry?.fonts.keys() ?? [])]]).toEqual([
        [],
        ['Baumans-Regular'],
      ]);
    } finally {
      rmSync(broken, { recursive: true, force: true });
    }
  });

  it("editing an imported file's @font loads again", async () => {
    const fonts = new DiagnosticFonts(() => undefined);
    const broken = await fonts.forDocument(programUri, MAIN, await graphWith(labels('../fonts/Missing.ttf')));
    expect(broken?.messages.map((m) => m.severity)).toEqual(['error']);
    const fixed = await fonts.forDocument(programUri, MAIN, await graphWith(labels('../fonts/Baumans-Regular.ttf')));
    expect([fixed?.messages, [...(fixed?.registry?.fonts.keys() ?? [])]]).toEqual([[], ['Baumans-Regular']]);
  });

  it('a font file the imported file names, added later under the same path, loads on the next check', async () => {
    const fonts = new DiagnosticFonts(() => undefined);
    const graph = await graphWith(labels('../fonts/LaterImported.ttf'));
    expect((await fonts.forDocument(programUri, MAIN, graph))?.messages.map((m) => m.severity)).toEqual(['error']);
    copyFileSync(join(project, 'fonts', 'Baumans-Regular.ttf'), join(project, 'fonts', 'LaterImported.ttf'));
    try {
      const after = await fonts.forDocument(programUri, MAIN, graph);
      expect([after?.messages, !!after?.registry]).toEqual([[], true]);
    } finally {
      rmSync(join(project, 'fonts', 'LaterImported.ttf'));
    }
  });

  it('the same files checked again load nothing again', async () => {
    let loads = 0;
    const fonts = new DiagnosticFonts(
      () => undefined,
      async (...args: Parameters<typeof resolveWith>) => {
        loads++;
        return resolveWith(...args);
      },
    );
    const graph = await graphWith(labels('../fonts/Baumans-Regular.ttf'));
    await fonts.forDocument(programUri, MAIN, graph);
    await fonts.forDocument(programUri, MAIN, graph);
    expect(loads).toBe(1);
  });
});

describe('downloads in the background (downloads on)', () => {
  let saved: string | undefined;
  beforeAll(() => {
    saved = process.env.PATHOGEN_OFFLINE;
    delete process.env.PATHOGEN_OFFLINE;
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.PATHOGEN_OFFLINE;
    else process.env.PATHOGEN_OFFLINE = saved;
  });

  /** A loader whose first pass always needs a download, and whose download waits for `finish()`. */
  function standIn(outcome: () => ResolveFontsResult | Error) {
    const passes: string[] = [];
    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const resolve = async (_source: string, _where: Where, offline: string | null): Promise<ResolveFontsResult> => {
      passes.push(offline === null ? 'download' : 'first pass');
      if (offline !== null) {
        return {
          fonts: [],
          messages: [{ severity: 'warning', code: 'font-load', message: 'skipped' }],
          downloadsSkipped: true,
          retryable: false,
        };
      }
      await done;
      const result = outcome();
      if (result instanceof Error) throw result;
      return result;
    };
    return { passes, finish, resolve };
  }
  const DOWNLOADED: ResolveFontsResult = {
    fonts: [],
    messages: [{ severity: 'warning', code: 'font-weight', message: 'downloaded' }],
    downloadsSkipped: false,
    retryable: false,
  };
  const source = '@font "Raleway" 650;';

  it('answers at once without font information, downloads once, then rechecks the document', async () => {
    const loader = standIn(() => DOWNLOADED);
    const rechecked: string[] = [];
    const fonts = new DiagnosticFonts((uri) => rechecked.push(uri), loader.resolve);

    expect(await fonts.forDocument(programUri, source)).toBeUndefined();
    expect(await fonts.forDocument(programUri, source)).toBeUndefined(); // still downloading: no second download
    loader.finish();
    await vi.waitFor(() => expect(rechecked).toEqual([programUri]));
    expect(await fonts.forDocument(programUri, source)).toEqual({ messages: DOWNLOADED.messages });
    expect(loader.passes).toEqual(['first pass', 'download']);
  });

  it('a document closed while its fonts download is not checked again or remembered', async () => {
    const loader = standIn(() => DOWNLOADED);
    const rechecked: string[] = [];
    const fonts = new DiagnosticFonts((uri) => rechecked.push(uri), loader.resolve);
    expect(await fonts.forDocument(programUri, source)).toBeUndefined();
    fonts.forget(programUri);
    loader.finish();
    await new Promise((r) => {
      setTimeout(r, 20);
    });
    expect(rechecked).toEqual([]);
  });

  it('a download that throws is reported once, without starting another download', async () => {
    const loader = standIn(() => new Error('disk full'));
    const rechecked: string[] = [];
    const fonts = new DiagnosticFonts((uri) => rechecked.push(uri), loader.resolve);
    expect(await fonts.forDocument(programUri, source)).toBeUndefined();
    loader.finish();
    await vi.waitFor(() => expect(rechecked).toEqual([programUri]));
    expect((await fonts.forDocument(programUri, source))?.messages).toEqual([
      { severity: 'error', message: "Fonts couldn't be loaded: disk full" },
    ]);
    expect(loader.passes).toEqual(['first pass', 'download']);
  });

  it('a weight that stood in because the network failed is replaced once a download works', async () => {
    // The real loader and Node host; only the network is scripted. Raleway is
    // installed at 400 only, so 700 has to come from Google Fonts.
    const raleway = join(project, 'fonts', 'Raleway-Regular.ttf');
    copyFileSync(join(__dirname, '..', 'fonts', 'Baumans', 'Baumans-Regular.ttf'), raleway);
    let online = false;
    const fetchImpl = scriptedGoogle(
      readFileSync(join(__dirname, 'fixtures', 'fonts', 'Inter-Regular.ttf')),
      () => online,
    );
    const resolve = async (src: string, where: Where, offline: string | null): Promise<ResolveFontsResult> =>
      resolveFonts(src, {
        host: createNodeFontHost({
          root: where.root,
          programDir: where.programDir,
          offlineReason: offline,
          cacheDir: null,
          systemFontDirs: [],
          fetchImpl,
        }),
        entry: where.entry,
      });
    let clock = 0;
    const rechecked: string[] = [];
    const fonts = new DiagnosticFonts(
      (uri) => rechecked.push(uri),
      resolve,
      () => clock,
    );
    const program = '@font "Raleway" 700;';
    try {
      await fonts.forDocument(programUri, program);
      await vi.waitFor(() => expect(rechecked).toHaveLength(1));
      const standingIn = await fonts.forDocument(programUri, program);
      online = true;
      const meanwhile = await fonts.forDocument(programUri, program);
      clock += RETRY_AFTER_MS;
      await fonts.forDocument(programUri, program);
      await vi.waitFor(() => expect(rechecked).toHaveLength(2));
      const downloaded = await fonts.forDocument(programUri, program);
      const codes = (standingIn?.messages ?? []).map((m: { code?: string }) => m.code);
      expect([codes, meanwhile === standingIn, downloaded?.messages]).toEqual([['font-weight'], true, []]);
    } finally {
      rmSync(raleway);
    }
  });

  it('a result with a problem is retried after a short while, not on every check', async () => {
    let clock = 0;
    const loader = standIn(() => ({
      fonts: [],
      messages: [{ severity: 'error', message: "Couldn't download" }],
      downloadsSkipped: false,
      retryable: false,
    }));
    const rechecked: string[] = [];
    const fonts = new DiagnosticFonts(
      (uri) => rechecked.push(uri),
      loader.resolve,
      () => clock,
    );
    await fonts.forDocument(programUri, source);
    loader.finish();
    await vi.waitFor(() => expect(rechecked).toEqual([programUri]));
    await fonts.forDocument(programUri, source);
    expect(loader.passes).toEqual(['first pass', 'download']);
    clock += RETRY_AFTER_MS;
    await fonts.forDocument(programUri, source);
    expect(loader.passes).toEqual(['first pass', 'download', 'first pass', 'download']);
  });
});
