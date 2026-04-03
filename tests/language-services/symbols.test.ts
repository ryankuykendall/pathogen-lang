import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { getDocumentSymbols, SymbolKind } from '../../src/language-services/symbols';

function symbols(source: string) {
  return getDocumentSymbols(new StringTextDocument(source));
}

describe('getDocumentSymbols', () => {
  it('returns empty array for empty source', () => {
    expect(symbols('')).toEqual([]);
  });

  it('returns empty array for unparseable source', () => {
    expect(symbols('let x = ')).toEqual([]);
  });

  describe('let declarations', () => {
    it('extracts simple let declaration', () => {
      const syms = symbols('let x = 10;');
      expect(syms).toHaveLength(1);
      expect(syms[0].name).toBe('x');
      expect(syms[0].kind).toBe(SymbolKind.Variable);
    });

    it('extracts multiple declarations', () => {
      const syms = symbols('let x = 10;\nlet y = 20;');
      expect(syms).toHaveLength(2);
      expect(syms[0].name).toBe('x');
      expect(syms[1].name).toBe('y');
    });

    it('extracts array destructuring', () => {
      const syms = symbols('let [a, b] = [1, 2];');
      expect(syms).toHaveLength(1);
      expect(syms[0].name).toBe('[a, b]');
    });

    it('extracts object destructuring', () => {
      const syms = symbols('let { x, y } = point;');
      expect(syms).toHaveLength(1);
      expect(syms[0].name).toBe('{ x, y }');
    });

    it('has correct 0-based line', () => {
      const syms = symbols('M 0 0\nlet x = 10;');
      expect(syms).toHaveLength(1);
      expect(syms[0].range.start.line).toBe(1);
    });
  });

  describe('function definitions', () => {
    it('extracts function with params', () => {
      const syms = symbols('fn draw(cx, cy, r) {\n  circle(cx, cy, r)\n}');
      expect(syms).toHaveLength(1);
      expect(syms[0].name).toBe('draw(cx, cy, r)');
      expect(syms[0].kind).toBe(SymbolKind.Function);
    });

    it('extracts function without params', () => {
      const syms = symbols('fn reset() {\n  M 0 0\n}');
      expect(syms).toHaveLength(1);
      expect(syms[0].name).toBe('reset()');
    });

    it('includes child symbols from function body', () => {
      const syms = symbols('fn draw() {\n  let r = 50;\n  circle(0, 0, r)\n}');
      expect(syms).toHaveLength(1);
      expect(syms[0].children).toHaveLength(1);
      expect(syms[0].children![0].name).toBe('r');
    });
  });

  describe('enum definitions', () => {
    it('extracts enum with members', () => {
      const syms = symbols('enum Direction {\n  UP,\n  DOWN\n}');
      expect(syms).toHaveLength(1);
      expect(syms[0].name).toBe('Direction');
      expect(syms[0].kind).toBe(SymbolKind.Enum);
      expect(syms[0].children).toHaveLength(2);
      expect(syms[0].children![0].name).toBe('UP');
      expect(syms[0].children![0].kind).toBe(SymbolKind.EnumMember);
      expect(syms[0].children![1].name).toBe('DOWN');
    });
  });

  describe('layer definitions', () => {
    it('extracts PathLayer definition', () => {
      const syms = symbols("define PathLayer('outline') ${ stroke: #000; }");
      expect(syms).toHaveLength(1);
      expect(syms[0].name).toBe("PathLayer('outline')");
      expect(syms[0].kind).toBe(SymbolKind.Struct);
    });

    it('extracts TextLayer definition', () => {
      const syms = symbols("define TextLayer('labels') ${ fill: #333; }");
      expect(syms).toHaveLength(1);
      expect(syms[0].name).toBe("TextLayer('labels')");
    });
  });

  describe('for loops', () => {
    it('extracts for-range loop', () => {
      const syms = symbols('for (i in 0..10) {\n  M i 0\n}');
      expect(syms).toHaveLength(1);
      expect(syms[0].name).toBe('for (i in ...)');
      expect(syms[0].kind).toBe(SymbolKind.Key);
    });

    it('extracts nested symbols from loop body', () => {
      const syms = symbols('for (i in 0..5) {\n  let x = i;\n  M x 0\n}');
      expect(syms).toHaveLength(1);
      expect(syms[0].children).toHaveLength(1);
      expect(syms[0].children![0].name).toBe('x');
    });

    it('extracts forEach loop', () => {
      const syms = symbols('let items = [1, 2];\nfor (item in items) {\n  M item 0\n}');
      expect(syms).toHaveLength(2); // let + for
      expect(syms[1].name).toBe('for (item in ...)');
    });
  });

  describe('mixed program', () => {
    it('extracts all symbol types from a program', () => {
      const source = [
        'let r = 50;',
        "define PathLayer('main') ${ stroke: #000; }",
        'fn draw(x, y) {',
        '  circle(x, y, r)',
        '}',
        'enum Mode { FILL, STROKE }',
        'for (i in 0..5) {',
        '  M i 0',
        '}',
      ].join('\n');
      const syms = symbols(source);
      expect(syms).toHaveLength(5);
      expect(syms[0].kind).toBe(SymbolKind.Variable);  // let r
      expect(syms[1].kind).toBe(SymbolKind.Struct);    // PathLayer
      expect(syms[2].kind).toBe(SymbolKind.Function);  // fn draw
      expect(syms[3].kind).toBe(SymbolKind.Enum);      // enum Mode
      expect(syms[4].kind).toBe(SymbolKind.Key);       // for loop
    });
  });
});
