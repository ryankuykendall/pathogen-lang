// Path helper functions that return PathSegment values

import { formatNum } from '../evaluator/format';

export interface PathSegment {
  type: 'PathSegment';
  value: string;
}

function segment(value: string): PathSegment {
  return { type: 'PathSegment', value };
}

export const pathFunctions = {
  // Circle: draws a full circle using two arcs
  circle: (cx: number, cy: number, r: number): PathSegment =>
    segment(
      `M ${formatNum(cx - r)} ${formatNum(cy)} ` +
        `A ${formatNum(r)} ${formatNum(r)} 0 1 1 ${formatNum(cx + r)} ${formatNum(cy)} ` +
        `A ${formatNum(r)} ${formatNum(r)} 0 1 1 ${formatNum(cx - r)} ${formatNum(cy)}`,
    ),

  // Arc: draws an arc from current point
  arc: (rx: number, ry: number, rotation: number, largeArc: number, sweep: number, x: number, y: number): PathSegment =>
    segment(
      `A ${formatNum(rx)} ${formatNum(ry)} ${formatNum(rotation)} ${largeArc} ${sweep} ${formatNum(x)} ${formatNum(y)}`,
    ),

  // Rectangle
  rect: (x: number, y: number, width: number, height: number): PathSegment =>
    segment(
      `M ${formatNum(x)} ${formatNum(y)} ` +
        `L ${formatNum(x + width)} ${formatNum(y)} ` +
        `L ${formatNum(x + width)} ${formatNum(y + height)} ` +
        `L ${formatNum(x)} ${formatNum(y + height)} ` +
        `Z`,
    ),

  // Rounded rectangle
  roundRect: (x: number, y: number, width: number, height: number, radius: number): PathSegment => {
    const r = Math.min(radius, width / 2, height / 2);
    return segment(
      `M ${formatNum(x + r)} ${formatNum(y)} ` +
        `L ${formatNum(x + width - r)} ${formatNum(y)} ` +
        `Q ${formatNum(x + width)} ${formatNum(y)} ${formatNum(x + width)} ${formatNum(y + r)} ` +
        `L ${formatNum(x + width)} ${formatNum(y + height - r)} ` +
        `Q ${formatNum(x + width)} ${formatNum(y + height)} ${formatNum(x + width - r)} ${formatNum(y + height)} ` +
        `L ${formatNum(x + r)} ${formatNum(y + height)} ` +
        `Q ${formatNum(x)} ${formatNum(y + height)} ${formatNum(x)} ${formatNum(y + height - r)} ` +
        `L ${formatNum(x)} ${formatNum(y + r)} ` +
        `Q ${formatNum(x)} ${formatNum(y)} ${formatNum(x + r)} ${formatNum(y)} ` +
        `Z`,
    );
  },

  // Regular polygon
  polygon: (cx: number, cy: number, radius: number, sides: number): PathSegment => {
    const points: string[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      points.push(i === 0 ? `M ${formatNum(x)} ${formatNum(y)}` : `L ${formatNum(x)} ${formatNum(y)}`);
    }
    points.push('Z');
    return segment(points.join(' '));
  },

  // Star shape
  star: (cx: number, cy: number, outerRadius: number, innerRadius: number, points: number): PathSegment => {
    const segments: string[] = [];
    const totalPoints = points * 2;

    for (let i = 0; i < totalPoints; i++) {
      const angle = (i / totalPoints) * Math.PI * 2 - Math.PI / 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      segments.push(i === 0 ? `M ${formatNum(x)} ${formatNum(y)}` : `L ${formatNum(x)} ${formatNum(y)}`);
    }
    segments.push('Z');
    return segment(segments.join(' '));
  },

  // Line segment
  line: (x1: number, y1: number, x2: number, y2: number): PathSegment =>
    segment(`M ${formatNum(x1)} ${formatNum(y1)} L ${formatNum(x2)} ${formatNum(y2)}`),

  // Quadratic bezier curve
  quadratic: (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number): PathSegment =>
    segment(
      `M ${formatNum(x1)} ${formatNum(y1)} Q ${formatNum(cx)} ${formatNum(cy)} ${formatNum(x2)} ${formatNum(y2)}`,
    ),

  // Cubic bezier curve
  cubic: (
    x1: number,
    y1: number,
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x2: number,
    y2: number,
  ): PathSegment =>
    segment(
      `M ${formatNum(x1)} ${formatNum(y1)} C ${formatNum(c1x)} ${formatNum(c1y)} ${formatNum(c2x)} ${formatNum(c2y)} ${formatNum(x2)} ${formatNum(y2)}`,
    ),

  // Move to (returns path segment)
  moveTo: (x: number, y: number): PathSegment => segment(`M ${formatNum(x)} ${formatNum(y)}`),

  // Line to (returns path segment)
  lineTo: (x: number, y: number): PathSegment => segment(`L ${formatNum(x)} ${formatNum(y)}`),

  // Close path
  closePath: (): PathSegment => segment('Z'),
};
