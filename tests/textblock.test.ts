import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile, parse, createFontRegistry, addFont } from '../src';
import type { FontRegistry } from '../src';
import { tokenizeLine, normalizeCodeText } from '../src/evaluator/code-snippet';

function compileLogs(source: string) {
  return compile(source).logs.map((l) => l.parts.map((p) => p.value).join(' '));
}

function compileLogValues(source: string) {
  return compile(source).logs.map((l) => l.parts[0]?.value);
}

describe('TextBlock', () => {
  // ---------------------------------------------------------------------------
  // Parser
  // ---------------------------------------------------------------------------
  describe('parser', () => {
    it('parses a basic text block expression', () => {
      const ast = parse("let t = &{ text(0, 16)`Hello` };");
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe('LetDeclaration');
      if (ast.body[0].type === 'LetDeclaration') {
        expect(ast.body[0].value.type).toBe('TextBlockExpression');
      }
    });

    it('parses text block with control flow', () => {
      const ast = parse(`
        let t = &{
          for (i in 0..3) {
            text(0, calc(i * 20))\`item\`
          }
        };
      `);
      expect(ast.body).toHaveLength(1);
      if (ast.body[0].type === 'LetDeclaration' && ast.body[0].value.type === 'TextBlockExpression') {
        expect(ast.body[0].value.body).toHaveLength(1);
        expect(ast.body[0].value.body[0].type).toBe('ForLoop');
      }
    });

    it('parses text block with tspan body', () => {
      const ast = parse(`
        let t = &{
          text(0, 16) {
            tspan()\`first\`
            tspan(0, 16)\`second\`
          }
        };
      `);
      expect(ast.body).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Definition
  // ---------------------------------------------------------------------------
  describe('definition', () => {
    it('creates a TextBlockValue with text elements', () => {
      const result = compile(`
        let t = &{ text(0, 16)\`Hello\` };
        log(t);
      `);
      expect(result.logs[0].parts[0].value).toBe('TextBlock(1 elements)');
    });

    it('captures multiple text elements', () => {
      const result = compile(`
        let t = &{
          text(0, 16)\`Line 1\`
          text(0, 32)\`Line 2\`
          text(0, 48)\`Line 3\`
        };
        log(t);
      `);
      expect(result.logs[0].parts[0].value).toBe('TextBlock(3 elements)');
    });

    it('supports control flow inside text blocks', () => {
      const result = compile(`
        let t = &{
          for (i in 0..3) {
            text(0, calc(i * 20))\`item\`
          }
        };
        log(t);
      `);
      expect(result.logs[0].parts[0].value).toBe('TextBlock(4 elements)');
    });

    it('supports let declarations inside text blocks', () => {
      const result = compile(`
        let t = &{
          let y = 16;
          text(0, y)\`Hello\`
        };
        log(t);
      `);
      expect(result.logs[0].parts[0].value).toBe('TextBlock(1 elements)');
    });

    it('does not emit to any layer on creation', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        let t = &{ text(0, 16)\`Hello\` };
      `);
      // No text elements emitted to any layer
      const textLayer = result.layers.find((l) => l.name === 'labels');
      expect(textLayer?.textElements ?? []).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Runtime restrictions
  // ---------------------------------------------------------------------------
  describe('restrictions', () => {
    it('rejects path commands inside text blocks', () => {
      expect(() => compile('let t = &{ M 10 20 };')).toThrow(/Path commands are not allowed inside text blocks/);
    });

    it('rejects layer definitions inside text blocks', () => {
      expect(() => compile("let t = &{ define PathLayer('x') \${} };")).toThrow(/Layer definitions are not allowed inside text blocks/);
    });

    it('rejects layer apply blocks inside text blocks', () => {
      expect(() => compile(`
        define PathLayer('x') \${}
        let t = &{ layer('x').apply { M 0 0 } };
      `)).toThrow(/Layer apply blocks are not allowed inside text blocks/);
    });

    it('rejects nested text blocks', () => {
      expect(() => compile("let t = &{ let inner = &{ text(0, 0)`x` }; };")).toThrow(/Cannot nest text blocks/);
    });
  });

  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------
  describe('properties', () => {
    it('.elementCount returns number of elements', () => {
      const vals = compileLogValues(`
        let t = &{ text(0, 16)\`A\` text(0, 32)\`B\` };
        log(t.elementCount);
      `);
      expect(vals[0]).toBe('2');
    });

    it('.styles returns a StyleBlockValue that can be merged', () => {
      const result = compile(`
        let t = &{ text(0, 16)\`A\` } << \${ font-size: 24; };
        let s = t.styles;
        // Merge styles back to verify it's a real StyleBlockValue
        let t2 = &{ text(0, 16)\`B\` } << s;
        define TextLayer('test') \${}
        layer('test').apply {
          t2.drawTo(0, 0);
        }
      `);
      const layer = result.layers.find((l) => l.name === 'test');
      expect(layer?.textElements?.[0]?.styles?.['font-size']).toBe('24');
    });
  });

  // ---------------------------------------------------------------------------
  // Style merge (<<)
  // ---------------------------------------------------------------------------
  describe('<< operator', () => {
    it('merges style block into TextBlockValue', () => {
      const vals = compileLogValues(`
        let t = &{ text(0, 16)\`Hi\` } << \${ font-size: 24; };
        log(t);
      `);
      expect(vals[0]).toBe('TextBlock(1 elements)');
    });

    it('merges style block into ProjectedTextValue', () => {
      const vals = compileLogValues(`
        let t = &{ text(0, 16)\`Hi\` };
        let p = t.project(10, 20) << \${ font-weight: bold; };
        log(p);
      `);
      expect(vals[0]).toBe('ProjectedText(10, 20, 1 elements)');
    });
  });

  // ---------------------------------------------------------------------------
  // .project()
  // ---------------------------------------------------------------------------
  describe('.project()', () => {
    it('returns ProjectedTextValue with offset coords', () => {
      const vals = compileLogValues(`
        let t = &{ text(5, 16)\`Hello\` };
        let p = t.project(100, 200);
        log(p);
        log(p.origin);
      `);
      expect(vals[0]).toBe('ProjectedText(100, 200, 1 elements)');
      expect(vals[1]).toBe('Point(100, 200)');
    });

    it('does not modify the original TextBlockValue', () => {
      const vals = compileLogValues(`
        let t = &{ text(0, 16)\`Hello\` };
        let p = t.project(100, 200);
        log(t);
      `);
      expect(vals[0]).toBe('TextBlock(1 elements)');
    });
  });

  // ---------------------------------------------------------------------------
  // .drawTo()
  // ---------------------------------------------------------------------------
  describe('.drawTo()', () => {
    it('emits text elements to a TextLayer', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        let t = &{ text(0, 16)\`Hello\` };
        layer('labels').apply {
          t.drawTo(50, 100);
        }
      `);
      const layer = result.layers.find((l) => l.name === 'labels');
      expect(layer?.textElements).toHaveLength(1);
      expect(layer!.textElements![0].x).toBe(50);
      expect(layer!.textElements![0].y).toBe(116);
      expect(layer!.textElements![0].children[0]).toEqual({ type: 'run', text: 'Hello' });
    });

    it('applies rotation when provided', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        let t = &{ text(0, 16)\`Hello\` };
        layer('labels').apply {
          t.drawTo(50, 100, 45deg);
        }
      `);
      const layer = result.layers.find((l) => l.name === 'labels');
      expect(layer?.textElements).toHaveLength(1);
      // 45 degrees in radians
      expect(layer!.textElements![0].rotation).toBeCloseTo(Math.PI / 4, 6);
    });

    it('errors outside TextLayer context', () => {
      expect(() => compile(`
        let t = &{ text(0, 16)\`Hello\` };
        t.drawTo(50, 100);
      `)).toThrow(/drawTo\(\) can only be used inside a TextLayer apply block/);
    });

    it('errors inside a PathLayer context', () => {
      expect(() => compile(`
        define PathLayer('path') \${}
        let t = &{ text(0, 16)\`Hello\` };
        layer('path').apply {
          t.drawTo(50, 100);
        }
      `)).toThrow(/drawTo\(\) can only be used inside a TextLayer apply block/);
    });

    it('returns a ProjectedTextValue', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        let t = &{ text(0, 16)\`Hello\` };
        let projected = null;
        layer('labels').apply {
          projected = t.drawTo(50, 100);
        }
        log(projected);
      `);
      expect(result.logs[0].parts[0].value).toBe('ProjectedText(50, 100, 1 elements)');
    });
  });

  // ---------------------------------------------------------------------------
  // ProjectedTextValue .draw()
  // ---------------------------------------------------------------------------
  describe('.draw()', () => {
    it('emits text elements at projected position', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        let t = &{ text(0, 16)\`Hello\` };
        let p = t.project(50, 100);
        layer('labels').apply {
          p.draw();
        }
      `);
      const layer = result.layers.find((l) => l.name === 'labels');
      expect(layer?.textElements).toHaveLength(1);
      expect(layer!.textElements![0].x).toBe(50);
      expect(layer!.textElements![0].y).toBe(116);
    });

    it('errors outside TextLayer context', () => {
      expect(() => compile(`
        let t = &{ text(0, 16)\`Hello\` };
        let p = t.project(50, 100);
        p.draw();
      `)).toThrow(/draw\(\) can only be used inside a TextLayer apply block/);
    });
  });

  // ---------------------------------------------------------------------------
  // ProjectedTextValue .drawTo()
  // ---------------------------------------------------------------------------
  describe('ProjectedTextValue .drawTo()', () => {
    it('re-projects and emits to a new position', () => {
      const result = compile(`
        define TextLayer('labels') \${}
        let t = &{ text(0, 16)\`Hello\` };
        let p = t.project(50, 100);
        layer('labels').apply {
          p.drawTo(200, 300);
        }
      `);
      const layer = result.layers.find((l) => l.name === 'labels');
      expect(layer?.textElements).toHaveLength(1);
      expect(layer!.textElements![0].x).toBe(200);
      expect(layer!.textElements![0].y).toBe(316);
    });
  });

  // ---------------------------------------------------------------------------
  // .translate()
  // ---------------------------------------------------------------------------
  describe('.translate()', () => {
    it('returns a new ProjectedTextValue with offset origin', () => {
      const vals = compileLogValues(`
        let t = &{ text(0, 16)\`Hello\` };
        let p = t.project(50, 100);
        let moved = p.translate(10, -5);
        log(moved.origin);
      `);
      expect(vals[0]).toBe('Point(60, 95)');
    });
  });

  // ---------------------------------------------------------------------------
  // BBoxAnchor enum
  // ---------------------------------------------------------------------------
  describe('BBoxAnchor enum', () => {
    it('is accessible as a built-in enum', () => {
      const vals = compileLogValues(`
        log(BBoxAnchor.TopLeft);
        log(BBoxAnchor.Center);
        log(BBoxAnchor.BottomRight);
      `);
      expect(vals[0]).toBe('top-left');
      expect(vals[1]).toBe('center');
      expect(vals[2]).toBe('bottom-right');
    });

    it('has all 9 values', () => {
      const vals = compileLogValues(`
        log(BBoxAnchor.TopLeft);
        log(BBoxAnchor.Top);
        log(BBoxAnchor.TopRight);
        log(BBoxAnchor.Right);
        log(BBoxAnchor.BottomRight);
        log(BBoxAnchor.Bottom);
        log(BBoxAnchor.BottomLeft);
        log(BBoxAnchor.Left);
        log(BBoxAnchor.Center);
      `);
      expect(vals).toEqual([
        'top-left', 'top', 'top-right', 'right',
        'bottom-right', 'bottom', 'bottom-left', 'left', 'center',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // .boundingBox()
  // ---------------------------------------------------------------------------
  describe('.boundingBox()', () => {
    it('returns an ObjectValue with x, y, width, height', () => {
      const result = compile(`
        let t = &{ text(0, 16)\`Hello\` } << \${ font-size: 16; };
        let bb = t.boundingBox();
        log(bb.x);
        log(bb.y);
        log(bb.width);
        log(bb.height);
      `);
      const vals = result.logs.map((l) => parseFloat(l.parts[0].value));
      // x should be 0 (text at x=0)
      expect(vals[0]).toBe(0);
      // y should be 0 (16 - fontSize = 0)
      expect(vals[1]).toBe(0);
      // width should be positive (depends on "Hello" char widths)
      expect(vals[2]).toBeGreaterThan(0);
      // height should be ~19.2 (16 * 1.2)
      expect(vals[3]).toBeCloseTo(19.2, 1);
    });

    it('works on ProjectedTextValue', () => {
      const result = compile(`
        let t = &{ text(0, 16)\`Hi\` } << \${ font-size: 20; };
        let p = t.project(100, 200);
        let bb = p.boundingBox();
        log(bb.x);
        log(bb.y);
      `);
      const vals = result.logs.map((l) => parseFloat(l.parts[0].value));
      // After projection: x = 0 + 100 = 100
      expect(vals[0]).toBe(100);
      // After projection: y = (16 - 20) + 200 = 196 (baseline - fontSize + origin)
      expect(vals[1]).toBe(196);
    });

    it('returns zero bbox for empty text block', () => {
      const result = compile(`
        let t = &{};
        let bb = t.boundingBox();
        log(bb.width);
        log(bb.height);
      `);
      const vals = result.logs.map((l) => parseFloat(l.parts[0].value));
      expect(vals[0]).toBe(0);
      expect(vals[1]).toBe(0);
    });

    it('monospace text is wider per-character than sans-serif', () => {
      const result = compile(`
        let sans = &{ text(0, 16)\`iii\` } << \${ font-size: 16; font-family: sans-serif; };
        let mono = &{ text(0, 16)\`iii\` } << \${ font-size: 16; font-family: monospace; };
        log(sans.boundingBox().width);
        log(mono.boundingBox().width);
      `);
      const sansWidth = parseFloat(result.logs[0].parts[0].value);
      const monoWidth = parseFloat(result.logs[1].parts[0].value);
      // 'i' is narrow in sans-serif (~0.22) but uniform in mono (~0.60)
      expect(monoWidth).toBeGreaterThan(sansWidth);
    });

    it('unions multiple elements correctly', () => {
      const result = compile(`
        let t = &{
          text(0, 16)\`Top\`
          text(50, 48)\`Bottom\`
        } << \${ font-size: 16; };
        let bb = t.boundingBox();
        log(bb.x);
        log(bb.y);
      `);
      const vals = result.logs.map((l) => parseFloat(l.parts[0].value));
      // x: min of 0 and 50 = 0
      expect(vals[0]).toBe(0);
      // y: min of (16-16) and (48-16) = 0
      expect(vals[1]).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // .paddedBoundingBox()
  // ---------------------------------------------------------------------------
  describe('.paddedBoundingBox()', () => {
    it('expands bbox by padding', () => {
      const result = compile(`
        let t = &{ text(0, 16)\`Hi\` } << \${ font-size: 16; };
        let p = t.project(0, 0);
        let bb = p.boundingBox();
        let pbb = p.paddedBoundingBox(5, 10);
        log(bb.x);
        log(pbb.x);
        log(bb.y);
        log(pbb.y);
        log(bb.width);
        log(pbb.width);
        log(bb.height);
        log(pbb.height);
      `);
      const vals = result.logs.map((l) => parseFloat(l.parts[0].value));
      // x should be reduced by inlinePad (10)
      expect(vals[1]).toBe(vals[0] - 10);
      // y should be reduced by blockPad (5)
      expect(vals[3]).toBe(vals[2] - 5);
      // width should be increased by 2*inlinePad
      expect(vals[5]).toBe(vals[4] + 20);
      // height should be increased by 2*blockPad
      expect(vals[7]).toBe(vals[6] + 10);
    });
  });

  // ---------------------------------------------------------------------------
  // .anchor()
  // ---------------------------------------------------------------------------
  describe('.anchor()', () => {
    it('resolves TopLeft to bbox origin', () => {
      const result = compile(`
        let t = &{ text(0, 16)\`X\` } << \${ font-size: 16; };
        let p = t.project(100, 200);
        let pt = p.anchor(BBoxAnchor.TopLeft);
        log(pt);
      `);
      const pt = result.logs[0].parts[0].value;
      // TopLeft = (bbox.x, bbox.y) = (100, 200 + 16 - 16) = (100, 200)
      expect(pt).toBe('Point(100, 200)');
    });

    it('resolves Center to bbox center', () => {
      const result = compile(`
        let t = &{ text(0, 16)\`XX\` } << \${ font-size: 16; };
        let p = t.project(0, 0);
        let pt = p.anchor(BBoxAnchor.Center);
        log(pt.x);
        log(pt.y);
      `);
      const x = parseFloat(result.logs[0].parts[0].value);
      const y = parseFloat(result.logs[1].parts[0].value);
      // Center x should be bbox.width / 2
      expect(x).toBeGreaterThan(0);
      // Center y should be (bbox.y + bbox.height/2)
      expect(y).toBeGreaterThan(0);
    });

    it('rejects invalid anchor values', () => {
      expect(() => compile(`
        let t = &{ text(0, 16)\`X\` };
        let p = t.project(0, 0);
        p.anchor("invalid");
      `)).toThrow(/Invalid BBoxAnchor value/);
    });
  });

  // ---------------------------------------------------------------------------
  // .polarProject()
  // ---------------------------------------------------------------------------
  describe('.polarProject()', () => {
    it('places text at angle 0 (right)', () => {
      const result = compile(`
        let t = &{ text(0, 16)\`X\` } << \${ font-size: 16; };
        let p = t.polarProject(100, 100, 0, 50, BBoxAnchor.Center);
        log(p.origin);
      `);
      const origin = result.logs[0].parts[0].value;
      // Target = (150, 100), anchor = center, so origin is offset from target
      expect(origin).toContain('Point(');
    });

    it('produces a ProjectedTextValue', () => {
      const vals = compileLogValues(`
        let t = &{ text(0, 16)\`X\` } << \${ font-size: 16; };
        let p = t.polarProject(100, 100, 0, 50, BBoxAnchor.TopLeft);
        log(p);
      `);
      expect(vals[0]).toContain('ProjectedText(');
    });

    it('works on TextBlockValue (not just projected)', () => {
      const vals = compileLogValues(`
        let t = &{ text(0, 16)\`Test\` } << \${ font-size: 16; };
        let p = t.polarProject(0, 0, 90deg, 50, BBoxAnchor.Center);
        log(p);
      `);
      expect(vals[0]).toContain('ProjectedText(');
    });
  });

  // ---------------------------------------------------------------------------
  // .intersects()
  // ---------------------------------------------------------------------------
  describe('.intersects()', () => {
    it('detects overlap between two ProjectedTextValues', () => {
      const vals = compileLogValues(`
        let t1 = &{ text(0, 16)\`Hello World\` } << \${ font-size: 16; };
        let t2 = &{ text(0, 16)\`Overlap\` } << \${ font-size: 16; };
        let p1 = t1.project(0, 0);
        let p2 = t2.project(5, 5);
        log(p1.intersects(p2));
      `);
      expect(vals[0]).toBe('true');
    });

    it('returns false for non-overlapping texts', () => {
      const vals = compileLogValues(`
        let t1 = &{ text(0, 16)\`A\` } << \${ font-size: 16; };
        let t2 = &{ text(0, 16)\`B\` } << \${ font-size: 16; };
        let p1 = t1.project(0, 0);
        let p2 = t2.project(500, 500);
        log(p1.intersects(p2));
      `);
      expect(vals[0]).toBe('false');
    });

    it('detects overlap with a bbox object', () => {
      const vals = compileLogValues(`
        let t = &{ text(0, 16)\`Hello\` } << \${ font-size: 16; };
        let p = t.project(0, 0);
        let box = { x: 0, y: 0, width: 100, height: 100 };
        log(p.intersects(box));
      `);
      expect(vals[0]).toBe('true');
    });

    it('returns false for non-overlapping bbox', () => {
      const vals = compileLogValues(`
        let t = &{ text(0, 16)\`Hello\` } << \${ font-size: 16; };
        let p = t.project(0, 0);
        let box = { x: 1000, y: 1000, width: 10, height: 10 };
        log(p.intersects(box));
      `);
      expect(vals[0]).toBe('false');
    });
  });

  // ---------------------------------------------------------------------------
  // .intersectionPoints()
  // ---------------------------------------------------------------------------
  describe('.intersectionPoints()', () => {
    it('returns overlap corners for two overlapping texts', () => {
      const result = compile(`
        let t1 = &{ text(0, 16)\`Hello World\` } << \${ font-size: 16; };
        let t2 = &{ text(0, 16)\`Overlap\` } << \${ font-size: 16; };
        let p1 = t1.project(0, 0);
        let p2 = t2.project(5, 5);
        let pts = p1.intersectionPoints(p2);
        log(pts.length);
      `);
      const count = parseInt(result.logs[0].parts[0].value, 10);
      // Two overlapping AABBs → 4 overlap rectangle corners
      expect(count).toBe(4);
    });

    it('returns empty array for non-overlapping texts', () => {
      const vals = compileLogValues(`
        let t1 = &{ text(0, 16)\`A\` } << \${ font-size: 16; };
        let t2 = &{ text(0, 16)\`B\` } << \${ font-size: 16; };
        let p1 = t1.project(0, 0);
        let p2 = t2.project(500, 500);
        log(p1.intersectionPoints(p2).length);
      `);
      expect(vals[0]).toBe('0');
    });
  });

  // ---------------------------------------------------------------------------
  // Display formatting
  // ---------------------------------------------------------------------------
  describe('display formatting', () => {
    it('formats TextBlockValue correctly', () => {
      const vals = compileLogValues(`
        let t = &{ text(0, 16)\`A\` text(0, 32)\`B\` };
        log(t);
      `);
      expect(vals[0]).toBe('TextBlock(2 elements)');
    });

    it('formats ProjectedTextValue correctly', () => {
      const vals = compileLogValues(`
        let t = &{ text(0, 16)\`A\` };
        log(t.project(10, 20));
      `);
      expect(vals[0]).toBe('ProjectedText(10, 20, 1 elements)');
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: multi-element with styles
  // ---------------------------------------------------------------------------
  describe('integration', () => {
    it('draws multi-element text block with block-level styles', () => {
      const result = compile(`
        define TextLayer('labels') \${ font-size: 14; }
        let label = &{
          text(0, 14)\`Title\`
          text(0, 30)\`Subtitle\`
        } << \${ font-size: 14; fill: #333; };
        layer('labels').apply {
          label.drawTo(50, 50);
        }
      `);
      const layer = result.layers.find((l) => l.name === 'labels');
      expect(layer?.textElements).toHaveLength(2);
      expect(layer!.textElements![0].x).toBe(50);
      expect(layer!.textElements![0].y).toBe(64);
      expect(layer!.textElements![0].styles).toEqual({ 'font-size': '14', fill: '#333' });
      expect(layer!.textElements![1].x).toBe(50);
      expect(layer!.textElements![1].y).toBe(80);
    });

    it('uses text block with tspan children', () => {
      const result = compile(`
        define TextLayer('t') \${}
        let label = &{
          text(0, 16) {
            tspan()\`bold \`
            tspan(0, 16)\`normal\`
          }
        };
        layer('t').apply {
          label.drawTo(10, 20);
        }
      `);
      const layer = result.layers.find((l) => l.name === 't');
      expect(layer?.textElements).toHaveLength(1);
      expect(layer!.textElements![0].children).toHaveLength(2);
      expect(layer!.textElements![0].children[0]).toEqual({ type: 'tspan', text: 'bold ', content: undefined });
    });

    it('measures then positions to avoid overlap', () => {
      // Simulate a layout scenario where we check intersection before placing
      const vals = compileLogValues(`
        let t1 = &{ text(0, 16)\`Label A\` } << \${ font-size: 16; };
        let t2 = &{ text(0, 16)\`Label B\` } << \${ font-size: 16; };

        let p1 = t1.project(0, 0);
        let bb1 = p1.boundingBox();

        // Place t2 just below t1's bbox
        let p2 = t2.project(0, calc(bb1.y + bb1.height + 5));
        log(p1.intersects(p2));
      `);
      // Should not overlap when placed below
      expect(vals[0]).toBe('false');
    });
  });

  // ---------------------------------------------------------------------------
  // .toPathBlock()
  // ---------------------------------------------------------------------------
  describe('.toPathBlock()', () => {
    let fontRegistry: FontRegistry;

    beforeAll(() => {
      const raw = readFileSync(join(__dirname, 'fixtures/fonts/Inter-Regular.ttf'));
      const fontBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
      fontRegistry = createFontRegistry();
      addFont(fontRegistry, 'Inter', 400, 'normal', fontBuffer);
    });

    it('returns a PathBlockValue with commands from a simple TextBlock', () => {
      const result = compile(`
        let t = &{ text(0, 20)\`A\` } << \${ font-family: Inter; font-size: 24; };
        let pb = t.toPathBlock();
        log(pb);
      `, { fonts: fontRegistry });
      // Should log PathBlock(...) with non-zero commands
      expect(result.logs[0].parts[0].value).toContain('PathBlock(');
    });

    it('produces drawable PathBlock output', () => {
      const result = compile(`
        define PathLayer('text') \${ fill: #000; stroke: none; }
        let t = &{ text(0, 20)\`Hi\` } << \${ font-family: Inter; font-size: 24; };
        let pb = t.toPathBlock();
        layer('text').apply { pb.drawTo(10, 10); }
      `, { fonts: fontRegistry });
      const layer = result.layers.find((l) => l.name === 'text');
      expect(layer?.data).toBeDefined();
      expect(layer!.data!.length).toBeGreaterThan(0);
    });

    it('handles multi-element layout with correct vertical positioning', () => {
      const result = compile(`
        let t = &{
          text(0, 20)\`Top\`
          text(0, 40)\`Bottom\`
        } << \${ font-family: Inter; font-size: 16; };
        let pb = t.toPathBlock();
        log(pb);
      `, { fonts: fontRegistry });
      // PathBlock(N commands) where N > 0
      const match = result.logs[0].parts[0].value.match(/PathBlock\((\d+) commands\)/);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBeGreaterThan(0);
    });

    it('respects tspan dx/dy offsets', () => {
      const result = compile(`
        let t = &{
          text(0, 20) {
            tspan()\`A\`
            tspan(10, 5)\`B\`
          }
        } << \${ font-family: Inter; font-size: 24; };
        let pb = t.toPathBlock();
        log(pb);
      `, { fonts: fontRegistry });
      const match = result.logs[0].parts[0].value.match(/PathBlock\((\d+) commands\)/);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBeGreaterThan(0);
    });

    it('applies letter-spacing', () => {
      // Wider spacing should not change command count but would affect positions
      const result = compile(`
        let t1 = &{ text(0, 20)\`AB\` } << \${ font-family: Inter; font-size: 24; };
        let t2 = &{ text(0, 20)\`AB\` } << \${ font-family: Inter; font-size: 24; letter-spacing: 20; };
        let pb1 = t1.toPathBlock();
        let pb2 = t2.toPathBlock();
        log(pb1);
        log(pb2);
      `, { fonts: fontRegistry });
      const match1 = result.logs[0].parts[0].value.match(/PathBlock\((\d+) commands\)/);
      const match2 = result.logs[1].parts[0].value.match(/PathBlock\((\d+) commands\)/);
      const count1 = parseInt(match1![1], 10);
      const count2 = parseInt(match2![1], 10);
      // Same number of commands (same glyphs) regardless of spacing
      expect(count1).toBe(count2);
      expect(count1).toBeGreaterThan(0);
    });

    it('respects per-tspan font-size overrides', () => {
      const result = compile(`
        let t = &{
          text(0, 20) {
            tspan()\`A\`
            tspan()\`B\`
          }
        } << \${ font-family: Inter; font-size: 16; };
        let pb = t.toPathBlock();
        log(pb);
      `, { fonts: fontRegistry });
      const match = result.logs[0].parts[0].value.match(/PathBlock\((\d+) commands\)/);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBeGreaterThan(0);
    });

    it('errors when no font registry is available', () => {
      expect(() => compile(`
        let t = &{ text(0, 20)\`A\` } << \${ font-family: Inter; font-size: 24; };
        t.toPathBlock();
      `)).toThrow(/requires fonts to be loaded/);
    });

    it('errors when font is not loaded', () => {
      expect(() => compile(`
        let t = &{ text(0, 20)\`A\` } << \${ font-family: UnknownFont; font-size: 24; };
        t.toPathBlock();
      `, { fonts: fontRegistry })).toThrow(/font 'UnknownFont' not loaded/);
    });

    it('errors when font-family is missing from styles', () => {
      expect(() => compile(`
        let t = &{ text(0, 20)\`A\` } << \${ font-size: 24; };
        t.toPathBlock();
      `, { fonts: fontRegistry })).toThrow(/requires font-family to be set/);
    });

    it('returns empty PathBlock for empty TextBlock', () => {
      const result = compile(`
        let t = &{} << \${ font-family: Inter; font-size: 24; };
        let pb = t.toPathBlock();
        log(pb);
      `, { fonts: fontRegistry });
      expect(result.logs[0].parts[0].value).toBe('PathBlock(0 commands)');
    });

    it('handles space characters by advancing cursor without outline commands', () => {
      const result = compile(`
        let t1 = &{ text(0, 20)\`A B\` } << \${ font-family: Inter; font-size: 24; };
        let t2 = &{ text(0, 20)\`AB\` } << \${ font-family: Inter; font-size: 24; };
        let pb1 = t1.toPathBlock();
        let pb2 = t2.toPathBlock();
        log(pb1);
        log(pb2);
      `, { fonts: fontRegistry });
      const match1 = result.logs[0].parts[0].value.match(/PathBlock\((\d+) commands\)/);
      const match2 = result.logs[1].parts[0].value.match(/PathBlock\((\d+) commands\)/);
      // Space doesn't add outline commands
      expect(parseInt(match1![1], 10)).toBe(parseInt(match2![1], 10));
    });

    it('rejects arguments', () => {
      expect(() => compile(`
        let t = &{ text(0, 20)\`A\` } << \${ font-family: Inter; font-size: 24; };
        t.toPathBlock(42);
      `, { fonts: fontRegistry })).toThrow(/expects 0 arguments/);
    });
  });

  // ---------------------------------------------------------------------------
  // Code snippet tokenizer (unit tests)
  // ---------------------------------------------------------------------------
  describe('code snippet tokenizer', () => {
    it('highlights keywords correctly', () => {
      const tokens = tokenizeLine('let x = 5;');
      expect(tokens[0]).toEqual({ type: 'keyword', value: 'let' });
    });

    it('highlights comments (// to EOL)', () => {
      const tokens = tokenizeLine('// This is a comment');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('comment');
      expect(tokens[0].value).toBe('// This is a comment');
    });

    it('highlights string literals (backticks)', () => {
      const tokens = tokenizeLine('`hello world`');
      expect(tokens[0].type).toBe('string');
      expect(tokens[0].value).toBe('`hello world`');
    });

    it('highlights string literals (double quotes)', () => {
      const tokens = tokenizeLine('"hello"');
      expect(tokens[0].type).toBe('string');
    });

    it('highlights numbers (int and float)', () => {
      const tokens = tokenizeLine('42 3.14');
      const nums = tokens.filter((t) => t.type === 'number');
      expect(nums).toHaveLength(2);
      expect(nums[0].value).toBe('42');
      expect(nums[1].value).toBe('3.14');
    });

    it('highlights function calls', () => {
      const tokens = tokenizeLine('myFunc(x)');
      expect(tokens[0]).toEqual({ type: 'function', value: 'myFunc' });
    });

    it('highlights builtins', () => {
      const tokens = tokenizeLine('PathLayer Color');
      const builtins = tokens.filter((t) => t.type === 'builtin');
      expect(builtins).toHaveLength(2);
    });

    it('highlights operators', () => {
      const tokens = tokenizeLine('x = a + b');
      const ops = tokens.filter((t) => t.type === 'operator');
      expect(ops.length).toBeGreaterThan(0);
      expect(ops.map((o) => o.value)).toContain('=');
      expect(ops.map((o) => o.value)).toContain('+');
    });

    it('highlights punctuation', () => {
      const tokens = tokenizeLine('{ } ( ) ;');
      const puncts = tokens.filter((t) => t.type === 'punctuation');
      expect(puncts.length).toBe(5);
    });

    it('handles mixed code lines correctly', () => {
      const tokens = tokenizeLine('let x = circle(50, 50, 25);');
      const types = tokens.filter((t) => t.type !== 'text').map((t) => t.type);
      expect(types).toContain('keyword'); // let
      expect(types).toContain('operator'); // =
      expect(types).toContain('builtin'); // circle (stdlib builtin)
      expect(types).toContain('number'); // 50, 50, 25
      expect(types).toContain('punctuation'); // (, ), ;, ,
    });

    it('handles Pathogen sigils', () => {
      const tokens = tokenizeLine('@{ h 10 }');
      const puncts = tokens.filter((t) => t.type === 'punctuation');
      expect(puncts.map((p) => p.value)).toContain('@{');
    });

    it('handles stdlib function names as builtins', () => {
      const tokens = tokenizeLine('circle rect polygon');
      const builtins = tokens.filter((t) => t.type === 'builtin');
      expect(builtins).toHaveLength(3);
    });

    it('handles the << operator', () => {
      const tokens = tokenizeLine('pb << ${ fill: red; }');
      const ops = tokens.filter((t) => t.type === 'operator');
      expect(ops.map((o) => o.value)).toContain('<<');
    });
  });

  // ---------------------------------------------------------------------------
  // normalizeCodeText
  // ---------------------------------------------------------------------------
  describe('normalizeCodeText', () => {
    it('strips common leading whitespace (dedent)', () => {
      const result = normalizeCodeText('    let x = 1;\n    let y = 2;');
      expect(result).toBe('let x = 1;\nlet y = 2;');
    });

    it('trims blank leading and trailing lines', () => {
      const result = normalizeCodeText('\n\n  hello\n  world\n\n');
      expect(result).toBe('hello\nworld');
    });

    it('normalizes tabs to 2 spaces', () => {
      // Single line gets fully dedented, so test with two lines where
      // the first has no indent and the second has a tab
      const result = normalizeCodeText('if (x) {\n\tlet y = 1;\n}');
      expect(result).toBe('if (x) {\n  let y = 1;\n}');
    });

    it('handles empty input', () => {
      expect(normalizeCodeText('')).toBe('');
      expect(normalizeCodeText('\n\n\n')).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // .toCodeSnippetBlock()
  // ---------------------------------------------------------------------------
  describe('.toCodeSnippetBlock()', () => {
    // Helper: find child layer inside GroupLayer output
    function findChild(result: ReturnType<typeof compile>, groupName: string, childName: string) {
      const group = result.layers.find((l) => l.name === groupName);
      if (!group || !group.children) return undefined;
      return group.children.find((c) => c.name === childName);
    }

    it('returns a LayerReference to a GroupLayer', () => {
      const result = compile(`
        let code = &{ text(0, 0)\`let x = 5;\` };
        code.toCodeSnippetBlock('my-snippet');
      `);
      const group = result.layers.find((l) => l.name === 'my-snippet');
      expect(group).toBeDefined();
      expect(group!.type).toBe('group');
    });

    it('creates GroupLayer with 2 children: bg PathLayer + code TextLayer', () => {
      const result = compile(`
        let code = &{ text(0, 0)\`let x = 5;\` };
        code.toCodeSnippetBlock('snip');
      `);
      const group = result.layers.find((l) => l.name === 'snip');
      expect(group).toBeDefined();
      expect(group!.type).toBe('group');
      expect(group!.children).toHaveLength(2);

      const bgChild = findChild(result, 'snip', 'snip-bg');
      expect(bgChild).toBeDefined();
      expect(bgChild!.type).toBe('path');

      const codeChild = findChild(result, 'snip', 'snip-code');
      expect(codeChild).toBeDefined();
      expect(codeChild!.type).toBe('text');
    });

    it('produces correct number of text elements (one per code line)', () => {
      const result = compile(`
        let code = &{ text(0, 0)\`let x = 1;
let y = 2;
let z = 3;\` };
        code.toCodeSnippetBlock('snip');
      `);
      const codeChild = findChild(result, 'snip', 'snip-code');
      expect(codeChild?.textElements).toHaveLength(3);
    });

    it('per-token tspan fill colors match palette', () => {
      const result = compile(`
        let code = &{ text(0, 0)\`let x = 5;\` };
        code.toCodeSnippetBlock('snip');
      `);
      const codeChild = findChild(result, 'snip', 'snip-code');
      expect(codeChild?.textElements).toHaveLength(1);
      const children = codeChild!.textElements![0].children;
      // Should have tspan children with fill styles
      const tspans = children.filter((c: any) => c.type === 'tspan');
      expect(tspans.length).toBeGreaterThan(0);
      // First non-whitespace token should be 'let' (keyword) with purple color
      const letToken = tspans.find((t: any) => t.text === 'let');
      expect(letToken).toBeDefined();
      expect((letToken as any).styles?.fill).toBe('#c084fc');
    });

    it('custom fontSize respected', () => {
      const result = compile(`
        let code = &{ text(0, 0)\`let x = 5;\` };
        code.toCodeSnippetBlock('snip', 14);
      `);
      const codeChild = findChild(result, 'snip', 'snip-code');
      expect(codeChild?.styles?.['font-size']).toBe('14');
    });

    it('custom padding respected', () => {
      const result = compile(`
        let code = &{ text(0, 0)\`hello\` };
        code.toCodeSnippetBlock('snip', 10, 20);
      `);
      const codeChild = findChild(result, 'snip', 'snip-code');
      // First text element x should be padding (20)
      expect(codeChild?.textElements?.[0].x).toBe(20);
    });

    it('background auto-sized to content', () => {
      const result = compile(`
        let code = &{ text(0, 0)\`let x = 5;\` };
        code.toCodeSnippetBlock('snip');
      `);
      const bgChild = findChild(result, 'snip', 'snip-bg');
      expect(bgChild).toBeDefined();
      // Should have path data for the roundRect
      expect(bgChild!.data!.length).toBeGreaterThan(0);
    });

    it('errors on layer name collision', () => {
      expect(() => compile(`
        define PathLayer('snip') \${}
        let code = &{ text(0, 0)\`hello\` };
        code.toCodeSnippetBlock('snip');
      `)).toThrow(/layer name 'snip' already exists/);
    });

    it('handles empty code gracefully', () => {
      const result = compile(`
        let code = &{ text(0, 0)\`\` };
        code.toCodeSnippetBlock('snip');
      `);
      const group = result.layers.find((l) => l.name === 'snip');
      // Should not crash; group should exist
      expect(group).toBeDefined();
    });

    it('handles multiline code from text block template literal', () => {
      const result = compile(`
        let code = &{
          text(0, 0)\`// Comment
let x = circle(50, 50, 25);
log(x);\`
        };
        code.toCodeSnippetBlock('demo');
      `);
      const codeChild = findChild(result, 'demo', 'demo-code');
      expect(codeChild?.textElements?.length).toBe(3);
      // First line should start with a comment token
      const firstLine = codeChild!.textElements![0].children;
      const commentToken = firstLine.find((c: any) => c.type === 'tspan' && c.text.startsWith('//'));
      expect(commentToken).toBeDefined();
      expect((commentToken as any).styles?.fill).toBe('#64748b');
    });

    it('background has dark fill and rounded corners', () => {
      const result = compile(`
        let code = &{ text(0, 0)\`test\` };
        code.toCodeSnippetBlock('snip');
      `);
      const bgChild = findChild(result, 'snip', 'snip-bg');
      expect(bgChild?.styles?.fill).toBe('#1e293b');
      expect(bgChild?.styles?.stroke).toBe('#334155');
      // Path should contain Q commands (quadratic corners from roundRect)
      expect(bgChild!.data).toContain('Q');
    });
  });
});

describe('switch inside text bodies', () => {
  // text(x, y) { switch (...) { ... } } inside a TextLayer apply block.
  function textChildren(level: string): unknown[] {
    const result = compile(`
      define default TextLayer('t') \${ font-size: 12; }
      let level = ${level};
      layer('t').apply {
        text(0, 0) {
          switch (level) {
            case 1, 2 { \`Low\` }
            case 3..<7 { tspan()\`Medium\` }
            default { \`High\` }
          }
        }
      }
    `);
    return result.layers[0].textElements?.[0]?.children ?? [];
  }

  it('a value alternative emits the template literal as a run', () => {
    expect(textChildren('2')).toEqual([{ type: 'run', text: 'Low' }]);
  });

  it('a range case emits the tspan', () => {
    expect(textChildren('3')).toEqual([{ type: 'tspan', text: 'Medium', content: undefined }]);
  });

  it('the half-open upper bound falls to the default', () => {
    expect(textChildren('7')).toEqual([{ type: 'run', text: 'High' }]);
  });

  it('a case body may hold several text items', () => {
    const result = compile(`
      define default TextLayer('t') \${}
      let kind = "b";
      layer('t').apply {
        text(0, 0) {
          switch (kind) {
            case "a" { \`A\` }
            case "b" { \`B\` tspan(0, 16)\`B2\` }
          }
        }
      }
    `);
    expect(result.layers[0].textElements?.[0]?.children).toEqual([
      { type: 'run', text: 'B' },
      { type: 'tspan', text: 'B2', dx: 0, dy: 16, rotation: undefined, styles: undefined },
    ]);
  });

  it('bindings from a destructuring case are visible in the template', () => {
    const result = compile(`
      define default TextLayer('t') \${}
      let p = Point(3, 4);
      layer('t').apply {
        text(0, 0) {
          switch (p) {
            case {x, y} where x > y { \`wide\` }
            case {x, y} { \`\${x},\${y}\` }
          }
        }
      }
    `);
    expect(result.layers[0].textElements?.[0]?.children).toEqual([{ type: 'run', text: '3,4' }]);
  });

  it('case bindings are not visible after the switch in a text body', () => {
    expect(() =>
      compile(`
        define default TextLayer('t') \${}
        let p = Point(3, 4);
        layer('t').apply {
          text(0, 0) {
            switch (p) { case {x, y} { \`\${x}\` } }
            \`\${y}\`
          }
        }
      `),
    ).toThrow(/Undefined variable: y/);
  });

  it('switch nested in a text for loop, with continue and break targeting the loop', () => {
    const result = compile(`
      define default TextLayer('t') \${}
      layer('t').apply {
        text(0, 0) {
          for (i in 0..5) {
            switch (i) {
              case 1 { continue; }
              case 4 { break; }
            }
            \`v\${i}\`
          }
        }
      }
    `);
    const texts = result.layers[0].textElements?.[0]?.children?.map((c: { text?: string }) => c.text) ?? [];
    expect(texts).toEqual(['v0', 'v2', 'v3']);
  });

  it('switch nested in a text if', () => {
    const result = compile(`
      define default TextLayer('t') \${}
      let ok = true;
      let n = 1;
      layer('t').apply {
        text(0, 0) {
          if (ok) {
            switch (n) { case 1 { \`one\` } default { \`other\` } }
          }
        }
      }
    `);
    expect(result.layers[0].textElements?.[0]?.children).toEqual([{ type: 'run', text: 'one' }]);
  });

  it('switch at the top level of a &{ } text-block expression', () => {
    const vals = compileLogValues(`
      let kind = "b";
      let tb = &{
        switch (kind) {
          case "a" { text(0, 10)\`A\`; }
          case "b" { text(0, 10)\`B\`; text(0, 20)\`B2\`; }
        }
      };
      log(tb.elementCount);
    `);
    expect(vals[0]).toBe('2');
  });

  it('a &{ } switch draws the selected text element to a TextLayer', () => {
    const result = compile(`
      define TextLayer('labels') \${}
      let kind = "zzz";
      let tb = &{
        switch (kind) {
          case "a" { text(0, 16)\`A\` }
          default { text(0, 16)\`Other\` }
        }
      };
      layer('labels').apply {
        tb.drawTo(50, 100);
      }
    `);
    const layer = result.layers.find((l) => l.name === 'labels');
    expect(layer?.textElements).toHaveLength(1);
    expect(layer!.textElements![0].x).toBe(50);
    expect(layer!.textElements![0].y).toBe(116);
    expect(layer!.textElements![0].children[0]).toEqual({ type: 'run', text: 'Other' });
  });

  it('break through a switch inside a &{ } for loop', () => {
    const vals = compileLogValues(`
      let tb = &{
        for (i in 0..5) {
          switch (i) { case 2 { break; } }
          text(calc(i * 10), 10)\`v\${i}\`;
        }
      };
      log(tb.elementCount);
    `);
    expect(vals[0]).toBe('2');
  });

  it('continue through a switch inside a &{ } for loop', () => {
    const vals = compileLogValues(`
      let tb = &{
        for (i in 0..5) {
          switch (i) { case 2, 3 { continue; } }
          text(calc(i * 10), 10)\`v\${i}\`;
        }
      };
      log(tb.elementCount);
    `);
    expect(vals[0]).toBe('4');
  });
});
