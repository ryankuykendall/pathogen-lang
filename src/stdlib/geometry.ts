// Intersections — where circles and lines meet. Results are arrays of
// Points, empty when there is no intersection, so the length is the test.

interface XY {
  x: number;
  y: number;
}

// Tolerances scale with the geometry: 1e-9 of the largest magnitude in play,
// never below 1e-9, so a drawing in tenths of a millimetre and one in
// thousands of units judge tangency and parallelism the same way.
function tolerance(...values: number[]): number {
  let largest = 1;
  for (const v of values) if (Math.abs(v) > largest) largest = Math.abs(v);
  return 1e-9 * largest;
}

/** Read a point from a Point value, a context object ({x, y} inside `value`), or a bare {x, y}. */
function asXY(v: unknown, fn: string): XY {
  if (typeof v === 'object' && v !== null) {
    const o = v as { type?: string; x?: unknown; y?: unknown; value?: { x?: unknown; y?: unknown } };
    const src = o.type === 'ContextObject' && o.value ? o.value : o;
    if (typeof src.x === 'number' && typeof src.y === 'number') return { x: src.x, y: src.y };
  }
  throw new Error(`${fn}() expects Point values for its points`);
}

function radius(v: unknown, fn: string): number {
  if (typeof v !== 'number' || !(v > 0)) throw new Error(`${fn}() expects a positive radius`);
  return v;
}

function points(list: XY[]): { type: 'ArrayValue'; elements: { type: 'PointValue'; x: number; y: number }[] } {
  return { type: 'ArrayValue', elements: list.map((p) => ({ type: 'PointValue', x: p.x, y: p.y })) };
}

/**
 * circleCircle(c1, r1, c2, r2) → the 0, 1 or 2 points where two circles meet.
 * With two, the first is on the left of the c1→c2 direction as the page
 * shows it (y down), the second on the right.
 */
function circleCircle(c1: unknown, r1: unknown, c2: unknown, r2: unknown) {
  const a = asXY(c1, 'circleCircle');
  const b = asXY(c2, 'circleCircle');
  const ra = radius(r1, 'circleCircle');
  const rb = radius(r2, 'circleCircle');
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const EPS = tolerance(a.x, a.y, b.x, b.y, ra, rb);
  if (d < EPS) return points([]); // concentric: none, or infinitely many
  if (d > ra + rb + EPS || d < Math.abs(ra - rb) - EPS) return points([]);
  // Distance from c1 to the chord's midpoint along c1→c2, then half the chord.
  const along = (ra * ra - rb * rb + d * d) / (2 * d);
  const h2 = ra * ra - along * along;
  const h = h2 > EPS ? Math.sqrt(h2) : 0;
  const ux = dx / d;
  const uy = dy / d;
  const mx = a.x + ux * along;
  const my = a.y + uy * along;
  if (h === 0) return points([{ x: mx, y: my }]);
  // Left of travel on a y-down page is the direction rotated a quarter turn counter-clockwise on screen: (uy, -ux).
  return points([
    { x: mx + uy * h, y: my - ux * h },
    { x: mx - uy * h, y: my + ux * h },
  ]);
}

/**
 * lineCircle(p1, p2, c, r) → the 0, 1 or 2 points where the infinite line
 * through p1 and p2 meets the circle, in order along p1→p2.
 */
function lineCircle(p1: unknown, p2: unknown, c: unknown, r: unknown) {
  const a = asXY(p1, 'lineCircle');
  const b = asXY(p2, 'lineCircle');
  const centre = asXY(c, 'lineCircle');
  const rr = radius(r, 'lineCircle');
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const EPS = tolerance(a.x, a.y, b.x, b.y, centre.x, centre.y, rr);
  if (len < EPS) throw new Error('lineCircle() needs two distinct points to define the line');
  const ux = dx / len;
  const uy = dy / len;
  // Project the centre onto the line; the foot is the chord's midpoint.
  const t = (centre.x - a.x) * ux + (centre.y - a.y) * uy;
  const fx = a.x + ux * t;
  const fy = a.y + uy * t;
  const gap2 = rr * rr - ((fx - centre.x) ** 2 + (fy - centre.y) ** 2);
  if (gap2 < -EPS) return points([]);
  const h = gap2 > EPS ? Math.sqrt(gap2) : 0;
  if (h === 0) return points([{ x: fx, y: fy }]);
  return points([
    { x: fx - ux * h, y: fy - uy * h },
    { x: fx + ux * h, y: fy + uy * h },
  ]);
}

/**
 * lineLine(p1, p2, p3, p4) → the point where the infinite lines through
 * p1,p2 and p3,p4 meet, as a one-element array; [] when parallel.
 */
function lineLine(p1: unknown, p2: unknown, p3: unknown, p4: unknown) {
  const a = asXY(p1, 'lineLine');
  const b = asXY(p2, 'lineLine');
  const c = asXY(p3, 'lineLine');
  const d = asXY(p4, 'lineLine');
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const cross = r.x * s.y - r.y * s.x;
  const EPS = tolerance(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
  if (Math.abs(cross * cross) < EPS * EPS || Math.abs(cross) < EPS * Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y)) return points([]);
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / cross;
  return points([{ x: a.x + r.x * t, y: a.y + r.y * t }]);
}

export const geometryFunctions = {
  circleCircle,
  lineCircle,
  lineLine,
};
