import { describe, expect, it } from 'vitest';

import { compile } from '../../src/index';
import { buildLayers } from '../../src/render/build-layers';
import { toSvgString } from '../../src/render/serialize';

function render(source: string): string {
  const result = compile(source);
  return buildLayers(result.layers).map((node) => toSvgString(node)).join('\n');
}

const font = "let font = 'monospace';\n";

describe('tab-stops on a text layer', () => {
  it('turns the fields after each tab into anchored tspans at the stops', () => {
    const svg = render(`${font}let t = TextLayer('t') #{ font-family: font; tab-stops: 11 end, 24 end, 40 end; };\nt.apply { text(2, 16, #{ text-anchor: end; })\`1\\t7.0\\t15.1\\t24.0\`; }`);
    expect(svg).toContain(
      '<text data-layer-name="t" id="t" x="2" y="16" font-family="monospace" text-anchor="end">1<tspan x="13" text-anchor="end">7.0</tspan><tspan x="26" text-anchor="end">15.1</tspan><tspan x="42" text-anchor="end">24.0</tspan></text>',
    );
    expect(svg).not.toContain('tab-stops');
  });

  it('defaults a stop without an anchor to start, and leaves extra fields inline', () => {
    const svg = render(`${font}let t = TextLayer('t') #{ font-family: font; tab-stops: 10; };\nt.apply { text(0, 10)\`a\\tb\\tc\`; }`);
    expect(svg).toContain('>a<tspan x="10" text-anchor="start">b</tspan>c</text>');
  });

  it('leaves a tab alone when the layer has no stops', () => {
    const svg = render(`${font}let t = TextLayer('t') #{ font-family: font; };\nt.apply { text(0, 10)\`a\\tb\`; }`);
    expect(svg).toContain('>a\tb</text>');
    expect(svg).not.toContain('<tspan');
  });

  it('rejects a stop it cannot read', () => {
    expect(() => compile(`${font}let t = TextLayer('t') #{ font-family: font; tab-stops: wide end; };\nt.apply { text(0, 10)\`a\\tb\`; }`)).toThrow(/tab-stops/);
  });
});
