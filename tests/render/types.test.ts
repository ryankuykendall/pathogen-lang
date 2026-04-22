import { describe, expect, it } from 'vitest';

import { h, isRawText, isVNode, raw } from '../../src/render/types';

describe('VNode types', () => {
  it('h() creates a VNode with defaults for optional args', () => {
    expect(h('rect')).toEqual({ tag: 'rect', attrs: {}, children: [] });
  });

  it('h() preserves the caller-provided attrs and children', () => {
    const node = h('g', { id: 'x', transform: 't' }, [h('path', { d: 'M 0 0' })]);
    expect(node.tag).toBe('g');
    expect(node.attrs).toEqual({ id: 'x', transform: 't' });
    expect(node.children).toHaveLength(1);
  });

  it('raw() wraps content as a RawText marker', () => {
    const r = raw('<![CDATA[foo]]>');
    expect(isRawText(r)).toBe(true);
    expect(r.raw).toBe('<![CDATA[foo]]>');
  });

  it('isVNode / isRawText discriminate correctly', () => {
    const node = h('a');
    const r = raw('x');
    expect(isVNode(node)).toBe(true);
    expect(isVNode(r)).toBe(false);
    expect(isVNode('text')).toBe(false);
    expect(isRawText(node)).toBe(false);
    expect(isRawText(r)).toBe(true);
    expect(isRawText('text')).toBe(false);
  });
});
