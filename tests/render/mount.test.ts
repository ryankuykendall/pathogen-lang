// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { h, raw } from '../../src/render/types';
import { mountInto } from '../../src/render/mount';

const SVG_NS = 'http://www.w3.org/2000/svg';

function freshSvg(): SVGElement {
  return document.createElementNS(SVG_NS, 'svg') as SVGElement;
}

describe('mountInto', () => {
  it('appends a single element with attrs and no children', () => {
    const parent = freshSvg();
    mountInto(parent, h('rect', { width: '10', height: '10' }));
    expect(parent.children.length).toBe(1);
    const child = parent.children[0];
    expect(child.tagName).toBe('rect');
    expect(child.getAttribute('width')).toBe('10');
    expect(child.getAttribute('height')).toBe('10');
  });

  it('appends multiple siblings when given an array', () => {
    const parent = freshSvg();
    mountInto(parent, [h('g', { id: 'a' }), h('g', { id: 'b' })]);
    expect(parent.children.length).toBe(2);
    expect(parent.children[0].getAttribute('id')).toBe('a');
    expect(parent.children[1].getAttribute('id')).toBe('b');
  });

  it('creates nested children via recursion', () => {
    const parent = freshSvg();
    mountInto(parent, h('g', { id: 'wrap' }, [h('path', { d: 'M 0 0' })]));
    const g = parent.children[0];
    expect(g.children.length).toBe(1);
    expect(g.children[0].tagName).toBe('path');
    expect(g.children[0].getAttribute('d')).toBe('M 0 0');
  });

  it('uses the SVG namespace (createElementNS) for all tags', () => {
    const parent = freshSvg();
    mountInto(parent, h('marker', { id: 'm' }, [h('path', { d: 'M 0 0' })]));
    const marker = parent.children[0];
    expect(marker.namespaceURI).toBe(SVG_NS);
    expect(marker.children[0].namespaceURI).toBe(SVG_NS);
  });

  it('unwraps __text-siblings__ so multiple <text> elements are siblings of parent', () => {
    const parent = freshSvg();
    mountInto(
      parent,
      h('__text-siblings__', {}, [
        h('text', { x: '0', y: '0' }, ['a']),
        h('text', { x: '0', y: '10' }, ['b']),
      ]),
    );
    expect(parent.children.length).toBe(2);
    expect(parent.children[0].tagName).toBe('text');
    expect(parent.children[1].tagName).toBe('text');
  });

  it('does NOT clear the parent (callers are responsible for cleanup)', () => {
    const parent = freshSvg();
    const existing = document.createElementNS(SVG_NS, 'rect');
    parent.appendChild(existing);
    mountInto(parent, h('path', { d: 'M 0 0' }));
    expect(parent.children.length).toBe(2);
  });

  it('appends text nodes for string children inside text/tspan', () => {
    const parent = freshSvg();
    mountInto(parent, h('text', { x: '0', y: '0' }, ['Hello ', h('tspan', {}, ['world'])]));
    const text = parent.children[0];
    expect(text.textContent).toBe('Hello world');
  });

  it('parses raw SVG children for fragments', () => {
    const parent = freshSvg();
    const fragment = h('__fragment__', {}, [raw('<circle cx="5" cy="5" r="5"/>')]);
    mountInto(parent, fragment);
    expect(parent.children.length).toBe(1);
    expect(parent.children[0].tagName).toBe('circle');
    expect(parent.children[0].getAttribute('cx')).toBe('5');
  });
});
