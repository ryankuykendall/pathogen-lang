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

  it('returns empty for unparseable source', () => {
    expect(rename('let x = ', 0, 4, 'y')).toHaveLength(0);
  });
});
