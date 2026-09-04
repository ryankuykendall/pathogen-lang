/**
 * @vitest-environment jsdom
 *
 * Security: playground render contract.
 *
 * Even when JSDOM does not enforce CSP (real-browser Playwright tests cover
 * that in scripts/security-browser-audit.ts), this file verifies that the
 * compiler-emission contract holds in DOM space too: a clean compiled tree
 * mounted via mountInto() contains no script, no on* attribute, no remote
 * url() in a stylesheet, and no foreignObject element.
 *
 * This is a structural check, not a CSP enforcement check. It catches
 * regressions where the compiler starts emitting forbidden DOM nodes; it
 * does NOT replace the browser-based audit.
 */

import { describe, expect, it } from 'vitest';

import { buildSvgTree, compile, mountInto, toSvgString } from '../../src';

function mountCompiled(source: string): SVGElement {
  const result = compile(source);
  const tree = buildSvgTree(result);
  const host = document.createElement('div');
  document.body.appendChild(host);
  mountInto(host, tree);
  const svg = host.querySelector('svg');
  if (!svg) throw new Error('mountInto produced no <svg>');
  return svg as SVGElement;
}

function assertCleanDom(svg: SVGElement): void {
  // No script
  expect(svg.querySelectorAll('script').length).toBe(0);
  // No foreignObject
  expect(svg.querySelectorAll('foreignObject').length).toBe(0);
  // No iframe
  expect(svg.querySelectorAll('iframe').length).toBe(0);
  // No on* attributes anywhere
  const all = svg.querySelectorAll('*');
  for (const el of Array.from(all)) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.toLowerCase().startsWith('on')).toBe(false);
    }
  }
  // No <style> block contains url(http or @import (defense in depth — Phase 1
  // should have already prevented this at the source).
  const styles = svg.querySelectorAll('style');
  for (const style of Array.from(styles)) {
    const text = style.textContent ?? '';
    expect(text).not.toMatch(/url\s*\(\s*['"]?https?:/i);
    expect(text).not.toMatch(/@import\b/i);
    expect(text).not.toMatch(/image-set\s*\(/i);
    expect(text).not.toMatch(/expression\s*\(/i);
    expect(text).not.toMatch(/\\[0-9a-fA-F]/);
  }
  // No href/xlink:href to remote or javascript URI
  for (const el of Array.from(all)) {
    for (const attrName of ['href', 'xlink:href']) {
      const v = el.getAttribute(attrName);
      if (v == null) continue;
      expect(v).not.toMatch(/^https?:/i);
      expect(v).not.toMatch(/^javascript:/i);
      expect(v).not.toMatch(/^\/\//);
      expect(v).not.toMatch(/^data:text\/html/i);
    }
  }
}

describe('Security · playground render', () => {
  it('clean source produces a clean DOM tree', () => {
    const svg = mountCompiled(`
      define PathLayer('main') #{ fill: "#e63946"; stroke-width: 2; }
      layer('main').apply { M 0 0 L 100 0 L 100 100 Z }
    `);
    assertCleanDom(svg);
  });

  // The @property block emission test runs against the serialized SVG string
  // (not the JSDOM-mounted DOM) because JSDOM cannot create CDATA sections in
  // an HTML document. The serialized form is what the playground's iframe
  // receives via srcdoc anyway, so this is the real artifact.
  it('Color(CSSVar(...)) with valid name produces a clean <style> @property block (serialized)', () => {
    const result = compile(`
      let brand = Color(CSSVar('--brand', Color('#e63946')));
      define PathLayer('main') #{ stroke: brand; }
      layer('main').apply { M 0 0 L 100 0 }
    `);
    const svg = toSvgString(buildSvgTree(result));
    expect(svg).toContain('@property --brand');
    expect(svg).not.toMatch(/@import/);
    // Brace count match within <style>...</style>
    const styleMatch = svg.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    const inside = styleMatch![1];
    const opens = (inside.match(/\{/g) ?? []).length;
    const closes = (inside.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it('compiles a benign gradient without leaking remote refs', () => {
    const svg = mountCompiled(`
      let g = LinearGradient('grad1', 0, 0, 1, 0) {|gr|
        gr.stop(0, Color('#000000'));
        gr.stop(1, Color('#ffffff'));
      };
      define PathLayer('main') #{ fill: g; }
      layer('main').apply { M 0 0 L 100 0 L 100 100 Z }
    `);
    assertCleanDom(svg);
  });
});
