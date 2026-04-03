import { describe, it, expect } from 'vitest';
import { StringTextDocument } from '../../src/language-services/document';
import { getCompletions } from '../../src/language-services/completion';
import type { CompletionItem } from '../../src/language-services/completion';

function complete(source: string, line: number, character: number): CompletionItem[] {
  return getCompletions(new StringTextDocument(source), { line, character });
}

/** Get completions at end of source. */
function completeAtEnd(source: string): CompletionItem[] {
  const lines = source.split('\n');
  const lastLine = lines.length - 1;
  const lastChar = lines[lastLine].length;
  return complete(source, lastLine, lastChar);
}

function labels(items: CompletionItem[]): string[] {
  return items.map((i) => i.label);
}

describe('getCompletions', () => {
  describe('keywords', () => {
    it('offers keywords at top level', () => {
      const items = completeAtEnd('');
      const names = labels(items);
      expect(names).toContain('let');
      expect(names).toContain('for');
      expect(names).toContain('if');
      expect(names).toContain('fn');
    });

    it('filters by prefix', () => {
      const items = completeAtEnd('le');
      const names = labels(items);
      expect(names).toContain('let');
      expect(names).toContain('lerp');
      expect(names).not.toContain('for');
    });
  });

  describe('stdlib functions', () => {
    it('offers stdlib functions', () => {
      const items = completeAtEnd('');
      const names = labels(items);
      expect(names).toContain('circle');
      expect(names).toContain('sin');
      expect(names).toContain('lerp');
      expect(names).toContain('PI');
    });

    it('filters stdlib by prefix', () => {
      const items = completeAtEnd('ci');
      expect(labels(items)).toContain('circle');
      expect(labels(items)).not.toContain('rect');
    });

    it('offers ctx', () => {
      const items = completeAtEnd('ct');
      expect(labels(items)).toContain('ctx');
    });
  });

  describe('user definitions (scope-aware)', () => {
    it('offers user-declared variables', () => {
      const items = completeAtEnd('let myVar = 10;\n');
      expect(labels(items)).toContain('myVar');
    });

    it('offers user-defined functions', () => {
      const items = completeAtEnd('fn drawCircle(x, y) {\n  circle(x, y, 10)\n}\n');
      expect(labels(items)).toContain('drawCircle');
    });

    it('does not offer variables declared after cursor', () => {
      // Cursor is at end of line 0, myLater is on line 1
      const items = complete('M 0 0\nlet myLater = 10;', 0, 5);
      expect(labels(items)).not.toContain('myLater');
    });

    it('offers loop variables inside loop body', () => {
      // Source must be parseable for scope analysis to work
      const source = 'for (i in 0..10) {\n  M i 0\n}';
      // Cursor at line 1 (inside the loop body)
      const items = complete(source, 1, 4);
      expect(labels(items)).toContain('i');
    });
  });

  describe('member access (dot completions)', () => {
    it('offers ctx properties after ctx.', () => {
      const items = completeAtEnd('M 0 0\nctx.');
      const names = labels(items);
      expect(names).toContain('position');
      expect(names).toContain('start');
      expect(names).toContain('heading');
      expect(names).toContain('transform');
    });

    it('offers Object methods after Object.', () => {
      const items = completeAtEnd('Object.');
      const names = labels(items);
      expect(names).toContain('keys');
      expect(names).toContain('values');
      expect(names).toContain('entries');
    });

    it('offers Point members for Point variables', () => {
      const items = completeAtEnd('let p = Point(10, 20);\np.');
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
      expect(names).toContain('translate');
      expect(names).toContain('distance');
    });

    it('offers PathBlock members for path block variables', () => {
      const items = completeAtEnd('let shape = @{\n  M 0 0\n  L 100 0\n};\nshape.');
      const names = labels(items);
      expect(names).toContain('draw');
      expect(names).toContain('get');
      expect(names).toContain('boundingBox');
      expect(names).toContain('length');
    });

    it('offers array members for array variables', () => {
      const items = completeAtEnd('let items = [1, 2, 3];\nitems.');
      const names = labels(items);
      expect(names).toContain('length');
      expect(names).toContain('map');
      expect(names).toContain('filter');
      expect(names).toContain('push');
    });

    it('offers string members for string variables', () => {
      const items = completeAtEnd('let name = "hello";\nname.');
      const names = labels(items);
      expect(names).toContain('length');
      expect(names).toContain('split');
      expect(names).toContain('includes');
    });

    it('filters member completions by prefix', () => {
      const items = completeAtEnd('ctx.pos');
      expect(labels(items)).toContain('position');
      expect(labels(items)).not.toContain('start');
    });
  });

  describe('deep property access', () => {
    it('offers Point members for ctx.position.', () => {
      const items = completeAtEnd('M 0 0\nctx.position.');
      const names = labels(items);
      expect(names).toContain('x');
      expect(names).toContain('y');
    });

    it('offers transform sub-properties for ctx.transform.', () => {
      const items = completeAtEnd('M 0 0\nctx.transform.');
      const names = labels(items);
      expect(names).toContain('translate');
      expect(names).toContain('rotate');
      expect(names).toContain('scale');
      expect(names).toContain('reset');
    });
  });

  describe('style block completions', () => {
    it('offers style properties inside ${ }', () => {
      const items = completeAtEnd("define PathLayer('main') ${ ");
      const names = labels(items);
      expect(names).toContain('stroke');
      expect(names).toContain('fill');
      expect(names).toContain('stroke-width');
      expect(names).toContain('opacity');
      // Should NOT offer regular keywords/stdlib inside style block
      expect(names).not.toContain('let');
      expect(names).not.toContain('circle');
    });

    it('does not offer style properties outside ${ }', () => {
      const items = completeAtEnd('let x = 10;\n');
      const names = labels(items);
      expect(names).not.toContain('stroke');
      expect(names).not.toContain('fill');
    });
  });

  describe('completion item structure', () => {
    it('includes detail for stdlib functions', () => {
      const items = completeAtEnd('circ');
      const circle = items.find((i) => i.label === 'circle');
      expect(circle).toBeDefined();
      expect(circle!.detail).toContain('circle(cx, cy, r)');
    });

    it('has sortText for ordering', () => {
      const items = completeAtEnd('');
      expect(items.every((i) => typeof i.sortText === 'string')).toBe(true);
    });

    it('keywords have snippet insertText', () => {
      const items = completeAtEnd('');
      const letItem = items.find((i) => i.label === 'let');
      expect(letItem).toBeDefined();
      expect(letItem!.isSnippet).toBe(true);
      expect(letItem!.insertText).toContain('${1:name}');
    });
  });
});
