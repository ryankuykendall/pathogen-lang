// Grid generation functions that return PathSegment values

import { formatNum } from '../evaluator/format';

import type { PathSegment } from './path';

function segment(value: string): PathSegment {
  return { type: 'PathSegment', value };
}

// ---------------------------------------------------------------------------
// Valid pattern types
// ---------------------------------------------------------------------------

type GridType = 'shape' | 'dot' | 'intersection' | 'partial';
const VALID_TYPES = new Set<GridType>(['shape', 'dot', 'intersection', 'partial']);

type HexOrientation = 'edge' | 'vertex';
const VALID_ORIENTATIONS = new Set<HexOrientation>(['edge', 'vertex']);

// ---------------------------------------------------------------------------
// Pattern proportions
// ---------------------------------------------------------------------------

const DOT_RADIUS_FACTOR = 0.025;
const CROSS_ARM_FACTOR = 0.075;
const PARTIAL_FRACTION = 0.4;

// ---------------------------------------------------------------------------
// Shared geometry helpers
// ---------------------------------------------------------------------------

function emitDot(parts: string[], cx: number, cy: number, r: number): void {
  parts.push(
    `M ${formatNum(cx - r)} ${formatNum(cy)} ` +
      `A ${formatNum(r)} ${formatNum(r)} 0 1 1 ${formatNum(cx + r)} ${formatNum(cy)} ` +
      `A ${formatNum(r)} ${formatNum(r)} 0 1 1 ${formatNum(cx - r)} ${formatNum(cy)}`,
  );
}

function emitCross(parts: string[], cx: number, cy: number, arm: number): void {
  parts.push(`M ${formatNum(cx - arm)} ${formatNum(cy)} L ${formatNum(cx + arm)} ${formatNum(cy)}`);
  parts.push(`M ${formatNum(cx)} ${formatNum(cy - arm)} L ${formatNum(cx)} ${formatNum(cy + arm)}`);
}

function emitEdgeCross(parts: string[], cx: number, cy: number, arm: number, angles: number[]): void {
  for (const angle of angles) {
    const dx = arm * Math.cos(angle);
    const dy = arm * Math.sin(angle);
    parts.push(
      `M ${formatNum(cx - dx)} ${formatNum(cy - dy)} L ${formatNum(cx + dx)} ${formatNum(cy + dy)}`,
    );
  }
}

function emitRadialArms(parts: string[], cx: number, cy: number, arm: number, angles: number[]): void {
  for (const angle of angles) {
    const dx = arm * Math.cos(angle);
    const dy = arm * Math.sin(angle);
    parts.push(
      `M ${formatNum(cx)} ${formatNum(cy)} L ${formatNum(cx + dx)} ${formatNum(cy + dy)}`,
    );
  }
}

function emitPartial(parts: string[], x1: number, y1: number, x2: number, y2: number, fraction: number): void {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = ((x2 - x1) * fraction) / 2;
  const dy = ((y2 - y1) * fraction) / 2;
  parts.push(`M ${formatNum(mx - dx)} ${formatNum(my - dy)} L ${formatNum(mx + dx)} ${formatNum(my + dy)}`);
}

// Dedup keys rounded to 6 decimal places for floating-point safety
function coordKey(n: number): string {
  return n.toFixed(6);
}

function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  const k1 = `${coordKey(x1)},${coordKey(y1)}`;
  const k2 = `${coordKey(x2)},${coordKey(y2)}`;
  return k1 < k2 ? `${k1}-${k2}` : `${k2}-${k1}`;
}

function vertexKey(x: number, y: number): string {
  return `${coordKey(x)},${coordKey(y)}`;
}

// ---------------------------------------------------------------------------
// Argument validation
// ---------------------------------------------------------------------------

interface GridArgs {
  type: GridType;
  x: number;
  y: number;
  width: number;
  height: number;
  cellSize: number;
}

function validateGridArgs(fnName: string, args: unknown[], minArgs = 6, maxArgs = 6): GridArgs {
  if (args.length < minArgs || args.length > maxArgs) {
    throw new Error(
      `${fnName}() expects ${minArgs === maxArgs ? minArgs : `${minArgs}-${maxArgs}`} arguments (type, x, y, width, height, cellSize${maxArgs > 6 ? ', orientation?' : ''}), got ${args.length}`,
    );
  }
  const [typeArg, xArg, yArg, wArg, hArg, csArg] = args;
  if (typeof typeArg !== 'string' || !VALID_TYPES.has(typeArg as GridType)) {
    throw new Error(
      `${fnName}() type must be 'shape', 'dot', 'intersection', or 'partial', got '${typeArg}'`,
    );
  }
  const numArgs = [xArg, yArg, wArg, hArg, csArg];
  for (let i = 0; i < numArgs.length; i++) {
    if (typeof numArgs[i] !== 'number') {
      throw new Error(`${fnName}() argument ${i + 2} must be a number`);
    }
  }
  const cellSize = csArg as number;
  if (cellSize <= 0) {
    throw new Error(`${fnName}() cellSize must be positive, got ${cellSize}`);
  }
  return {
    type: typeArg as GridType,
    x: xArg as number,
    y: yArg as number,
    width: wArg as number,
    height: hArg as number,
    cellSize,
  };
}

// ===========================================================================
// squareGrid
// ===========================================================================

function squareGridImpl({ type, x, y, width, height, cellSize }: GridArgs): string {
  const cols = Math.floor(width / cellSize);
  const rows = Math.floor(height / cellSize);
  if (cols === 0 || rows === 0) return '';

  const parts: string[] = [];
  const s = cellSize;

  switch (type) {
    case 'shape': {
      // Horizontal lines
      for (let i = 0; i <= rows; i++) {
        const py = y + i * s;
        parts.push(`M ${formatNum(x)} ${formatNum(py)} L ${formatNum(x + cols * s)} ${formatNum(py)}`);
      }
      // Vertical lines
      for (let j = 0; j <= cols; j++) {
        const px = x + j * s;
        parts.push(`M ${formatNum(px)} ${formatNum(y)} L ${formatNum(px)} ${formatNum(y + rows * s)}`);
      }
      break;
    }
    case 'dot': {
      const r = DOT_RADIUS_FACTOR * s;
      for (let i = 0; i <= rows; i++) {
        for (let j = 0; j <= cols; j++) {
          emitDot(parts, x + j * s, y + i * s, r);
        }
      }
      break;
    }
    case 'intersection': {
      const arm = CROSS_ARM_FACTOR * s;
      for (let i = 0; i <= rows; i++) {
        for (let j = 0; j <= cols; j++) {
          emitCross(parts, x + j * s, y + i * s, arm);
        }
      }
      break;
    }
    case 'partial': {
      // Horizontal edges
      for (let i = 0; i <= rows; i++) {
        for (let j = 0; j < cols; j++) {
          emitPartial(parts, x + j * s, y + i * s, x + (j + 1) * s, y + i * s, PARTIAL_FRACTION);
        }
      }
      // Vertical edges
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j <= cols; j++) {
          emitPartial(parts, x + j * s, y + i * s, x + j * s, y + (i + 1) * s, PARTIAL_FRACTION);
        }
      }
      break;
    }
  }

  return parts.join(' ');
}

// ===========================================================================
// triangleGrid
// ===========================================================================

interface Vertex {
  x: number;
  y: number;
}

interface Edge {
  v1: Vertex;
  v2: Vertex;
}

function buildTriangleLattice(x: number, y: number, width: number, height: number, cellSize: number): { vertices: Vertex[][]; edges: Edge[] } {
  const side = (2 * cellSize) / Math.sqrt(3);
  const numRows = Math.floor(height / cellSize);
  if (numRows === 0) return { vertices: [], edges: [] };

  // Build vertex rows
  const vertexRows: Vertex[][] = [];
  for (let r = 0; r <= numRows; r++) {
    const offset = r % 2 === 1 ? side / 2 : 0;
    const maxX = width + x;
    const row: Vertex[] = [];
    let vx = x + offset;
    while (vx <= maxX + 0.0001) {
      row.push({ x: vx, y: y + r * cellSize });
      vx += side;
    }
    vertexRows.push(row);
  }

  // Build edges
  const edges: Edge[] = [];

  // Horizontal edges within each row
  for (let r = 0; r <= numRows; r++) {
    const row = vertexRows[r];
    for (let j = 0; j < row.length - 1; j++) {
      edges.push({ v1: row[j], v2: row[j + 1] });
    }
  }

  // Diagonal edges between adjacent rows
  for (let r = 0; r < numRows; r++) {
    const topRow = vertexRows[r];
    const botRow = vertexRows[r + 1];
    const topIsEven = r % 2 === 0;

    if (topIsEven) {
      // Even row (no offset) → odd row (offset by side/2)
      // Each top vertex j connects to bot vertex j (down-right) and bot vertex j-1 (down-left)
      for (let j = 0; j < topRow.length; j++) {
        // Down-right: top[j] → bot[j] (bot is shifted right, so bot[j].x = top[j].x + side/2)
        if (j < botRow.length) {
          edges.push({ v1: topRow[j], v2: botRow[j] });
        }
        // Down-left: top[j] → bot[j-1] (bot[j-1].x = top[j].x - side/2)
        if (j > 0 && j - 1 < botRow.length) {
          edges.push({ v1: topRow[j], v2: botRow[j - 1] });
        }
      }
    } else {
      // Odd row (offset) → even row (no offset)
      // Each top vertex j connects to bot vertex j (down-left) and bot vertex j+1 (down-right)
      for (let j = 0; j < topRow.length; j++) {
        if (j < botRow.length) {
          edges.push({ v1: topRow[j], v2: botRow[j] });
        }
        if (j + 1 < botRow.length) {
          edges.push({ v1: topRow[j], v2: botRow[j + 1] });
        }
      }
    }
  }

  return { vertices: vertexRows, edges };
}

function triangleGridImpl({ type, x, y, width, height, cellSize }: GridArgs): string {
  const { vertices: vertexRows, edges } = buildTriangleLattice(x, y, width, height, cellSize);
  if (vertexRows.length === 0) return '';

  const parts: string[] = [];

  switch (type) {
    case 'shape': {
      for (const edge of edges) {
        parts.push(
          `M ${formatNum(edge.v1.x)} ${formatNum(edge.v1.y)} L ${formatNum(edge.v2.x)} ${formatNum(edge.v2.y)}`,
        );
      }
      break;
    }
    case 'dot': {
      const r = DOT_RADIUS_FACTOR * cellSize;
      const seen = new Set<string>();
      for (const row of vertexRows) {
        for (const v of row) {
          const key = vertexKey(v.x, v.y);
          if (!seen.has(key)) {
            seen.add(key);
            emitDot(parts, v.x, v.y, r);
          }
        }
      }
      break;
    }
    case 'intersection': {
      const arm = CROSS_ARM_FACTOR * cellSize;
      // Triangle grid: 3 bidirectional arms at 0, 60, 120 degrees
      const angles = [0, Math.PI / 3, (2 * Math.PI) / 3];
      const seen = new Set<string>();
      for (const row of vertexRows) {
        for (const v of row) {
          const key = vertexKey(v.x, v.y);
          if (!seen.has(key)) {
            seen.add(key);
            emitEdgeCross(parts, v.x, v.y, arm, angles);
          }
        }
      }
      break;
    }
    case 'partial': {
      for (const edge of edges) {
        emitPartial(parts, edge.v1.x, edge.v1.y, edge.v2.x, edge.v2.y, PARTIAL_FRACTION);
      }
      break;
    }
  }

  return parts.join(' ');
}

// ===========================================================================
// hexagonGrid
// ===========================================================================

function hexVertices(cx: number, cy: number, side: number, orientation: HexOrientation): Vertex[] {
  if (orientation === 'edge') {
    // Flat-top: first vertex at 0 degrees (right), going counter-clockwise
    const w = (Math.sqrt(3) * side) / 2;
    return [
      { x: cx + side, y: cy },           // right
      { x: cx + side / 2, y: cy - w },   // upper-right
      { x: cx - side / 2, y: cy - w },   // upper-left
      { x: cx - side, y: cy },           // left
      { x: cx - side / 2, y: cy + w },   // lower-left
      { x: cx + side / 2, y: cy + w },   // lower-right
    ];
  } else {
    // Pointy-top: first vertex at top
    const w = (Math.sqrt(3) * side) / 2;
    return [
      { x: cx, y: cy - side },           // top
      { x: cx + w, y: cy - side / 2 },   // upper-right
      { x: cx + w, y: cy + side / 2 },   // lower-right
      { x: cx, y: cy + side },           // bottom
      { x: cx - w, y: cy + side / 2 },   // lower-left
      { x: cx - w, y: cy - side / 2 },   // upper-left
    ];
  }
}

interface HexGridData {
  edges: Edge[];
  vertexAngles: Map<string, { v: Vertex; angles: number[] }>;
}

function buildHexGrid(x: number, y: number, width: number, height: number, cellSize: number, orientation: HexOrientation): HexGridData {
  let side: number, colSpacing: number, rowSpacing: number;

  if (orientation === 'edge') {
    // Flat-top: cellSize = flat-to-flat height = sqrt(3) * side
    side = cellSize / Math.sqrt(3);
    colSpacing = 1.5 * side;
    rowSpacing = cellSize;
  } else {
    // Pointy-top: cellSize = point-to-point height = 2 * side
    side = cellSize / 2;
    colSpacing = Math.sqrt(3) * side;
    rowSpacing = 1.5 * side;
  }

  const numCols = Math.floor(width / colSpacing);
  const numRows = Math.floor(height / rowSpacing);
  if (numCols === 0 || numRows === 0) return { edges: [], vertexAngles: new Map() };

  const edgeSet = new Set<string>();
  const edges: Edge[] = [];
  const vertexAngles = new Map<string, { v: Vertex; angles: number[] }>();

  for (let r = 0; r <= numRows; r++) {
    for (let c = 0; c <= numCols; c++) {
      let cx: number, cy: number;
      if (orientation === 'edge') {
        // Flat-top: odd columns offset by half row spacing
        cx = x + colSpacing / 2 + c * colSpacing;
        cy = y + cellSize / 2 + r * rowSpacing + (c % 2 === 1 ? rowSpacing / 2 : 0);
      } else {
        // Pointy-top: odd rows offset by half column spacing
        cx = x + colSpacing / 2 + c * colSpacing + (r % 2 === 1 ? colSpacing / 2 : 0);
        cy = y + side + r * rowSpacing;
      }

      // Skip hexes whose center is well outside the bounding box
      if (cx - side > x + width + 0.001 || cy - side > y + height + 0.001) continue;
      if (cx + side < x - 0.001 || cy + side < y - 0.001) continue;

      const verts = hexVertices(cx, cy, side, orientation);

      for (let i = 0; i < 6; i++) {
        const v1 = verts[i];
        const v2 = verts[(i + 1) % 6];
        const ek = edgeKey(v1.x, v1.y, v2.x, v2.y);

        if (!edgeSet.has(ek)) {
          edgeSet.add(ek);
          edges.push({ v1, v2 });
        }

        // Track angles for intersection pattern
        const angle = Math.atan2(v2.y - v1.y, v2.x - v1.x);
        const reverseAngle = Math.atan2(v1.y - v2.y, v1.x - v2.x);

        const vk1 = vertexKey(v1.x, v1.y);
        if (!vertexAngles.has(vk1)) {
          vertexAngles.set(vk1, { v: v1, angles: [] });
        }
        const entry1 = vertexAngles.get(vk1)!;
        entry1.angles.push(angle);

        const vk2 = vertexKey(v2.x, v2.y);
        if (!vertexAngles.has(vk2)) {
          vertexAngles.set(vk2, { v: v2, angles: [] });
        }
        const entry2 = vertexAngles.get(vk2)!;
        entry2.angles.push(reverseAngle);
      }
    }
  }

  return { edges, vertexAngles };
}

function hexagonGridImpl(args: GridArgs, orientation: HexOrientation): string {
  const { type, x, y, width, height, cellSize } = args;
  const { edges, vertexAngles } = buildHexGrid(x, y, width, height, cellSize, orientation);
  if (edges.length === 0) return '';

  const parts: string[] = [];

  switch (type) {
    case 'shape': {
      for (const edge of edges) {
        parts.push(
          `M ${formatNum(edge.v1.x)} ${formatNum(edge.v1.y)} L ${formatNum(edge.v2.x)} ${formatNum(edge.v2.y)}`,
        );
      }
      break;
    }
    case 'dot': {
      const r = DOT_RADIUS_FACTOR * cellSize;
      for (const { v } of vertexAngles.values()) {
        emitDot(parts, v.x, v.y, r);
      }
      break;
    }
    case 'intersection': {
      const arm = CROSS_ARM_FACTOR * cellSize;
      for (const { v, angles } of vertexAngles.values()) {
        // Hex vertices have 3 edges meeting — use radial arms (half-lines from center)
        const uniqueAngles = deduplicateAngles(angles);
        emitRadialArms(parts, v.x, v.y, arm, uniqueAngles);
      }
      break;
    }
    case 'partial': {
      for (const edge of edges) {
        emitPartial(parts, edge.v1.x, edge.v1.y, edge.v2.x, edge.v2.y, PARTIAL_FRACTION);
      }
      break;
    }
  }

  return parts.join(' ');
}

/** Deduplicate angles that are within ~1 degree of each other, keeping one representative. */
function deduplicateAngles(angles: number[]): number[] {
  const threshold = 0.02; // ~1.15 degrees
  const unique: number[] = [];
  for (const a of angles) {
    let isDuplicate = false;
    for (const u of unique) {
      let diff = Math.abs(a - u);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < threshold) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) unique.push(a);
  }
  return unique;
}

// ===========================================================================
// Exported functions
// ===========================================================================

export const gridFunctions = {
  squareGrid: (...args: unknown[]): PathSegment => {
    const gridArgs = validateGridArgs('squareGrid', args);
    return segment(squareGridImpl(gridArgs));
  },

  triangleGrid: (...args: unknown[]): PathSegment => {
    const gridArgs = validateGridArgs('triangleGrid', args);
    return segment(triangleGridImpl(gridArgs));
  },

  hexagonGrid: (...args: unknown[]): PathSegment => {
    if (args.length < 6 || args.length > 7) {
      throw new Error(
        `hexagonGrid() expects 6-7 arguments (type, x, y, width, height, cellSize, orientation?), got ${args.length}`,
      );
    }
    const gridArgs = validateGridArgs('hexagonGrid', args.slice(0, 6), 6, 6);
    let orientation: HexOrientation = 'edge';
    if (args.length === 7) {
      const ori = args[6];
      if (typeof ori !== 'string' || !VALID_ORIENTATIONS.has(ori as HexOrientation)) {
        throw new Error(
          `hexagonGrid() orientation must be 'edge' or 'vertex', got '${ori}'`,
        );
      }
      orientation = ori as HexOrientation;
    }
    return segment(hexagonGridImpl(gridArgs, orientation));
  },
};
