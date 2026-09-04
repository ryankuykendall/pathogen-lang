import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { getSemanticTokens, encodeSemanticTokens, TOKEN_TYPES } from '../../src/language-services/semantic-tokens';
import type { SemanticToken } from '../../src/language-services/semantic-tokens';
import { EVALUATOR_CONSTRUCTORS } from '../../src/evaluator/constructor-registry';
import { BUILTIN_ENUMS } from '../../src/evaluator/builtin-enums';
import { contextAwareFunctions } from '../../src/stdlib';

function tokens(source: string): SemanticToken[] {
  return getSemanticTokens(new StringTextDocument(source));
}

function tokensByType(source: string, type: string): SemanticToken[] {
  const idx = TOKEN_TYPES.indexOf(type as any);
  return tokens(source).filter((t) => t.type === idx);
}

function typeOf(token: SemanticToken): string {
  return TOKEN_TYPES[token.type];
}

describe('getSemanticTokens', () => {
  it('returns empty for empty source', () => {
    expect(tokens('')).toEqual([]);
  });

  it('recovers tokens from incomplete source (lenient parse)', () => {
    // Mid-typing `let x = ` still classifies x — error recovery keeps
    // highlighting alive while the document has parse errors.
    const t = tokens('let x = ');
    expect(t.length).toBeGreaterThanOrEqual(1);
  });

  describe('variable declarations', () => {
    it('classifies let declaration as variable with declaration modifier', () => {
      const t = tokens('let x = 10;');
      const varTokens = t.filter((tok) => typeOf(tok) === 'variable');
      expect(varTokens.length).toBeGreaterThanOrEqual(1);
      expect(varTokens[0].modifiers & 1).toBe(1); // declaration bit
    });

    it('classifies variable reference as variable without declaration modifier', () => {
      const t = tokens('let x = 10;\nM x 0');
      const line1Tokens = t.filter((tok) => tok.line === 1 && typeOf(tok) === 'variable');
      expect(line1Tokens.length).toBeGreaterThanOrEqual(1);
      expect(line1Tokens[0].modifiers & 1).toBe(0); // no declaration bit
    });
  });

  describe('function definitions', () => {
    it('classifies fn name as function with declaration', () => {
      const t = tokens('fn draw() {\n  M 0 0\n}');
      const fnTokens = t.filter((tok) => typeOf(tok) === 'function');
      expect(fnTokens.length).toBeGreaterThanOrEqual(1);
      expect(fnTokens[0].modifiers & 1).toBe(1); // declaration
    });

    it('classifies function call as function without declaration', () => {
      const t = tokens('fn draw() {\n  M 0 0\n}\ndraw();');
      const callTokens = t.filter((tok) => tok.line === 3 && typeOf(tok) === 'function');
      expect(callTokens.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('parameters', () => {
    it('classifies function params as parameter', () => {
      const t = tokens('fn draw(cx, cy) {\n  M cx cy\n}');
      const paramTokens = t.filter((tok) => typeOf(tok) === 'parameter');
      expect(paramTokens.length).toBeGreaterThanOrEqual(2); // cx and cy declarations
    });
  });

  describe('loop variables', () => {
    it('classifies loop variable as variable with readonly modifier', () => {
      const t = tokens('for (i in 0..5) {\n  M i 0\n}');
      const loopVarTokens = t.filter((tok) => typeOf(tok) === 'variable' && (tok.modifiers & 4) !== 0);
      expect(loopVarTokens.length).toBeGreaterThanOrEqual(1); // readonly bit (bit 2)
    });
  });

  describe('builtins', () => {
    it('classifies stdlib function calls as function', () => {
      const t = tokensByType('circle(50, 50, 25);', 'function');
      expect(t.length).toBeGreaterThanOrEqual(1);
    });

    it('classifies ctx as namespace', () => {
      const t = tokensByType('let pos = ctx;', 'namespace');
      expect(t.length).toBeGreaterThanOrEqual(1);
    });

    it('classifies user enum references as type', () => {
      const t = tokensByType('enum Mode { A, B }\nlet m = Mode;', 'type');
      expect(t.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('enum definitions', () => {
    it('classifies enum name as type', () => {
      const t = tokensByType('enum Direction {\n  UP,\n  DOWN\n}', 'type');
      expect(t.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('token positions', () => {
    it('tokens are sorted by line then character', () => {
      const t = tokens('let x = 10;\nlet y = 20;');
      for (let i = 1; i < t.length; i++) {
        const prev = t[i - 1];
        const curr = t[i];
        expect(
          curr.line > prev.line || (curr.line === prev.line && curr.character >= prev.character),
        ).toBe(true);
      }
    });

    it('has correct length for identifiers', () => {
      const t = tokens('let radius = 50;');
      const radiusToken = t.find((tok) => tok.character === 4 && tok.line === 0);
      expect(radiusToken).toBeDefined();
      expect(radiusToken!.length).toBe(6); // "radius"
    });
  });

  describe('encodeSemanticTokens', () => {
    it('encodes as delta format', () => {
      const toks: SemanticToken[] = [
        { line: 0, character: 4, length: 1, type: 0, modifiers: 1 },
        { line: 1, character: 2, length: 1, type: 0, modifiers: 0 },
      ];
      const encoded = encodeSemanticTokens(toks);
      // First: deltaLine=0, deltaChar=4, len=1, type=0, mod=1
      // Second: deltaLine=1, deltaChar=2, len=1, type=0, mod=0
      expect(encoded).toEqual([0, 4, 1, 0, 1, 1, 2, 1, 0, 0]);
    });

    it('encodes same-line tokens with character delta', () => {
      const toks: SemanticToken[] = [
        { line: 0, character: 4, length: 1, type: 0, modifiers: 0 },
        { line: 0, character: 10, length: 3, type: 2, modifiers: 0 },
      ];
      const encoded = encodeSemanticTokens(toks);
      // Second: deltaLine=0, deltaChar=6 (10-4), len=3, type=2, mod=0
      expect(encoded).toEqual([0, 4, 1, 0, 0, 0, 6, 3, 2, 0]);
    });
  });

  describe('style-block value references', () => {
    it('emits a variable token at the exact column and length inside a style value', () => {
      const src = 'let shadowColor = #000;\nlet s = #{ filter: drop-shadow(4px 4px shadowColor); };';
      const col = src.split('\n')[1].indexOf('shadowColor');
      // Line 1 also carries the `s` declaration token; select by column.
      const varTokens = tokensByType(src, 'variable').filter((t) => t.line === 1 && t.character === col);
      expect(varTokens).toHaveLength(1);
      expect(varTokens[0].length).toBe('shadowColor'.length);
    });

    it('emits nothing for CSS keywords in style values', () => {
      const src = 'let s = #{ stroke-linejoin: round; text-anchor: middle; };';
      const styleLine = tokens(src).filter((t) => t.line === 0 && t.character > src.indexOf('#{'));
      expect(styleLine).toHaveLength(0);
    });

    it('emits a function token for a fn referenced in a template interpolation', () => {
      const src = 'fn myFn(x) { return x; }\nlet s = #{ font-family: `${myFn(2)}`; };';
      const fnTokens = tokensByType(src, 'function').filter((t) => t.line === 1);
      expect(fnTokens).toHaveLength(1);
      expect(fnTokens[0].character).toBe(src.split('\n')[1].indexOf('myFn'));
      expect(fnTokens[0].length).toBe(4);
    });
  });
});

describe('builtin coloring derived from the runtime registries', () => {
  it('emits a token for every constructor, enum, and context-aware function', () => {
    const names = [...EVALUATOR_CONSTRUCTORS, ...Object.keys(BUILTIN_ENUMS), ...contextAwareFunctions];
    const uncolored = names.filter((name) => {
      const t = tokens(`let probe = ${name};`);
      return !t.some((tok) => tok.line === 0 && tok.character === 12 && tok.length === name.length);
    });
    expect(uncolored).toEqual([]);
  });

  it('colors Point, PathLayer, polarPoint, and BlendMode', () => {
    expect(typeOf(tokens('let p = Point(3, 4);').find((t) => t.character === 8)!)).toBe('type');
    expect(typeOf(tokens('let L = PathLayer("a");').find((t) => t.character === 8)!)).toBe('type');
    expect(typeOf(tokens('let q = polarPoint(0, 10);').find((t) => t.character === 8)!)).toBe('function');
    expect(typeOf(tokens('let b = BlendMode.Multiply;').find((t) => t.character === 8)!)).toBe('type');
  });
});
