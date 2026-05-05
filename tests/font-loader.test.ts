import { describe, it, expect } from 'vitest';
import { extractFontReferences, extractFontUrlFromGoogleFontsCss } from '../playground/services/font-loader';

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
