import { describe, expect, it } from 'vitest';

import { compile } from '../../src/index';
import { buildLayers } from '../../src/render/build-layers';
import { toSvgString } from '../../src/render/serialize';

function render(source: string): string {
  const result = compile(source);
  return buildLayers(result.layers).map((node) => toSvgString(node)).join('\n');
}

const arrow = "let tip = @{ m 0 0 l 6 3 l -6 3 z };\nlet arrowMarker = Marker('arrow', 6, 6) {|m| m.append(tip, #{ fill: context-stroke; }); };\n";

describe('marker-scope: subpath', () => {
  const lines = "let d1 = PathLayer('dims') #{ stroke: #333; fill: none; marker-start: arrowMarker; marker-end: arrowMarker; marker-scope: subpath; };\nd1.apply {\n  M 10 20\n  L 90 20\n  M 10 40\n  L 90 40\n}\n";

  it('emits one path per subpath inside a group that carries the layer', () => {
    const svg = render(arrow + lines);
    expect(svg).toMatch(/<g[^>]*data-layer-name="dims"[^>]*id="dims"[^>]*marker-start="url\(#arrow\)"[^>]*marker-end="url\(#arrow\)"[^>]*>/);
    expect(svg).not.toContain('marker-scope');
    const paths = svg.match(/<path d="[^"]*"\/>/g) ?? [];
    expect(paths).toEqual(['<path d="M 10 20 L 90 20"/>', '<path d="M 10 40 L 90 40"/>']);
  });

  it('gives a run that starts after z its own absolute move', () => {
    const src = arrow + "let d1 = PathLayer('runs') #{ stroke: #333; fill: none; marker-end: arrowMarker; marker-scope: subpath; };\nd1.apply {\n  M 10 10\n  h 20\n  v 20\n  z\n  l 5 5\n  l 10 0\n}\n";
    const svg = render(src);
    const paths = svg.match(/<path d="[^"]*"\/>/g) ?? [];
    expect(paths).toHaveLength(2);
    expect(paths[1]).toBe('<path d="M 10 10 l 5 5 l 10 0"/>');
  });

  it('keeps a single path by default and with marker-scope: path', () => {
    const plain = render(arrow + lines.replace(' marker-scope: subpath;', ''));
    expect(plain.match(/<path /g)).toHaveLength(1);
    expect(plain).toContain('d="M 10 20 L 90 20 M 10 40 L 90 40"');
    const explicit = render(arrow + lines.replace('marker-scope: subpath', 'marker-scope: path'));
    expect(explicit.match(/<path /g)).toHaveLength(1);
    expect(explicit).not.toContain('marker-scope');
  });

  it('rejects any other value', () => {
    expect(() => compile(arrow + lines.replace('marker-scope: subpath', 'marker-scope: run'))).toThrow(/marker-scope/);
  });
});
