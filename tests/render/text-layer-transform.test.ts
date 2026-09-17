import { describe, expect, it } from 'vitest';

import { compile } from '../../src/index';
import { buildLayers } from '../../src/render/build-layers';
import { toSvgString } from '../../src/render/serialize';

/** A TextLayer's transform (explicit, convenience or imperative) must reach its <text> elements. */
function render(source: string): string {
  const result = compile(source);
  return buildLayers(result.layers).map((node) => toSvgString(node)).join('\n');
}

describe('text layer transforms reach the emitted <text>', () => {
  const font = "let font = 'sans-serif';\n";

  it('applies a convenience rotate to every text in the layer', () => {
    const svg = render(`${font}let t = TextLayer('t') #{ font-family: font; rotate: -0.5pi; };\nt.apply { text(10, 20)\`a\`; text(30, 40)\`b\`; }`);
    const texts = svg.match(/<text[^>]*>/g) ?? [];
    expect(texts).toHaveLength(2);
    for (const t of texts) expect(t).toContain('transform="rotate(-90)"');
  });

  it('applies the layer transform inside a group and keeps the per-text rotation inside it', () => {
    const svg = render(
      `${font}let g = GroupLayer('g') #{ translate-x: 5; };\nlet t = TextLayer('t') #{ font-family: font; translate-y: 7; };\ng.append(t);\nt.apply { text(10, 20, 30deg)\`a\`; }`,
    );
    // radToDeg(30deg) may print as 29.999999999999996; the composition is what matters.
    expect(svg).toMatch(/transform="translate\(0, 7\) rotate\((30|29\.9+\d*), 10, 20\)"/);
  });


  it('emits no transform attribute when the layer has none', () => {
    const svg = render(`${font}let t = TextLayer('t') #{ font-family: font; };\nt.apply { text(10, 20)\`a\`; }`);
    expect(svg).not.toContain('transform=');
  });
});
