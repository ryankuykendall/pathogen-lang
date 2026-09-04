import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { prepareRename, getRenameEdits } from '../../src/language-services/rename';
import type { TextEdit } from '../../src/language-services/rename';

function prepare(source: string, line: number, character: number) {
  return prepareRename(new StringTextDocument(source), { line, character });
}

function rename(source: string, line: number, character: number, newName: string): TextEdit[] {
  return getRenameEdits(new StringTextDocument(source), { line, character }, newName);
}

describe('prepareRename', () => {
  it('returns null for keywords', () => {
    expect(prepare('let x = 10;', 0, 1)).toBeNull(); // "let" keyword
  });

  it('returns null for stdlib functions', () => {
    expect(prepare('circle(50, 50, 25)', 0, 3)).toBeNull(); // "circle" is stdlib
  });

  it('returns null for whitespace', () => {
    expect(prepare('let x = 10;', 0, 3)).toBeNull(); // space
  });

  it('succeeds for user variable', () => {
    const result = prepare('let radius = 50;\ncircle(0, 0, radius);', 0, 5);
    expect(result).not.toBeNull();
    expect(result!.placeholder).toBe('radius');
  });

  it('succeeds for user function', () => {
    const result = prepare('fn draw() {\n  M 0 0\n}\ndraw();', 0, 4);
    expect(result).not.toBeNull();
    expect(result!.placeholder).toBe('draw');
  });

  it('succeeds from reference site', () => {
    const result = prepare('let radius = 50;\ncircle(0, 0, radius);', 1, 15);
    expect(result).not.toBeNull();
    expect(result!.placeholder).toBe('radius');
  });
});

describe('getRenameEdits', () => {
  it('returns empty for non-renameable symbols', () => {
    expect(rename('let x = 10;', 0, 1, 'newName')).toHaveLength(0); // "let"
  });

  it('renames variable declaration and usages', () => {
    const source = 'let radius = 50;\ncircle(0, 0, radius);';
    const edits = rename(source, 0, 5, 'r');
    expect(edits.length).toBeGreaterThanOrEqual(2); // declaration + usage
    // All edits should replace with 'r'
    expect(edits.every((e) => e.newText === 'r')).toBe(true);
  });

  it('renames from reference site', () => {
    const source = 'let radius = 50;\ncircle(0, 0, radius);';
    const edits = rename(source, 1, 15, 'r');
    expect(edits.length).toBeGreaterThanOrEqual(2);
  });

  it('rename edits have correct ranges', () => {
    const source = 'let x = 10;\nM x 0';
    const edits = rename(source, 0, 4, 'y');
    expect(edits.length).toBeGreaterThanOrEqual(2);
    // Check that declaration edit is on line 0
    const declEdit = edits.find((e) => e.range.start.line === 0);
    expect(declEdit).toBeDefined();
    expect(declEdit!.range.start.character).toBe(4); // "x" starts at col 4
    expect(declEdit!.range.end.character).toBe(5); // "x" ends at col 5
  });

  it('does not rename shadowed variable in different scope', () => {
    const source = 'let x = 10;\nfn test() {\n  let x = 20;\n  M x 0\n}\nM x 0';
    // Rename the outer x (line 0)
    const edits = rename(source, 0, 4, 'y');
    // Should rename the declaration on line 0 and usage on line 5
    // Should NOT rename inner x on lines 2 and 3
    const editLines = edits.map((e) => e.range.start.line);
    expect(editLines).toContain(0);
    expect(editLines).toContain(5);
    expect(editLines).not.toContain(2);
    expect(editLines).not.toContain(3);
  });

  it('renames the recovered declaration in incomplete source (lenient parse)', () => {
    // Mid-typing `let x = ` still finds x's declaration — error recovery
    // keeps rename alive while the document has parse errors.
    expect(rename('let x = ', 0, 4, 'y')).toHaveLength(1);
  });
});

describe('rename with shorthand object properties', () => {
  it('expands the shorthand instead of renaming the property key', () => {
    const src = 'let contour = 5;\nlet set = { contour, other: 1 };';
    const edits = rename(src, 0, 6, 'outline');
    const declEdit = edits.find((e) => e.range.start.line === 0);
    expect(declEdit).toBeDefined();
    expect(declEdit!.newText).toBe('outline');
    const refEdit = edits.find((e) => e.range.start.line === 1);
    expect(refEdit).toBeDefined();
    expect(refEdit!.newText).toBe('contour: outline');
  });

  it('still renames longhand property values with the bare name', () => {
    const src = 'let v = 5;\nlet set = { key: v };';
    const edits = rename(src, 0, 4, 'w');
    expect(edits.length).toBeGreaterThanOrEqual(2);
    expect(edits.every((e) => e.newText === 'w')).toBe(true);
  });

  it('does not touch a colonless string key from error recovery', () => {
    // { 'radius' } is grammar-invalid (mid-typing of { 'radius': ... });
    // renaming the variable must not mangle the string literal.
    const src = "let radius = 40;\nlet p = { 'radius' };";
    const edits = rename(src, 0, 5, 'size');
    expect(edits).toHaveLength(1);
    expect(edits[0].range.start.line).toBe(0);
  });

  it('renames shorthand and longhand references on the same line', () => {
    const src = 'let radius = 40;\nlet p = { radius, scaled: radius };';
    const edits = rename(src, 0, 5, 'size');
    expect(edits).toHaveLength(3);
    const line1 = edits
      .filter((e) => e.range.start.line === 1)
      .sort((a, b) => a.range.start.character - b.range.start.character);
    expect(line1).toHaveLength(2);
    expect(line1[0].newText).toBe('radius: size');
    expect(line1[1].newText).toBe('size');
  });

  it('renames repeated references on one line', () => {
    const src = 'let a = 5;\nlet sum = calc(a + a);';
    const edits = rename(src, 0, 4, 'b');
    const line1 = edits.filter((e) => e.range.start.line === 1);
    expect(line1).toHaveLength(2);
    expect(line1.every((e) => e.newText === 'b')).toBe(true);
  });
});

describe('rename inside style-block values', () => {
  function applyEdits(source: string, edits: TextEdit[]): string {
    const lines = source.split('\n');
    // Apply per line, right-to-left so earlier edits don't shift later ranges.
    const sorted = [...edits].sort((a, b) =>
      a.range.start.line !== b.range.start.line
        ? b.range.start.line - a.range.start.line
        : b.range.start.character - a.range.start.character,
    );
    for (const e of sorted) {
      const line = lines[e.range.start.line];
      lines[e.range.start.line] =
        line.slice(0, e.range.start.character) + e.newText + line.slice(e.range.end.character);
    }
    return lines.join('\n');
  }

  it('renames a variable referenced inside drop-shadow()', () => {
    const src = 'let c = #f00;\nlet s = #{ filter: drop-shadow(1px 1px c); };';
    const edits = rename(src, 0, 4, 'shadow');
    expect(edits).toHaveLength(2);
    expect(applyEdits(src, edits)).toBe(
      'let shadow = #f00;\nlet s = #{ filter: drop-shadow(1px 1px shadow); };',
    );
  });

  it('renames a member-head reference', () => {
    const src = 'let c = #f00;\nlet s = #{ fill: c.alpha(40%); };';
    expect(applyEdits(src, rename(src, 0, 4, 'base'))).toBe(
      'let base = #f00;\nlet s = #{ fill: base.alpha(40%); };',
    );
  });

  it('renames inside a template interpolation value', () => {
    const src = "let family = 'Inter';\nlet s = #{ font-family: `${family}`; };";
    expect(applyEdits(src, rename(src, 0, 6, 'font'))).toBe(
      "let font = 'Inter';\nlet s = #{ font-family: `${font}`; };",
    );
  });

  it('handles declaration and style-value reference on the SAME line', () => {
    const src = 'let c = #f00; let s = #{ stroke: c; };';
    const edits = rename(src, 0, 4, 'col');
    expect(applyEdits(src, edits)).toBe('let col = #f00; let s = #{ stroke: col; };');
  });

  it('renames multiple style-value references on one line distinctly', () => {
    const src = 'let c = #f00;\nlet s = #{ filter: drop-shadow(1px 1px c) drop-shadow(2px 2px c); };';
    const edits = rename(src, 0, 4, 'x');
    expect(edits).toHaveLength(3);
    expect(applyEdits(src, edits)).toBe(
      'let x = #f00;\nlet s = #{ filter: drop-shadow(1px 1px x) drop-shadow(2px 2px x); };',
    );
  });

  it('rename initiated FROM a style-value reference works', () => {
    const src = 'let c = #f00;\nlet s = #{ stroke: c; };';
    // Cursor on the `c` inside the style block (line 1, char 19)
    const edits = rename(src, 1, 19, 'col');
    expect(applyEdits(src, edits)).toBe('let col = #f00;\nlet s = #{ stroke: col; };');
  });

  it('prepareRename works on a style-value reference', () => {
    const src = 'let c = #f00;\nlet s = #{ stroke: c; };';
    const result = prepare(src, 1, 19);
    expect(result).not.toBeNull();
    expect(result!.placeholder).toBe('c');
  });

  it('does not rename an undeclared CSS keyword', () => {
    const src = 'let s = #{ stroke-linejoin: round; };';
    expect(prepare(src, 0, 30)).toBeNull();
  });
});

describe('rename switch keywords and case bindings', () => {
  const src = [
    'let p = Point(3, 1);',
    'switch (p) {',
    '  case { x, y } where x > y {',
    '    M x y',
    '  }',
    '  default {',
    '    M 0 0',
    '  }',
    '}',
  ].join('\n');

  it('switch, case, where, and default are not renameable', () => {
    expect(prepare(src, 1, 2)).toBeNull(); // switch
    expect(prepare(src, 2, 3)).toBeNull(); // case
    expect(prepare(src, 2, 17)).toBeNull(); // where
    expect(prepare(src, 5, 4)).toBeNull(); // default
  });

  it('break, continue, with, as, and ViewBox are not renameable', () => {
    expect(prepare('for (i in 0..3) {\n  break;\n}', 1, 3)).toBeNull();
    expect(prepare('for (i in 0..3) {\n  continue;\n}', 1, 3)).toBeNull();
    expect(prepare('define ViewBox(0, 0, 10, 10);', 0, 9)).toBeNull();
  });

  it('renames a destructured case binding in the pattern, the guard, and the body', () => {
    const edits = rename(src, 3, 6, 'px'); // `x` in `M x y`
    expect(edits.map((e) => [e.range.start.line, e.range.start.character, e.newText])).toEqual([
      [2, 9, 'px'],
      [2, 22, 'px'],
      [3, 6, 'px'],
    ]);
  });
});
