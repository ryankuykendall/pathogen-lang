import { describe, expect, it } from 'vitest';

import { h, raw } from '../../src/render/types';
import { escapeXml, toSvgString } from '../../src/render/serialize';

describe('toSvgString', () => {
  describe('escapeXml', () => {
    it('escapes the five XML metacharacters', () => {
      expect(escapeXml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;\'');
    });

    it('is idempotent on already-escaped text? (no — double-encodes, which matches legacy)', () => {
      // Legacy behavior: double-encoding. Preserve it.
      expect(escapeXml('&amp;')).toBe('&amp;amp;');
    });
  });

  describe('non-svg root falls back to plain tree serialization', () => {
    it('self-closes an empty element', () => {
      expect(toSvgString(h('rect', { width: '10', height: '10' }))).toBe(
        '<rect width="10" height="10"/>',
      );
    });

    it('opens/closes an element with children', () => {
      const tree = h('g', { id: 'root' }, [h('path', { d: 'M 0 0' })]);
      expect(toSvgString(tree)).toBe('<g id="root">\n  <path d="M 0 0"/>\n</g>');
    });

    it('inline <text> concatenates string and tspan children without newlines', () => {
      const tree = h('text', { x: '0', y: '0' }, [
        'Hello ',
        h('tspan', { fill: 'red' }, ['world']),
      ]);
      expect(toSvgString(tree)).toBe('<text x="0" y="0">Hello <tspan fill="red">world</tspan></text>');
    });

    it('raw children are emitted verbatim, skipping escape', () => {
      const tree = h('foo', {}, [raw('<raw>&&&</raw>')]);
      // Raw passes through; no escape.
      expect(toSvgString(tree)).toContain('<raw>&&&</raw>');
    });
  });

  describe('svg root envelope', () => {
    it('emits the pre-refactor envelope shape even when empty', () => {
      const tree = h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 10 10' }, []);
      expect(toSvgString(tree)).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">\n\n\n</svg>',
      );
    });

    it('places <defs> at column 0 (not tree-indented under <svg>)', () => {
      const tree = h('svg', { xmlns: 'http://www.w3.org/2000/svg' }, [
        h('defs', {}, [h('marker', { id: 'm' }, [])]),
      ]);
      const out = toSvgString(tree);
      // Defs open tag at column 0; its marker child at column 2.
      expect(out).toContain('\n<defs>\n');
      expect(out).toContain('  <marker id="m"/>');
    });

    it('layer elements render at column 2', () => {
      const tree = h('svg', { xmlns: 'http://www.w3.org/2000/svg' }, [
        h('path', { d: 'M 0 0' }),
      ]);
      expect(toSvgString(tree)).toContain('  <path d="M 0 0"/>');
    });

    it('unwraps __text-siblings__ at the top level', () => {
      // The synthetic wrapper exists so build-layers can return multiple text
      // children from a single TextLayer. The serializer must never emit it
      // as a literal tag — browsers treat it as an unknown element and skip
      // its <text> children, dropping every label and formula on the floor.
      const tree = h('svg', { xmlns: 'http://www.w3.org/2000/svg' }, [
        h('__text-siblings__', {}, [
          h('text', { id: 'a', x: '0', y: '0' }, ['hello']),
          h('text', { x: '0', y: '10' }, ['world']),
        ]),
      ]);
      const out = toSvgString(tree);
      expect(out).not.toContain('__text-siblings__');
      expect(out).toContain('<text id="a" x="0" y="0">hello</text>');
      expect(out).toContain('<text x="0" y="10">world</text>');
    });

    it('unwraps __text-siblings__ when nested inside a group', () => {
      // Regression: when a TextLayer is a child of a GroupLayer (e.g. the
      // Clifford Attractor blog samples), the wrapper appears one level deep
      // inside <g>. The serializer's recursive path must unwrap there too,
      // not only at the top level.
      const tree = h('svg', { xmlns: 'http://www.w3.org/2000/svg' }, [
        h('g', { id: 'concept' }, [
          h('path', { id: 'bg', d: 'M 0 0' }),
          h('__text-siblings__', {}, [
            h('text', { id: 'labels', x: '0', y: '0' }, ['x0']),
            h('text', { x: '0', y: '10' }, ['x1']),
          ]),
        ]),
      ]);
      const out = toSvgString(tree);
      expect(out).not.toContain('__text-siblings__');
      expect(out).toContain('<text id="labels" x="0" y="0">x0</text>');
      expect(out).toContain('<text x="0" y="10">x1</text>');
    });
  });
});
