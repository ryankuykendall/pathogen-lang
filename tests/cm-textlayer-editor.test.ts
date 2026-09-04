import { describe, expect, it } from 'vitest';

import { findFontTargets } from '../playground/utils/cm-textlayer-editor.js';
import { parseLezer } from '../src';

function targets(source: string) {
  const { tree } = parseLezer(source);
  return findFontTargets(tree, source);
}

describe('findFontTargets (AST-based)', () => {
  describe('TextLayer targets', () => {
    it('detects `define TextLayer(...) ${...}`', () => {
      const src = "define TextLayer('labels') #{ font-family: 'Inter'; font-size: 14; };";
      const t = targets(src);
      expect(t).toHaveLength(1);
      expect(t[0].kind).toBe('textlayer');
      if (t[0].kind !== 'textlayer') return;
      expect(t[0].buttonPos).toBe(src.indexOf('TextLayer') + 'TextLayer'.length);
      expect(src.slice(t[0].blockFrom, t[0].blockTo)).toContain("font-family: 'Inter'");
      expect(t[0].props.get('font-family')).toBe("'Inter'");
      expect(t[0].props.get('font-size')).toBe('14');
    });

    it('detects `let x = TextLayer(...) ${...}` (the previously-missing form)', () => {
      const src = "let labels = TextLayer('labels') #{ font-family: 'Inter'; };";
      const t = targets(src);
      expect(t).toHaveLength(1);
      expect(t[0].kind).toBe('textlayer');
      if (t[0].kind !== 'textlayer') return;
      expect(t[0].buttonPos).toBe(src.indexOf('TextLayer') + 'TextLayer'.length);
      expect(t[0].props.get('font-family')).toBe("'Inter'");
    });

    it('skips TextLayer() with no style block', () => {
      const src = "define TextLayer('labels');";
      expect(targets(src)).toEqual([]);
    });

    it('skips PathLayer (not a TextLayer)', () => {
      const src = "define PathLayer('outline') #{ stroke: #f00; };";
      expect(targets(src)).toEqual([]);
    });

    it('skips GroupLayer (not a TextLayer)', () => {
      const src = "define GroupLayer('g') #{ opacity: 0.5; };";
      expect(targets(src)).toEqual([]);
    });

    it('does NOT detect TextLayer text inside a string literal', () => {
      const src = `log("define TextLayer('x') \${ font-family: 'Inter'; }");`;
      expect(targets(src)).toEqual([]);
    });

    it('does NOT detect TextLayer text inside a line comment', () => {
      const src = `// define TextLayer('x') \${ font-family: 'Inter'; };\nlet a = 1;`;
      expect(targets(src)).toEqual([]);
    });

    it('finds multiple TextLayer targets', () => {
      const src =
        "define TextLayer('a') #{ font-family: 'Inter'; };\n" +
        "let b = TextLayer('b') #{ font-family: 'Roboto'; };";
      const t = targets(src);
      expect(t).toHaveLength(2);
      expect(t.every((x) => x.kind === 'textlayer')).toBe(true);
    });
  });

  describe('FontDirective targets', () => {
    it('detects `@font "Inter";` with no weight', () => {
      const src = `@font 'Inter';`;
      const t = targets(src);
      expect(t).toHaveLength(1);
      expect(t[0].kind).toBe('fontdirective');
      if (t[0].kind !== 'fontdirective') return;
      expect(src.slice(t[0].familyFrom, t[0].familyTo)).toBe('Inter');
      expect(t[0].weightFrom).toBeNull();
      expect(t[0].weightTo).toBeNull();
    });

    it('detects `@font "Roboto" 700;` with weight', () => {
      const src = `@font 'Roboto' 700;`;
      const t = targets(src);
      expect(t).toHaveLength(1);
      expect(t[0].kind).toBe('fontdirective');
      if (t[0].kind !== 'fontdirective') return;
      expect(src.slice(t[0].familyFrom, t[0].familyTo)).toBe('Roboto');
      expect(t[0].weightFrom).not.toBeNull();
      expect(t[0].weightTo).not.toBeNull();
      expect(src.slice(t[0].weightFrom!, t[0].weightTo!)).toBe('700');
    });

    it('detects a path-like family in @font', () => {
      const src = `@font './fonts/Custom.ttf';`;
      const t = targets(src);
      expect(t).toHaveLength(1);
      if (t[0].kind !== 'fontdirective') return;
      expect(src.slice(t[0].familyFrom, t[0].familyTo)).toBe('./fonts/Custom.ttf');
    });

    it('does NOT detect @font inside a string literal', () => {
      const src = `let s = "@font 'Inter';";`;
      expect(targets(src)).toEqual([]);
    });

    it('replacing inside familyFrom/To preserves surrounding quotes', () => {
      const src = `@font 'Inter' 700;`;
      const t = targets(src);
      expect(t).toHaveLength(1);
      if (t[0].kind !== 'fontdirective') return;
      const { familyFrom, familyTo } = t[0];
      const replaced = src.slice(0, familyFrom) + 'Roboto' + src.slice(familyTo);
      expect(replaced).toBe(`@font 'Roboto' 700;`);
    });

    it('still recovers weight when a following @font is incomplete', () => {
      // Lezer's precedence on FontDirective shortens the first directive to
      // `@font String` when the next line has an incomplete `@font`. The
      // weight Number reparses as a stray ExpressionStatement. Our walker
      // must recover it — otherwise the popup thinks there is no weight,
      // loses the user's authored value in the UI, and inserts a second
      // number when writing back.
      const src = `@font "Fira Sans" 200;\n@font\n`;
      const t = targets(src);
      expect(t).toHaveLength(1);
      expect(t[0].kind).toBe('fontdirective');
      if (t[0].kind !== 'fontdirective') return;
      expect(t[0].weightFrom).not.toBeNull();
      expect(src.slice(t[0].weightFrom!, t[0].weightTo!)).toBe('200');
    });
  });

  describe('mixed', () => {
    it('finds both TextLayer and FontDirective targets in one file', () => {
      const src =
        `@font 'Inter';\n` +
        `define TextLayer('x') #{ font-family: 'Inter'; };\n` +
        `let y = TextLayer('y') #{ font-family: 'Roboto'; };`;
      const t = targets(src);
      expect(t).toHaveLength(3);
      const kinds = t.map((x) => x.kind).sort();
      expect(kinds).toEqual(['fontdirective', 'textlayer', 'textlayer']);
    });
  });
});
