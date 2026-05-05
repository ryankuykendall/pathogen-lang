import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  extractFontReferences,
  extractFontUrlFromGoogleFontsCss,
  resolveFontBinaries,
  fetchFontBinary,
} from '../playground/services/font-loader';

describe('extractFontReferences', () => {
  it('extracts family and weight from @font directive', () => {
    const refs = extractFontReferences(`@font "Raleway" 400;`);
    expect(refs).toEqual([{ family: 'Raleway', weight: 400 }]);
  });

  it('extracts family without weight from @font directive', () => {
    const refs = extractFontReferences(`@font "Inter";`);
    expect(refs).toEqual([{ family: 'Inter', weight: undefined }]);
  });

  it('skips file-path @font directives', () => {
    const refs = extractFontReferences(`@font "../../../../fonts/Raleway/Raleway-Bold.ttf"`);
    expect(refs).toEqual([]);
  });

  it('extracts font-family from style block (default weight)', () => {
    const refs = extractFontReferences('let s = ${ font-family: Roboto; font-size: 24; };');
    expect(refs).toEqual([{ family: 'Roboto' }]);
  });

  it('pairs font-family with font-weight in the same style block', () => {
    const refs = extractFontReferences('let s = ${ font-family: Roboto; font-weight: 700; font-size: 24; };');
    expect(refs).toEqual([{ family: 'Roboto', weight: 700 }]);
  });

  it('skips generic font families', () => {
    const refs = extractFontReferences('let s = ${ font-family: system-ui, sans-serif; };');
    expect(refs).toEqual([]);
  });

  it('skips legacy filename-shaped families (Raleway-Bold, BebasNeue-Regular, etc.)', () => {
    const refs = extractFontReferences(`
      let s1 = \${ font-family: Raleway-Bold; };
      let s2 = \${ font-family: BebasNeue-Regular; };
      let s3 = \${ font-family: Inter-SemiBold; };
    `);
    expect(refs).toEqual([]);
  });

  it('deduplicates the same family+weight across multiple references', () => {
    const refs = extractFontReferences(`
      @font "Roboto" 400;
      let a = \${ font-family: Roboto; font-weight: 400; };
      let b = \${ font-family: Roboto; };
    `);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ family: 'Roboto', weight: 400 });
  });

  it('handles multiple distinct font references', () => {
    const refs = extractFontReferences(`
      @font "Inter" 400;
      let bold = \${ font-family: Inter; font-weight: 700; };
    `);
    expect(refs).toEqual(
      expect.arrayContaining([
        { family: 'Inter', weight: 400 },
        { family: 'Inter', weight: 700 },
      ]),
    );
    expect(refs).toHaveLength(2);
  });

  it('quoted family names in style blocks are unquoted', () => {
    const refs = extractFontReferences(`let s = \${ font-family: "Fira Sans"; font-weight: 200; };`);
    expect(refs).toEqual([{ family: 'Fira Sans', weight: 200 }]);
  });
});

describe('extractFontUrlFromGoogleFontsCss', () => {
  it('picks the latin block from multi-block WOFF2 CSS', () => {
    const css = `/* cyrillic-ext */
@font-face {
  font-family: 'Raleway';
  src: url(https://fonts.gstatic.com/s/raleway/v37/cyrillic-ext.woff2) format('woff2');
}
/* cyrillic */
@font-face {
  font-family: 'Raleway';
  src: url(https://fonts.gstatic.com/s/raleway/v37/cyrillic.woff2) format('woff2');
}
/* latin */
@font-face {
  font-family: 'Raleway';
  src: url(https://fonts.gstatic.com/s/raleway/v37/latin.woff2) format('woff2');
}`;
    expect(extractFontUrlFromGoogleFontsCss(css)).toBe('https://fonts.gstatic.com/s/raleway/v37/latin.woff2');
  });

  it('falls back to the first src url when no latin block exists', () => {
    const css = `@font-face {
  font-family: 'Raleway';
  src: url(https://fonts.gstatic.com/foo.ttf) format('truetype');
}`;
    expect(extractFontUrlFromGoogleFontsCss(css)).toBe('https://fonts.gstatic.com/foo.ttf');
  });

  it('handles src with local() prefix before url()', () => {
    const css = `@font-face {
  src: local('Raleway'), url(https://fonts.gstatic.com/foo.ttf) format('truetype');
}`;
    expect(extractFontUrlFromGoogleFontsCss(css)).toBe('https://fonts.gstatic.com/foo.ttf');
  });

  it('returns null when CSS contains no url()', () => {
    expect(extractFontUrlFromGoogleFontsCss('not a font face')).toBeNull();
  });
});

describe('fetchFontBinary failure surfacing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns { ok: false, reason } for a CSS fetch 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    const outcome = await fetchFontBinary('NotARealFamily404Test', 400);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure outcome');
    expect(outcome.reason).toMatch(/Google Fonts CSS fetch failed: 404/);
  });

  it('returns { ok: false, reason } when CSS has no extractable URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not a font face', { status: 200 })),
    );

    const outcome = await fetchFontBinary('NoUrlFamilyTest', 400);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure outcome');
    expect(outcome.reason).toMatch(/Could not extract font URL/);
  });

  it('returns { ok: false, reason } when binary fetch fails', async () => {
    const css = `/* latin */ @font-face { src: url(https://fonts.gstatic.com/test.ttf) format('truetype'); }`;
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call++;
        if (call === 1) return new Response(css, { status: 200 });
        return new Response('', { status: 500 });
      }),
    );

    const outcome = await fetchFontBinary('BinaryFailFamilyTest', 400);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure outcome');
    expect(outcome.reason).toMatch(/Font binary fetch failed: 500/);
  });

  it('refuses to fetch CSS generic family names with a clear reason', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const outcome = await fetchFontBinary('sans-serif', 400);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure outcome');
    expect(outcome.reason).toMatch(/CSS generic family/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns { ok: false, reason: "WOFF2 decode failed: …" } when WOFF2 decompression rejects', async () => {
    // WOFF2 magic bytes: 'wOF2' = 0x77 0x4F 0x46 0x32
    const woff2Header = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]);
    const css = `/* latin */ @font-face { src: url(https://fonts.gstatic.com/test.woff2) format('woff2'); }`;
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call++;
        if (call === 1) return new Response(css, { status: 200 });
        return new Response(woff2Header.buffer, { status: 200 });
      }),
    );

    // The WOFF2 branch in fetchFontBinaryUncached() is wrapped in a try/catch
    // that converts any decoder rejection into a `WOFF2 decode failed: …`
    // reason. In this test env the dynamic import of '../vendor/woff2-decompress.js'
    // has no resolvable file (vendor lives at public/pathogen/vendor/ post-build,
    // not playground/vendor/), so the import itself rejects — but even if it
    // were vendored to the test path, an 8-byte magic-only buffer would still
    // fail the decoder. Either way we land in our typed-reason branch.
    const outcome = await fetchFontBinary('Woff2DecodeFailureTest', 400);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure outcome');
    expect(outcome.reason).toMatch(/WOFF2 decode failed:/);
  });
});

describe('resolveFontBinaries partitioning', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns one binary and one failure when one fetch succeeds and one 404s', async () => {
    const css = `/* latin */ @font-face { src: url(https://fonts.gstatic.com/ok.ttf) format('truetype'); }`;
    // A minimal 8-byte TTF-shaped buffer is fine for this test — we never
    // parse it, only confirm it's threaded through to `binaries`.
    const ttfBuffer = new Uint8Array(8).buffer;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('MixSuccessFamily')) return new Response(css, { status: 200 });
        if (url.includes('ok.ttf')) return new Response(ttfBuffer, { status: 200 });
        if (url.includes('MixFailureFamily')) return new Response('', { status: 404 });
        return new Response('', { status: 500 });
      }),
    );

    const result = await resolveFontBinaries([
      { family: 'MixSuccessFamily', weight: 400 },
      { family: 'MixFailureFamily', weight: 400 },
    ]);

    expect(result.binaries).toHaveLength(1);
    expect(result.binaries[0]).toMatchObject({
      family: 'MixSuccessFamily',
      weight: 400,
      style: 'normal',
    });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      family: 'MixFailureFamily',
      weight: 400,
    });
    expect(result.failures[0].reason).toMatch(/404/);
  });

  it('returns no binaries and no failures for an empty input list', async () => {
    const result = await resolveFontBinaries([]);
    expect(result.binaries).toEqual([]);
    expect(result.failures).toEqual([]);
  });
});
