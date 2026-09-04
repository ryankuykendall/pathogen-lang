import { oklchToCSS, oklchToHex, oklchToHSLString, oklchToOKLCHString, oklchToRGBString } from '../color';
import { radiansToDegreesSnapped, radiansToPiMultipleSnapped, radiansToTurnsSnapped } from './angle';

import type { AngleValue, ColorValue, ContextObject, GridValue, MeshPointValue, PointValue, PolarVectorValue, Value, VertexHandleValue, ViewBoxStructValue } from './types';

/**
 * Shared property registry for built-in struct values.
 *
 * Single source of truth for the data properties of Point, PolarVector, Grid,
 * MeshPoint, Color, ViewBox, and context objects — used by the evaluator
 * for member access and object destructuring. Properties are read
 * lazily via `get()` so reading one never computes the others; `keys()` exists
 * for rest-pattern enumeration and is not called on the member-access hot path.
 *
 * The module returns data and never throws for unknown keys — the caller
 * raises its own error with its own formatting. The evaluator's
 * ContextObject `transform` special case (TransformReference synthesis from
 * `_transformState`) intentionally stays in index.ts.
 *
 * Descriptor inputs are typed `unknown` because `getStructDescriptor` is the
 * type guard: callers probe arbitrary values with it. `get()` is only ever
 * invoked with the value its descriptor was looked up for, after `has()`
 * returned true.
 */

type Getter = (value: unknown) => Value;

export interface StructDescriptor {
  /** Type name used in error messages: `Property 'z' does not exist on Point` */
  name: string;
  /** Whether the property exists on this value. */
  has(value: unknown, key: string): boolean;
  /** Read one property. Only valid when `has(value, key)` is true. */
  get(value: unknown, key: string): Value;
  /** All destructurable keys, for rest-pattern enumeration. */
  keys(value: unknown): string[];
}

function staticDescriptor(name: string, getters: Record<string, Getter>): StructDescriptor {
  const keyList = Object.keys(getters);
  return {
    name,
    // Object.hasOwn, not `in` or truthiness: inherited keys like 'toString'
    // must not resolve to Object.prototype members.
    has: (_value, key) => Object.hasOwn(getters, key),
    get: (value, key) => getters[key](value),
    keys: () => keyList,
  };
}

const POINT = staticDescriptor('Point', {
  x: (v) => (v as PointValue).x,
  y: (v) => (v as PointValue).y,
});

const POLAR_VECTOR = staticDescriptor('PolarVector', {
  angle: (v) => (v as PolarVectorValue).angle,
  distance: (v) => (v as PolarVectorValue).distance,
});

const GRID = staticDescriptor('Grid', {
  rows: (v) => (v as GridValue).rows,
  cols: (v) => (v as GridValue).cols,
  xDim: (v) => (v as GridValue).xDim,
  yDim: (v) => (v as GridValue).yDim,
  origin: (v) => (v as GridValue).origin,
  width: (v) => (v as GridValue).cols * (v as GridValue).xDim,
  height: (v) => (v as GridValue).rows * (v as GridValue).yDim,
  outOfBounds: (v) => (v as GridValue).outOfBounds,
  interpolation: (v) => (v as GridValue).interpolation,
});

const MESH_POINT = staticDescriptor('MeshPoint', {
  x: (v) => (v as MeshPointValue).x,
  y: (v) => (v as MeshPointValue).y,
  color: (v) => ({ type: 'ColorValue' as const, oklch: { ...(v as MeshPointValue).color } }),
});

const COLOR = staticDescriptor('Color', {
  css: (v) => oklchToCSS((v as ColorValue).oklch),
  hex: (v) => oklchToHex((v as ColorValue).oklch),
  oklch: (v) => oklchToOKLCHString((v as ColorValue).oklch),
  hsl: (v) => oklchToHSLString((v as ColorValue).oklch),
  rgb: (v) => oklchToRGBString((v as ColorValue).oklch),
  lightness: (v) => (v as ColorValue).oklch.L,
  chroma: (v) => (v as ColorValue).oklch.C,
  hue: (v) => (v as ColorValue).oklch.H,
  a: (v) => (v as ColorValue).oklch.alpha,
});

/** Convert a raw context-object entry the same way member access always has. */
function convertContextProperty(key: string, raw: unknown): Value {
  if (typeof raw === 'number') return raw;
  if (Array.isArray(raw)) {
    return { type: 'ContextObject' as const, value: { length: raw.length, items: raw } };
  }
  if (typeof raw === 'object' && raw !== null) {
    return { type: 'ContextObject' as const, value: raw as Record<string, unknown> };
  }
  // Unreachable today (context objects only hold numbers/objects/arrays); a
  // plain Error here loses the evaluator's line-number wrapping if that ever
  // changes — mirror of the pre-refactor fallback in member access.
  throw new Error(`Cannot access property '${key}' of type ${typeof raw}`);
}

/**
 * Context objects have dynamic keys, so has/get/keys read the backing record
 * directly — no per-access allocation. `_transformState` is internal state
 * and is never exposed; `.transform` is synthesized from it by index.ts.
 */
const CONTEXT_OBJECT: StructDescriptor = {
  name: 'context object',
  has: (value, key) => key !== '_transformState' && (value as ContextObject).value[key] !== undefined,
  get: (value, key) => convertContextProperty(key, (value as ContextObject).value[key]),
  keys: (value) => Object.keys((value as ContextObject).value).filter((k) => k !== '_transformState'),
};

const VERTEX_HANDLE = staticDescriptor('VertexHandle', {
  x: (v) => (v as VertexHandleValue).point.x,
  y: (v) => (v as VertexHandleValue).point.y,
  point: (v) => ({ type: 'PointValue', x: (v as VertexHandleValue).point.x, y: (v as VertexHandleValue).point.y }) as Value,
  label: (v) => (v as VertexHandleValue).label,
});

const ANGLE = staticDescriptor('Angle', {
  deg: (v) => radiansToDegreesSnapped((v as AngleValue).radians),
  rad: (v) => (v as AngleValue).radians,
  pi: (v) => radiansToPiMultipleSnapped((v as AngleValue).radians),
  turns: (v) => radiansToTurnsSnapped((v as AngleValue).radians),
});

const VIEW_BOX = staticDescriptor('ViewBox', {
  originX: (v) => (v as ViewBoxStructValue).originX,
  originY: (v) => (v as ViewBoxStructValue).originY,
  width: (v) => (v as ViewBoxStructValue).width,
  height: (v) => (v as ViewBoxStructValue).height,
});

const DESCRIPTORS: Record<string, StructDescriptor> = {
  PointValue: POINT,
  PolarVectorValue: POLAR_VECTOR,
  GridValue: GRID,
  MeshPointValue: MESH_POINT,
  ColorValue: COLOR,
  AngleValue: ANGLE,
  ContextObject: CONTEXT_OBJECT,
  VertexHandleValue: VERTEX_HANDLE,
  ViewBoxStructValue: VIEW_BOX,
};

/**
 * Returns the property descriptor for a built-in struct value, or null for
 * anything else (including plain ObjectValue, which has its own Map-backed
 * access and lenient destructuring semantics).
 */
export function getStructDescriptor(value: unknown): StructDescriptor | null {
  if (typeof value !== 'object' || value === null || !('type' in value)) return null;
  return DESCRIPTORS[(value as { type: string }).type] ?? null;
}
