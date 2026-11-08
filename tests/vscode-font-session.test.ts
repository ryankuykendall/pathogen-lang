/**
 * The VS Code preview's font session (packages/vscode-pathogen/src/font-session.ts),
 * driven with the real library: the extension host loads fonts with the same
 * loader and Node host as the CLI, and hands the webview each font once.
 * Real folders under tests/tmp/; downloads are off (tests/setup.ts).
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { scriptedGoogle } from './host/font-bytes';
import { FontSession, RETRY_AFTER_MS } from '../packages/vscode-pathogen/src/font-session';
import * as lib from '../src';
import * as node from '../src/node';

const TMP = join(__dirname, 'tmp');
const BAUMANS = join(__dirname, '..', 'fonts', 'Baumans', 'Baumans-Regular.ttf');
const INTER = join(__dirname, 'fixtures', 'fonts', 'Inter-Regular.ttf');
/** macOS and Windows by default: this file is found under another letter case. */
const caseInsensitiveFs = existsSync(__filename.toUpperCase());
let project: string;
let program: string;

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  project = mkdtempSync(join(TMP, 'vscode-session-'));
  mkdirSync(join(project, 'fonts'));
  writeFileSync(join(project, 'pathogen.json'), '{}\n');
  copyFileSync(BAUMANS, join(project, 'fonts', 'Baumans-Regular.ttf'));
  program = join(project, 'poster.pathogen');
});

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

const session = (offline?: () => string | null) => new FontSession({ lib, node, ...(offline ? { offline } : {}) });

describe('loading a document’s fonts', () => {
  it('loads a project file with the CLI’s rules and hands over its exact bytes', async () => {
    const s = session();
    const loaded = await s.load('@font "./fonts/Baumans-Regular.ttf";\nM 0 0', program);
    expect([loaded.notices, loaded.errors, loaded.fontIds.length]).toEqual([[], [], 1]);
    const [payload] = s.undelivered(loaded.fontIds);
    expect([payload.family, payload.weight, payload.kind]).toEqual(['Baumans-Regular', 400, 'ttf']);
    expect(Buffer.from(payload.buffer).equals(readFileSync(BAUMANS))).toBe(true);
  });

  it.skipIf(!caseInsensitiveFs)(
    'a document path spelled in another letter case than on disk still loads its project fonts',
    async () => {
      // VS Code hands over Windows paths as `c:\…` for `C:\…`; on this
      // system, an all-caps path to the same file plays that part.
      const loaded = await session().load('@font "./fonts/Baumans-Regular.ttf";\nM 0 0', program.toUpperCase());
      expect([loaded.notices, loaded.errors, loaded.fontIds.length]).toEqual([[], [], 1]);
    },
  );

  it.skipIf(!caseInsensitiveFs)(
    'a document in a folder spelled differently from the disk still finds the files beside it',
    async () => {
      // `./` paths start at the document's folder, which must be spelled as on
      // disk to match: opened as POSTERS/ for posters/, nothing may differ.
      const posters = join(project, 'posters');
      mkdirSync(posters, { recursive: true });
      copyFileSync(BAUMANS, join(posters, 'Baumans-Regular.ttf'));
      try {
        const loaded = await session().load(
          '@font "./Baumans-Regular.ttf";\nM 0 0',
          join(project, 'POSTERS', 'main.pathogen'),
        );
        expect([loaded.notices, loaded.errors, loaded.fontIds.length]).toEqual([[], [], 1]);
      } finally {
        rmSync(posters, { recursive: true });
      }
    },
  );

  it('a weight that stood in because the network failed is replaced once a download works', async () => {
    // The real loader and Node host; only the network is scripted. Raleway is
    // installed at 400 only, so 700 has to come from Google Fonts.
    const raleway = join(project, 'fonts', 'Raleway-Regular.ttf');
    copyFileSync(BAUMANS, raleway);
    let online = false;
    let clock = 0;
    const fetchImpl = scriptedGoogle(readFileSync(INTER), () => online);
    const s = new FontSession({
      lib,
      node: {
        ...node,
        createNodeFontHost: (options) =>
          node.createNodeFontHost({ ...options, offlineReason: null, cacheDir: null, systemFontDirs: [], fetchImpl }),
      },
      now: () => clock,
    });
    const source = '@font "Raleway" 700;';
    try {
      const standIn = await s.load(source, program);
      online = true;
      const meanwhile = await s.load(source, program);
      clock += RETRY_AFTER_MS;
      const downloaded = await s.load(source, program);
      expect([
        standIn.notices.length,
        meanwhile === standIn,
        downloaded.notices,
        downloaded.fontIds[0] !== standIn.fontIds[0],
      ]).toEqual([1, true, [], true]);
    } finally {
      rmSync(raleway);
    }
  });

  it('reuses the result while the directives stay the same, so typing never rereads font files', async () => {
    const s = session();
    const first = await s.load('@font "./fonts/Baumans-Regular.ttf";\nM 0 0', program);
    const second = await s.load('@font "./fonts/Baumans-Regular.ttf";\nM 0 0 L 10 10', program);
    expect(second).toBe(first);
    const changed = await s.load('@font "./fonts/Baumans-Regular.ttf" 700;\nM 0 0', program);
    expect(changed).not.toBe(first);
  });

  it('positions errors like the evaluator, and a project-folder escape names the folder', async () => {
    const loaded = await session().load('M 0 0\n@font "../outside.ttf";', program);
    expect(loaded.errors).toEqual([
      `Line 2, col 1: @font path "../outside.ttf" leaves the project folder (${project}). Move the file into the project folder, or move the project's pathogen.json (or add one) to a folder that contains both the program and the file, other than your home folder itself.`,
    ]);
  });

  it('a broken pathogen.json: the fonts report it for a document without imports, and leave it to the imports otherwise', async () => {
    const broken = mkdtempSync(join(TMP, 'vscode-session-broken-'));
    mkdirSync(join(broken, 'fonts'));
    copyFileSync(BAUMANS, join(broken, 'fonts', 'Baumans-Regular.ttf'));
    writeFileSync(join(broken, 'pathogen.json'), '{ "main": "poster.pathogen" }\n');
    const poster = join(broken, 'poster.pathogen');
    try {
      const fontsOnly = await session().load('@font "./fonts/Baumans-Regular.ttf";\nM 0 0', poster);
      expect(fontsOnly.errors).toEqual([
        `pathogen.json (${broken}): "main" is now "entryPoints", a list whose first entry is the main. Replace it with "entryPoints": ["poster.pathogen"].`,
      ]);
      // previewModules reports it at the import (tests/vscode-preview-modules.test.ts), so it shows once.
      const withImports = await session().load(
        'import { gear } from "./parts/gears.pathogen";\n@font "./fonts/Baumans-Regular.ttf";\nM 0 0',
        poster,
      );
      expect([withImports.errors, withImports.fontIds.length]).toEqual([[], 1]);
    } finally {
      rmSync(broken, { recursive: true, force: true });
    }
  });

  it('an unsaved document can’t read files and says to save first', async () => {
    const loaded = await session().load('@font "./fonts/Baumans-Regular.ttf";', undefined);
    expect(loaded.errors).toEqual([
      'Line 1, col 1: @font file "./fonts/Baumans-Regular.ttf" could not be read: save the file first: paths in @font start at the file',
    ]);
  });

  it('with downloads off, a family not on this computer is a warning that names the reason', async () => {
    const program2 = '@font "Zzyzx Nonesuch";\nM 0 0';
    expect((await session().load(program2, program)).notices).toEqual([
      'Line 1, col 1: @font "Zzyzx Nonesuch": not on this computer, and downloads are off (PATHOGEN_OFFLINE=1). Calls that need this font will fail.',
    ]);
    expect((await session(() => 'VS Code Restricted Mode').load(program2, program)).notices).toEqual([
      'Line 1, col 1: @font "Zzyzx Nonesuch": not on this computer, and downloads are off (VS Code Restricted Mode). Calls that need this font will fail.',
    ]);
  });

  it('a source that doesn’t parse loads nothing (the compile reports it)', async () => {
    expect(await session().load('@font "Baumans";\nlet broken = ;', program)).toEqual({
      fontIds: [],
      notices: [],
      errors: [],
    });
  });

  it('a source without @font is answered without parsing it', async () => {
    let plans = 0;
    const s = new FontSession({
      lib: {
        ...lib,
        planFontDirectives: (src: string) => {
          plans++;
          return lib.planFontDirectives(src);
        },
      },
      node,
    });
    expect(await s.load('M 0 0 L 10 10', program)).toEqual({ fontIds: [], notices: [], errors: [] });
    expect(plans).toBe(0);
  });

  it('a font file added after an error is picked up on the next edit', async () => {
    const s = session();
    const source = '@font "./fonts/Later.ttf";\nM 0 0';
    const missing = await s.load(source, program);
    expect(missing.errors).toHaveLength(1);
    copyFileSync(BAUMANS, join(project, 'fonts', 'Later.ttf'));
    try {
      const found = await s.load(`${source} L 1 1`, program);
      expect([found.errors, found.fontIds.length]).toEqual([[], 1]);
    } finally {
      rmSync(join(project, 'fonts', 'Later.ttf'));
    }
  });

  it('a result with a problem is reused only briefly; a clean one stays', async () => {
    let clock = 0;
    let resolves = 0;
    const counting = {
      ...lib,
      resolveFonts: async (...args: Parameters<typeof lib.resolveFonts>) => {
        resolves++;
        return lib.resolveFonts(...args);
      },
    };
    const s = new FontSession({ lib: counting, node, now: () => clock });
    const offlineMiss = '@font "Zzyzx Nonesuch";\nM 0 0';
    await s.load(offlineMiss, program);
    await s.load(offlineMiss, program);
    expect(resolves).toBe(1);
    clock += RETRY_AFTER_MS;
    await s.load(offlineMiss, program);
    expect(resolves).toBe(2);
    const clean = '@font "./fonts/Baumans-Regular.ttf";';
    await s.load(clean, program);
    clock += RETRY_AFTER_MS * 100;
    await s.load(clean, program);
    expect(resolves).toBe(3);
  });

  it('identical loads in progress share one run', async () => {
    let resolves = 0;
    const counting = {
      ...lib,
      resolveFonts: async (...args: Parameters<typeof lib.resolveFonts>) => {
        resolves++;
        return lib.resolveFonts(...args);
      },
    };
    const s = new FontSession({ lib: counting, node });
    const source = '@font "./fonts/Baumans-Regular.ttf";';
    const [a, b] = await Promise.all([s.load(source, program), s.load(source, program)]);
    expect([resolves, a]).toEqual([1, b]);
  });
});

// Phase 1a step 6d: docs/modules.md "Fonts in imported files", in the preview.
describe('fonts in the files a document imports', () => {
  const MAIN = 'import { ready } from "./parts/labels.pathogen";\nM 0 0\n';
  async function graphWith(labelsSource: string) {
    mkdirSync(join(project, 'parts'), { recursive: true });
    writeFileSync(join(project, 'parts', 'labels.pathogen'), labelsSource);
    return (await node.resolveEditorModules(program, MAIN, () => undefined)).graph;
  }

  it("an imported file's @font loads for the preview, its ./ path from its own folder", async () => {
    const graph = await graphWith('module;\n@font "../fonts/Baumans-Regular.ttf";\nexport const ready = 1;\n');
    const loaded = await session().load(MAIN, program, graph);
    expect([loaded.notices, loaded.errors, loaded.fontIds.length]).toEqual([[], [], 1]);
  });

  it("an imported file's font problem names that file", async () => {
    const graph = await graphWith('module;\n@font "../fonts/Missing.ttf";\nexport const ready = 1;\n');
    const loaded = await session().load(MAIN, program, graph);
    expect(loaded.errors).toEqual([
      `parts/labels.pathogen line 2, col 1: @font file "../fonts/Missing.ttf" was not found (looked for ${join(project, 'fonts', 'Missing.ttf')}).`,
    ]);
  });

  it("editing the imported file's @font loads again", async () => {
    const s = session();
    expect(
      (await s.load(MAIN, program, await graphWith('module;\n@font "../fonts/Missing.ttf";\n'))).errors,
    ).toHaveLength(1);
    const fixed = await s.load(MAIN, program, await graphWith('module;\n@font "../fonts/Baumans-Regular.ttf";\n'));
    expect([fixed.errors, fixed.fontIds.length]).toEqual([[], 1]);
  });
});

describe('handing fonts to the webview', () => {
  it('each font once; a reloaded webview gets them again; a re-ask always answers', async () => {
    const s = session();
    const { fontIds } = await s.load('@font "./fonts/Baumans-Regular.ttf";', program);
    expect(s.undelivered(fontIds)).toHaveLength(1);
    expect(s.undelivered(fontIds)).toEqual([]);
    s.forgetDelivered();
    expect(s.undelivered(fontIds)).toHaveLength(1);
    expect(s.payloads(fontIds).map((f) => f.id)).toEqual(fontIds);
  });

  it('display fonts load like any family, once each, and a miss is silent', async () => {
    const s = session();
    const fonts = await s.loadDisplayFonts([{ family: 'Baumans', weight: 400 }], program);
    expect(fonts.map((f) => [f.family, f.weight])).toEqual([['Baumans', 400]]);
    expect(await s.loadDisplayFonts([{ family: 'Baumans', weight: 400 }], program)).toEqual([]);
    expect(await s.loadDisplayFonts([{ family: 'Zzyzx Nonesuch', weight: 400 }], program)).toEqual([]);
  });

  it('a reloaded webview that asks for display fonts again gets them again', async () => {
    const s = session();
    const first = await s.loadDisplayFonts([{ family: 'Baumans', weight: 400 }], program);
    s.forgetDelivered();
    const again = await s.loadDisplayFonts([{ family: 'Baumans', weight: 400 }], program);
    expect(again.map((f) => f.id)).toEqual(first.map((f) => f.id));
  });

  it('display weights snap to the 100–900 grid, so odd weights share one lookup', async () => {
    const s = session();
    const fonts = await s.loadDisplayFonts([{ family: 'Baumans', weight: 437 }], program);
    expect(fonts.map((f) => f.weight)).toEqual([400]);
    expect(await s.loadDisplayFonts([{ family: 'Baumans', weight: 401 }], program)).toEqual([]);
  });
});
