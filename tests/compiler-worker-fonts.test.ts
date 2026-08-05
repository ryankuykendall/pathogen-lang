import { describe, it, expect, vi, afterEach } from 'vitest';
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
