import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { compilePath } from './helpers';

/**
 * translateStartPointTo(x, y) / translateCenterPointTo(x, y) — docs/path-blocks.md,
 * "Transforms". The same geometry, shifted so one named point of it sits at (x, y).
 *
 * Contracts under test:
 * - the named point (startPoint / centerPoint()) of the result is (x, y);
 * - nothing else changes: length, bounding-box size, subpaths, closure, labels;
 * - the receiver decides the type: PathBlock → PathBlock, ProjectedPath → ProjectedPath;
 * - `anchor` undoes it: result.drawTo(anchor) is the same ink as the receiver in place.
 */

function logsOf(source: string): string[] {
  return compile(source).logs.map((entry) => entry.parts.map((p) => String(p.value)).join(''));
}

const PLATE = `
  let plate = @{ h 100 v 40 h -100 z };
  let knife = @{ m 50 -10 v 60 };
  let piece = plate.cut(knife)[1];
`;

describe('translateStartPointTo / translateCenterPointTo — the documented examples', () => {
  it('a cut piece draws where it sat; translated, it starts at the pen', () => {
    // The piece starts at (50, 40) in the plate, so draw() from M 200 70 bridges that far.
    expect(compilePath(`${PLATE} M 200 70 piece.draw()`)).toBe('M 200 70 m 50 40 l -50 0 l 0 -40 l 50 0 l 0 40 z');
    expect(compilePath(`${PLATE} M 200 70 piece.translateStartPointTo(0, 0).draw()`)).toBe(
      'M 200 70 l -50 0 l 0 -40 l 50 0 l 0 40 z',
    );
  });

  it('translateCenterPointTo(0, 0) centres the piece on the pen', () => {
    // The piece is the plate's left half, 50 × 40, and its first point is its
    // bottom-right corner; centred on the origin that corner is at (25, 20).
    expect(compilePath(`${PLATE} M 200 70 piece.translateCenterPointTo(0, 0).draw()`)).toBe(
      'M 200 70 m 25 20 l -50 0 l 0 -40 l 50 0 l 0 40 z',
    );
  });

  it('the result reports the new point and carries anchor', () => {
    const logs = logsOf(`${PLATE}
      let loose = piece.translateStartPointTo(0, 0);
      log(loose.startPoint);
      log(loose.anchor);
      log(piece.startPoint);
      let centred = piece.translateCenterPointTo(0, 0);
      log(centred.centerPoint());
      log(centred.anchor);
      log(piece.centerPoint());
    `);
    expect(logs[0]).toBe('Point(0, 0)');
    expect(logs[1]).toBe('Point(50, 40)');
    expect(logs[1]).toBe(logs[2]);
    expect(logs[3]).toBe('Point(0, 0)');
    expect(logs[4]).toBe('Point(25, 20)');
    expect(logs[4]).toBe(logs[5]);
  });

  it('drawTo(anchor) is the same ink as the receiver drawn at the origin', () => {
    const inPlace = compilePath(`${PLATE} piece.drawTo(0, 0);`);
    const viaStart = compilePath(`${PLATE}
      let loose = piece.translateStartPointTo(0, 0);
      loose.drawTo(loose.anchor.x, loose.anchor.y);`);
    // Same absolute geometry, spelled without the bridge: M 50 40 instead of M 0 0 m 50 40.
    expect(inPlace).toBe('M 0 0 m 50 40 l -50 0 l 0 -40 l 50 0 l 0 40 z');
    expect(viaStart).toBe('M 50 40 l -50 0 l 0 -40 l 50 0 l 0 40 z');
  });

  it('a leading move is position, not shape', () => {
    const logs = logsOf(`
      let b = @{ m 10 10 h 20 };
      log(b.translateStartPointTo(0, 0).d);
      log(b.translateStartPointTo(0, 0).anchor);
      log(b.translateStartPointTo(3, 4).d);
    `);
    expect(logs[0]).toBe('h 20');
    expect(logs[1]).toBe('Point(10, 10)');
    expect(logs[2]).toBe('m 3 4 h 20');
  });

  it('is the one-call spelling of project(0, 0).toPathBlock()', () => {
    const logs = logsOf(`${PLATE}
      log(piece.translateStartPointTo(0, 0).d);
      log(piece.project(0, 0).toPathBlock().d);
    `);
    expect(logs[0]).toBe(logs[1]);
  });

  it('keeps the close that subPath(0, 1) drops', () => {
    const logs = logsOf(`${PLATE}
      log(piece.translateStartPointTo(0, 0).d);
      log(piece.subPath(0, 1).d);
    `);
    expect(logs[0]).toBe('l -50 0 l 0 -40 l 50 0 l 0 40 z');
    expect(logs[1]).toBe('l -50 0 l 0 -40 l 50 0 l 0 40');
  });
});

/**
 * Coverage matrix: every kind of receiver × both methods × two destinations. One row per
 * receiver; the invariants are computed from the receiver itself, not hardcoded.
 */
// `inked` names the same shape without its leading move, for the two receivers that
// have one: boundingBox() and centerPoint() count a leading move's origin, the
// translation drops the move, so size is compared against the ink alone.
const RECEIVERS: Array<{ name: string; setup: string; projected: boolean; inked?: string }> = [
  { name: 'block literal', setup: 'let r = @{ h 40 v 30 l -10 5 };', projected: false },
  {
    name: 'authored leading move',
    setup: 'let r = @{ m 12 -7 h 40 v 30 };',
    projected: false,
    inked: '@{ h 40 v 30 }',
  },
  {
    name: 'closed block',
    setup: 'let r = @{ m 5 5 h 40 v 30 h -40 z };',
    projected: false,
    inked: '@{ h 40 v 30 h -40 z }',
  },
  { name: 'multi-subpath', setup: 'let r = @{ h 30 m 10 10 q 10 -20 20 0 z };', projected: false },
  { name: 'curves', setup: 'let r = @{ c 10 0 20 10 30 10 s 20 10 30 10 a 10 10 0 0 1 20 0 };', projected: false },
  { name: 'cut piece', setup: 'let r = @{ h 100 v 40 h -100 z }.cut(@{ m 50 -10 v 60 })[1];', projected: false },
  { name: 'dash piece', setup: 'let r = @{ h 100 }.dash(#{ stroke-dasharray: 20, 10; })[2].path;', projected: false },
  { name: 'outline', setup: 'let r = @{ m 20 20 h 60 }.outline(#{ stroke-width: 8; });', projected: false },
  { name: 'ProjectedPath', setup: 'let r = @{ h 40 v 30 l -10 5 }.project(120, 80);', projected: true },
  {
    name: 'ProjectedPath with a leading move',
    setup: 'let r = @{ m 12 -7 h 40 v 30 }.project(120, 80);',
    projected: true,
    inked: '@{ h 40 v 30 }',
  },
  {
    name: 'multi-subpath ProjectedPath',
    setup: 'let r = @{ h 30 m 10 10 q 10 -20 20 0 z }.project(60, 90);',
    projected: true,
  },
  {
    name: 'cut piece of a ProjectedPath',
    setup: 'let r = @{ h 100 v 40 h -100 z }.project(30, 60).cut(@{ m 50 -10 v 60 }.project(30, 60))[1];',
    projected: true,
  },
];

const METHODS = [
  { method: 'translateStartPointTo', point: 'startPoint' },
  { method: 'translateCenterPointTo', point: 'centerPoint()' },
] as const;

const DESTINATIONS: Array<[number, number]> = [
  [0, 0],
  [17, -9],
];

function num(s: string): number {
  return Number(s);
}

describe('translateStartPointTo / translateCenterPointTo — every receiver', () => {
  for (const rx of RECEIVERS) {
    for (const { method, point } of METHODS) {
      for (const [x, y] of DESTINATIONS) {
        it(`${rx.name}: ${method}(${x}, ${y})`, () => {
          const result = compile(`${rx.setup}
            let ref = ${rx.inked ?? 'r'};
            let t = r.${method}(${x}, ${y});
            log(t.${point}.x); log(t.${point}.y);
            log(r.${point}.x); log(r.${point}.y);
            log(t.length); log(r.length);
            log(t.boundingBox().width); log(ref.boundingBox().width);
            log(t.boundingBox().height); log(ref.boundingBox().height);
            log(t.subPathCount); log(r.subPathCount);
            log(t.anchor.x); log(t.anchor.y);
            log(r.startPoint.x); log(r.startPoint.y);
            define PathLayer('inPlace') #{}
            define PathLayer('restored') #{}
            layer('inPlace').apply {
              let original = ${rx.projected ? 'r.draw()' : 'r.drawTo(0, 0)'};
              log(original.translateStartPointTo(0, 0).d);
              log(original.startPoint);
            }
            layer('restored').apply {
              let back = t.drawTo(t.anchor.x, t.anchor.y);
              log(back.translateStartPointTo(0, 0).d);
              log(back.startPoint);
            }
          `);
          const logs = result.logs.map((entry) => entry.parts.map((p) => String(p.value)).join(''));
          const v = logs.map(num);

          // The named point lands on the destination.
          expect(v[0]).toBeCloseTo(x, 9);
          expect(v[1]).toBeCloseTo(y, 9);
          // Nothing else changes.
          expect(v[4]).toBeCloseTo(v[5], 9);
          expect(v[6]).toBeCloseTo(v[7], 9);
          expect(v[8]).toBeCloseTo(v[9], 9);
          expect(v[10]).toBe(v[11]);

          // anchor: on a PathBlock, the shift removed (old point − destination); on a
          // ProjectedPath, the receiver's startPoint. Either way drawTo(anchor) restores.
          if (rx.projected) {
            expect(v[12]).toBeCloseTo(v[14], 9);
            expect(v[13]).toBeCloseTo(v[15], 9);
          } else if (rx.inked === undefined || point === 'startPoint') {
            expect(v[12]).toBeCloseTo(v[2] - x, 9);
            expect(v[13]).toBeCloseTo(v[3] - y, 9);
          }

          // drawTo(anchor) lands the result's first drawn point where the receiver's is.
          const layerD = (name: string): string => result.layers.find((l) => l.name === name)?.data ?? '';
          const restored = absoluteStart(layerD('restored'));
          const inPlace = absoluteStart(layerD('inPlace'));
          expect(restored[0]).toBeCloseTo(inPlace[0], 9);
          expect(restored[1]).toBeCloseTo(inPlace[1], 9);
          // …and the whole of it, not only the first point: both drawn results are
          // ProjectedPaths, so their page-coordinate path data must agree command
          // for command, as must where they start.
          expect(logs[18]).toBe(logs[16]);
          expect(logs[19]).toBe(logs[17]);
        });
      }
    }
  }

  it('the receiver decides the type', () => {
    const logs = logsOf(`
      let block = @{ m 5 5 h 40 v 30 };
      let projected = block.project(100, 100);
      log(block.translateStartPointTo(0, 0));
      log(block.translateCenterPointTo(0, 0));
      log(projected.translateStartPointTo(0, 0));
      log(projected.translateCenterPointTo(0, 0));
    `);
    expect(logs.map((l) => l.slice(0, l.indexOf('(')))).toEqual([
      'PathBlock',
      'PathBlock',
      'ProjectedPath',
      'ProjectedPath',
    ]);
  });

  it('a translated ProjectedPath draws at its new page position', () => {
    // project(100, 100) puts the ink at (105, 105); moved to (20, 30), draw() starts there.
    expect(
      compilePath(`let p = @{ m 5 5 h 40 v 30 }.project(100, 100).translateStartPointTo(20, 30); p.draw();`),
    ).toBe('M 20 30 h 40 v 30');
  });

  it('labels survive', () => {
    const logs = logsOf(`
      let b = @{ m 10 10 h 40 as segment('top') v 30 as segment('side') };
      let t = b.translateCenterPointTo(0, 0);
      log(t.segment('side').length);
      log(t.segment('top').length);
    `);
    expect(logs).toEqual(['30', '40']);
  });

  it('labels survive on a ProjectedPath', () => {
    const logs = logsOf(`
      let p = @{ m 10 10 h 40 as segment('top') v 30 as segment('side') }.project(200, 100);
      let t = p.translateStartPointTo(5, 5);
      log(t.segment('side').length);
      log(t.segment('top').startPoint);
    `);
    expect(logs).toEqual(['30', 'Point(5, 5)']);
  });

  it('a path with nothing drawn comes back empty on both receivers, with no anchor', () => {
    const logs = logsOf(`
      let onlyMoves = @{ m 5 5 };
      log(onlyMoves.translateStartPointTo(1, 1).isEmpty);
      let projected = onlyMoves.project(10, 10).translateStartPointTo(1, 1);
      log(projected.isEmpty);
      log(projected.startPoint);
    `);
    expect(logs).toEqual(['true', 'true', 'Point(1, 1)']);
    expect(() => compilePath(`let e = @{ m 5 5 }.translateStartPointTo(1, 1); log(e.anchor);`)).toThrow(
      "'anchor' is only available",
    );
    expect(() =>
      compilePath(`let e = @{ m 5 5 }.project(10, 10).translateStartPointTo(1, 1); log(e.anchor);`),
    ).toThrow("'anchor' is only available");
  });

  it('an empty block stays empty', () => {
    const logs = logsOf(`
      let e = @{ };
      log(e.translateStartPointTo(5, 5).isEmpty);
      log(e.translateCenterPointTo(5, 5).isEmpty);
    `);
    expect(logs).toEqual(['true', 'true']);
  });
});

/** The absolute point where a d-string's ink starts: its leading M plus any m run. */
function absoluteStart(d: string): [number, number] {
  const tokens = d.trim().split(/\s+/);
  let x = 0;
  let y = 0;
  let i = 0;
  while (i < tokens.length && (tokens[i] === 'M' || tokens[i] === 'm')) {
    const dx = Number(tokens[i + 1]);
    const dy = Number(tokens[i + 2]);
    if (tokens[i] === 'M') {
      x = dx;
      y = dy;
    } else {
      x += dx;
      y += dy;
    }
    i += 3;
  }
  return [x, y];
}

describe('translateStartPointTo / translateCenterPointTo — errors', () => {
  for (const { method } of METHODS) {
    it(`${method} wants exactly two numbers`, () => {
      expect(() => compilePath(`let b = @{ h 10 }; b.${method}(0);`)).toThrow(
        `${method}() expects 2 arguments (x, y)`,
      );
      expect(() => compilePath(`let b = @{ h 10 }; b.${method}(0, 0, 0);`)).toThrow(
        `${method}() expects 2 arguments (x, y)`,
      );
      expect(() => compilePath(`let b = @{ h 10 }; b.${method}('a', 0);`)).toThrow(`${method}() x must be a number`);
      expect(() => compilePath(`let b = @{ h 10 }; b.${method}(0, 90deg);`)).toThrow(`${method}() y must be a number`);
      expect(() => compilePath(`let p = @{ h 10 }.project(5, 5); p.${method}(0);`)).toThrow(
        `${method}() expects 2 arguments (x, y)`,
      );
    });
  }
});
