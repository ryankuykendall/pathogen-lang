/**
 * The playground and the Node hosts make the same Google Fonts decisions from
 * two copies of the logic (the playground can only reach shared code through
 * the IIFE bundle). These tests fail as soon as the copies disagree.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { minimalSfnt, ttfToWoff } from './font-bytes';
import {
  formatFontSubstitutions,
  GENERIC_FONT_FAMILIES as PLAYGROUND_GENERIC_FONT_FAMILIES,
} from '../../playground/services/font-loader';
import {
  CURATED_FONTS,
  getKnownVariants,
  nearestWeight as playgroundNearestWeight,
} from '../../playground/utils/google-fonts';
import { toBase64 } from '../../src/host/font-face-css';
import {
  buildCss2Url,
  CURATED_GOOGLE_FONTS,
  curatedVariants,
  fontFileKind,
  formatWeightSubstitution,
  nearestWeight,
  parseCss2Response,
  sfntLooksComplete,
  woffLooksComplete,
} from '../../src/host/google-fonts';
import { GENERIC_FONT_FAMILIES } from '../../src/host/paths';

describe('catalog parity with the playground', () => {
  it('the curated family list and weights are identical', () => {
    expect(CURATED_GOOGLE_FONTS).toEqual(CURATED_FONTS);
  });

  it.each(CURATED_FONTS.map((f) => f.family))('known weights agree for %s', (family) => {
    expect(curatedVariants(family)).toEqual(getKnownVariants(family));
  });

  it('a family outside the catalog has unknown weights in both', () => {
    expect(curatedVariants('Gravitas One')).toBeNull();
    expect(getKnownVariants('Gravitas One')).toBeNull();
  });
});

describe('weight decisions match the playground', () => {
  const variantSets = [[400], [400, 700], [100, 300, 400, 500, 700, 900], [200, 300, 400, 600, 700, 900]];
  const requests = [100, 150, 250, 350, 450, 500, 550, 650, 750, 800, 850, 900, 950];

  it('nearestWeight gives the same answer on every request and variant set', () => {
    for (const variants of variantSets) {
      for (const requested of requests) {
        expect([variants, requested, nearestWeight(requested, variants)]).toEqual([
          variants,
          requested,
          playgroundNearestWeight(requested, variants),
        ]);
      }
    }
  });

  it('substitution warnings are worded the same', () => {
    const cases = [
      { family: 'Gravitas One', requested: 700, used: 400, available: [] },
      { family: 'Baumans', requested: 900, used: 400, available: [400] },
      { family: 'Raleway', requested: 650, used: 600, available: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
    ];
    expect(cases.map(formatWeightSubstitution)).toEqual(formatFontSubstitutions(cases));
  });
});

describe('small shared helpers', () => {
  it('builds the css2 request with and without a weight', () => {
    expect(buildCss2Url('Noto Sans SC', 400)).toBe(
      'https://fonts.googleapis.com/css2?family=Noto%20Sans%20SC:wght@400&display=swap',
    );
    expect(buildCss2Url('Baumans')).toBe('https://fonts.googleapis.com/css2?family=Baumans&display=swap');
  });

  it('reads the URL and weight from a non-browser css2 response', () => {
    const css =
      "@font-face {\n  font-family: 'Raleway';\n  font-style: normal;\n  font-weight: 700;\n  font-display: swap;\n  src: url(https://fonts.gstatic.com/s/raleway/v37/x.ttf) format('truetype');\n}\n";
    expect(parseCss2Response(css)).toEqual({ url: 'https://fonts.gstatic.com/s/raleway/v37/x.ttf', weight: 700 });
    expect(parseCss2Response('<!DOCTYPE html>')).toBeNull();
  });

  it('takes a font URL only from fonts.gstatic.com, over HTTPS', () => {
    const css = (url: string) => `@font-face {\n  font-weight: 400;\n  src: url(${url}) format('truetype');\n}\n`;
    expect(
      [
        'https://evil.example/x.ttf',
        'https://fonts.gstatic.com.evil.example/x.ttf',
        'http://fonts.gstatic.com/s/x/v1/x.ttf',
      ].map((url) => parseCss2Response(css(url))),
    ).toEqual([null, null, null]);
    expect(parseCss2Response(css('https://fonts.gstatic.com/s/x/v1/x.ttf'))).toEqual({
      url: 'https://fonts.gstatic.com/s/x/v1/x.ttf',
      weight: 400,
    });
  });

  it('a TrueType or OpenType file is complete only when every table lies inside it', () => {
    const inter = new Uint8Array(readFileSync(join(__dirname, '..', 'fixtures', 'fonts', 'Inter-Regular.ttf')));
    const otto = minimalSfnt('cff');
    otto.set([0x4f, 0x54, 0x54, 0x4f]); // 'OTTO'
    const pastTheEnd = minimalSfnt('data');
    new DataView(pastTheEnd.buffer).setUint32(12 + 12, 5); // claims 5 bytes; the file holds 4
    expect(
      [
        inter,
        otto,
        minimalSfnt(),
        inter.subarray(0, Math.floor(inter.length / 2)),
        inter.subarray(0, 12), // the header alone
        new Uint8Array(),
        pastTheEnd,
        new TextEncoder().encode('wOF2 and more bytes than a header'),
      ].map(sfntLooksComplete),
    ).toEqual([true, true, true, false, false, false, false, false]);
  });

  it('a WOFF file is complete only when its stated length and every table fit', () => {
    const inter = new Uint8Array(readFileSync(join(__dirname, '..', 'fixtures', 'fonts', 'Inter-Regular.ttf')));
    const compressed = ttfToWoff(inter);
    const stored = ttfToWoff(inter, { compress: false });
    const longer = new Uint8Array(compressed.length + 4);
    longer.set(compressed); // bytes past the length the header states
    expect(
      [
        compressed,
        stored,
        compressed.subarray(0, compressed.length - 1),
        compressed.subarray(0, 44), // the header alone
        longer,
        inter, // a TrueType file is not a WOFF file
      ].map(woffLooksComplete),
    ).toEqual([true, true, false, false, false, false]);
  });

  it('recognizes font files by signature', () => {
    const tag = (s: string) => Uint8Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
    expect(fontFileKind(new Uint8Array([0, 1, 0, 0, 9]))).toBe('ttf');
    expect(fontFileKind(tag('OTTO'))).toBe('otf');
    expect(fontFileKind(tag('wOFF'))).toBe('woff');
    expect(fontFileKind(tag('wOF2'))).toBe('woff2');
    expect(fontFileKind(tag('ttcf'))).toBe('collection');
    expect(fontFileKind(tag('<htm'))).toBeNull();
  });

  it('the generic family set is the playground set', () => {
    expect([...GENERIC_FONT_FAMILIES].sort()).toEqual([...PLAYGROUND_GENERIC_FONT_FAMILIES].sort());
  });

  it('base64 matches Node for every remainder length', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 255, 1024]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 37 + 11) & 0xff);
      expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});
