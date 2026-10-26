/**
 * The shared pre-compile font step (src/host/load-fonts.ts) against a fake
 * host: in-memory project files, installed fonts, a scripted fetch and a
 * cache. Nothing here touches the network or the disk beyond one fixture.
 * The contract is docs/path-blocks.md § Font Loading by Environment and
 * docs/projects.md.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ttfToWoff } from './font-bytes';
import { buildFontRegistry, FONT_CACHE_TTL_MS, planFontDirectives, resolveFonts } from '../../src/host/load-fonts';

import type { HostFetchResponse } from '../../src/host/google-fonts';
import type { FontHost, HostReadResult, LocalFontMatch } from '../../src/host/types';

// Read at load time: test tables below are built from it.
const ttf = new Uint8Array(readFileSync(join(__dirname, '../fixtures/fonts/Inter-Regular.ttf')));

const GSTATIC = 'https://fonts.gstatic.com/s/test/v1/font.ttf';
const cssFor = (weight: number, url = GSTATIC) =>
  `@font-face {\n  font-family: 'X';\n  font-style: normal;\n  font-weight: ${weight};\n  src: url(${url}) format('truetype');\n}\n`;

interface FakeHost extends FontHost {
  requests: string[];
  reads: string[];
  cacheStore: Map<string, Uint8Array>;
}

function fakeHost(
  options: {
    files?: Record<string, Uint8Array | HostReadResult>;
    installed?: Record<string, LocalFontMatch>;
    /** url → response; a function can see the URL. Absent = offline. */
    routes?: (url: string) => { status: number; body: string | Uint8Array } | Error;
    offlineReason?: string;
    cache?: Map<string, Uint8Array>;
    decodeWoff2?: (bytes: Uint8Array) => Promise<Uint8Array>;
  } = {},
): FakeHost {
  const requests: string[] = [];
  const reads: string[] = [];
  const cacheStore = options.cache ?? new Map<string, Uint8Array>();
  const host: FakeHost = {
    projectLabel: '/Users/you/my-gears',
    requests,
    reads,
    cacheStore,
    async readFile(path) {
      reads.push(path);
      const entry = options.files?.[path];
      if (!entry) return { ok: false, code: 'not-found', osPath: `/Users/you/my-gears${path}` };
      return entry instanceof Uint8Array ? { ok: true, bytes: entry } : entry;
    },
    async findLocalFont(family, weight, { nearest }) {
      const exact = options.installed?.[`${family}:${weight}`];
      if (exact) return exact;
      if (!nearest) return null;
      const any = Object.entries(options.installed ?? {}).find(([key]) => key.startsWith(`${family}:`));
      return any ? any[1] : null;
    },
    cache: {
      async get(key) {
        return cacheStore.get(key) ?? null;
      },
      async put(key, bytes) {
        cacheStore.set(key, bytes);
      },
    },
    ...(options.offlineReason ? { offlineReason: options.offlineReason } : {}),
    ...(options.decodeWoff2 ? { decodeWoff2: options.decodeWoff2 } : {}),
  };
  if (options.routes) {
    const routes = options.routes;
    host.fetch = async (url: string): Promise<HostFetchResponse> => {
      requests.push(url);
      const reply = routes(url);
      if (reply instanceof Error) throw reply;
      const body = reply.body;
      return {
        status: reply.status,
        text: async () => (typeof body === 'string' ? body : new TextDecoder().decode(body)),
        bytes: async () => (typeof body === 'string' ? new TextEncoder().encode(body) : body),
      };
    };
  }
  return host;
}

/** Google answering css2 for a family/weight table, and serving the font file. */
function google(weights: Record<string, number | 'default'>, fontBytes = () => ttf) {
  return (url: string) => {
    if (url === GSTATIC) return { status: 200, body: fontBytes() };
    const query = decodeURIComponent(url.split('family=')[1].split('&')[0]);
    const [family, axis] = query.split(':wght@');
    const known = weights[family];
    if (known === undefined) return { status: 400, body: 'bad request' };
    if (axis === undefined) return { status: 200, body: cssFor(known === 'default' ? 400 : known) };
    return Number(axis) === known || (known === 'default' && axis === '400')
      ? { status: 200, body: cssFor(Number(axis)) }
      : { status: 400, body: 'bad request' };
  };
}

const ENTRY = '/main.pathogen';

describe('planFontDirectives — the first step every tool shares, the playground included', () => {
  it('sorts directives into files and families, keeping weights as written and positions', () => {
    expect(planFontDirectives('@font "./fonts/a.ttf" 700;\n@font "Raleway";')).toEqual({
      directives: [
        { source: './fonts/a.ttf', kind: 'file', weight: 700, line: 1, column: 1 },
        { source: 'Raleway', kind: 'family', line: 2, column: 1 },
      ],
      errors: [],
    });
  });

  it('reports source mistakes as positioned errors and leaves them out of the directives', () => {
    const plan = planFontDirectives('@font "serif";\n@font "Inter.ttf";\n@font "Raleway";');
    expect(plan?.directives.map((d) => d.source)).toEqual(['Raleway']);
    expect(plan?.errors.map((e) => [e.severity, e.line, e.message])).toEqual([
      [
        'error',
        1,
        '@font "serif": serif is a CSS generic family, not a font. Name a font family instead, such as @font "Noto Serif";',
      ],
      [
        'error',
        2,
        '@font "Inter.ttf" looks like a file name but isn\'t a path. File paths start with ./, ../ or / — did you mean "./Inter.ttf"?',
      ],
    ]);
  });

  it('is null for a source that does not parse (the compile reports that)', () => {
    expect(planFontDirectives('@font "Raleway";\nlet broken = ;')).toBeNull();
  });
});

describe('font ids', () => {
  it('a font file edited in place, at the same size, gets a new id', async () => {
    const edited = ttf.slice();
    edited[edited.length - 7] ^= 0xff; // one byte deep inside the file
    const idFor = async (bytes: Uint8Array) =>
      (await resolveFonts('@font "./A.ttf";', { host: fakeHost({ files: { '/A.ttf': bytes } }), entry: ENTRY }))
        .fonts[0].id;
    const [before, after, again] = await Promise.all([idFor(ttf), idFor(edited), idFor(ttf.slice())]);
    expect([before === after, before === again]).toEqual([false, true]);
  });
});

describe('resolveFonts — no fonts', () => {
  it('a program without @font makes no host calls', async () => {
    const host = fakeHost({ routes: () => new Error('should not fetch') });
    const result = await resolveFonts('M 0 0 L 10 10', { host, entry: ENTRY });
    expect(result).toEqual({ fonts: [], messages: [], downloadsSkipped: false, retryable: false });
    expect(host.requests).toEqual([]);
    expect(host.reads).toEqual([]);
  });

  it('a program that does not parse returns nothing (the compile reports the error)', async () => {
    const result = await resolveFonts('@font "Inter"\nM 0 0 L', { host: fakeHost(), entry: ENTRY });
    expect(result.fonts).toEqual([]);
  });
});

describe('resolveFonts — file paths', () => {
  it('loads a file relative to the program and names the family after the file', async () => {
    const host = fakeHost({ files: { '/fonts/Inter-Regular.ttf': ttf } });
    const { fonts, messages } = await resolveFonts('@font "./fonts/Inter-Regular.ttf";', { host, entry: ENTRY });
    expect(messages).toEqual([]);
    expect(fonts.map((f) => [f.family, f.weight, f.origin, f.kind, f.bytes.length])).toEqual([
      ['Inter-Regular', 400, 'file', 'ttf', ttf.length],
    ]);
    expect(host.reads).toEqual(['/fonts/Inter-Regular.ttf']);
  });

  it('the weight after a path labels the file', async () => {
    const host = fakeHost({ files: { '/fonts/Inter-Regular.ttf': ttf } });
    const { fonts } = await resolveFonts('@font "/fonts/Inter-Regular.ttf" 700;', {
      host,
      entry: '/parts/rack.pathogen',
    });
    expect(fonts.map((f) => [f.family, f.weight])).toEqual([['Inter-Regular', 700]]);
  });

  it('a path that leaves the project folder is an error at the directive, before anything is read', async () => {
    const host = fakeHost();
    const { fonts, messages } = await resolveFonts('M 0 0\n@font "../../.ssh/id_rsa";', { host, entry: ENTRY });
    expect(fonts).toEqual([]);
    expect(host.reads).toEqual([]);
    expect(messages).toEqual([
      {
        severity: 'error',
        message:
          '@font path "../../.ssh/id_rsa" leaves the project folder (/Users/you/my-gears). Move the file into the project folder, or move the project\'s pathogen.json (or add one) to a folder that contains both the program and the file, other than your home folder itself.',
        line: 2,
        column: 1,
      },
    ]);
  });

  it('a symbolic link out of the project reads as leaving it', async () => {
    const host = fakeHost({ files: { '/fonts/link.ttf': { ok: false, code: 'escapes-root' } } });
    const { messages } = await resolveFonts('@font "./fonts/link.ttf";', { host, entry: ENTRY });
    expect(messages.map((m) => m.message)).toEqual([
      '@font path "./fonts/link.ttf" leaves the project folder (/Users/you/my-gears). Move the file into the project folder, or move the project\'s pathogen.json (or add one) to a folder that contains both the program and the file, other than your home folder itself.',
    ]);
  });

  it('a missing file names where it looked; a leading / adds the project-folder hint', async () => {
    const { messages } = await resolveFonts(
      '@font "./fonts/Missing.ttf";\n@font "/System/Library/Fonts/Georgia.ttf";',
      {
        host: fakeHost(),
        entry: ENTRY,
      },
    );
    expect(messages.map((m) => m.message)).toEqual([
      '@font file "./fonts/Missing.ttf" was not found (looked for /Users/you/my-gears/fonts/Missing.ttf).',
      '@font file "/System/Library/Fonts/Georgia.ttf" was not found (looked for /Users/you/my-gears/System/Library/Fonts/Georgia.ttf). A leading / means the project folder, not your computer\'s root.',
    ]);
  });

  it('a letter-case mismatch shows the spelling on disk', async () => {
    const host = fakeHost({
      files: {
        '/fonts/baumans-regular.ttf': { ok: false, code: 'case-mismatch', actual: '/fonts/Baumans-Regular.ttf' },
      },
    });
    const { messages } = await resolveFonts('@font "./fonts/baumans-regular.ttf";', { host, entry: ENTRY });
    expect(messages.map((m) => m.message)).toEqual([
      '@font file "./fonts/baumans-regular.ttf" differs from the file on disk only in letter case: "./fonts/Baumans-Regular.ttf". Paths are case-sensitive on every system.',
    ]);
  });

  it('a file that is not a font, or is a collection, is an error', async () => {
    const host = fakeHost({
      files: {
        '/notes.txt': new TextEncoder().encode('hello'),
        '/fonts/All.ttc': new TextEncoder().encode('ttcf....'),
      },
    });
    const { messages } = await resolveFonts('@font "./notes.txt";\n@font "./fonts/All.ttc";', { host, entry: ENTRY });
    expect(messages.map((m) => m.message)).toEqual([
      '@font file "./notes.txt" is not a font file: expected TrueType (.ttf), OpenType (.otf), WOFF or WOFF2 data.',
      '@font file "./fonts/All.ttc" is a font collection (.ttc), which isn\'t supported. Use a single .ttf or .otf file.',
    ]);
  });

  it('WOFF2 is decoded when the host can, and an error when it cannot', async () => {
    const woff2 = new TextEncoder().encode('wOF2 fake');
    const withDecoder = fakeHost({ files: { '/a.woff2': woff2 }, decodeWoff2: async () => ttf });
    const decoded = await resolveFonts('@font "./a.woff2";', { host: withDecoder, entry: ENTRY });
    expect(decoded.fonts.map((f) => [f.family, f.kind])).toEqual([['a', 'ttf']]);
    const without = await resolveFonts('@font "./a.woff2";', {
      host: fakeHost({ files: { '/a.woff2': woff2 } }),
      entry: ENTRY,
    });
    expect(without.messages.map((m) => m.message)).toEqual([
      '@font file "./a.woff2" is WOFF2, which can\'t be read here. Use the .ttf or .otf file instead.',
    ]);
  });

  it('a WOFF2 file that does not decode, or decodes to something else, is an error at its directive', async () => {
    const woff2 = new TextEncoder().encode('wOF2 fake');
    const run = async (decodeWoff2: (bytes: Uint8Array) => Promise<Uint8Array>) =>
      (
        await resolveFonts('@font "./a.woff2";', {
          host: fakeHost({ files: { '/a.woff2': woff2 }, decodeWoff2 }),
          entry: ENTRY,
        })
      ).messages;
    const throws = await run(async () => {
      throw new Error('Invalid WOFF2 header');
    });
    const notAFont = await run(async () => new TextEncoder().encode('not a font'));
    expect([...throws, ...notAFont]).toEqual([
      {
        severity: 'error',
        message: '@font file "./a.woff2" is a damaged WOFF2 file: Invalid WOFF2 header',
        line: 1,
        column: 1,
      },
      {
        severity: 'error',
        message: '@font file "./a.woff2" is a damaged WOFF2 file: it didn\'t decode to a TrueType or OpenType font.',
        line: 1,
        column: 1,
      },
    ]);
  });

  it('a font file cut short is an error at its directive, not a failure inside a glyph call', async () => {
    const woff = ttfToWoff(ttf);
    const host = fakeHost({
      files: {
        '/fonts/Cut.ttf': ttf.subarray(0, Math.floor(ttf.length / 2)),
        '/fonts/Cut.woff': woff.subarray(0, woff.length - 100),
        '/fonts/Whole.woff': woff,
      },
    });
    const { fonts, messages } = await resolveFonts(
      '@font "./fonts/Cut.ttf";\n@font "./fonts/Cut.woff";\n@font "./fonts/Whole.woff" 700;',
      { host, entry: ENTRY },
    );
    expect([fonts.map((f) => [f.family, f.kind]), messages.map((m) => [m.line, m.message])]).toEqual([
      [['Whole', 'woff']],
      [
        [1, '@font file "./fonts/Cut.ttf" is damaged or incomplete: its tables run past the end of the file.'],
        [2, '@font file "./fonts/Cut.woff" is damaged or incomplete: its tables run past the end of the file.'],
      ],
    ]);
  });

  it('a folder named as a font, the project folder included, says it is a folder', async () => {
    const host = fakeHost({ files: { '/fonts': { ok: false, code: 'folder' }, '/': { ok: false, code: 'folder' } } });
    const { messages } = await resolveFonts('@font "./fonts";\n@font "/";', { host, entry: ENTRY });
    expect(messages.map((m) => m.message)).toEqual([
      '@font path "./fonts" is a folder, not a font file.',
      '@font path "/" is a folder, not a font file.',
    ]);
  });

  it('the spelling on disk is shown in the path as written, `..` steps included', async () => {
    const host = fakeHost({
      files: {
        '/Fonts/Raleway/raleway-bold.ttf': {
          ok: false,
          code: 'case-mismatch',
          actual: '/fonts/Raleway/Raleway-Bold.ttf',
        },
        '/Fonts/a.ttf': { ok: false, code: 'case-mismatch', actual: '/fonts/A.ttf' },
      },
    });
    const top = await resolveFonts('@font "./tests/../Fonts/Raleway/raleway-bold.ttf";', { host, entry: ENTRY });
    const nested = await resolveFonts('@font "../Fonts/a.ttf";', { host, entry: '/parts/rack.pathogen' });
    expect([...top.messages, ...nested.messages].map((m) => m.message)).toEqual([
      '@font file "./tests/../Fonts/Raleway/raleway-bold.ttf" differs from the file on disk only in letter case: "./tests/../fonts/Raleway/Raleway-Bold.ttf". Paths are case-sensitive on every system.',
      '@font file "../Fonts/a.ttf" differs from the file on disk only in letter case: "../fonts/A.ttf". Paths are case-sensitive on every system.',
    ]);
  });

  it('a family a file already provides is not looked up again', async () => {
    const host = fakeHost({ files: { '/Inter.ttf': ttf }, routes: () => new Error('should not fetch') });
    const { fonts, messages } = await resolveFonts('@font "Inter";\n@font "./Inter.ttf";', { host, entry: ENTRY });
    expect(messages).toEqual([]);
    expect(fonts.map((f) => [f.family, f.origin])).toEqual([['Inter', 'file']]);
  });
});

describe('resolveFonts — source mistakes', () => {
  it('generic families, file-like names, backslashes and nested directives are positioned errors', async () => {
    const src = [
      '@font "serif";',
      '@font "Inter.ttf";',
      '@font ".\\\\fonts\\\\a.ttf";',
      'fn f() {',
      '  @font "Inter";',
      '}',
    ].join('\n');
    const { messages } = await resolveFonts(src, { host: fakeHost(), entry: ENTRY });
    expect(messages.map((m) => [m.line, m.message])).toEqual([
      [5, '@font must be at the top level of the program, not inside a function or block.'],
      [
        1,
        '@font "serif": serif is a CSS generic family, not a font. Name a font family instead, such as @font "Noto Serif";',
      ],
      [
        2,
        '@font "Inter.ttf" looks like a file name but isn\'t a path. File paths start with ./, ../ or / — did you mean "./Inter.ttf"?',
      ],
      [
        3,
        '@font path ".\\fonts\\a.ttf" uses a backslash. Write paths with forward slashes on every system: "./fonts/a.ttf".',
      ],
    ]);
  });
});

describe('resolveFonts — family names', () => {
  it('an installed font at the requested weight wins, with no download', async () => {
    const host = fakeHost({
      installed: { 'Raleway:700': { bytes: ttf, weight: 700, label: '/Library/Fonts/Raleway-Bold.ttf' } },
      routes: () => new Error('should not fetch'),
    });
    const { fonts, messages } = await resolveFonts('@font "Raleway" 700;', { host, entry: ENTRY });
    expect(messages).toEqual([]);
    expect(fonts.map((f) => [f.family, f.weight, f.origin])).toEqual([['Raleway', 700, 'local']]);
    expect(host.requests).toEqual([]);
  });

  it('otherwise the complete font is downloaded from Google once, then served from the cache', async () => {
    const host = fakeHost({ routes: google({ Raleway: 700 }) });
    const first = await resolveFonts('@font "Raleway" 700;', { host, entry: ENTRY, now: () => 1_000 });
    expect(first.messages).toEqual([]);
    expect(first.fonts.map((f) => [f.family, f.weight, f.origin])).toEqual([['Raleway', 700, 'google']]);
    expect(host.requests).toEqual(['https://fonts.googleapis.com/css2?family=Raleway:wght@700&display=swap', GSTATIC]);

    const again = await resolveFonts('@font "Raleway" 700;', { host, entry: ENTRY, now: () => 2_000 });
    expect(again.fonts.map((f) => f.origin)).toEqual(['cache']);
    expect(host.requests).toHaveLength(2); // nothing new
  });

  it('a cached font older than 30 days is checked again; an unchanged URL is not downloaded again', async () => {
    const host = fakeHost({ routes: google({ Raleway: 700 }) });
    await resolveFonts('@font "Raleway" 700;', { host, entry: ENTRY, now: () => 0 });
    const later = await resolveFonts('@font "Raleway" 700;', { host, entry: ENTRY, now: () => FONT_CACHE_TTL_MS + 1 });
    expect(later.fonts.map((f) => f.origin)).toEqual(['google']);
    expect(host.requests).toEqual([
      'https://fonts.googleapis.com/css2?family=Raleway:wght@700&display=swap',
      GSTATIC,
      'https://fonts.googleapis.com/css2?family=Raleway:wght@700&display=swap',
    ]);
  });

  it('a curated family snaps to its nearest known weight, with a font-weight warning', async () => {
    const host = fakeHost({ routes: google({ Raleway: 600 }) });
    const { fonts, messages } = await resolveFonts('@font "Raleway" 650;', { host, entry: ENTRY });
    expect(host.requests[0]).toBe('https://fonts.googleapis.com/css2?family=Raleway:wght@600&display=swap');
    expect(fonts.map((f) => [f.family, f.weight])).toEqual([['Raleway', 650]]); // registered under the requested weight
    expect(messages).toEqual([
      {
        severity: 'warning',
        code: 'font-weight',
        message:
          'Raleway is not available at weight 650; using 600 — available weights: 100, 200, 300, 400, 500, 600, 700, 800, 900',
        line: 1,
        column: 1,
      },
    ]);
  });

  it('any other family falls back to its default weight after a 400', async () => {
    const host = fakeHost({ routes: google({ 'Gravitas One': 'default' }) });
    const { fonts, messages } = await resolveFonts('@font "Gravitas One" 700;', { host, entry: ENTRY });
    expect(fonts.map((f) => [f.family, f.weight])).toEqual([['Gravitas One', 700]]);
    expect(messages.map((m) => [m.code, m.message])).toEqual([
      ['font-weight', 'Gravitas One does not provide weight 700 on Google Fonts; using its default weight 400'],
    ]);
  });

  it('a family Google does not know is an error, with a suggestion when one is close', async () => {
    const host = fakeHost({ routes: google({}) });
    const { fonts, messages } = await resolveFonts('@font "Interr";', { host, entry: ENTRY });
    expect(fonts).toEqual([]);
    expect(messages.map((m) => [m.severity, m.message])).toEqual([
      [
        'error',
        '@font "Interr": no font of that name is installed on this computer or available from Google Fonts. Did you mean "Inter"?',
      ],
    ]);
  });

  it('a failed download is an error; a stale cached copy is used instead when there is one', async () => {
    const offlineError = new Error('getaddrinfo ENOTFOUND fonts.googleapis.com');
    const failing = fakeHost({ routes: () => offlineError });
    const failed = await resolveFonts('@font "Raleway" 700;', { host: failing, entry: ENTRY });
    expect(failed.messages.map((m) => [m.severity, m.message])).toEqual([
      [
        'error',
        'Couldn\'t download "Raleway" from Google Fonts (getaddrinfo ENOTFOUND fonts.googleapis.com). Try again when you\'re online, or put the font in a fonts/ folder in your project.',
      ],
    ]);

    const cache = new Map<string, Uint8Array>();
    await resolveFonts('@font "Raleway" 700;', {
      host: fakeHost({ routes: google({ Raleway: 700 }), cache }),
      entry: ENTRY,
      now: () => 0,
    });
    const stale = await resolveFonts('@font "Raleway" 700;', {
      host: fakeHost({ routes: () => offlineError, cache }),
      entry: ENTRY,
      now: () => FONT_CACHE_TTL_MS * 2,
    });
    expect(stale.messages).toEqual([]);
    expect(stale.fonts.map((f) => f.origin)).toEqual(['cache']);
  });

  it('says when a download was skipped, so a host can run offline first and download only when needed', async () => {
    const program = '@font "Raleway" 700;';
    const installed = (weight: number) => ({
      [`Raleway:${weight}`]: { bytes: ttf, weight, label: `/fonts/Raleway-${weight}.ttf` },
    });
    const run = async (host: FakeHost) => resolveFonts(program, { host, entry: ENTRY });

    const miss = await run(fakeHost({ offlineReason: '--offline' }));
    expect([miss.downloadsSkipped, miss.fonts.length]).toEqual([true, 0]);
    // Another installed weight stands in offline, but online the exact weight could be downloaded.
    const nearest = await run(fakeHost({ offlineReason: '--offline', installed: installed(400) }));
    expect([nearest.downloadsSkipped, nearest.fonts.length]).toEqual([true, 1]);
    const exact = await run(fakeHost({ offlineReason: '--offline', installed: installed(700) }));
    expect(exact.downloadsSkipped).toBe(false);
    const online = await run(fakeHost({ routes: google({ Raleway: 700 }) }));
    expect([online.downloadsSkipped, online.fonts.length]).toEqual([false, 1]);
  });

  it('a connection that drops while the reply is arriving is a download failure, not a crash', async () => {
    const host = fakeHost();
    host.fetch = async () => ({
      status: 200,
      text: async () => {
        throw new Error('socket hang up');
      },
      bytes: async () => {
        throw new Error('socket hang up');
      },
    });
    const { fonts, messages } = await resolveFonts('@font "Raleway" 700;', { host, entry: ENTRY });
    expect(fonts).toEqual([]);
    expect(messages.map((m) => [m.severity, m.message])).toEqual([
      [
        'error',
        'Couldn\'t download "Raleway" from Google Fonts (socket hang up). Try again when you\'re online, or put the font in a fonts/ folder in your project.',
      ],
    ]);
  });

  it('a family Google stops listing still loads from a copy downloaded earlier', async () => {
    const cache = new Map<string, Uint8Array>();
    await resolveFonts('@font "Raleway" 700;', {
      host: fakeHost({ routes: google({ Raleway: 700 }), cache }),
      entry: ENTRY,
      now: () => 0,
    });
    const later = await resolveFonts('@font "Raleway" 700;', {
      host: fakeHost({ routes: google({}), cache }),
      entry: ENTRY,
      now: () => FONT_CACHE_TTL_MS * 2,
    });
    expect(later.messages).toEqual([]);
    expect(later.fonts.map((f) => [f.family, f.weight, f.origin])).toEqual([['Raleway', 700, 'cache']]);
  });

  it('with downloads off, a cached copy is used whatever its age', async () => {
    const cache = new Map<string, Uint8Array>();
    await resolveFonts('@font "Raleway" 700;', {
      host: fakeHost({ routes: google({ Raleway: 700 }), cache }),
      entry: ENTRY,
      now: () => 0,
    });
    const offline = await resolveFonts('@font "Raleway" 700;', {
      host: fakeHost({ cache, offlineReason: '--offline' }),
      entry: ENTRY,
      now: () => FONT_CACHE_TTL_MS * 5,
    });
    expect(offline.fonts.map((f) => f.origin)).toEqual(['cache']);
  });

  it('with downloads off, an installed font at another weight is a font-weight warning', async () => {
    const host = fakeHost({
      installed: { 'Raleway:400': { bytes: ttf, weight: 400, label: '/repo/fonts/Raleway/Raleway-Regular.ttf' } },
      offlineReason: '--offline',
    });
    const { fonts, messages } = await resolveFonts('@font "Raleway" 700;', { host, entry: ENTRY });
    expect(fonts.map((f) => [f.family, f.weight, f.origin])).toEqual([['Raleway', 700, 'local']]);
    expect(messages.map((m) => [m.code, m.message])).toEqual([
      [
        'font-weight',
        'Raleway is not installed at weight 700; using the installed weight 400 (/repo/fonts/Raleway/Raleway-Regular.ttf)',
      ],
    ]);
  });

  it('with downloads on, an installed font at another weight still stands in when Google Fonts has nothing', async () => {
    // A system font Google Fonts doesn't serve (macOS's Herculanum), installed
    // only at 400: downloads on must never do worse than downloads off. A
    // failure that may pass (the network, a download) is worth retrying.
    const installed = {
      'Herculanum:400': { bytes: ttf, weight: 400, label: '/Library/Fonts/Herculanum.ttf' },
    };
    const run = async (routes: NonNullable<Parameters<typeof fakeHost>[0]>['routes']) => {
      const { fonts, messages, retryable } = await resolveFonts('@font "Herculanum" 700;', {
        host: fakeHost({ installed, routes }),
        entry: ENTRY,
      });
      return [
        fonts.map((f) => [f.family, f.weight, f.origin]),
        messages.map((m) => [m.severity, m.code, m.message]),
        retryable,
      ];
    };
    const standIn = [['Herculanum', 700, 'local']];
    const using = 'using the installed weight 400 (/Library/Fonts/Herculanum.ttf)';
    expect({
      unknown: await run(google({})),
      unreachable: await run(() => new Error('getaddrinfo ENOTFOUND fonts.googleapis.com')),
      downloadFails: await run((url) =>
        url === GSTATIC ? { status: 500, body: 'oops' } : { status: 200, body: cssFor(700) },
      ),
    }).toEqual({
      unknown: [
        standIn,
        [
          [
            'warning',
            'font-weight',
            `Herculanum is not installed at weight 700, and Google Fonts doesn't have it; ${using}`,
          ],
        ],
        false,
      ],
      unreachable: [
        standIn,
        [
          [
            'warning',
            'font-weight',
            `Herculanum is not installed at weight 700, and Google Fonts couldn't be reached (getaddrinfo ENOTFOUND fonts.googleapis.com); ${using}`,
          ],
        ],
        true,
      ],
      downloadFails: [
        standIn,
        [
          [
            'warning',
            'font-weight',
            `Herculanum is not installed at weight 700, and its download failed (HTTP 500 for the font file); ${using}`,
          ],
        ],
        true,
      ],
    });
    // With downloads off, the same stand-in is final until downloads are on.
    const offline = await resolveFonts('@font "Herculanum" 700;', {
      host: fakeHost({ installed, offlineReason: '--offline' }),
      entry: ENTRY,
    });
    expect([offline.retryable, offline.downloadsSkipped]).toEqual([false, true]);
  });

  it('with downloads off and no copy anywhere, a font-load warning names the reason', async () => {
    const { fonts, messages } = await resolveFonts('@font "Inter";', {
      host: fakeHost({ offlineReason: 'PATHOGEN_OFFLINE=1' }),
      entry: ENTRY,
    });
    expect(fonts).toEqual([]);
    expect(messages).toEqual([
      {
        severity: 'warning',
        code: 'font-load',
        message:
          '@font "Inter": not on this computer, and downloads are off (PATHOGEN_OFFLINE=1). Calls that need this font will fail.',
        line: 1,
        column: 1,
      },
    ]);
  });

  describe('a cache entry that is damaged, incomplete or from elsewhere is a miss, never a font', () => {
    const CSS2 = 'https://fonts.googleapis.com/css2?family=Raleway:wght@700&display=swap';
    const INDEX = 'css2:Raleway:700';
    const FONT = `font:${GSTATIC}`;
    const good = { url: GSTATIC, weightUsed: 700, fetchedAt: 1_000, available: [] };
    const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    const cases: [string, [string, Uint8Array][]][] = [
      [
        'an empty font file',
        [
          [INDEX, json(good)],
          [FONT, new Uint8Array()],
        ],
      ],
      [
        'a font file cut short',
        [
          [INDEX, json(good)],
          [FONT, ttf.subarray(0, 1000)],
        ],
      ],
      [
        'an index without weightUsed',
        [
          [INDEX, json({ url: GSTATIC, fetchedAt: 1_000, available: [] })],
          [FONT, ttf],
        ],
      ],
      [
        'an index naming another host',
        [
          [INDEX, json({ ...good, url: 'https://evil.example/x.ttf' })],
          ['font:https://evil.example/x.ttf', ttf],
        ],
      ],
      [
        'an index that is not JSON',
        [
          [INDEX, new TextEncoder().encode('{')],
          [FONT, ttf],
        ],
      ],
      // Valid JSON that isn't an entry at all
      ...(['null', '[]', '7'] as const).map((text): [string, [string, Uint8Array][]] => [
        `an index holding ${text}`,
        [
          [INDEX, new TextEncoder().encode(text)],
          [FONT, ttf],
        ],
      ]),
    ];

    it.each(cases)('online, %s is downloaded again', async (_label, entries) => {
      const host = fakeHost({ routes: google({ Raleway: 700 }), cache: new Map(entries) });
      const { fonts, messages } = await resolveFonts('@font "Raleway" 700;', { host, entry: ENTRY, now: () => 2_000 });
      expect([fonts.map((f) => [f.origin, f.bytes.length]), messages, host.requests]).toEqual([
        [['google', ttf.length]],
        [],
        [CSS2, GSTATIC],
      ]);
    });

    it.each(cases)('offline, %s leaves the family unloaded with a font-load warning', async (_label, entries) => {
      const host = fakeHost({ offlineReason: '--offline', cache: new Map(entries) });
      const { fonts, messages } = await resolveFonts('@font "Raleway" 700;', { host, entry: ENTRY, now: () => 2_000 });
      expect([fonts, messages.map((m) => m.code)]).toEqual([[], ['font-load']]);
    });

    it('an index dated in the future is checked with Google again rather than trusted for ever', async () => {
      const cache = new Map<string, Uint8Array>([
        [INDEX, json({ ...good, fetchedAt: 10 ** 15 })],
        [FONT, ttf],
      ]);
      const host = fakeHost({ routes: google({ Raleway: 700 }), cache });
      const { fonts } = await resolveFonts('@font "Raleway" 700;', { host, entry: ENTRY, now: () => 2_000 });
      // The font URL is unchanged, so the cached file is reused without a second download.
      expect([fonts.map((f) => f.origin), host.requests]).toEqual([['google'], [CSS2]]);
      expect(JSON.parse(new TextDecoder().decode(cache.get(INDEX)))).toEqual({ ...good, fetchedAt: 2_000 });
    });
  });

  it('downloads font files only from fonts.gstatic.com', async () => {
    const elsewhere = 'https://evil.example/raleway.ttf';
    const host = fakeHost({
      routes: (url) => (url === elsewhere ? { status: 200, body: ttf } : { status: 200, body: cssFor(700, elsewhere) }),
    });
    const { fonts, messages } = await resolveFonts('@font "Raleway" 700;', { host, entry: ENTRY });
    expect([fonts, host.requests.includes(elsewhere), messages.map((m) => m.message)]).toEqual([
      [],
      false,
      [
        'Couldn\'t download "Raleway" from Google Fonts (Google Fonts sent a response with no font in it). Try again when you\'re online, or put the font in a fonts/ folder in your project.',
      ],
    ]);
  });

  it('the same family and weight twice loads once', async () => {
    const host = fakeHost({ routes: google({ Inter: 400 }) });
    const { fonts } = await resolveFonts('@font "Inter";\n@font "Inter" 400;', { host, entry: ENTRY });
    expect(fonts).toHaveLength(1);
  });
});

describe('buildFontRegistry', () => {
  it('registers every font and reuses parsed entries by id', async () => {
    const host = fakeHost({ files: { '/Inter.ttf': ttf } });
    const { fonts } = await resolveFonts('@font "./Inter.ttf";', { host, entry: ENTRY });
    const first = buildFontRegistry(fonts);
    expect([...first.registry.fonts.keys()]).toEqual(['Inter']);
    const again = buildFontRegistry(fonts, first.entries);
    expect(again.registry.fonts.get('Inter')![0]).toBe(first.registry.fonts.get('Inter')![0]);
  });
});
