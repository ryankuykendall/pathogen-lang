import { describe, it, expect } from 'vitest';
import { compile, compileWithContext } from '../src';
import { compilePath } from './helpers';

describe('Multi-Layer Support', () => {
  describe('layer definitions', () => {
    it('defines a single PathLayer', () => {
      const result = compile(`
        define PathLayer('main') \${}
        layer('main').apply { M 10 20 }
      `);
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].name).toBe('main');
      expect(result.layers[0].type).toBe('path');
      expect(result.layers[0].data).toBe('M 10 20');
    });

    it('defines a default PathLayer', () => {
      const result = compile(`
        define default PathLayer('main') \${ stroke: #cc0000; }
        M 10 20
      `);
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].name).toBe('main');
      expect(result.layers[0].isDefault).toBe(true);
      expect(result.layers[0].data).toBe('M 10 20');
    });

    it('defines multiple layers', () => {
      const result = compile(`
        define default PathLayer('main') \${ stroke: #cc0000; stroke-width: 4; }
        define PathLayer('overlay') \${ stroke: #0000cc; }
        M 10 10 h 20 v 20 z
        layer('overlay').apply { M 30 30 v 20 h 20 z }
      `);
      expect(result.layers).toHaveLength(2);
      expect(result.layers[0].name).toBe('main');
      expect(result.layers[0].data).toBe('M 10 10 h 20 v 20 z');
      expect(result.layers[0].isDefault).toBe(true);
      expect(result.layers[1].name).toBe('overlay');
      expect(result.layers[1].data).toBe('M 30 30 v 20 h 20 z');
    });

    it('layers appear in definition order', () => {
      const result = compile(`
        define PathLayer('alpha') \${}
        define PathLayer('beta') \${}
        define PathLayer('gamma') \${}
        layer('beta').apply { M 1 0 }
        layer('gamma').apply { M 2 0 }
        layer('alpha').apply { M 0 0 }
      `);
      expect(result.layers.map(l => l.name)).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  describe('style properties', () => {
    it('parses stroke style', () => {
      const result = compile(`
        define PathLayer('main') \${ stroke: #cc0000; }
        layer('main').apply { M 0 0 }
      `);
      expect(result.layers[0].styles).toEqual({ stroke: '#cc0000' });
    });

    it('parses multiple styles', () => {
      const result = compile(`
        define PathLayer('main') \${
          stroke: #cc0000;
          stroke-width: 4;
          fill: none;
          stroke-dasharray: 4 1 2 3;
        }
        layer('main').apply { M 0 0 }
      `);
      expect(result.layers[0].styles).toEqual({
        stroke: '#cc0000',
        'stroke-width': '4',
        fill: 'none',
        'stroke-dasharray': '4 1 2 3',
      });
    });

    it('ignores comments in style blocks', () => {
      const result = compile(`
        define PathLayer('main') \${
          // This is a comment
          stroke: red;
          // Another comment
          fill: blue;
        }
        layer('main').apply { M 0 0 }
      `);
      expect(result.layers[0].styles).toEqual({ stroke: 'red', fill: 'blue' });
    });

    it('handles empty style block', () => {
      const result = compile(`
        define PathLayer('main') \${}
        layer('main').apply { M 0 0 }
      `);
      expect(result.layers[0].styles).toEqual({});
    });
  });

  describe('layer apply blocks', () => {
    it('routes commands to the specified layer', () => {
      const result = compile(`
        define PathLayer('a') \${}
        define PathLayer('b') \${}
        layer('a').apply { M 1 1 L 2 2 }
        layer('b').apply { M 3 3 L 4 4 }
      `);
      expect(result.layers[0].data).toBe('M 1 1 L 2 2');
      expect(result.layers[1].data).toBe('M 3 3 L 4 4');
    });

    it('supports loops inside apply blocks', () => {
      const result = compile(`
        define PathLayer('dots') \${}
        layer('dots').apply {
          for (i in 0..3) {
            M calc(i * 10) 0
          }
        }
      `);
      expect(result.layers[0].data).toBe('M 0 0 M 10 0 M 20 0 M 30 0');
    });

    it('supports conditionals inside apply blocks', () => {
      const result = compile(`
        define PathLayer('main') \${}
        layer('main').apply {
          if (1) { M 10 10 } else { M 20 20 }
        }
      `);
      expect(result.layers[0].data).toBe('M 10 10');
    });

    it('supports function calls inside apply blocks', () => {
      const result = compile(`
        define PathLayer('main') \${}
        fn box(x, y) { M x y h 10 v 10 h -10 z }
        layer('main').apply { box(5, 5) }
      `);
      expect(result.layers[0].data).toBe('M 5 5 h 10 v 10 h -10 z');
    });
  });

  describe('default layer routing', () => {
    it('routes bare commands to default layer', () => {
      const result = compile(`
        define default PathLayer('bg') \${ stroke: gray; }
        define PathLayer('fg') \${ stroke: black; }
        M 10 10 L 20 20
        layer('fg').apply { M 30 30 L 40 40 }
      `);
      expect(result.layers[0].name).toBe('bg');
      expect(result.layers[0].data).toBe('M 10 10 L 20 20');
      expect(result.layers[1].name).toBe('fg');
      expect(result.layers[1].data).toBe('M 30 30 L 40 40');
    });

    it('bare commands without default layer create implicit default', () => {
      const result = compile(`
        define PathLayer('overlay') \${}
        M 10 10
        layer('overlay').apply { M 20 20 }
      `);
      expect(result.layers).toHaveLength(2);
      expect(result.layers[0].name).toBe('default');
      expect(result.layers[0].data).toBe('M 10 10');
      expect(result.layers[0].isDefault).toBe(true);
      expect(result.layers[1].name).toBe('overlay');
      expect(result.layers[1].data).toBe('M 20 20');
    });

    it('no layers defined gives single default layer', () => {
      const result = compile('M 10 20 L 30 40');
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].name).toBe('default');
      expect(result.layers[0].data).toBe('M 10 20 L 30 40');
      expect(result.layers[0].isDefault).toBe(true);
      expect(result.layers[0].styles).toEqual({});
    });
  });

  describe('context isolation', () => {
    it('each layer has its own path context', () => {
      const result = compileWithContext(`
        define PathLayer('a') \${}
        define PathLayer('b') \${}
        layer('a').apply { M 100 100 L 200 200 }
        layer('b').apply { M 0 0 L 50 50 }
      `);
      // Main context should be at origin (no bare commands)
      expect(result.context.position).toEqual({ x: 0, y: 0 });
    });

    it('layer().ctx returns layer-specific context', () => {
      const result = compileWithContext(`
        define PathLayer('main') \${}
        layer('main').apply { M 100 100 L 200 200 }
        log(layer('main').ctx.position.x)
        log(layer('main').ctx.position.y)
      `);
      expect(result.logs).toHaveLength(2);
      expect(result.logs[0].parts[0].value).toBe('200');
      expect(result.logs[1].parts[0].value).toBe('200');
    });

    it('ctx updates within apply block reflect the layer context', () => {
      const result = compileWithContext(`
        define PathLayer('main') \${}
        layer('main').apply {
          M 50 50
          L calc(ctx.position.x + 10) calc(ctx.position.y + 10)
        }
      `);
      expect(result.layers[0].data).toBe('M 50 50 L 60 60');
    });
  });

  describe('layer() function', () => {
    it('returns a LayerReference', () => {
      const result = compileWithContext(`
        define PathLayer('test') \${}
        layer('test').apply { M 10 10 }
        log(layer('test').name)
      `);
      expect(result.logs[0].parts[0].value).toBe('test');
    });

    it('layer().ctx works', () => {
      const result = compileWithContext(`
        define PathLayer('test') \${}
        layer('test').apply { M 42 99 }
        log(layer('test').ctx.position.x)
      `);
      expect(result.logs[0].parts[0].value).toBe('42');
    });
  });

  describe('compileWithContext with layers', () => {
    it('returns layers in result', () => {
      const result = compileWithContext(`
        define default PathLayer('main') \${ stroke: red; }
        define PathLayer('outline') \${ stroke: black; stroke-width: 2; }
        M 10 10 L 20 20
        layer('outline').apply { M 0 0 L 100 100 }
      `);
      expect(result.layers).toHaveLength(2);
      expect(result.layers[0].name).toBe('main');
      expect(result.layers[0].styles.stroke).toBe('red');
      expect(result.layers[1].name).toBe('outline');
      expect(result.layers[1].styles.stroke).toBe('black');
      expect(result.layers[1].styles['stroke-width']).toBe('2');
    });

    it('path property returns first layer data', () => {
      const result = compileWithContext(`
        define default PathLayer('main') \${}
        M 10 20
      `);
      expect(result.path).toBe('M 10 20');
    });
  });

  describe('layer name from expression', () => {
    it('supports variable as layer name', () => {
      const result = compile(`
        let name = 'myLayer';
        define PathLayer(name) \${}
        layer(name).apply { M 10 10 }
      `);
      expect(result.layers[0].name).toBe('myLayer');
      expect(result.layers[0].data).toBe('M 10 10');
    });
  });

  describe('error cases', () => {
    it('throws on duplicate layer name', () => {
      expect(() => compile(`
        define PathLayer('main') \${}
        define PathLayer('main') \${}
      `)).toThrow("Duplicate layer name: 'main'");
    });

    it('throws on multiple default layers', () => {
      expect(() => compile(`
        define default PathLayer('a') \${}
        define default PathLayer('b') \${}
      `)).toThrow("Cannot define multiple default layers. 'a' is already the default");
    });

    it('throws on nested apply blocks', () => {
      expect(() => compile(`
        define PathLayer('a') \${}
        define PathLayer('b') \${}
        layer('a').apply {
          layer('b').apply { M 0 0 }
        }
      `)).toThrow("Cannot nest layer apply blocks. Already inside layer 'a'");
    });

    it('throws on undefined layer in apply', () => {
      expect(() => compile(`
        layer('nonexistent').apply { M 0 0 }
      `)).toThrow("Undefined layer: 'nonexistent'");
    });

    it('throws on undefined layer in expression', () => {
      expect(() => compileWithContext(`
        log(layer('nonexistent').ctx)
      `)).toThrow("Undefined layer: 'nonexistent'");
    });

    it('throws on non-string layer name in define', () => {
      expect(() => compile(`
        define PathLayer(42) \${}
      `)).toThrow('Layer name must be a string');
    });

    it('throws on non-string layer name in apply', () => {
      expect(() => compile(`
        define PathLayer('test') \${}
        layer(42).apply { M 0 0 }
      `)).toThrow('Layer name must be a string');
    });

    it('allows TextLayer definitions', () => {
      const result = compile(`
        define TextLayer('labels') \${}
      `);
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].type).toBe('text');
      expect(result.layers[0].name).toBe('labels');
    });

    it('throws when path commands target a TextLayer apply block', () => {
      expect(() => compile(`
        define TextLayer('labels') \${}
        layer('labels').apply { M 10 20 }
      `)).toThrow('Path commands cannot be used inside a TextLayer apply block');
    });

    it('throws when bare path commands route to default TextLayer', () => {
      expect(() => compile(`
        define default TextLayer('labels') \${}
        M 10 20
      `)).toThrow('Path commands cannot be routed to a TextLayer');
    });

    it('throws when text() is used outside a TextLayer apply block', () => {
      expect(() => compile(`
        text(10, 20)\`hello\`
      `)).toThrow('text() can only be used inside a TextLayer apply block');
    });

    it('throws when text() is used inside a PathLayer apply block', () => {
      expect(() => compile(`
        define PathLayer('main') \${}
        layer('main').apply { text(10, 20)\`hello\` }
      `)).toThrow('text() can only be used inside a TextLayer apply block');
    });
  });

  describe('TextLayer', () => {
    it('creates a TextLayer with inline text', () => {
      const result = compile(`
        define TextLayer('labels') \${ font-size: 14; }
        layer('labels').apply {
          text(10, 20)\`Hello\`
        }
      `);
      expect(result.layers).toHaveLength(1);
      const layer = result.layers[0];
      expect(layer.type).toBe('text');
      expect(layer.name).toBe('labels');
      expect(layer.styles['font-size']).toBe('14');
      expect(layer.textElements).toHaveLength(1);
      expect(layer.textElements![0]).toEqual({
        x: 10, y: 20, rotation: undefined,
        children: [{ type: 'run', text: 'Hello' }],
      });
    });

    it('creates text with rotation in degrees', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(50, 45, 30deg)\`Rotated\`
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.x).toBe(50);
      expect(te.y).toBe(45);
      expect(te.rotation).toBeCloseTo(30 * Math.PI / 180);
    });

    it('creates text with rotation in radians (default)', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(50, 45, 0.5pi)\`Rotated\`
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.rotation).toBeCloseTo(Math.PI / 2);
    });

    it('creates text with template literal interpolation', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        let name = "World";
        layer('labels').apply {
          text(10, 20)\`Hello \${name}!\`
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.children[0]).toEqual({ type: 'run', text: 'Hello World!' });
    });

    it('creates text with block form and tspans', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(10, 20) {
            \`Hello \`
            tspan(0, 0, 30deg)\`world\`
            \` end\`
          }
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.children).toHaveLength(3);
      expect(te.children[0]).toEqual({ type: 'run', text: 'Hello ' });
      expect(te.children[1]).toMatchObject({ type: 'tspan', text: 'world', dx: 0, dy: 0 });
      expect((te.children[1] as any).rotation).toBeCloseTo(30 * Math.PI / 180);
      expect(te.children[2]).toEqual({ type: 'run', text: ' end' });
    });

    it('creates tspan with only dx/dy', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(10, 20) {
            tspan()\`first\`
            tspan(0, 16)\`second\`
          }
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.children).toEqual([
        { type: 'tspan', text: 'first' },
        { type: 'tspan', text: 'second', dx: 0, dy: 16 },
      ]);
    });

    it('data field contains concatenated plain text', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(10, 20)\`Hello\`
          text(50, 60)\`World\`
        }
      `);
      expect(result.layers[0].data).toBe('Hello World');
    });

    it('mixes PathLayer and TextLayer', () => {
      const result = compile(`
        define default PathLayer('shape') \${ stroke: #333; fill: none; }
        define TextLayer('labels') \${ font-size: 14; fill: #333; }
        M 50 50 L 150 80
        layer('labels').apply {
          text(50, 45)\`Start\`
          text(150, 75)\`End\`
        }
      `);
      expect(result.layers).toHaveLength(2);
      expect(result.layers[0].type).toBe('path');
      expect(result.layers[0].data).toBe('M 50 50 L 150 80');
      expect(result.layers[1].type).toBe('text');
      expect(result.layers[1].textElements).toHaveLength(2);
    });

    it('TextLayer can be the default layer', () => {
      const result = compile(`
        define default TextLayer('labels') \${}
        define PathLayer('lines') \${}
        layer('lines').apply { M 10 20 }
        layer('labels').apply { text(10, 20)\`hello\` }
      `);
      expect(result.layers[0].type).toBe('text');
      expect(result.layers[0].isDefault).toBe(true);
      expect(result.layers[1].type).toBe('path');
    });

    it('uses variables and expressions in text position', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        let x = 10;
        let y = 20;
        layer('labels').apply {
          text(calc(x + 5), calc(y * 2))\`pos\`
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.x).toBe(15);
      expect(te.y).toBe(40);
    });

    it('uses for loop inside TextLayer apply block', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          for (i in 0..2) {
            text(calc(i * 50), 20)\`item \${i}\`
          }
        }
      `);
      expect(result.layers[0].textElements).toHaveLength(3);
      expect(result.layers[0].textElements![0].x).toBe(0);
      expect(result.layers[0].textElements![1].x).toBe(50);
      expect(result.layers[0].textElements![2].x).toBe(100);
    });
  });

  describe('for/if/let inside text blocks', () => {
    it('supports for loop inside text block to generate tspans', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(100, 100) {
            for (i in 0..2) {
              tspan(20, 0)\`item \${i}\`
            }
          }
        }
      `);
      expect(result.layers[0].textElements).toHaveLength(1);
      const te = result.layers[0].textElements![0];
      expect(te.children).toHaveLength(3);
      expect(te.children[0]).toEqual({ type: 'tspan', text: 'item 0', dx: 20, dy: 0, rotation: undefined });
      expect(te.children[1]).toEqual({ type: 'tspan', text: 'item 1', dx: 20, dy: 0, rotation: undefined });
      expect(te.children[2]).toEqual({ type: 'tspan', text: 'item 2', dx: 20, dy: 0, rotation: undefined });
    });

    it('supports if statement inside text block', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(10, 20) {
            if (1) {
              tspan(0, 16)\`visible\`
            } else {
              tspan(0, 16)\`hidden\`
            }
          }
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.children).toHaveLength(1);
      expect(te.children[0]).toEqual({ type: 'tspan', text: 'visible', dx: 0, dy: 16, rotation: undefined });
    });

    it('supports if-else inside text block (false branch)', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(10, 20) {
            if (0) {
              tspan(0, 16)\`visible\`
            } else {
              tspan(0, 16)\`fallback\`
            }
          }
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.children).toHaveLength(1);
      expect(te.children[0]).toMatchObject({ type: 'tspan', text: 'fallback' });
    });

    it('supports let declaration inside text block', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(10, 20) {
            let prefix = "item";
            tspan(0, 16)\`\${prefix} A\`
            tspan(0, 16)\`\${prefix} B\`
          }
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.children).toHaveLength(2);
      expect(te.children[0]).toMatchObject({ type: 'tspan', text: 'item A' });
      expect(te.children[1]).toMatchObject({ type: 'tspan', text: 'item B' });
    });

    it('supports nested for loop inside text block', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(10, 20) {
            for (row in 0..1) {
              for (col in 0..1) {
                tspan(0, 16)\`r\${row}c\${col}\`
              }
            }
          }
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.children).toHaveLength(4);
      expect(te.children[0]).toMatchObject({ type: 'tspan', text: 'r0c0' });
      expect(te.children[1]).toMatchObject({ type: 'tspan', text: 'r0c1' });
      expect(te.children[2]).toMatchObject({ type: 'tspan', text: 'r1c0' });
      expect(te.children[3]).toMatchObject({ type: 'tspan', text: 'r1c1' });
    });

    it('supports mixed content with for loops in text block', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        layer('labels').apply {
          text(10, 20) {
            \`Header\`
            for (i in 0..1) {
              tspan(0, 16)\`line \${i}\`
            }
            \`Footer\`
          }
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.children).toHaveLength(4);
      expect(te.children[0]).toEqual({ type: 'run', text: 'Header' });
      expect(te.children[1]).toMatchObject({ type: 'tspan', text: 'line 0' });
      expect(te.children[2]).toMatchObject({ type: 'tspan', text: 'line 1' });
      expect(te.children[3]).toEqual({ type: 'run', text: 'Footer' });
    });
  });

  describe('style block integration', () => {
    it('layer with style variable', () => {
      const result = compile(`
        let styles = \${ stroke: #cc0000; stroke-width: 3; fill: none; };
        define PathLayer('outline') styles
        layer('outline').apply { M 10 10 L 90 90 }
      `);
      expect(result.layers[0].styles).toEqual({
        stroke: '#cc0000',
        'stroke-width': '3',
        fill: 'none',
      });
      expect(result.layers[0].data).toBe('M 10 10 L 90 90');
    });

    it('layer with merged style expression', () => {
      const result = compile(`
        let base = \${ stroke: black; stroke-width: 1; };
        define PathLayer('custom') base << \${ stroke-width: 4; fill: none; }
        layer('custom').apply { M 0 0 H 100 }
      `);
      expect(result.layers[0].styles).toEqual({
        stroke: 'black',
        'stroke-width': '4',
        fill: 'none',
      });
    });

    it('text element with per-element styles', () => {
      const result = compile(`
        define TextLayer('labels') \${ font-size: 14; }
        let bold = \${ font-weight: bold; };
        layer('labels').apply {
          text(10, 20, 0, bold)\`Hello\`
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.styles).toEqual({ 'font-weight': 'bold' });
    });

    it('tspan with per-element styles', () => {
      const result = compile(`
        define TextLayer('labels') \${ font-size: 14; }
        layer('labels').apply {
          text(10, 20) {
            tspan(0, 0, 0, \${ fill: red; })\`colored\`
          }
        }
      `);
      const te = result.layers[0].textElements![0];
      expect(te.children[0]).toMatchObject({
        type: 'tspan',
        text: 'colored',
        styles: { fill: 'red' },
      });
    });

    it('empty style block in layer definition', () => {
      const result = compile(`
        define PathLayer('bare') \${}
        layer('bare').apply { M 0 0 L 10 10 }
      `);
      expect(result.layers[0].styles).toEqual({});
      expect(result.layers[0].data).toBe('M 0 0 L 10 10');
    });

    it('style block property access returns string values', () => {
      const result = compile(`
        let s = \${ stroke-width: 5; fill: none; };
        log(s.strokeWidth);
        log(s.fill);
        define default PathLayer('d') \${ stroke: black; }
        M 0 0
      `);
      expect(result.logs[0].parts[0].value).toBe('5');
      expect(result.logs[1].parts[0].value).toBe('none');
    });
  });

  describe('Layer Transforms', () => {
    describe('translate', () => {
      it('sets translate transform on a layer', () => {
        const result = compile(`
          define PathLayer('main') \${ stroke: red; }
          layer('main').ctx.transform.translate.set(50, 50)
          layer('main').apply { M 0 0 L 100 0 }
        `);
        expect(result.layers[0].transform).toBe('translate(50, 50)');
      });

      it('reads translate values', () => {
        const result = compileWithContext(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.translate.set(30, 40)
          log(layer('main').ctx.transform.translate.x)
          log(layer('main').ctx.transform.translate.y)
        `);
        expect(result.logs[0].parts[0].value).toBe('30');
        expect(result.logs[1].parts[0].value).toBe('40');
      });

      it('returns 0 for unset translate', () => {
        const result = compileWithContext(`
          define PathLayer('main') \${}
          log(layer('main').ctx.transform.translate.x)
          log(layer('main').ctx.transform.translate.y)
        `);
        expect(result.logs[0].parts[0].value).toBe('0');
        expect(result.logs[1].parts[0].value).toBe('0');
      });

      it('resets translate', () => {
        const result = compile(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.translate.set(50, 50)
          layer('main').ctx.transform.translate.reset()
          layer('main').apply { M 0 0 }
        `);
        expect(result.layers[0].transform).toBeUndefined();
      });
    });

    describe('rotate', () => {
      it('sets rotate transform (angle only)', () => {
        const result = compile(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.rotate.set(calc(PI() / 4))
          layer('main').apply { M 0 0 L 100 0 }
        `);
        expect(result.layers[0].transform).toBe('rotate(45)');
      });

      it('sets rotate with origin', () => {
        const result = compile(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.rotate.set(calc(PI() / 2), 50, 50)
          layer('main').apply { M 0 0 }
        `);
        expect(result.layers[0].transform).toBe('rotate(90, 50, 50)');
      });

      it('reads rotate values', () => {
        const result = compileWithContext(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.rotate.set(calc(PI() / 4), 10, 20)
          log(layer('main').ctx.transform.rotate.angle)
          log(layer('main').ctx.transform.rotate.cx)
          log(layer('main').ctx.transform.rotate.cy)
        `);
        expect(Number(result.logs[0].parts[0].value)).toBeCloseTo(Math.PI / 4);
        expect(result.logs[1].parts[0].value).toBe('10');
        expect(result.logs[2].parts[0].value).toBe('20');
      });

      it('returns 0 for unset rotate angle', () => {
        const result = compileWithContext(`
          define PathLayer('main') \${}
          log(layer('main').ctx.transform.rotate.angle)
        `);
        expect(result.logs[0].parts[0].value).toBe('0');
      });
    });

    describe('scale', () => {
      it('sets scale transform', () => {
        const result = compile(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.scale.set(2, 3)
          layer('main').apply { M 0 0 }
        `);
        expect(result.layers[0].transform).toBe('scale(2, 3)');
      });

      it('sets scale with origin', () => {
        const result = compile(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.scale.set(2, 2, 50, 50)
          layer('main').apply { M 0 0 }
        `);
        expect(result.layers[0].transform).toBe('translate(50, 50) scale(2, 2) translate(-50, -50)');
      });

      it('reads scale values', () => {
        const result = compileWithContext(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.scale.set(2, 3)
          log(layer('main').ctx.transform.scale.x)
          log(layer('main').ctx.transform.scale.y)
        `);
        expect(result.logs[0].parts[0].value).toBe('2');
        expect(result.logs[1].parts[0].value).toBe('3');
      });

      it('returns 1 for unset scale', () => {
        const result = compileWithContext(`
          define PathLayer('main') \${}
          log(layer('main').ctx.transform.scale.x)
          log(layer('main').ctx.transform.scale.y)
        `);
        expect(result.logs[0].parts[0].value).toBe('1');
        expect(result.logs[1].parts[0].value).toBe('1');
      });
    });

    describe('combined transforms', () => {
      it('applies translate + rotate + scale in SVG order', () => {
        const result = compile(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.translate.set(10, 20)
          layer('main').ctx.transform.rotate.set(calc(PI() / 2))
          layer('main').ctx.transform.scale.set(2, 2)
          layer('main').apply { M 0 0 }
        `);
        expect(result.layers[0].transform).toBe('translate(10, 20) rotate(90) scale(2, 2)');
      });
    });

    describe('reset all transforms', () => {
      it('clears all transforms with transform.reset()', () => {
        const result = compile(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.translate.set(50, 50)
          layer('main').ctx.transform.rotate.set(1)
          layer('main').ctx.transform.scale.set(2, 2)
          layer('main').ctx.transform.reset()
          layer('main').apply { M 0 0 }
        `);
        expect(result.layers[0].transform).toBeUndefined();
      });
    });

    describe('default context (no layers)', () => {
      it('sets transform on implicit default layer via ctx', () => {
        const result = compile(`
          ctx.transform.translate.set(25, 25)
          M 0 0 L 100 0
        `);
        expect(result.layers[0].transform).toBe('translate(25, 25)');
      });

      it('reads transform from ctx without layers', () => {
        const result = compileWithContext(`
          ctx.transform.scale.set(3, 4)
          log(ctx.transform.scale.x)
          log(ctx.transform.scale.y)
        `);
        expect(result.logs[0].parts[0].value).toBe('3');
        expect(result.logs[1].parts[0].value).toBe('4');
      });
    });

    describe('inside apply block', () => {
      it('ctx.transform inside apply block sets that layer transform', () => {
        const result = compile(`
          define PathLayer('main') \${}
          layer('main').apply {
            ctx.transform.translate.set(10, 20)
            M 0 0 L 50 50
          }
        `);
        expect(result.layers[0].transform).toBe('translate(10, 20)');
      });
    });

    describe('per-layer isolation', () => {
      it('each layer has independent transforms', () => {
        const result = compile(`
          define PathLayer('a') \${}
          define PathLayer('b') \${}
          layer('a').ctx.transform.translate.set(10, 10)
          layer('b').ctx.transform.scale.set(2, 2)
          layer('a').apply { M 0 0 }
          layer('b').apply { M 0 0 }
        `);
        expect(result.layers[0].transform).toBe('translate(10, 10)');
        expect(result.layers[1].transform).toBe('scale(2, 2)');
      });
    });

    describe('no transform set', () => {
      it('transform is undefined when not set', () => {
        const result = compile(`
          define PathLayer('main') \${}
          layer('main').apply { M 0 0 L 100 0 }
        `);
        expect(result.layers[0].transform).toBeUndefined();
      });

      it('no transform on implicit default layer', () => {
        const result = compile('M 0 0 L 100 0');
        expect(result.layers[0].transform).toBeUndefined();
      });
    });

    describe('error cases', () => {
      it('throws on wrong number of translate.set args', () => {
        expect(() => compile(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.translate.set(50)
        `)).toThrow('translate.set() expects 2 arguments');
      });

      it('throws on wrong number of rotate.set args', () => {
        expect(() => compile(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.rotate.set(1, 2)
        `)).toThrow('rotate.set() expects 1 or 3 arguments');
      });

      it('throws on wrong number of scale.set args', () => {
        expect(() => compile(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.scale.set(2)
        `)).toThrow('scale.set() expects 2 or 4 arguments');
      });

      it('throws on non-numeric transform arguments', () => {
        expect(() => compile(`
          define PathLayer('main') \${}
          layer('main').ctx.transform.translate.set("a", "b")
        `)).toThrow('arguments must be numbers');
      });

      it('throws on invalid transform property', () => {
        expect(() => compileWithContext(`
          define PathLayer('main') \${}
          log(layer('main').ctx.transform.skew)
        `)).toThrow("does not exist on transform");
      });
    });
  });

  describe('SVGDocumentFragment', () => {
    it('creates a fragment from a template literal', () => {
      const result = compile(`
        let fragment = SVGDocumentFragment(\`<rect width="100" height="100" fill="red"/>\`);
        fragment.insert()
      `);
      expect(result.layers.some(l => l.type === 'fragment')).toBe(true);
    });

    it('separates defs from visual content', () => {
      const result = compile(`
        let fragment = SVGDocumentFragment(\`
          <defs>
            <filter id="blur"><feGaussianBlur stdDeviation="5"/></filter>
          </defs>
          <rect width="100" height="100" fill="red"/>
        \`);
        fragment.insert()
      `);
      const frag = result.layers.find(l => l.type === 'fragment')!;
      expect(frag.fragmentDefs).toContain('filter');
      expect(frag.fragmentDefs).toContain('feGaussianBlur');
      expect(frag.fragmentVisuals).toContain('rect');
      expect(frag.fragmentVisuals).not.toContain('filter');
    });

    it('rejects <script> tags', () => {
      expect(() => compile(`
        SVGDocumentFragment(\`<script>alert(1)</script>\`);
      `)).toThrow('<script> elements are not allowed');
    });

    it('rejects on* event handlers', () => {
      expect(() => compile(`
        SVGDocumentFragment(\`<rect onclick="alert(1)" width="10" height="10"/>\`);
      `)).toThrow('on* event handler attributes are not allowed');
    });

    it('rejects malformed SVG (mismatched tags)', () => {
      expect(() => compile(`
        SVGDocumentFragment(\`<g><rect/></text>\`);
      `)).toThrow('malformed SVG');
    });

    it('respects layer ordering', () => {
      const result = compile(`
        define PathLayer('bg') \${}
        let frag = SVGDocumentFragment(\`<rect width="100" height="100"/>\`);
        frag.insert()
        define PathLayer('fg') \${}
        layer('bg').apply { M 0 0 }
        layer('fg').apply { M 10 10 }
      `);
      expect(result.layers.map(l => l.type)).toEqual(['path', 'fragment', 'path']);
      expect(result.layers[0].name).toBe('bg');
      expect(result.layers[1].type).toBe('fragment');
      expect(result.layers[2].name).toBe('fg');
    });

    it('supports multiple fragment insertions', () => {
      const result = compile(`
        let f1 = SVGDocumentFragment(\`<rect width="50" height="50"/>\`);
        let f2 = SVGDocumentFragment(\`<circle cx="50" cy="50" r="25"/>\`);
        f1.insert()
        f2.insert()
      `);
      const frags = result.layers.filter(l => l.type === 'fragment');
      expect(frags).toHaveLength(2);
      expect(frags[0].fragmentVisuals).toContain('rect');
      expect(frags[1].fragmentVisuals).toContain('circle');
    });

    it('supports expression interpolation in template literal', () => {
      const result = compile(`
        let r = 25;
        let frag = SVGDocumentFragment(\`<circle cx="50" cy="50" r="\${r}"/>\`);
        frag.insert()
      `);
      const frag = result.layers.find(l => l.type === 'fragment')!;
      expect(frag.fragmentVisuals).toContain('r="25"');
    });

    it('rejects non-string argument', () => {
      expect(() => compile(`
        SVGDocumentFragment(42);
      `)).toThrow('argument must be a string');
    });

    it('rejects wrong argument count', () => {
      expect(() => compile(`
        SVGDocumentFragment(\`a\`, \`b\`);
      `)).toThrow('expects 1 argument');
    });
  });

  describe('Mask and ClipPath', () => {
    it('creates a Mask and returns raw id via .id', () => {
      const result = compile(`
        let m = Mask('my-mask');
        log(m.id);
      `);
      expect(result.logs[0].parts[0].value).toBe('my-mask');
      expect(result.masks).toHaveLength(1);
      expect(result.masks[0].id).toBe('my-mask');
      expect(result.masks[0].elements).toHaveLength(0);
    });

    it('creates a ClipPath and returns raw id via .id', () => {
      const result = compile(`
        let c = ClipPath('my-clip');
        log(c.id);
      `);
      expect(result.logs[0].parts[0].value).toBe('my-clip');
      expect(result.clipPaths).toHaveLength(1);
      expect(result.clipPaths[0].id).toBe('my-clip');
      expect(result.clipPaths[0].elements).toHaveLength(0);
    });

    it('style auto-wrapping: mask property gets url(#...) wrapper', () => {
      const result = compile(`
        let m = Mask('alpha-mask');
        define PathLayer('art') \${ mask: m.id; }
        layer('art').apply { M 0 0 L 10 10 }
      `);
      expect(result.layers.find(l => l.name === 'art')!.styles['mask']).toBe('url(#alpha-mask)');
    });

    it('style auto-wrapping: clip-path property gets url(#...) wrapper', () => {
      const result = compile(`
        let c = ClipPath('clip-id');
        define PathLayer('scene') \${ clip-path: c.id; }
        layer('scene').apply { M 0 0 L 10 10 }
      `);
      expect(result.layers.find(l => l.name === 'scene')!.styles['clip-path']).toBe('url(#clip-id)');
    });

    it('does not double-wrap values that already start with url(', () => {
      const result = compile(`
        define PathLayer('art') \${ mask: url(#existing); }
        layer('art').apply { M 0 0 L 10 10 }
      `);
      expect(result.layers.find(l => l.name === 'art')!.styles['mask']).toBe('url(#existing)');
    });

    it('Mask.append() with PathBlockValue auto-projects at origin', () => {
      const result = compile(`
        let p = @{ m 0 0 l 50 50 };
        let m = Mask('test');
        m.append(p, \${ fill: white; });
      `);
      expect(result.masks).toHaveLength(1);
      expect(result.masks[0].elements).toHaveLength(1);
      expect(result.masks[0].elements[0].pathData).toContain('M');
      expect(result.masks[0].elements[0].styles).toEqual({ fill: 'white' });
    });

    it('Mask.append() with ProjectedPathValue', () => {
      const result = compile(`
        let p = @{ m 0 0 l 50 50 };
        let proj = p.project(10, 20);
        let m = Mask('proj-mask');
        m.append(proj, \${ fill: black; });
      `);
      expect(result.masks[0].elements).toHaveLength(1);
      expect(result.masks[0].elements[0].pathData).toContain('M');
      expect(result.masks[0].elements[0].styles).toEqual({ fill: 'black' });
    });

    it('multiple appends produce multiple elements', () => {
      const result = compile(`
        let p1 = @{ m 0 0 l 100 0 l 0 100 z };
        let p2 = @{ m 50 50 l 20 0 l 0 20 z };
        let m = Mask('multi');
        m.append(p1, \${ fill: white; });
        m.append(p2, \${ fill: black; });
      `);
      expect(result.masks[0].elements).toHaveLength(2);
      expect(result.masks[0].elements[0].styles.fill).toBe('white');
      expect(result.masks[0].elements[1].styles.fill).toBe('black');
    });

    it('ClipPath.append() accepts path without styles', () => {
      const result = compile(`
        let p = @{ m 0 0 l 100 0 l 0 100 z };
        let c = ClipPath('clip');
        c.append(p);
      `);
      expect(result.clipPaths[0].elements).toHaveLength(1);
      expect(result.clipPaths[0].elements[0].pathData).toContain('M');
    });

    it('Mask.append() without styles uses empty styles', () => {
      const result = compile(`
        let p = @{ m 0 0 l 50 50 };
        let m = Mask('no-style');
        m.append(p);
      `);
      expect(result.masks[0].elements).toHaveLength(1);
      expect(result.masks[0].elements[0].styles).toEqual({});
    });

    it('duplicate Mask ID throws error', () => {
      expect(() => compile(`
        let m1 = Mask('dup');
        let m2 = Mask('dup');
      `)).toThrow("Duplicate defs ID 'dup'");
    });

    it('duplicate ID across Mask and ClipPath throws error', () => {
      expect(() => compile(`
        let m = Mask('shared');
        let c = ClipPath('shared');
      `)).toThrow("Duplicate defs ID 'shared'");
    });

    it('Mask() rejects non-string argument', () => {
      expect(() => compile(`
        Mask(42);
      `)).toThrow('argument must be a string');
    });

    it('ClipPath() rejects wrong argument count', () => {
      expect(() => compile(`
        ClipPath();
      `)).toThrow('expects 1 argument');
    });

    it('Mask.append() rejects non-path argument', () => {
      expect(() => compile(`
        let m = Mask('bad');
        m.append(42);
      `)).toThrow('must be a PathBlock or ProjectedPath');
    });

    it('ClipPath.append() rejects non-path argument', () => {
      expect(() => compile(`
        let c = ClipPath('bad');
        c.append("not a path");
      `)).toThrow('must be a PathBlock or ProjectedPath');
    });

    it('Mask.append() rejects non-style-block second argument', () => {
      expect(() => compile(`
        let p = @{ m 0 0 l 10 10 };
        let m = Mask('bad-style');
        m.append(p, 42);
      `)).toThrow('second argument must be a style block');
    });

    it('empty mask produces empty elements array', () => {
      const result = compile(`
        let m = Mask('empty');
      `);
      expect(result.masks[0].elements).toHaveLength(0);
    });

    it('using mask in layer styles with full pipeline', () => {
      const result = compile(`
        let maskShape = @{ m 0 0 l 200 0 l 0 200 l -200 0 z };
        let cutout = @{ m 50 50 l 100 0 l 0 100 l -100 0 z };
        let m = Mask('reveal');
        m.append(maskShape, \${ fill: white; });
        m.append(cutout, \${ fill: black; });

        define PathLayer('art') \${ mask: m.id; }
        layer('art').apply { M 10 10 L 190 190 }
      `);
      expect(result.masks).toHaveLength(1);
      expect(result.masks[0].id).toBe('reveal');
      expect(result.masks[0].elements).toHaveLength(2);
      const artLayer = result.layers.find(l => l.name === 'art')!;
      expect(artLayer.styles['mask']).toBe('url(#reveal)');
    });

    it('formatValueForDisplay shows Mask and ClipPath', () => {
      const result = compile(`
        let m = Mask('disp');
        let c = ClipPath('disp2');
        let p = @{ m 0 0 l 10 10 };
        m.append(p);
        log(m);
        log(c);
      `);
      expect(result.logs[0].parts[0].value).toBe('Mask(disp, 1 paths)');
      expect(result.logs[1].parts[0].value).toBe('ClipPath(disp2, 0 paths)');
    });

    it('auto-wrapping applies to filter, marker-start, marker-mid, marker-end', () => {
      const result = compile(`
        define PathLayer('f') \${ filter: blur-filter; }
        define PathLayer('ms') \${ marker-start: arrow; }
        define PathLayer('mm') \${ marker-mid: dot; }
        define PathLayer('me') \${ marker-end: arrowhead; }
        layer('f').apply { M 0 0 }
        layer('ms').apply { M 0 0 }
        layer('mm').apply { M 0 0 }
        layer('me').apply { M 0 0 }
      `);
      expect(result.layers.find(l => l.name === 'f')!.styles['filter']).toBe('url(#blur-filter)');
      expect(result.layers.find(l => l.name === 'ms')!.styles['marker-start']).toBe('url(#arrow)');
      expect(result.layers.find(l => l.name === 'mm')!.styles['marker-mid']).toBe('url(#dot)');
      expect(result.layers.find(l => l.name === 'me')!.styles['marker-end']).toBe('url(#arrowhead)');
    });
  });
});
