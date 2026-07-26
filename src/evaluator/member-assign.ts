import { oklchToCSS } from '../color';
import { BUILTIN_ENUMS } from './builtin-enums';
import { hasAngleUnit } from './units';

import type { OKLCH } from '../color';
import type { ColorValue } from './types';
import type { Expression } from '../parser/ast';

function isColorValue(value: unknown): value is ColorValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'ColorValue';
}

/**
 * Member-assignment (`obj.prop = value`) validation semantics shared by both
 * evaluators, so the annotated evaluator rejects exactly what normal
 * compilation rejects. Target types are structural — only the fields each
 * function touches — because the evaluators' local value shapes differ in
 * unrelated fields. `fail` lets each evaluator wrap the message in its own
 * formatError/getLine plumbing.
 */

/**
 * The gradient fields this module reads or writes — structural so both
 * evaluators' GradientValue shapes (which differ in fields this module never
 * touches, e.g. topoContours) satisfy it.
 */
export interface GradientAssignTarget {
  gradientType: 'linear' | 'radial' | 'conic' | 'mesh' | 'freeform' | 'topo';
  spreadMethod?: string;
  gradientUnits?: string;
  gradientTransform?: string;
  interpolation?: 'srgb' | 'oklch' | 'linearRGB';
  steps?: number;
  from?: number;
  to?: number;
  direction?: 'cw' | 'ccw';
  spread?: string;
  innerRadius?: number;
  innerFill?: 'transparent' | 'transparent-blend' | 'center' | ColorValue;
  falloff?: number;
  topoEasing?: string;
  topoMethod?: string;
  topoIterations?: number;
  topoBlend?: number;
  topoBaseColor?: OKLCH;
  topoBaseColorCSS?: string;
}

/**
 * Gradient property-assignment semantics shared by both evaluators.
 * `valueExpr` is the source expression of the assigned value — needed for the
 * ConicGradient from/to angle-unit enforcement, which is a property of how the
 * value is written, not of its runtime number.
 */
export function assignGradientProperty(
  obj: GradientAssignTarget,
  property: string,
  value: unknown,
  valueExpr: Expression,
  fail: (message: string) => never,
): void {
  switch (property) {
    case 'spreadMethod':
    case 'gradientUnits':
    case 'gradientTransform': {
      if (typeof value !== 'string') fail(`Gradient property '${property}' must be a string`);
      if (property === 'spreadMethod') obj.spreadMethod = value;
      else if (property === 'gradientUnits') obj.gradientUnits = value;
      else obj.gradientTransform = value;
      return;
    }
    case 'interpolation': {
      if (typeof value !== 'string') fail(`Gradient property 'interpolation' must be a string`);
      if (value !== 'srgb' && value !== 'oklch' && value !== 'linearRGB') {
        fail(`Gradient interpolation must be 'srgb', 'oklch', or 'linearRGB'`);
      }
      obj.interpolation = value;
      return;
    }
    case 'steps': {
      if (typeof value !== 'number') fail(`Gradient property 'steps' must be a number`);
      obj.steps = value;
      return;
    }
    // Conic-specific properties
    case 'from':
    case 'to': {
      // Enforce angle unit on literal numbers
      if (valueExpr.type === 'NumberLiteral' && !valueExpr.unit) {
        fail(
          `ConicGradient '${property}' requires an angle unit. Use e.g. ${valueExpr.value}deg, ${((valueExpr.value * Math.PI) / 180).toFixed(2)}rad, or ${(valueExpr.value / 180).toFixed(2)}pi`,
        );
      }
      // Also check negative unary on bare number
      if (valueExpr.type === 'UnaryExpression' && valueExpr.operator === '-' && !hasAngleUnit(valueExpr)) {
        fail(`ConicGradient '${property}' requires an angle unit`);
      }
      if (typeof value !== 'number') fail(`ConicGradient '${property}' must be a number (with angle unit)`);
      obj[property] = value;
      return;
    }
    case 'direction': {
      if (value !== 'cw' && value !== 'ccw') fail(`ConicGradient direction must be 'cw' or 'ccw'`);
      obj.direction = value;
      return;
    }
    case 'spread': {
      if (typeof value !== 'string' || !['clamp', 'repeat', 'transparent'].includes(value)) {
        fail(`ConicGradient spread must be 'clamp', 'repeat', or 'transparent'`);
      }
      obj.spread = value;
      return;
    }
    case 'innerRadius': {
      if (typeof value !== 'number') fail(`ConicGradient innerRadius must be a number`);
      if (value < 0) fail(`ConicGradient innerRadius must be >= 0`);
      obj.innerRadius = value;
      return;
    }
    case 'innerFill': {
      if (value === 'transparent' || value === 'center' || value === 'transparent-blend') {
        obj.innerFill = value;
      } else if (isColorValue(value)) {
        obj.innerFill = value;
      } else {
        fail(`ConicGradient innerFill must be 'transparent', 'transparent-blend', 'center', or a Color value`);
      }
      return;
    }
    // Freeform-specific properties
    case 'falloff': {
      if (obj.gradientType !== 'freeform') fail(`Property 'falloff' is only available on FreeformGradient`);
      if (typeof value !== 'number') fail(`FreeformGradient falloff must be a number`);
      if (value <= 0) fail(`FreeformGradient falloff must be positive`);
      obj.falloff = value;
      return;
    }
    // Topo-specific properties
    case 'easing': {
      if (obj.gradientType !== 'topo') fail(`Property 'easing' is only available on TopoGradient`);
      const valid = ['linear', 'smoothstep', 'ease-in', 'ease-out', 'ease-in-out'];
      if (typeof value !== 'string' || !valid.includes(value)) {
        fail(`TopoGradient easing must be one of: ${valid.join(', ')}`);
      }
      obj.topoEasing = value;
      return;
    }
    case 'method': {
      if (obj.gradientType !== 'topo') fail(`Property 'method' is only available on TopoGradient`);
      if (value !== 'distance' && value !== 'laplace') {
        fail(`TopoGradient method must be 'distance' or 'laplace'`);
      }
      obj.topoMethod = value as string;
      return;
    }
    case 'iterations': {
      if (obj.gradientType !== 'topo') fail(`Property 'iterations' is only available on TopoGradient`);
      if (typeof value !== 'number') fail(`TopoGradient iterations must be a number`);
      if (value < 1 || value > 2000) fail(`TopoGradient iterations must be between 1 and 2000`);
      obj.topoIterations = Math.round(value);
      return;
    }
    case 'blend': {
      if (obj.gradientType !== 'topo') fail(`Property 'blend' is only available on TopoGradient`);
      if (typeof value !== 'number') fail(`TopoGradient blend must be a number`);
      if (value < 0 || value > 1) fail(`TopoGradient blend must be between 0 and 1`);
      obj.topoBlend = value;
      return;
    }
    case 'baseColor': {
      if (obj.gradientType !== 'topo') fail(`Property 'baseColor' is only available on TopoGradient`);
      if (!isColorValue(value)) fail(`TopoGradient baseColor must be a Color value`);
      obj.topoBaseColor = { ...value.oklch };
      obj.topoBaseColorCSS = oklchToCSS(value.oklch);
      return;
    }
    default:
      fail(`Cannot assign to Gradient property '${property}'`);
  }
}

export interface PatternAssignTarget {
  patternUnits?: string;
  patternTransform?: string;
  patternContentUnits?: string;
}

export function assignPatternProperty(
  obj: PatternAssignTarget,
  property: string,
  value: unknown,
  fail: (message: string) => never,
): void {
  if (typeof value !== 'string') fail(`Pattern property '${property}' must be a string`);
  switch (property) {
    case 'patternUnits':
      obj.patternUnits = value;
      return;
    case 'patternTransform':
      obj.patternTransform = value;
      return;
    case 'patternContentUnits':
      obj.patternContentUnits = value;
      return;
    default:
      fail(`Cannot assign to Pattern property '${property}'`);
  }
}

export interface MarkerAssignTarget {
  viewBox?: string;
  refX?: number | string;
  refY?: number | string;
  orient?: number | string;
  markerUnits?: string;
  preserveAspectRatio?: string;
}

export function assignMarkerProperty(
  obj: MarkerAssignTarget,
  property: string,
  value: unknown,
  fail: (message: string) => never,
): void {
  const validateEnum = (enumName: string, val: string): string => {
    const enumObj = BUILTIN_ENUMS[enumName];
    const validValues = Object.values(enumObj);
    if (!validValues.includes(val)) {
      fail(`Invalid value '${val}' for Marker.${property}. Valid values: ${validValues.join(', ')}`);
    }
    return val;
  };
  switch (property) {
    case 'viewBox': {
      if (typeof value !== 'string') fail(`Marker.viewBox must be a string`);
      obj.viewBox = value;
      return;
    }
    case 'refX': {
      if (typeof value === 'number') {
        obj.refX = value;
      } else if (typeof value === 'string') {
        obj.refX = validateEnum('MarkerRefX', value);
      } else {
        fail(`Marker.refX must be a number or MarkerRefX enum value`);
      }
      return;
    }
    case 'refY': {
      if (typeof value === 'number') {
        obj.refY = value;
      } else if (typeof value === 'string') {
        obj.refY = validateEnum('MarkerRefY', value);
      } else {
        fail(`Marker.refY must be a number or MarkerRefY enum value`);
      }
      return;
    }
    case 'orient': {
      if (typeof value === 'number') {
        obj.orient = value;
      } else if (typeof value === 'string') {
        obj.orient = validateEnum('MarkerOrient', value);
      } else {
        fail(`Marker.orient must be a number or MarkerOrient enum value`);
      }
      return;
    }
    case 'markerUnits': {
      if (typeof value !== 'string') fail(`Marker.markerUnits must be a MarkerUnits enum value`);
      obj.markerUnits = validateEnum('MarkerUnits', value);
      return;
    }
    case 'preserveAspectRatio': {
      if (typeof value !== 'string') fail(`Marker.preserveAspectRatio must be a MarkerPreserveAspectRatio enum value`);
      obj.preserveAspectRatio = validateEnum('MarkerPreserveAspectRatio', value);
      return;
    }
    default:
      fail(`Cannot assign to Marker property '${property}'`);
  }
}

export interface MeshPointAssignTarget {
  x?: number;
  y?: number;
  color?: OKLCH;
  colorCSS?: string;
}

export function assignMeshPointProperty(
  obj: MeshPointAssignTarget,
  property: string,
  value: unknown,
  fail: (message: string) => never,
): void {
  switch (property) {
    case 'color': {
      if (!isColorValue(value)) fail('MeshPoint color must be a Color value');
      obj.color = { ...value.oklch };
      obj.colorCSS = oklchToCSS(value.oklch);
      return;
    }
    case 'x': {
      if (typeof value !== 'number') fail('MeshPoint x must be a number');
      obj.x = value;
      return;
    }
    case 'y': {
      if (typeof value !== 'number') fail('MeshPoint y must be a number');
      obj.y = value;
      return;
    }
    default:
      fail(`Cannot assign to MeshPoint property '${property}'`);
  }
}
