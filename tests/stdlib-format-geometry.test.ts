import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';

function logLines(src: string): string[] {
  const result = compile(src);
  return result.logs.map((l) => l.parts.map((p) => String(p.value)).join(' '));
}

describe('toFixed(value, digits)', () => {
  it('formats to exactly the digits asked for', () => {
    expect(logLines("log(toFixed(323.85, 2), toFixed(7, 1), toFixed(22.600000000000001, 1), toFixed(2.5, 0));")).toEqual([
      '323.85 7.0 22.6 3',
    ]);
  });

  it('keeps the sign on negatives', () => {
    expect(logLines('log(toFixed(-13.456, 2), toFixed(-0.04, 1));')).toEqual(['-13.46 -0.0']);
  });

  it('formats an angle only with an explicit unit', () => {
    expect(logLines("let a = 45deg;\nlog(toFixed(a, 1, 'deg'), toFixed(a, 3, 'rad'));")).toEqual(['45.0 0.785']);
    expect(() => compile('let a = 45deg;\nlog(toFixed(a, 1));')).toThrow(/needs a unit/);
  });

  it('rejects digits outside 0..20 and non-numbers', () => {
    expect(() => compile('log(toFixed(1, 21));')).toThrow(/digits/);
    expect(() => compile("log(toFixed('x', 1));")).toThrow(/number/);
  });

  it('returns a string, usable in a template', () => {
    const src = "let font = 'sans-serif';\nlet t = TextLayer('t') #{ font-family: font; };\nt.apply { text(0, 0)`${toFixed(1 / 3, 2)} mm`; }\nlog(`${toFixed(1 / 3, 2)} mm`);";
    expect(logLines(src)).toEqual(['0.33 mm']);
  });
});

describe('intersections', () => {
  it('circleCircle returns two points, left of c1→c2 first', () => {
    // Circles of radius 5 centred at (0,0) and (6,0) meet at (3, ±4); left of the eastward direction on the page is up (−y).
    expect(logLines('let hits = circleCircle(Point(0, 0), 5, Point(6, 0), 5);\nlog(hits.length, hits[0].x, hits[0].y, hits[1].x, hits[1].y);')).toEqual([
      '2 3 -4 3 4',
    ]);
  });

  it('circleCircle returns one point when tangent and none when apart or concentric', () => {
    expect(logLines('log(circleCircle(Point(0, 0), 2, Point(5, 0), 3).length, circleCircle(Point(0, 0), 1, Point(5, 0), 1).length, circleCircle(Point(0, 0), 1, Point(0, 0), 2).length);')).toEqual(['1 0 0']);
    expect(logLines('let t = circleCircle(Point(0, 0), 2, Point(5, 0), 3);\nlog(t[0].x, t[0].y);')).toEqual(['2 0']);
  });

  it('circleCircle solves the four-bar coupler pin', () => {
    // Crank pin at (17.5, -30.31), coupler 95, rocker ground at (120, 0), rocker 70: the open configuration (above the ground line) is the first point, the crossed one (below it) the second.
    const src = 'let hits = circleCircle(Point(17.5, -30.31), 95, Point(120, 0), 70);\nlog(hits.length, round(hits[0].x), round(hits[0].y), round(hits[1].x), round(hits[1].y));';
    expect(logLines(src)).toEqual(['2 105 -68 70 49']);
  });

  it('lineCircle returns points in order along p1→p2, and none when the line misses', () => {
    expect(logLines('let h = lineCircle(Point(-10, 0), Point(10, 0), Point(0, 0), 3);\nlog(h.length, h[0].x, h[1].x, lineCircle(Point(-10, 5), Point(10, 5), Point(0, 0), 3).length);')).toEqual([
      '2 -3 3 0',
    ]);
  });

  it('lineLine returns the crossing or nothing for parallel lines', () => {
    expect(logLines('let x = lineLine(Point(0, 0), Point(10, 10), Point(0, 10), Point(10, 0));\nlog(x.length, x[0].x, x[0].y, lineLine(Point(0, 0), Point(10, 0), Point(0, 5), Point(10, 5)).length);')).toEqual([
      '1 5 5 0',
    ]);
  });

  it('accepts any value with x and y, and rejects the rest', () => {
    expect(logLines('let c = polarPoint(0, 0);\nlog(circleCircle(c, 1, Point(1, 0), 1).length);')).toEqual(['2']);
    expect(() => compile('log(circleCircle(1, 1, Point(1, 0), 1).length);')).toThrow(/Point/);
  });
});
