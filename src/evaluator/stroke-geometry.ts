import type { Point } from './context';
import type { PathCommandMeta } from './types';
import { calculateCommandLength } from './sampling';
import { pathUnion } from './boolean-ops';
import {
  offsetCommands,
  reverseCommands,
  splitCommandAtParametricT,
  subPathCommands,
} from './path-transforms';

/**
 * Stroke geometry: dash partitioning, stroke-to-outline conversion, and
 * start-point rotation. These turn stroke *styling* concepts (dasharray,
 * width, caps, joins) into real command-list geometry.
 *
 * All functions operate on structured command lists (structurally compatible
 * with PathBlockCommand) and preserve subject-local placement: results keep
 * their absolute position within the source's coordinate space, so callers
 * can apply the cut() origin-{0,0} convention and pieces reassemble when
 * drawn at one anchor.
 */

/** Minimal command interface — structurally compatible with PathBlockCommand. */
interface StrokeCmd {
  command: string;
  args: number[];
  start: Point;
  end: Point;
  meta?: PathCommandMeta;
}

const EPS = 1e-9;
/** Guard against dash patterns that explode into absurd piece counts. */
const MAX_DASH_PIECES = 20000;

const copyCmd = (c: StrokeCmd): StrokeCmd => ({
  command: c.command,
  args: [...c.args],
  start: { ...c.start },
  end: { ...c.end },
  ...(c.meta !== undefined ? { meta: c.meta } : {}),
});

/**
 * Group a command list into subpaths (runs of drawing commands). Move
 * commands are dropped — each subpath's placement lives in its commands'
 * start/end coordinates. A Z ends its subpath (per SVG, a command after Z
 * without an intervening move starts a new subpath).
 */
export function groupIntoSubpaths(commands: StrokeCmd[]): StrokeCmd[][] {
  const subs: StrokeCmd[][] = [];
  let current: StrokeCmd[] | null = null;
  for (const cmd of commands) {
    if (cmd.command.toUpperCase() === 'M') {
      current = null;
      continue;
    }
    if (!current) {
      current = [];
      subs.push(current);
    }
    current.push(cmd);
    if (cmd.command.toUpperCase() === 'Z') current = null;
  }
  return subs.filter((s) => s.some((c) => calculateCommandLength(c) > EPS));
}

function subpathLength(body: StrokeCmd[]): number {
  let total = 0;
  for (const cmd of body) total += calculateCommandLength(cmd);
  return total;
}

/** Total drawn arc length across every subpath. */
export function totalDrawnLength(commands: StrokeCmd[]): number {
  let total = 0;
  for (const body of groupIntoSubpaths(commands)) total += subpathLength(body);
  return total;
}

function isClosedSubpath(body: StrokeCmd[]): boolean {
  if (body.length === 0) return false;
  const last = body[body.length - 1];
  if (last.command.toUpperCase() === 'Z') return true;
  const first = body[0];
  return Math.abs(first.start.x - last.end.x) < 1e-6 && Math.abs(first.start.y - last.end.y) < 1e-6;
}

// ---------------------------------------------------------------------------
// Dash partitioning
// ---------------------------------------------------------------------------

export interface DashPiece {
  commands: StrokeCmd[];
  kind: 'dash' | 'gap';
  t0: number;
  t1: number;
}

/**
 * Partition a path into alternating dash/gap pieces.
 *
 * `dashes` are absolute arc lengths (already resolved from any percentage
 * entries) with the SVG odd-count doubling already applied; `dashOffset` is
 * an absolute arc length (may be negative — it wraps modulo the pattern).
 *
 * The pattern restarts at each subpath (SVG behavior). t0/t1 are fractions
 * of the total drawn length across all subpaths, so they are monotone over
 * the returned array.
 *
 * With `mergeSeam`, a closed subpath whose pattern ends mid-dash at the seam
 * gets its trailing and leading dash pieces joined into one seam-crossing
 * piece (placed at the end of that subpath's run; its t1 = t0 + length
 * fraction, exceeding the wrap point — the wrap signal).
 */
export function dashCommands(
  commands: StrokeCmd[],
  dashes: number[],
  dashOffset: number,
  mergeSeam = false,
): DashPiece[] {
  const subs = groupIntoSubpaths(commands);
  if (subs.length === 0) return [];

  const subLengths = subs.map(subpathLength);
  const totalLength = subLengths.reduce((a, b) => a + b, 0);
  if (totalLength <= EPS) return [];

  const patternLength = dashes.reduce((a, b) => a + b, 0);
  if (patternLength <= EPS) {
    // All-zero pattern: SVG renders as solid — one dash covering everything.
    return [{ commands: commands.map(copyCmd), kind: 'dash', t0: 0, t1: 1 }];
  }

  const pieces: DashPiece[] = [];
  let lengthBefore = 0; // drawn length of prior subpaths (for global t0/t1)

  for (let s = 0; s < subs.length; s++) {
    const body = subs[s];
    const bodyLength = subLengths[s];
    if (bodyLength <= EPS) continue;
    const subStartIndex = pieces.length;

    // Locate the pattern position at the subpath start: dashOffset units
    // into the cycle (wrapped).
    let into = ((dashOffset % patternLength) + patternLength) % patternLength;
    let entry = 0;
    // Walk to the pattern entry containing `into`; terminates because the
    // pattern sum is positive, so a non-exhausted entry always exists.
    while (into >= dashes[entry] - EPS) {
      into -= dashes[entry];
      entry = (entry + 1) % dashes.length;
    }

    let pos = 0;
    let guard = 0;
    while (pos < bodyLength - EPS) {
      if (++guard > MAX_DASH_PIECES * 2 || pieces.length > MAX_DASH_PIECES) {
        throw new Error(
          `dash() pattern produces more than ${MAX_DASH_PIECES} pieces — use larger stroke-dasharray entries`,
        );
      }
      const remainingEntry = dashes[entry] - into;
      into = 0;
      const end = Math.min(bodyLength, pos + remainingEntry);
      if (end > pos + EPS) {
        const slice = subPathCommands(body, pos / bodyLength, end / bodyLength);
        if (slice.length > 0) {
          pieces.push({
            commands: slice,
            kind: entry % 2 === 0 ? 'dash' : 'gap',
            t0: (lengthBefore + pos) / totalLength,
            t1: (lengthBefore + end) / totalLength,
          });
        }
        pos = end;
      }
      entry = (entry + 1) % dashes.length;
    }

    if (mergeSeam && isClosedSubpath(body)) {
      const first = pieces[subStartIndex];
      const last = pieces[pieces.length - 1];
      if (
        first !== undefined &&
        last !== undefined &&
        first !== last &&
        first.kind === 'dash' &&
        last.kind === 'dash'
      ) {
        // The last piece ends at the seam and the first begins there (both
        // by construction of the walk), so their command lists are already
        // geometrically contiguous across the seam.
        const merged: DashPiece = {
          commands: [...last.commands, ...first.commands],
          kind: 'dash',
          t0: last.t0,
          t1: last.t0 + (last.t1 - last.t0) + (first.t1 - first.t0),
        };
        pieces.splice(subStartIndex, 1);
        pieces[pieces.length - 1] = merged;
      }
    }

    lengthBefore += bodyLength;
  }

  return pieces;
}

// ---------------------------------------------------------------------------
// Stroke outline (stroke-to-path)
// ---------------------------------------------------------------------------

export type StrokeLinecap = 'butt' | 'round' | 'square';
export type StrokeLinejoin = 'miter' | 'round' | 'bevel';

export interface OutlineOptions {
  width: number;
  linecap: StrokeLinecap;
  linejoin: StrokeLinejoin;
  miterLimit: number;
  /** outline-overlap: 'union' self-unions the result to dissolve overlaps. */
  overlap?: 'raw' | 'union';
}

const vecLen = (v: Point): number => Math.sqrt(v.x * v.x + v.y * v.y);

function normalize(v: Point): Point {
  const l = vecLen(v);
  if (l < 1e-12) return { x: 1, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

/** Unit tangent at the start of a subpath (direction of first drawn motion). */
function subpathStartTangent(body: StrokeCmd[]): Point {
  for (const cmd of body) {
    if (calculateCommandLength(cmd) <= EPS) continue;
    const [head] = splitCommandAtParametricT(cmd, 0.02);
    const v = { x: head.end.x - head.start.x, y: head.end.y - head.start.y };
    if (vecLen(v) > 1e-12) return normalize(v);
  }
  return { x: 1, y: 0 };
}

/** Unit tangent at the end of a subpath (direction of last drawn motion). */
function subpathEndTangent(body: StrokeCmd[]): Point {
  for (let i = body.length - 1; i >= 0; i--) {
    const cmd = body[i];
    if (calculateCommandLength(cmd) <= EPS) continue;
    const [, tail] = splitCommandAtParametricT(cmd, 0.98);
    const v = { x: tail.end.x - tail.start.x, y: tail.end.y - tail.start.y };
    if (vecLen(v) > 1e-12) return normalize(v);
  }
  return { x: 1, y: 0 };
}

/**
 * Build the commands for one end cap from profile point A to profile point B,
 * bulging along the unit `outward` direction. Segments start at A and end at
 * B — no leading move. `halfWidth` is the cap's projection distance for
 * square caps (round caps derive their radius from the chord).
 */
function buildStrokeCap(cap: StrokeLinecap, A: Point, B: Point, outward: Point, halfWidth: number): StrokeCmd[] {
  const chord = { x: B.x - A.x, y: B.y - A.y };
  const chordLen = vecLen(chord);
  if (chordLen < EPS) return [];

  switch (cap) {
    case 'butt':
      return [{ command: 'l', args: [chord.x, chord.y], start: { ...A }, end: { ...B } }];

    case 'round': {
      const r = chordLen / 2;
      // Sweep so the arc bulges toward `outward`.
      const sweep = chord.x * outward.y - chord.y * outward.x < 0 ? 1 : 0;
      return [{ command: 'a', args: [r, r, 0, 0, sweep, chord.x, chord.y], start: { ...A }, end: { ...B } }];
    }

    case 'square': {
      const aOut = { x: A.x + outward.x * halfWidth, y: A.y + outward.y * halfWidth };
      const bOut = { x: B.x + outward.x * halfWidth, y: B.y + outward.y * halfWidth };
      return [
        { command: 'l', args: [aOut.x - A.x, aOut.y - A.y], start: { ...A }, end: aOut },
        { command: 'l', args: [bOut.x - aOut.x, bOut.y - aOut.y], start: { ...aOut }, end: bOut },
        { command: 'l', args: [B.x - bOut.x, B.y - bOut.y], start: { ...bOut }, end: { ...B } },
      ];
    }
  }
}

/** A dot: the outline of a (near-)zero-length spine at point P. */
function buildDot(P: Point, cap: StrokeLinecap, halfWidth: number): StrokeCmd[] {
  if (cap === 'round') {
    const west = { x: P.x - halfWidth, y: P.y };
    const east = { x: P.x + halfWidth, y: P.y };
    return [
      { command: 'a', args: [halfWidth, halfWidth, 0, 1, 1, 2 * halfWidth, 0], start: west, end: east },
      { command: 'a', args: [halfWidth, halfWidth, 0, 1, 1, -2 * halfWidth, 0], start: east, end: { ...west } },
      { command: 'z', args: [], start: { ...west }, end: { ...west } },
    ];
  }
  if (cap === 'square') {
    const nw = { x: P.x - halfWidth, y: P.y - halfWidth };
    const ne = { x: P.x + halfWidth, y: P.y - halfWidth };
    const se = { x: P.x + halfWidth, y: P.y + halfWidth };
    const sw = { x: P.x - halfWidth, y: P.y + halfWidth };
    return [
      { command: 'l', args: [2 * halfWidth, 0], start: nw, end: ne },
      { command: 'l', args: [0, 2 * halfWidth], start: { ...ne }, end: se },
      { command: 'l', args: [-2 * halfWidth, 0], start: { ...se }, end: sw },
      { command: 'z', args: [], start: { ...sw }, end: { ...nw } },
    ];
  }
  return []; // butt: no area, matching SVG
}

/** Relative move connecting the pen between contours. */
function moveBetween(from: Point, to: Point): StrokeCmd {
  // Lowercase relative `m` — an uppercase M would serialize as a literal
  // absolute move (see the boolean-ops "uppercase M" trap).
  return { command: 'm', args: [to.x - from.x, to.y - from.y], start: { ...from }, end: { ...to } };
}

/**
 * Convert a stroked path into the closed path outlining it (stroke-to-path).
 *
 * Open subpaths become one closed contour: left side forward, end cap,
 * right side back, start cap, close. Closed subpaths become two concentric
 * contours with opposite winding (the stroke's outer and inner edges), which
 * fill as a band under the nonzero fill rule.
 */
export function outlineCommands(commands: StrokeCmd[], options: OutlineOptions): StrokeCmd[] {
  const half = options.width / 2;
  const join = options.linejoin;
  const offsetOpts = { join, miterLimit: options.miterLimit };

  const result: StrokeCmd[] = [];
  const pushContour = (contour: StrokeCmd[]): void => {
    if (contour.length === 0) return;
    if (result.length > 0) {
      result.push(moveBetween(result[result.length - 1].end, contour[0].start));
    }
    result.push(...contour);
  };

  // groupIntoSubpaths drops zero-length subpaths, but a zero-length subpath
  // still has cap geometry (a dot) — walk the raw grouping for those.
  const rawSubs: StrokeCmd[][] = [];
  let current: StrokeCmd[] | null = null;
  for (const cmd of commands) {
    if (cmd.command.toUpperCase() === 'M') {
      current = null;
      continue;
    }
    if (!current) {
      current = [];
      rawSubs.push(current);
    }
    current.push(cmd);
    if (cmd.command.toUpperCase() === 'Z') current = null;
  }

  for (const body of rawSubs) {
    if (body.length === 0) continue;

    if (subpathLength(body) <= 1e-6) {
      pushContour(buildDot(body[0].start, options.linecap, half));
      continue;
    }

    if (isClosedSubpath(body)) {
      // Outer edge: offset of the forward spine. Inner edge: offset of the
      // reversed spine — same distance, opposite traversal, so the ring
      // comes back with opposite winding and correctly-mitred joins.
      const outer = offsetCommands(body, half, offsetOpts);
      const inner = offsetCommands(reverseCommands(body), half, offsetOpts);
      pushContour(outer);
      pushContour(inner);
      continue;
    }

    // Open spine: left side forward + end cap + right side back + start cap.
    // The right side is the offset of the REVERSED spine (offsetting always
    // to the traversal's left) so its joins are computed in its own
    // traversal direction.
    const left = offsetCommands(body, half, offsetOpts);
    const rightBack = offsetCommands(reverseCommands(body), half, offsetOpts);
    if (left.length === 0 || rightBack.length === 0) continue;

    const endOutward = subpathEndTangent(body);
    const startTangent = subpathStartTangent(body);
    const startOutward = { x: -startTangent.x, y: -startTangent.y };

    const contour: StrokeCmd[] = [...left];
    const leftEnd = contour[contour.length - 1].end;
    contour.push(...buildStrokeCap(options.linecap, leftEnd, rightBack[0].start, endOutward, half));
    contour.push(...rightBack);
    const rightEnd = contour[contour.length - 1].end;
    contour.push(...buildStrokeCap(options.linecap, rightEnd, left[0].start, startOutward, half));
    const ringStart = contour[0].start;
    contour.push({ command: 'z', args: [], start: { ...contour[contour.length - 1].end }, end: { ...ringStart } });
    pushContour(contour);
  }

  if (options.overlap === 'union' && result.length > 0) {
    // Self-union dissolves self-intersections within a contour and merges
    // overlapping contours (e.g. touching caps) into one clean boundary.
    return pathUnion(result, result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Start-point rotation
// ---------------------------------------------------------------------------

/** Replace any z with its explicit line equivalent (dropping zero-length closes). */
function explodeCloses(cmds: StrokeCmd[]): StrokeCmd[] {
  const out: StrokeCmd[] = [];
  for (const cmd of cmds) {
    if (cmd.command.toUpperCase() !== 'Z') {
      out.push(copyCmd(cmd));
      continue;
    }
    const dx = cmd.end.x - cmd.start.x;
    const dy = cmd.end.y - cmd.start.y;
    if (Math.abs(dx) > EPS || Math.abs(dy) > EPS) {
      out.push({ command: 'l', args: [dx, dy], start: { ...cmd.start }, end: { ...cmd.end } });
    }
  }
  return out;
}

/**
 * Re-anchor a single-subpath path to start at arc-length fraction `t`
 * (wrapped into [0, 1)). Closed paths rotate seamlessly (the old seam is
 * healed, a fresh close is appended at the new seam). Open paths come back
 * as two runs — t→end, then a move back to the original start for the
 * remainder — every fragment in its original placement.
 *
 * Throws for multi-subpath sources: rotation is only well-defined along one
 * continuous run.
 */
export function rotateStartCommands(commands: StrokeCmd[], t: number): StrokeCmd[] {
  const subs = groupIntoSubpaths(commands);
  if (subs.length > 1) {
    throw new Error('startAt() requires a single-subpath path — split multi-subpath sources first');
  }
  if (subs.length === 0) return commands.map(copyCmd);

  const body = subs[0];
  const wrapped = ((t % 1) + 1) % 1;
  if (wrapped < EPS) return body.map(copyCmd);

  const closed = isClosedSubpath(body);
  const tail = explodeCloses(subPathCommands(body, wrapped, 1));
  const head = explodeCloses(subPathCommands(body, 0, wrapped));

  if (closed) {
    const cmds = [...tail, ...head];
    if (cmds.length === 0) return body.map(copyCmd);
    const newStart = cmds[0].start;
    cmds.push({
      command: 'z',
      args: [],
      start: { ...cmds[cmds.length - 1].end },
      end: { ...newStart },
    });
    return cmds;
  }

  if (tail.length === 0) return body.map(copyCmd);
  if (head.length === 0) return tail;
  return [...tail, moveBetween(tail[tail.length - 1].end, head[0].start), ...head];
}

// ---------------------------------------------------------------------------
// Style-block parsing
// ---------------------------------------------------------------------------

/** Parse one dash-length token: a number or a percentage of `totalLength`. */
function parseLengthToken(token: string, totalLength: number, context: string): number {
  const isPercent = token.endsWith('%');
  const numeric = Number(isPercent ? token.slice(0, -1) : token);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${context} values must be numbers or percentages (got '${token}')`);
  }
  return isPercent ? (numeric / 100) * totalLength : numeric;
}

export interface ParsedDashStyles {
  dashes: number[]; // absolute lengths, odd-count doubling applied
  offset: number; // absolute length (may be negative)
  mergeSeam: boolean; // dash-seam: merge
}

const DASH_ONLY_PROPS = new Set(['stroke-dasharray', 'stroke-dashoffset', 'dash-seam']);
const OUTLINE_STROKE_PROPS = new Set([
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'outline-overlap',
]);

/**
 * Validate and resolve the style block for dash(). Percentages resolve
 * against `totalLength` (the path's total drawn length).
 */
export function parseDashStyles(properties: Record<string, string>, totalLength: number): ParsedDashStyles {
  for (const prop of Object.keys(properties)) {
    if (DASH_ONLY_PROPS.has(prop)) continue;
    if (OUTLINE_STROKE_PROPS.has(prop)) {
      throw new Error(
        `dash() does not accept '${prop}' — dash pieces are centerlines; pass ${prop} to outline() on each piece instead`,
      );
    }
    throw new Error(`dash() does not accept '${prop}' in its style block (only stroke-dasharray and stroke-dashoffset)`);
  }

  const dashArrayRaw = properties['stroke-dasharray'];
  if (dashArrayRaw === undefined) {
    throw new Error('dash() requires stroke-dasharray in its style block');
  }
  const tokens = dashArrayRaw.trim().split(/[\s,]+/).filter((tk) => tk.length > 0);
  if (tokens.length === 0) {
    throw new Error('dash() requires at least one stroke-dasharray value');
  }
  const dashes = tokens.map((tk) => parseLengthToken(tk, totalLength, 'stroke-dasharray'));
  for (const d of dashes) {
    if (d < 0) throw new Error('stroke-dasharray values must not be negative');
  }
  if (dashes.length % 2 === 1) dashes.push(...dashes); // SVG odd-count doubling

  let offset = 0;
  const offsetRaw = properties['stroke-dashoffset'];
  if (offsetRaw !== undefined) {
    offset = parseLengthToken(offsetRaw.trim(), totalLength, 'stroke-dashoffset');
  }

  const seamRaw = properties['dash-seam']?.trim() ?? 'split';
  if (seamRaw !== 'split' && seamRaw !== 'merge') {
    throw new Error(`dash-seam must be 'split' or 'merge' (got '${seamRaw}')`);
  }

  return { dashes, offset, mergeSeam: seamRaw === 'merge' };
}

/** SVG's default miter limit. */
const DEFAULT_MITER_LIMIT = 4;

/** Validate and resolve the style block for outline(). */
export function parseOutlineStyles(properties: Record<string, string>): OutlineOptions {
  for (const prop of Object.keys(properties)) {
    if (OUTLINE_STROKE_PROPS.has(prop)) continue;
    if (DASH_ONLY_PROPS.has(prop)) {
      throw new Error(`outline() does not accept '${prop}' — partition with dash() first, then outline each piece`);
    }
    throw new Error(
      `outline() does not accept '${prop}' in its style block (only stroke-width, stroke-linecap, stroke-linejoin, stroke-miterlimit)`,
    );
  }

  const widthRaw = properties['stroke-width'];
  if (widthRaw === undefined) {
    throw new Error('outline() requires stroke-width in its style block');
  }
  const width = Number(widthRaw.trim());
  if (!Number.isFinite(width)) {
    throw new Error(`stroke-width must be a number (got '${widthRaw.trim()}')`);
  }
  if (width <= 0) {
    throw new Error('stroke-width must be positive');
  }

  const linecapRaw = properties['stroke-linecap']?.trim() ?? 'butt';
  if (linecapRaw !== 'butt' && linecapRaw !== 'round' && linecapRaw !== 'square') {
    throw new Error(`stroke-linecap must be 'butt', 'round', or 'square' (got '${linecapRaw}')`);
  }

  const linejoinRaw = properties['stroke-linejoin']?.trim() ?? 'miter';
  if (linejoinRaw !== 'miter' && linejoinRaw !== 'round' && linejoinRaw !== 'bevel') {
    throw new Error(`stroke-linejoin must be 'miter', 'round', or 'bevel' (got '${linejoinRaw}')`);
  }

  let miterLimit = DEFAULT_MITER_LIMIT;
  const miterLimitRaw = properties['stroke-miterlimit'];
  if (miterLimitRaw !== undefined) {
    if (linejoinRaw !== 'miter') {
      throw new Error("stroke-miterlimit requires stroke-linejoin: miter (the default join)");
    }
    miterLimit = Number(miterLimitRaw.trim());
    if (!Number.isFinite(miterLimit) || miterLimit < 1) {
      throw new Error(`stroke-miterlimit must be a number >= 1 (got '${miterLimitRaw.trim()}')`);
    }
  }

  const overlapRaw = properties['outline-overlap']?.trim() ?? 'raw';
  if (overlapRaw !== 'raw' && overlapRaw !== 'union') {
    throw new Error(`outline-overlap must be 'raw' or 'union' (got '${overlapRaw}')`);
  }

  return { width, linecap: linecapRaw, linejoin: linejoinRaw, miterLimit, overlap: overlapRaw };
}
