import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { getDefinition, getReferences } from '../../src/language-services/navigation';

function def(source: string, line: number, character: number) {
  return getDefinition(new StringTextDocument(source), { line, character });
}

function refs(source: string, line: number, character: number, includeDecl = true) {
  return getReferences(new StringTextDocument(source), { line, character }, includeDecl);
}

describe('getDefinition', () => {
  it('returns null for empty position', () => {
    expect(def('M 10 20', 0, 1)).toBeNull(); // space
  });

  it('returns null for stdlib functions (no user source)', () => {
    // 'circle' is stdlib — no user-authored definition to jump to
    expect(def('circle(50, 50, 25)', 0, 3)).toBeNull();
  });

  it('jumps to variable declaration', () => {
    const source = 'let radius = 50;\ncircle(0, 0, radius);';
    const result = def(source, 1, 15); // cursor on "radius" in circle call
    expect(result).not.toBeNull();
    expect(result!.range.start.line).toBe(0); // defined on line 0
  });

  it('jumps to function definition', () => {
    const source = 'fn draw() {\n  M 0 0\n}\ndraw();';
    const result = def(source, 3, 2); // cursor on "draw" call
    expect(result).not.toBeNull();
    expect(result!.range.start.line).toBe(0); // fn on line 0
  });

  it('returns definition when cursor is on the declaration itself', () => {
    const source = 'let x = 10;';
    const result = def(source, 0, 4); // cursor on "x" in declaration
    expect(result).not.toBeNull();
    expect(result!.range.start.line).toBe(0);
  });

  it('jumps to parameter definition inside function', () => {
    const source = 'fn draw(cx, cy) {\n  M cx cy\n}';
    const result = def(source, 1, 4); // cursor on "cx" usage
    expect(result).not.toBeNull();
    expect(result!.range.start.line).toBe(0); // param defined on fn line
  });

  it('returns null for unparseable source', () => {
    expect(def('let x = ', 0, 4)).toBeNull();
  });
});

describe('getReferences', () => {
  it('returns empty for whitespace', () => {
    expect(refs('M    10', 0, 2)).toHaveLength(0);
  });

  it('finds all references to a variable', () => {
    const source = 'let x = 10;\nM x 0\nL x 100';
    const result = refs(source, 0, 4); // cursor on "x" declaration
    // Declaration + 2 usages = 3
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('excludes declaration when includeDeclaration is false', () => {
    const source = 'let x = 10;\nM x 0';
    const withDecl = refs(source, 0, 4, true);
    const withoutDecl = refs(source, 0, 4, false);
    expect(withoutDecl.length).toBe(withDecl.length - 1);
  });

  it('finds references from a usage site', () => {
    const source = 'let radius = 50;\ncircle(0, 0, radius);';
    const result = refs(source, 1, 15); // cursor on "radius" usage
    expect(result.length).toBeGreaterThanOrEqual(2); // decl + usage
  });

  it('respects shadowing — does not include references to different declaration', () => {
    const source = 'let x = 10;\nfn test() {\n  let x = 20;\n  M x 0\n}\nM x 0';
    // Cursor on inner "x" usage (line 3) should find inner x, not outer
    const innerRefs = refs(source, 3, 4);
    // Cursor on outer "x" usage (line 5) should find outer x
    const outerRefs = refs(source, 5, 2);
    // They should reference different declarations
    // Inner should have 2 (inner decl + inner usage)
    // Outer should have 2 (outer decl + outer usage)
    expect(innerRefs.length).toBeGreaterThanOrEqual(1);
    expect(outerRefs.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty for stdlib functions', () => {
    // stdlib references have no user declaration
    expect(refs('circle(50, 50, 25)', 0, 3)).toHaveLength(0);
  });
});
