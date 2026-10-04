import { describe, expect, it } from 'vitest';

import { compile } from '../src';

/**
 * boundingBox() / centerPoint() and moves that draw nothing — docs/path-blocks.md,
 * "What the box measures". The box follows the pen, not the ink: every command's start
 * and end point counts, a move's included.
 *
 * These tests pin the numbers the docs quote. They describe the behaviour as it is; a
 * deliberate change to it must change the docs section in the same commit.
 */

function logsOf(source: string): string[] {
  return compile(source).logs.map((entry) => entry.parts.map((p) => String(p.value)).join(''));
}

/** `x y width height | centerPoint` of the path bound to `r` by `setup`. */
function measure(setup: string): string {
  const logs = logsOf(`
    ${setup}
    let box = r.boundingBox();
    log(\`\${box.x} \${box.y} \${box.width} \${box.height} | \${r.centerPoint()}\`);
  `);
  return logs[0];
}

describe('boundingBox() / centerPoint() — the documented table, one move at a time', () => {
  it.each([
    ['no move', 'let r = @{ h 20 };', '0 0 20 0 | Point(10, 0)'],
    ['a move at the start adds the origin', 'let r = @{ m 10 10 h 20 };', '0 0 30 10 | Point(15, 5)'],
    ['a move at the end adds its landing point', 'let r = @{ h 20 m 30 30 };', '0 0 50 30 | Point(25, 15)'],
    ['a move between drawn runs adds nothing', 'let r = @{ h 20 m 0 40 h 20 };', '0 0 40 40 | Point(20, 20)'],
    ['a move-only block still has a box', 'let r = @{ m 10 10 };', '0 0 10 10 | Point(5, 5)'],
    ['a stdlib shape in a block', 'let r = @{ circle(50, 50, 20); };', '0 0 70 70 | Point(35, 35)'],
    [
      'a ProjectedPath counts the point it was projected to',
      'let r = @{ m 10 10 h 20 }.project(100, 100);',
      '100 100 30 10 | Point(115, 105)',
    ],
  ])('%s', (_name, setup, expected) => {
    expect(measure(setup)).toBe(expected);
  });

  it('a move-only block is not empty and has no length', () => {
    expect(logsOf('let r = @{ m 10 10 }; log(r.isEmpty); log(r.length);')).toEqual(['false', '0']);
  });
});

/**
 * Where the path came from decides whether pen travel is in the box. `LEAD` is a square
 * whose ink spans 10..30 on both axes; a box that starts at 0 counted the leading move.
 */
const LEAD = 'let lead = @{ m 10 10 h 20 v 20 h -20 z };';
const OTHER = 'let other = @{ m 20 20 h 20 v 20 h -20 z };';

describe('boundingBox() — which paths count pen travel', () => {
  it.each([
    ['the block as written', 'let r = lead;'],
    ['.contours', 'let r = lead.contours[0];'],
    ['union', 'let r = lead.union(other);'],
    ['difference', 'let r = lead.difference(other);'],
    ['intersection', 'let r = lead.intersection(other);'],
    ['xor', 'let r = lead.xor(other);'],
    ['scale', 'let r = lead.scale(2, 2);'],
    ['rotate', 'let r = lead.rotate(90deg);'],
    ['mirror', 'let r = lead.mirror(0deg);'],
    ['offset', 'let r = lead.offset(2);'],
  ])('%s keeps the origin in the box', (_name, derive) => {
    const logs = logsOf(`
      ${LEAD} ${OTHER} ${derive}
      let box = r.boundingBox();
      log(box.x <= 0 && calc(box.x + box.width) >= 0);
      log(box.y <= 0 && calc(box.y + box.height) >= 0);
    `);
    expect(logs).toEqual(['true', 'true']);
  });

  it.each([
    ['a cut piece', 'let r = @{ m 60 0 h 100 v 40 h -100 z }.cut(@{ m 110 -10 v 60 })[0];', '110 0 50 40'],
    ['a dash piece', 'let r = @{ h 100 }.dash(#{ stroke-dasharray: 20, 10; })[2].path;', '30 0 20 0'],
    ['an outline', 'let r = @{ m 20 20 h 60 }.outline(#{ stroke-width: 8; });', '20 16 60 8'],
    [
      'a query match on a layer',
      `let plate = PathLayer('plate') #{ stroke: black; };
       plate.apply { M 5 5; h 10; circle(50, 50, 20); }
       let r = plate.query('call(circle)').block;`,
      '30 30 40 40',
    ],
    [
      'a query match on a projection',
      `let r = @{ h 10; circle(50, 50, 20); }.project(0, 0).query('call(circle)').block;`,
      '30 30 40 40',
    ],
    ['translateStartPointTo', 'let r = @{ m 10 10 h 20 }.translateStartPointTo(40, 40);', '40 40 20 0'],
    ['translateCenterPointTo', 'let r = @{ m 10 10 h 20 }.translateCenterPointTo(40, 40);', '30 40 20 0'],
  ])('%s measures its ink only', (_name, setup, expected) => {
    expect(measure(setup).split(' | ')[0]).toBe(expected);
  });

  it('.d does not tell the two kinds apart', () => {
    const logs = logsOf(`
      let written = @{ m 30 0 l 20 0 };
      let piece = @{ h 100 }.dash(#{ stroke-dasharray: 20, 10; })[2].path;
      log(written.d);
      log(piece.d);
      log(written.boundingBox().x);
      log(piece.boundingBox().x);
    `);
    expect(logs).toEqual(['m 30 0 l 20 0', 'm 30 0 l 20 0', '0', '30']);
  });
});

describe('measuring the ink of a block that starts with a move', () => {
  it('translateStartPointTo(startPoint) drops the travel and leaves the shape in place', () => {
    const setup = `
      let hole = @{ circle(50, 50, 20); };
      let r = hole.translateStartPointTo(hole.startPoint.x, hole.startPoint.y);
    `;
    expect(measure(setup)).toBe('30 30 40 40 | Point(50, 50)');
    expect(logsOf(`${setup} log(r.d == hole.d);`)).toEqual(['true']);
  });

  it('a move at the end survives the translation and still counts', () => {
    expect(measure('let t = @{ h 20 m 30 30 }; let r = t.translateStartPointTo(t.startPoint.x, t.startPoint.y);')).toBe(
      '0 0 50 30 | Point(25, 15)',
    );
    // translateCenterPointTo centres the box that reaches the move's landing point.
    expect(measure('let r = @{ h 20 m 30 30 }.translateCenterPointTo(0, 0);')).toBe('-25 -15 50 30 | Point(0, 0)');
  });
});

describe('consumers of the same box', () => {
  it('intersects() overlaps at the origin when one block starts with a move', () => {
    // Squares, not lines: a zero-height box never overlaps anything.
    const logs = logsOf(`
      let near = @{ h 10 v 10 h -10 z };
      let far = @{ m 40 40 h 10 v 10 h -10 z };
      log(near.intersects(far));
      log(near.intersects(far.translateStartPointTo(far.startPoint.x, far.startPoint.y)));
    `);
    expect(logs).toEqual(['true', 'false']);
  });

  it('Marker.fromPathBlock() fits the viewBox to the box, travel included', () => {
    const logs = logsOf(`
      let shape = @{ m 10 10 h 20 };
      log(Marker.fromPathBlock('withTravel', shape).viewBox);
      log(Marker.fromPathBlock('inkOnly', shape.translateStartPointTo(shape.startPoint.x, shape.startPoint.y)).viewBox);
    `);
    expect(logs).toEqual(['0 0 30 10', '10 10 20 0']);
  });
});
