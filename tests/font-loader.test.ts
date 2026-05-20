import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  extractFontReferences,
  extractFontUrlFromGoogleFontsCss,
  extractUnknownFontDirectiveFamilies,
  fontBinariesToCss,
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

  it('drops unknown families from style blocks so partial typing does not hit Google Fonts', () => {
    // Simulates the user typing "Josephin Sans" one character at a time
    // in the font picker. Each intermediate state must NOT extract — the
    // playground recompiles per keystroke and unknown fetches accumulate
    // 400/CORS errors and risk rate-limits. Only the completed name resolves.
    const partials = ['Joseph', 'Josephi', 'Josephin', 'Josephin S', 'Josephin Sa', 'Josephin San'];
    for (const partial of partials) {
      const refs = extractFontReferences(`let s = \${ font-family: ${partial}; };`);
      expect(refs, `partial "${partial}" should not extract`).toEqual([]);
    }
    // Once the user finishes typing, the known family DOES extract.
    const refs = extractFontReferences(`let s = \${ font-family: "Josefin Sans"; };`);
    expect(refs).toEqual([{ family: 'Josefin Sans' }]);
  });

  it('drops unknown families from @font directives — picker is the authoritative source', () => {
    const refs = extractFontReferences(`@font "TotallyMadeUpFontName" 400;`);
    expect(refs).toEqual([]);
  });

  it('keeps known families alongside dropped unknown ones in mixed sources', () => {
    const refs = extractFontReferences(`
      @font "Roboto" 400;
      @font "NotARealFont" 700;
      let s = \${ font-family: "ImaginaryThing"; };
      let t = \${ font-family: "Inter"; font-weight: 500; };
    `);
    expect(refs).toEqual(
      expect.arrayContaining([
        { family: 'Roboto', weight: 400 },
        { family: 'Inter', weight: 500 },
      ]),
    );
    expect(refs).toHaveLength(2);
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

describe('fontBinariesToCss', () => {
  it('returns an empty string for an empty input list', () => {
    expect(fontBinariesToCss([])).toBe('');
  });

  it('emits an @font-face block with a data URI for one entry', () => {
    // 4 bytes "abcd" → base64 "YWJjZA=="
    const buffer = new Uint8Array([0x61, 0x62, 0x63, 0x64]).buffer;
    const css = fontBinariesToCss([
      { family: 'Roboto Condensed', weight: 300, style: 'normal', buffer },
    ]);

    expect(css).toContain('font-family: "Roboto Condensed"');
    expect(css).toContain('font-weight: 300');
    expect(css).toContain('font-style: normal');
    expect(css).toContain('src: url("data:font/ttf;base64,YWJjZA==") format("truetype")');
  });

  it('emits one @font-face block per entry, separated by newlines', () => {
    const buf = new Uint8Array([0x00]).buffer;
    const css = fontBinariesToCss([
      { family: 'Inter', weight: 400, style: 'normal', buffer: buf },
      { family: 'Inter', weight: 700, style: 'normal', buffer: buf },
    ]);

    const blocks = css.split('@font-face').filter((s) => s.trim().length > 0);
    expect(blocks).toHaveLength(2);
    expect(css).toContain('font-weight: 400');
    expect(css).toContain('font-weight: 700');
    // Verify the join separator: the first block's closing brace is followed
    // by a newline and then the next block's @font-face.
    expect(css).toContain('}\n@font-face');
  });

  it('escapes embedded quotes in font family names', () => {
    const buf = new Uint8Array([0x00]).buffer;
    const css = fontBinariesToCss([
      { family: 'Quote"Injection', weight: 400, style: 'normal', buffer: buf },
    ]);
    expect(css).toContain('font-family: "Quote\\"Injection"');
  });

  it('handles font buffers larger than the 32KB chunked-base64 boundary', () => {
    // 64KB of nonzero bytes — exercises the chunked btoa path. A naive
    // String.fromCharCode(...new Uint8Array(buffer)) would throw "Maximum
    // call stack size exceeded" on inputs of this size.
    const bytes = new Uint8Array(64 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    const css = fontBinariesToCss([
      { family: 'Big', weight: 400, style: 'normal', buffer: bytes.buffer },
    ]);
    const b64Match = css.match(/data:font\/ttf;base64,([^"]+)/);
    expect(b64Match).not.toBeNull();
    // 64KB binary → 65536 bytes = 21845 full 3-byte groups + 1 tail byte.
    // 21845 * 4 = 87380 base64 chars for full groups, plus 4 (2 chars + "==")
    // for the padded tail = 87384 total.
    expect(b64Match![1].length).toBe(87384);
  });
});

describe('extractUnknownFontDirectiveFamilies', () => {
  it('returns nothing for a known @font directive', () => {
    expect(extractUnknownFontDirectiveFamilies(`@font "Roboto" 400;`)).toEqual([]);
  });

  it('returns the family for an unknown @font directive', () => {
    expect(extractUnknownFontDirectiveFamilies(`@font "MadeUpName" 400;`)).toEqual([
      { family: 'MadeUpName', weight: 400 },
    ]);
  });

  it('omits weight when the directive has none', () => {
    expect(extractUnknownFontDirectiveFamilies(`@font "MadeUpName";`)).toEqual([
      { family: 'MadeUpName' },
    ]);
  });

  it('skips file-path @font directives — they are host-loaded, not Google Fonts', () => {
    expect(
      extractUnknownFontDirectiveFamilies(`@font "../../../../fonts/Raleway/Raleway-Bold.ttf"`),
    ).toEqual([]);
  });

  it('ignores style-block unknowns — only @font is reported to avoid keystroke noise', () => {
    expect(
      extractUnknownFontDirectiveFamilies(`let s = \${ font-family: "PartialTypingHere"; };`),
    ).toEqual([]);
  });

  it('returns all unknown families when multiple are present', () => {
    const refs = extractUnknownFontDirectiveFamilies(`
      @font "FirstFakeFont" 400;
      @font "SecondFakeFont" 700;
    `);
    expect(refs).toEqual(
      expect.arrayContaining([
        { family: 'FirstFakeFont', weight: 400 },
        { family: 'SecondFakeFont', weight: 700 },
      ]),
    );
    expect(refs).toHaveLength(2);
  });

  it('returns just the unknowns in a mixed known+unknown source', () => {
    const refs = extractUnknownFontDirectiveFamilies(`
      @font "Roboto" 400;
      @font "NotARealFont" 700;
      let t = \${ font-family: "Inter"; };
    `);
    expect(refs).toEqual([{ family: 'NotARealFont', weight: 700 }]);
  });

  it('deduplicates repeated unknown directives at the same weight', () => {
    const refs = extractUnknownFontDirectiveFamilies(`
      @font "MadeUp" 400;
      @font "MadeUp" 400;
    `);
    expect(refs).toEqual([{ family: 'MadeUp', weight: 400 }]);
  });
});
