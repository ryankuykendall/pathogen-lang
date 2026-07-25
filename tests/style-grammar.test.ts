import { describe, expect, it } from 'vitest';

import { parser as outerParser } from '../src/parser/pathogen.generated';
import { editorParser, styleParser } from '../src/parser/editor-parser';
import { buildAST } from '../src/parser/ast-builder';

import { IterMode } from '@lezer/common';

import type { Tree } from '@lezer/common';
import type { StyleBlockLiteral, StyleProperty } from '../src/parser/ast';

/** Collect `name[from,to]` strings for every node in a tree. */
function nodeList(tree: Tree, options: { ignoreMounts?: boolean } = {}): string[] {
  const parts: string[] = [];
  tree.iterate({
    enter(n) {
      parts.push(`${n.name}[${n.from},${n.to}]`);
    },
    mode: options.ignoreMounts ? IterMode.IgnoreMounts : 0,
  });
  return parts;
}

/** Find the StyleBlockLiteral AST node in `let s = ${...};`. */
function styleBlockAST(source: string): StyleBlockLiteral {
  const ast = buildAST(outerParser.parse(source), source);
  const decl = ast.body[0] as { value: StyleBlockLiteral };
  return decl.value;
}

/**
 * Extract per-declaration {name, nameFrom, value} from the mounted inner tree
 * of the FIRST style block in the source, with document-absolute offsets.
 */
function innerDeclarations(source: string): Array<{ name: string; nameFrom: number; value: string }> {
  const tree = editorParser.parse(source);
  const decls: Array<{ name: string; nameFrom: number; value: string }> = [];
  tree.iterate({
    enter(n) {
      if (n.name !== 'Declaration') return;
      const node = n.node;
      const nameNode = node.getChild('PropertyName');
      if (!nameNode) return;
      // Value extent: from first child after ':' to last non-terminator child.
      const valueNodes = node.getChildren('NumberUnit')
        .concat(node.getChildren('ColorLiteral'))
        .concat(node.getChildren('StringLiteral'))
        .concat(node.getChildren('Template'))
        .concat(node.getChildren('Call'))
        .concat(node.getChildren('Identifier'));
      let from = Infinity;
      let to = -Infinity;
      // Walk all children between ':' and the terminator for full extent
      // (commas/slashes included via source slice of min..max child range).
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name === 'PropertyName' || child.name === ':' || child.name === ';') continue;
        from = Math.min(from, child.from);
        to = Math.max(to, child.to);
      }
      const value = valueNodes.length === 0 && from > to ? '' : source.slice(from, to).trim();
      decls.push({ name: source.slice(nameNode.from, nameNode.to), nameFrom: nameNode.from, value });
    },
  });
  return decls;
}

describe('inner style grammar', () => {
  describe('parity with parseStyleDeclarations (compiler AST)', () => {
    // Corpus: each entry is a full Pathogen program whose first statement is
    // `let s = ${...};`. Parity contract: for every declaration the compiler
    // parser produces, the mounted inner tree has a Declaration whose
    // PropertyName range and trimmed value text match.
    const corpus: Array<{ label: string; source: string }> = [
      {
        label: 'well-formed multi-declaration block',
        source: 'let s = ${\n  fill: #cc0000;\n  stroke-width: 4;\n  opacity: 0.5;\n};',
      },
      {
        label: 'function values with nested commas',
        source: 'let s = ${ filter: drop-shadow(4px 4px 8px rgba(0, 0, 0, 0.5)); };',
      },
      {
        label: 'chained filter functions',
        source: 'let s = ${ filter: blur(2px) brightness(1.2); };',
      },
      {
        label: 'template value with interpolation',
        source: 'let s = ${ font-family: `${family}`; fill: red; };',
      },
      {
        label: 'quoted strings containing ; and }',
        source: 'let s = ${ content: "a;b}c"; fill: none; };',
      },
      {
        label: 'font-family fallback list',
        source: 'let s = ${ font-family: "Inter", serif; };',
      },
      {
        label: 'line comments between declarations',
        source: 'let s = ${\n  // header\n  fill: red;\n  // footer\n  stroke: blue;\n};',
      },
      {
        label: 'multi-line function args',
        source: 'let s = ${\n  filter: drop-shadow(\n    4px 4px\n    black\n  );\n};',
      },
      {
        label: 'dasharray multi-token value',
        source: 'let s = ${ stroke-dasharray: 4 1 2 3; };',
      },
    ];

    for (const { label, source } of corpus) {
      it(`matches compiler declarations: ${label}`, () => {
        const block = styleBlockAST(source);
        expect(block.incomplete, 'corpus entry must be well-formed').toBeUndefined();
        const compilerDecls = block.properties;
        const inner = innerDeclarations(source);

        expect(inner.length, 'declaration count').toBe(compilerDecls.length);
        compilerDecls.forEach((prop: StyleProperty, i: number) => {
          expect(inner[i].name).toBe(prop.name);
          expect(inner[i].nameFrom, `name offset for '${prop.name}'`).toBe(prop.loc!.offset);
          expect(inner[i].value, `value for '${prop.name}'`).toBe(prop.value);
        });
      });
    }

    it('stays useful on mid-typing incomplete blocks', () => {
      // `filter: ` with no value/terminator — compiler marks incomplete; the
      // inner tree must still produce the earlier complete declaration and a
      // Declaration node carrying the property name being typed.
      const source = 'let s = ${\n  fill: red;\n  filter: \n};';
      const inner = innerDeclarations(source);
      expect(inner.length).toBeGreaterThanOrEqual(2);
      expect(inner[0]).toMatchObject({ name: 'fill', value: 'red' });
      expect(inner[1].name).toBe('filter');
    });

    it('flags missing semicolons the same way the compiler does', () => {
      // `fill: red` newline-terminated: compiler treats the newline as the
      // value bound and reports missing ';'. The inner tree still yields both
      // declarations (newline is a declaration terminator there).
      const source = 'let s = ${\n  fill: red\n  stroke: blue;\n};';
      const block = styleBlockAST(source);
      expect(block.incomplete?.message).toBe("Missing ';'");
      const inner = innerDeclarations(source);
      expect(inner.map((d) => d.name)).toEqual(['fill', 'stroke']);
    });
  });

  describe('outer-tree invariance', () => {
    // Mounts must not alter the host tree — same outer node structure with
    // and without the wrap, including the template-interpolation cases that
    // motivated keeping StyleContent opaque in the outer grammar.
    const programs = [
      'let s = ${ fill: red; };',
      'let s = ${ filter: drop-shadow(4px 4px 4px #c00); };\nlet t = `a ${s} b`;',
      'let msg = `value: ${calc(1 + 2)}`;\nlet s = ${ font-family: `${msg}`; };',
      "define PathLayer('a') ${ stroke: #667a; stroke-width: 0.5; }\nlayer('a').apply { M 0 0 }",
      'let empty = ${};',
      'for (i in 0..3) { M i 0 }',
    ];

    for (const source of programs) {
      it(`outer structure unchanged: ${JSON.stringify(source.slice(0, 48))}`, () => {
        expect(nodeList(editorParser.parse(source), { ignoreMounts: true })).toEqual(
          nodeList(outerParser.parse(source)),
        );
      });
    }
  });

  describe('standalone inner parser', () => {
    it('produces Call nodes with Identifier + ArgList inside values', () => {
      const tree = styleParser.parse('filter: blur(2px);');
      const names = nodeList(tree);
      expect(names).toContain('Call[8,17]');
      expect(names).toContain('Identifier[8,12]');
      expect(names).toContain('ArgList[12,17]');
      expect(names).toContain('NumberUnit[13,16]');
    });

    it('emits ColorLiteral nodes nested inside function args', () => {
      const src = 'filter: drop-shadow(4px 4px 4px #c00);';
      const names = nodeList(styleParser.parse(src));
      const colorFrom = src.indexOf('#c00');
      expect(names).toContain(`ColorLiteral[${colorFrom},${colorFrom + 4}]`);
    });

    it('single-quoted strings do not cross newlines', () => {
      // An unterminated single quote must not swallow the next declaration.
      const src = "content: 'oops\nfill: red;";
      const decls = styleParser.parse(src);
      const names = nodeList(decls);
      expect(names.some((n) => n.startsWith('Declaration[15,'))).toBe(true);
    });
  });
});
