import { describe, it, expect } from 'vitest';
import { trimPathDataPrecision } from '../src/evaluator/path-precision';
import { parsePathDataExpanded, commandsToAbsoluteD } from '../src/evaluator/path-data';

/** Final pen position after tracing a d string from (0,0). */
function endpoint(d: string): { x: number; y: number } {
  const commands = parsePathDataExpanded(d);
  return commands.length > 0 ? commands[commands.length - 1].end : { x: 0, y: 0 };
}

describe('trimPathDataPrecision', () => {
  it('emits absolute uppercase commands', () => {
    const out = trimPathDataPrecision('m 5 5 l 10.123 0 h 3.456 v 2 z', 2);
    expect(out).toBe('M 5 5 L 15.12 5 H 18.58 V 7 Z');
    expect(out).not.toMatch(/[a-y]/);
  });

  it('limits decimals to N and strips trailing zeros', () => {
    const out = trimPathDataPrecision('M 1.23456 2.500001 L 3.999999 4.000001', 3);
    expect(out).toBe('M 1.235 2.5 L 4 4');
    for (const token of out.match(/-?[\d.]+/g)!) {
      const decimals = token.split('.')[1]?.length ?? 0;
      expect(decimals).toBeLessThanOrEqual(3);
    }
  });

  it('leaves integers untouched at zero decimals', () => {
    expect(trimPathDataPrecision('M 100 200 L 300.6 400.4', 0)).toBe('M 100 200 L 301 400');
  });

  it('normalizes -0', () => {
    expect(trimPathDataPrecision('M 0 0 L -0.004 5', 2)).toBe('M 0 0 L 0 5');
  });

  it('does not accumulate drift on long relative chains (unlike relative rounding)', () => {
    const step = 'l 0.014 0.014 ';
    const d = `M 0 0 ${step.repeat(200)}`;
    const trueEnd = { x: 2.8, y: 2.8 };

    const trimmed = trimPathDataPrecision(d, 1);
    const trimmedEnd = endpoint(trimmed);
    expect(Math.abs(trimmedEnd.x - trueEnd.x)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(trimmedEnd.y - trueEnd.y)).toBeLessThanOrEqual(0.05);

    // The naive alternative — rounding each relative delta — collapses to zero.
    const naiveEnd = 200 * Number((0.014).toFixed(1));
    expect(Math.abs(naiveEnd - trueEnd.x)).toBeGreaterThan(2);
  });

  it('absolutizes curves and normalizes S/T to explicit C/Q with resolved reflections', () => {
    const d = 'M 10 10 c 5 0 10 5 10 10 s 5 10 10 10 q 2.5 5 5 5 t 5 0';
    const out = trimPathDataPrecision(d, 4);
    // S reflects the previous c's second control (20,15) about (20,20) → (20,25);
    // T reflects the previous q's control (32.5,35) about (35,35) → (37.5,35).
    expect(out).toBe('M 10 10 C 15 10 20 15 20 20 C 20 25 25 30 30 30 Q 32.5 35 35 35 Q 37.5 35 40 35');
    // Round-trip: endpoints preserved exactly at this precision
    expect(endpoint(out)).toEqual(endpoint(d));
  });

  it('S/T reflection state resets across Z and M subpath boundaries', () => {
    // S right after closing/starting a new subpath must NOT reflect the
    // previous subpath's curve — control collapses to the current point.
    const closed = trimPathDataPrecision('M 0 0 C 0 10 10 10 10 0 Z M 20 20 S 30 30 40 20', 2);
    expect(closed).toBe('M 0 0 C 0 10 10 10 10 0 Z M 20 20 C 20 20 30 30 40 20');
    const moved = trimPathDataPrecision('M 0 0 Q 5 10 10 0 M 20 20 T 30 20', 2);
    expect(moved).toBe('M 0 0 Q 5 10 10 0 M 20 20 Q 20 20 30 20');
  });

  it('chained S commands reflect each predecessor in turn', () => {
    const out = trimPathDataPrecision('M 0 0 C 0 10 10 10 10 0 S 30 -10 30 0 S 50 10 50 0', 2);
    // First S reflects (10,10) about (10,0) → (10,-10); second S reflects the
    // first S's own second control (30,-10) about (30,0) → (30,10).
    expect(out).toBe('M 0 0 C 0 10 10 10 10 0 C 10 -10 30 -10 30 0 C 30 10 50 10 50 0');
  });

  it('S/T after a non-curve command collapse their reflection to the current point', () => {
    const out = trimPathDataPrecision('M 0 0 L 10 10 S 20 0 30 10 L 40 10 T 50 20', 2);
    // No preceding same-family curve → first control = current point.
    expect(out).toBe('M 0 0 L 10 10 C 10 10 20 0 30 10 L 40 10 Q 40 10 50 20');
  });

  it('preserves arcs (radii, rotation, flags, endpoint)', () => {
    const out = trimPathDataPrecision('M 0 0 a 5.5555 5.5555 0 1 1 10.1234 0.5678', 2);
    expect(out).toBe('M 0 0 A 5.56 5.56 0 1 1 10.12 0.57');
  });

  it('expands multi-group commands (implicit lineto after M)', () => {
    expect(trimPathDataPrecision('M 0 0 10 10 20 20', 1)).toBe('M 0 0 L 10 10 L 20 20');
    expect(trimPathDataPrecision('m 0 0 l 1.55 0 1.55 0', 1)).toBe('M 0 0 L 1.6 0 L 3.1 0');
  });

  it('handles exponent-notation input', () => {
    expect(trimPathDataPrecision('M 0 0 h 1e-7', 2)).toBe('M 0 0 H 0');
    expect(trimPathDataPrecision('M 0 0 h 1.5e2', 2)).toBe('M 0 0 H 150');
  });

  it('is idempotent', () => {
    const d = 'M 1.234567 2.345678 c 1.111111 0 2.222222 1 3.333333 2 z';
    const once = trimPathDataPrecision(d, 2);
    expect(trimPathDataPrecision(once, 2)).toBe(once);
  });

  it('handles degenerate input', () => {
    expect(trimPathDataPrecision('', 2)).toBe('');
    expect(trimPathDataPrecision('M 5 5', 2)).toBe('M 5 5');
    expect(trimPathDataPrecision('garbage', 2)).toBe('');
  });

  it('clamps decimals to a sane range', () => {
    expect(trimPathDataPrecision('M 0 0 L 1.5 1.5', -3)).toBe('M 0 0 L 2 2');
    expect(() => trimPathDataPrecision('M 0 0 L 1.5 1.5', 25)).not.toThrow();
  });
});

describe('commandsToAbsoluteD', () => {
  it('uses a custom formatter', () => {
    const commands = parsePathDataExpanded('m 1.111 2.222 l 3.333 0');
    const out = commandsToAbsoluteD(commands, { format: (n) => n.toFixed(1) });
    expect(out).toBe('M 1.1 2.2 L 4.4 2.2');
  });

  it('defaults to full precision', () => {
    const commands = parsePathDataExpanded('M 0 0 l 0.1 0.2');
    expect(commandsToAbsoluteD(commands)).toBe('M 0 0 L 0.1 0.2');
  });

  it('serializes Z and passthrough absolute curves', () => {
    const commands = parsePathDataExpanded('M 0 0 C 1 2 3 4 5 6 Z');
    expect(commandsToAbsoluteD(commands)).toBe('M 0 0 C 1 2 3 4 5 6 Z');
  });
});
