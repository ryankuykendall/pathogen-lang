import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { annotateUncuratedResolution } from '../playground/services/compiler-worker';
import type { FontBinaryEntry } from '../playground/services/font-loader';

const binary = (family: string, weight = 400): FontBinaryEntry => ({
  family,
  weight,
  style: 'normal',
  buffer: new ArrayBuffer(4),
});

describe('annotateUncuratedResolution', () => {
  it('emits the curated-list notice for an uncurated family that loaded', () => {
    const { notices, failures } = annotateUncuratedResolution(
      { binaries: [binary('Gravitas One')], failures: [] },
      new Set(['Gravitas One']),
    );
    expect(notices).toEqual([
      '"Gravitas One" is not in the curated font list; loaded directly from Google Fonts.',
    ]);
    expect(failures).toEqual([]);
  });

  it('emits no notice for an uncurated family that failed to load', () => {
    const { notices } = annotateUncuratedResolution(
      { binaries: [], failures: [{ family: 'MadeUpName', weight: 400, reason: 'Failed to fetch' }] },
      new Set(['MadeUpName']),
    );
    expect(notices).toEqual([]);
  });

  it('rewrites uncurated failure reasons to the probe message, preserving the raw reason', () => {
    const { failures } = annotateUncuratedResolution(
      { binaries: [], failures: [{ family: 'MadeUpName', weight: 400, reason: 'Failed to fetch' }] },
      new Set(['MadeUpName']),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe(
      'Could not load "MadeUpName" from Google Fonts — the font was not found, ' +
        'or the network request failed. Check the spelling against fonts.google.com, ' +
        'or open the font picker for the curated list. (Failed to fetch)',
    );
  });

  it('leaves curated-family failures untouched — their raw CDN reason is accurate', () => {
    const failure = { family: 'Roboto', weight: 400, reason: 'Google Fonts CSS fetch failed: 500' };
    const { failures } = annotateUncuratedResolution(
      { binaries: [], failures: [failure] },
      new Set<string>(),
    );
    expect(failures).toEqual([failure]);
  });

  it('leaves generic-family rejections untouched via the structured code', () => {
    const failure = {
      family: 'sans-serif',
      weight: 400,
      reason: "'sans-serif' is a CSS generic family and cannot be fetched from Google Fonts",
      code: 'generic-family' as const,
    };
    const { failures } = annotateUncuratedResolution(
      { binaries: [], failures: [failure] },
      new Set(['sans-serif']),
    );
    expect(failures).toEqual([failure]);
  });

  it('emits one notice per family even with multiple loaded weights', () => {
    const { notices } = annotateUncuratedResolution(
      { binaries: [binary('Gravitas One', 400), binary('Gravitas One', 700)], failures: [] },
      new Set(['Gravitas One']),
    );
    expect(notices).toHaveLength(1);
  });
});

describe('resolveMissingGlyphSubsets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const cjkCss = (family: string) => `@font-face {
  font-family: '${family}';
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/fake/k0.woff2) format('woff2');
  unicode-range: U+AC00-AC1F;
}
@font-face {
  font-family: '${family}';
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/fake/k1.woff2) format('woff2');
  unicode-range: U+D700-D7A3;
}
/* latin */
@font-face {
  font-family: '${family}';
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/fake/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}`;

  async function seedSubsetIndex(family: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('https://fonts.googleapis.com/css2')) {
          return new Response(cjkCss(family), { status: 200 });
        }
        return new Response(new Uint8Array([1, 2, 3, 4]).buffer, { status: 200 });
      }),
    );
    const { fetchFontBinary } = await import('../playground/services/font-loader');
    const outcome = await fetchFontBinary(family, 400);
    if (!outcome.ok) throw new Error(`seed fetch failed: ${outcome.reason}`);
    return binary(family, 400);
  }

  it('fetches covering slices and recompiles once, then stops when the report clears', async () => {
    const { resolveMissingGlyphSubsets } = await import('../playground/services/compiler-worker');
    const primary = await seedSubsetIndex('GlyphLoopFixTest');

    const first = { missingGlyphs: [{ family: 'GlyphLoopFixTest', weight: 400, chars: ['가'] }] };
    const second = { missingGlyphs: undefined };
    const recompile = vi.fn(async () => second);

    const { result, binaries } = await resolveMissingGlyphSubsets(first, recompile, [primary]);

    expect(result).toBe(second);
    expect(recompile).toHaveBeenCalledTimes(1);
    expect(binaries).toHaveLength(2);
    expect(binaries[1]).toMatchObject({
      family: 'GlyphLoopFixTest',
      weight: 400,
      subsetUrl: 'https://fonts.gstatic.com/s/fake/k0.woff2',
      unicodeRanges: [[0xac00, 0xac1f]],
    });
  });

  it('does not recompile when no slice covers the missing chars', async () => {
    const { resolveMissingGlyphSubsets } = await import('../playground/services/compiler-worker');
    const primary = await seedSubsetIndex('GlyphLoopUncoveredTest');

    // U+4E00 is outside every slice range — nothing fetchable
    const first = { missingGlyphs: [{ family: 'GlyphLoopUncoveredTest', weight: 400, chars: ['一'] }] };
    const recompile = vi.fn();

    const { result, binaries } = await resolveMissingGlyphSubsets(first, recompile, [primary]);

    expect(result).toBe(first); // unchanged — its [warn] logs stand
    expect(recompile).not.toHaveBeenCalled();
    expect(binaries).toEqual([primary]);
  });

  it('fetches the slices a Font selection overlaps (fontCoverageRequests), then stops', async () => {
    const { resolveMissingGlyphSubsets } = await import('../playground/services/compiler-worker');
    const primary = await seedSubsetIndex('FontCoverageRangeTest');

    // Ranges overlap only k1 (U+D700-D7A3).
    const first = { fontCoverageRequests: [{ family: 'FontCoverageRangeTest', weight: 400, ranges: [[0xd7a0, 0xd7a3]] }] };
    const second = { fontCoverageRequests: [{ family: 'FontCoverageRangeTest', weight: 400, ranges: [[0xd7a0, 0xd7a3]] }] };
    const recompile = vi.fn(async () => second);

    const { result, binaries, notices } = await resolveMissingGlyphSubsets(first, recompile, [primary]);

    expect(recompile).toHaveBeenCalledTimes(1); // second pass finds nothing new
    expect(result).toBe(second);
    expect(binaries.map((b) => b.subsetUrl)).toEqual([undefined, 'https://fonts.gstatic.com/s/fake/k1.woff2']);
    expect(notices).toEqual([]);
  });

  it('a whole-font request (ranges null) fetches every slice and notes it for the banner', async () => {
    const { resolveMissingGlyphSubsets } = await import('../playground/services/compiler-worker');
    const primary = await seedSubsetIndex('FontCoverageAllTest');

    const first = { fontCoverageRequests: [{ family: 'FontCoverageAllTest', weight: 400, ranges: null }] };
    const recompile = vi.fn(async () => ({}));

    const { binaries, notices } = await resolveMissingGlyphSubsets(first, recompile, [primary]);

    expect(recompile).toHaveBeenCalledTimes(1);
    expect(binaries.map((b) => b.subsetUrl).sort()).toEqual(
      [undefined, 'https://fonts.gstatic.com/s/fake/k0.woff2', 'https://fonts.gstatic.com/s/fake/k1.woff2'].sort(),
    );
    expect(notices).toEqual([
      'Loaded all 3 slices of "FontCoverageAllTest" from Google Fonts (0.0 MB) for a Font call that needs the whole font.',
    ]);
  });

  it('recoverFontCoverage: a compile that failed before its slices loaded is retried once they are fetched', async () => {
    const { recoverFontCoverage } = await import('../playground/services/compiler-worker');
    const primary = await seedSubsetIndex('FontCoverageRetryTest');
    const failure = Object.assign(new Error('Index 0 is out of range'), {
      fontCoverageRequests: [{ family: 'FontCoverageRetryTest', weight: 400, ranges: [[0xac00, 0xac10]] }],
    });
    const ok = { layers: [] };
    const recompile = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(ok);

    const { first, binaries } = await recoverFontCoverage(recompile, [primary]);

    expect(first).toBe(ok);
    expect(recompile).toHaveBeenCalledTimes(2);
    expect(binaries.map((b) => b.subsetUrl)).toEqual([undefined, 'https://fonts.gstatic.com/s/fake/k0.woff2']);
  });

  it('recoverFontCoverage: a second dependent failure is recovered too', async () => {
    const { recoverFontCoverage } = await import('../playground/services/compiler-worker');
    const primary = await seedSubsetIndex('FontCoverageTwoStepTest');
    const fail = (lo: number, hi: number) =>
      Object.assign(new Error('Index 0 is out of range'), {
        fontCoverageRequests: [{ family: 'FontCoverageTwoStepTest', weight: 400, ranges: [[lo, hi]] }],
      });
    const ok = { layers: [] };
    const recompile = vi
      .fn()
      .mockRejectedValueOnce(fail(0xac00, 0xac10)) // needs k0
      .mockRejectedValueOnce(fail(0xd700, 0xd710)) // then needs k1
      .mockResolvedValueOnce(ok);
    const { first, binaries } = await recoverFontCoverage(recompile, [primary]);
    expect(first).toBe(ok);
    expect(recompile).toHaveBeenCalledTimes(3);
    expect(binaries.map((b) => b.subsetUrl)).toEqual([
      undefined,
      'https://fonts.gstatic.com/s/fake/k0.woff2',
      'https://fonts.gstatic.com/s/fake/k1.woff2',
    ]);
  });

  it('recoverFontCoverage: with nothing to fetch, the original error stands', async () => {
    const { recoverFontCoverage } = await import('../playground/services/compiler-worker');
    const primary = await seedSubsetIndex('FontCoverageNoRetryTest');
    const failure = Object.assign(new Error('Index 0 is out of range'), {
      fontCoverageRequests: [{ family: 'FontCoverageNoRetryTest', weight: 400, ranges: [[0x4e00, 0x4e09]] }],
    });
    const recompile = vi.fn().mockRejectedValueOnce(failure);
    await expect(recoverFontCoverage(recompile, [primary])).rejects.toBe(failure);
    expect(recompile).toHaveBeenCalledTimes(1);
    // A plain failure is never retried.
    const plain = new Error('Unknown variable x');
    await expect(recoverFontCoverage(vi.fn().mockRejectedValueOnce(plain), [primary])).rejects.toBe(plain);
  });

  it('never exceeds 2 recompile passes even if misses keep being reported', async () => {
    const { resolveMissingGlyphSubsets } = await import('../playground/services/compiler-worker');
    const primary = await seedSubsetIndex('GlyphLoopCapTest');

    // Each recompile reports a NEW fetchable char, so only the pass cap stops the loop.
    const reports = [
      { missingGlyphs: [{ family: 'GlyphLoopCapTest', weight: 400, chars: ['힣'] }] }, // k1
      { missingGlyphs: [{ family: 'GlyphLoopCapTest', weight: 400, chars: ['가'] }] }, // k0 — never acted on
    ];
    let call = 0;
    const recompile = vi.fn(async () => reports[call++]);

    const first = { missingGlyphs: [{ family: 'GlyphLoopCapTest', weight: 400, chars: ['가'] }] };
    await resolveMissingGlyphSubsets(first, recompile, [primary]);

    expect(recompile).toHaveBeenCalledTimes(2);
  });

  it('returns results without a missingGlyphs field untouched', async () => {
    const { resolveMissingGlyphSubsets } = await import('../playground/services/compiler-worker');
    const plain = { layers: [] };
    const recompile = vi.fn();
    const { result } = await resolveMissingGlyphSubsets(plain, recompile, []);
    expect(result).toBe(plain);
    expect(recompile).not.toHaveBeenCalled();
  });
});

describe('the shared @font plan in the playground (same rules and messages as the CLI)', () => {
  beforeEach(async () => {
    // The playground reaches the shared code through the library global.
    const lib = await import('../src');
    (globalThis as Record<string, unknown>).window = Object.assign(
      ((globalThis as Record<string, unknown>).window as object | undefined) ?? {},
      {
        PathogenLang: {
          parse: lib.parse,
          resolveFontDirectives: lib.resolveFontDirectives,
          planFontDirectives: lib.planFontDirectives,
        },
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('no network in this test');
      }),
    );
  });
  afterEach(() => {
    delete ((globalThis as Record<string, unknown>).window as { PathogenLang?: unknown }).PathogenLang;
    vi.unstubAllGlobals();
  });

  it('a source mistake stops the compile with the CLI message at its line', async () => {
    const { resolveFontsForSource } = await import('../playground/services/compiler-worker');
    const result = await resolveFontsForSource('M 0 0\n@font "serif";');
    expect(result.sourceError).toBe(
      'Line 2, col 1: @font "serif": serif is a CSS generic family, not a font. Name a font family instead, such as @font "Noto Serif";',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a file path is skipped with a warning that names the family to use, and nothing is fetched', async () => {
    const { resolveFontsForSource } = await import('../playground/services/compiler-worker');
    const result = await resolveFontsForSource('@font "./fonts/Raleway-Bold.ttf";\nM 0 0');
    expect(result.sourceError).toBeUndefined();
    expect(result.failures).toEqual([]);
    expect(result.notices).toEqual([
      '@font "./fonts/Raleway-Bold.ttf": the playground can\'t load font files yet, so this font was skipped. Use the Google Fonts family instead: @font "Raleway" 700;',
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('when the program also calls the font, its error keeps the file-path warning for the banner', async () => {
    const lib = await import('../src');
    const global = window as unknown as { PathogenLang: Record<string, unknown> };
    global.PathogenLang = { ...global.PathogenLang, compile: lib.compile };
    const { compile } = await import('../playground/services/compiler-worker');
    // A file font's family is its file name, as in the CLI.
    const source = [
      '@font "./fonts/Raleway-Bold.ttf";',
      'let s = #{ font-family: Raleway-Bold; font-size: 48; };',
      'let g = PathBlock.fromGlyph("A", s);',
    ].join('\n');
    const err = (await compile(source, 1, undefined, {}).catch((e: unknown) => e)) as Error & { fontNotices?: string[] };
    expect(err.message).toMatch(/no fonts were loaded/);
    expect(err.fontNotices).toEqual([
      '@font "./fonts/Raleway-Bold.ttf": the playground can\'t load font files yet, so this font was skipped. Use the Google Fonts family instead: @font "Raleway" 700;',
    ]);
  });

  it('the no-worker fallback registers fonts with their partial flag, as the worker does', async () => {
    const { fallbackSync } = await import('../playground/services/compiler-worker');
    const added: unknown[][] = [];
    (window as unknown as { PathogenLang: Record<string, unknown> }).PathogenLang = {
      createFontRegistry: () => ({ fonts: new Map() }),
      addFont: (...args: unknown[]) => added.push(args),
      ensureOpentype: async () => undefined,
      compile: () => 'compiled',
    };
    const sliced = {
      ...binary('Noto Sans SC'),
      unicodeRanges: [[0x4e00, 0x4e3f]] as [number, number][],
      partial: true,
    };
    await expect(fallbackSync('compile', 'M 0 0', {}, [sliced])).resolves.toBe('compiled');
    expect(added.map((args) => [args[1], args[6]])).toEqual([['Noto Sans SC', true]]);
  });

  it('a file named outside the curated list gets a general suggestion', async () => {
    const { fileFontNotice } = await import('../playground/services/font-loader');
    expect(fileFontNotice('../art/MyHandwriting.otf')).toBe(
      '@font "../art/MyHandwriting.otf": the playground can\'t load font files yet, so this font was skipped. Use a family from Google Fonts instead, such as @font "Inter";',
    );
  });
});
