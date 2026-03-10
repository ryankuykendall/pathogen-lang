// SVG path d-string parser — flattens to line segments for GPU shaders.
// Runs at render time in the GPU service, not at compile time.
// Returns a Float32Array of [x1, y1, x2, y2, ...] pairs.

/** A token is either a command letter (string) or a numeric parameter. */
type PathToken = string | number;

/**
 * Parse an SVG path d-string and flatten all commands into line segments.
 * Curves (C/S/Q/T) are subdivided via de Casteljau; arcs (A) are parametrically sampled.
 */
export function flattenToSegments(dString: string, precision: number = 8): Float32Array {
  const segments: number[] = [];
  const tokens = tokenize(dString);

  let cx = 0;
  let cy = 0; // current point
  let sx = 0;
  let sy = 0; // subpath start (for Z)
  let lastCmd = '';
  let lastCpX = 0;
  let lastCpY = 0; // last control point (for S/T smooth reflection)
  let i = 0;

  function next(): number {
    return tokens[i++] as number;
  }
  function peek(): PathToken {
    return tokens[i];
  }
  function hasNumbers(): boolean {
    return i < tokens.length && typeof tokens[i] === 'number';
  }

  while (i < tokens.length) {
    let cmd = peek();

    // If the token is a number, it's an implicit repeat of the last command.
    // After M, implicit repeats become L; after m, implicit repeats become l.
    if (typeof cmd === 'number') {
      if (lastCmd === 'M') {
        cmd = 'L';
      } else if (lastCmd === 'm') {
        cmd = 'l';
      } else {
        cmd = lastCmd;
      }
    } else {
      next(); // consume the command letter
    }

    switch (cmd) {
      case 'M': {
        cx = next();
        cy = next();
        sx = cx;
        sy = cy;
        lastCmd = 'M';
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case 'm': {
        cx += next();
        cy += next();
        sx = cx;
        sy = cy;
        lastCmd = 'm';
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case 'L': {
        const x = next();
        const y = next();
        segments.push(cx, cy, x, y);
        cx = x;
        cy = y;
        lastCmd = 'L';
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case 'l': {
        const x = cx + next();
        const y = cy + next();
        segments.push(cx, cy, x, y);
        cx = x;
        cy = y;
        lastCmd = 'l';
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case 'H': {
        const x = next();
        segments.push(cx, cy, x, cy);
        cx = x;
        lastCmd = 'H';
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case 'h': {
        const x = cx + next();
        segments.push(cx, cy, x, cy);
        cx = x;
        lastCmd = 'h';
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case 'V': {
        const y = next();
        segments.push(cx, cy, cx, y);
        cy = y;
        lastCmd = 'V';
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case 'v': {
        const y = cy + next();
        segments.push(cx, cy, cx, y);
        cy = y;
        lastCmd = 'v';
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case 'C': {
        const x1 = next();
        const y1 = next();
        const x2 = next();
        const y2 = next();
        const x = next();
        const y = next();
        subdivideCubic(segments, cx, cy, x1, y1, x2, y2, x, y, precision);
        lastCpX = x2;
        lastCpY = y2;
        cx = x;
        cy = y;
        lastCmd = 'C';
        break;
      }
      case 'c': {
        const x1 = cx + next();
        const y1 = cy + next();
        const x2 = cx + next();
        const y2 = cy + next();
        const x = cx + next();
        const y = cy + next();
        subdivideCubic(segments, cx, cy, x1, y1, x2, y2, x, y, precision);
        lastCpX = x2;
        lastCpY = y2;
        cx = x;
        cy = y;
        lastCmd = 'c';
        break;
      }
      case 'S': {
        // Smooth cubic: reflect last control point
        const rx = 2 * cx - lastCpX;
        const ry = 2 * cy - lastCpY;
        const x2 = next();
        const y2 = next();
        const x = next();
        const y = next();
        subdivideCubic(segments, cx, cy, rx, ry, x2, y2, x, y, precision);
        lastCpX = x2;
        lastCpY = y2;
        cx = x;
        cy = y;
        lastCmd = 'S';
        break;
      }
      case 's': {
        const rx = 2 * cx - lastCpX;
        const ry = 2 * cy - lastCpY;
        const x2 = cx + next();
        const y2 = cy + next();
        const x = cx + next();
        const y = cy + next();
        subdivideCubic(segments, cx, cy, rx, ry, x2, y2, x, y, precision);
        lastCpX = x2;
        lastCpY = y2;
        cx = x;
        cy = y;
        lastCmd = 's';
        break;
      }
      case 'Q': {
        const x1 = next();
        const y1 = next();
        const x = next();
        const y = next();
        subdivideQuadratic(segments, cx, cy, x1, y1, x, y, precision);
        lastCpX = x1;
        lastCpY = y1;
        cx = x;
        cy = y;
        lastCmd = 'Q';
        break;
      }
      case 'q': {
        const x1 = cx + next();
        const y1 = cy + next();
        const x = cx + next();
        const y = cy + next();
        subdivideQuadratic(segments, cx, cy, x1, y1, x, y, precision);
        lastCpX = x1;
        lastCpY = y1;
        cx = x;
        cy = y;
        lastCmd = 'q';
        break;
      }
      case 'T': {
        // Smooth quadratic: reflect last control point
        const rx = 2 * cx - lastCpX;
        const ry = 2 * cy - lastCpY;
        const x = next();
        const y = next();
        subdivideQuadratic(segments, cx, cy, rx, ry, x, y, precision);
        lastCpX = rx;
        lastCpY = ry;
        cx = x;
        cy = y;
        lastCmd = 'T';
        break;
      }
      case 't': {
        const rx = 2 * cx - lastCpX;
        const ry = 2 * cy - lastCpY;
        const x = cx + next();
        const y = cy + next();
        subdivideQuadratic(segments, cx, cy, rx, ry, x, y, precision);
        lastCpX = rx;
        lastCpY = ry;
        cx = x;
        cy = y;
        lastCmd = 't';
        break;
      }
      case 'A': {
        const rx = next();
        const ry = next();
        const xRot = next();
        const largeArc = next();
        const sweep = next();
        const x = next();
        const y = next();
        subdivideArc(segments, cx, cy, rx, ry, xRot, largeArc, sweep, x, y, precision);
        cx = x;
        cy = y;
        lastCmd = 'A';
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case 'a': {
        const rx = next();
        const ry = next();
        const xRot = next();
        const largeArc = next();
        const sweep = next();
        const x = cx + next();
        const y = cy + next();
        subdivideArc(segments, cx, cy, rx, ry, xRot, largeArc, sweep, x, y, precision);
        cx = x;
        cy = y;
        lastCmd = 'a';
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case 'Z':
      case 'z': {
        if (cx !== sx || cy !== sy) {
          segments.push(cx, cy, sx, sy);
        }
        cx = sx;
        cy = sy;
        lastCmd = cmd;
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      default:
        // Unknown command — skip
        break;
    }
  }

  return new Float32Array(segments);
}

// --- Tokenizer ---

/**
 * Tokenize an SVG path d-string into command letters and numbers.
 */
function tokenize(d: string): PathToken[] {
  const tokens: PathToken[] = [];
  // Match: command letters, or signed/unsigned numbers (int or float, with optional exponent)
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d)) !== null) {
    if (match[1]) {
      tokens.push(match[1]);
    } else {
      tokens.push(parseFloat(match[2]));
    }
  }
  return tokens;
}

// --- Curve subdivision (de Casteljau) ---

/**
 * Subdivide a cubic Bezier into line segments via de Casteljau.
 * Uses adaptive step count based on control polygon length.
 */
function subdivideCubic(
  out: number[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  steps: number,
): void {
  // Adaptive: estimate curve length from control polygon, max ~8px per segment
  const polyLen = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
  steps = Math.max(steps, Math.ceil(polyLen / 8));
  let px = x0;
  let py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const x = mt2 * mt * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t2 * t * x3;
    const y = mt2 * mt * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t2 * t * y3;
    out.push(px, py, x, y);
    px = x;
    py = y;
  }
}

/**
 * Subdivide a quadratic Bezier into line segments via de Casteljau.
 * Uses adaptive step count based on control polygon length.
 */
function subdivideQuadratic(
  out: number[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  steps: number,
): void {
  // Adaptive: estimate curve length from control polygon, max ~8px per segment
  const polyLen = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1);
  steps = Math.max(steps, Math.ceil(polyLen / 8));
  let px = x0;
  let py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
    const y = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
    out.push(px, py, x, y);
    px = x;
    py = y;
  }
}

// --- Arc subdivision ---

/**
 * Convert SVG arc parameters to center parameterization, then
 * sample the arc into line segments.
 */
function subdivideArc(
  out: number[],
  x0: number,
  y0: number,
  rxIn: number,
  ryIn: number,
  xRotDeg: number,
  largeArcFlag: number,
  sweepFlag: number,
  x: number,
  y: number,
  steps: number,
): void {
  // Degenerate: zero radii or same point — straight line
  if (rxIn === 0 || ryIn === 0 || (x0 === x && y0 === y)) {
    out.push(x0, y0, x, y);
    return;
  }

  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const phi = (xRotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: Transform to unit-circle space
  const dx2 = (x0 - x) / 2;
  const dy2 = (y0 - y) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Step 2: Correct out-of-range radii
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
  }

  // Step 3: Compute center in transformed space
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;

  let sq = (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2);
  if (sq < 0) sq = 0;
  let root = Math.sqrt(sq);
  if (largeArcFlag === sweepFlag) root = -root;

  const cxp = (root * (rx * y1p)) / ry;
  const cyp = (root * -(ry * x1p)) / rx;

  // Step 4: Transform center back
  const cxFinal = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2;
  const cyFinal = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;

  // Step 5: Compute angles
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  const theta1 = angleBetween(1, 0, ux, uy);
  let dTheta = angleBetween(ux, uy, vx, vy);

  if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;

  // Step 6: Sample the arc — adaptive step count based on arc length
  const arcLen = Math.max(rx, ry) * Math.abs(dTheta);
  steps = Math.max(steps, Math.ceil(arcLen / 8));
  let px = x0;
  let py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const angle = theta1 + dTheta * t;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const ex = cosPhi * rx * cosA - sinPhi * ry * sinA + cxFinal;
    const ey = sinPhi * rx * cosA + cosPhi * ry * sinA + cyFinal;
    out.push(px, py, ex, ey);
    px = ex;
    py = ey;
  }
}

/**
 * Angle between two 2D vectors (ux, uy) and (vx, vy), using atan2.
 */
function angleBetween(ux: number, uy: number, vx: number, vy: number): number {
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}
