import { describe, it, expect } from 'vitest';
import { decimatePathData } from '../src/evaluator/path-decimate';
import { parsePathDataExpanded } from '../src/evaluator/path-data';

function endpoint(d: string): { x: number; y: number } {
  const commands = parsePathDataExpanded(d);
  return commands.length > 0 ? commands[commands.length - 1].end : { x: 0, y: 0 };
}

const countDrawing = (d: string): number =>
  parsePathDataExpanded(d).filter((c) => !'MZmz'.includes(c.command)).length;

describe('decimatePathData', () => {
  it('epsilon <= 0 is an absolutized passthrough', () => {
    const { d, removed, kept } = decimatePathData('m 0 0 l 0.001 0 l 5 5', 0);
    expect(d).toBe('M 0 0 L 0.001 0 L 5.001 5');
    expect(removed).toBe(0);
    expect(kept).toBe(2);
  });

  it('culls sub-epsilon segments, keeps larger ones', () => {
    const { d, removed, kept } = decimatePathData('M 0 0 l 0.01 0 l 10 0 l 0.02 0.02 l 0 10', 0.5);
    expect(removed).toBe(2);
    expect(kept).toBe(2);
    const commands = parsePathDataExpanded(d).map((c) => c.command);
    expect(commands[0]).toBe('M');
    expect(commands).not.toContain('l');
  });

  it('M and Z always survive; no merging across them', () => {
    const input = 'M 0 0 l 0.01 0 z M 5 5 l 0.01 0 z';
    const { d } = decimatePathData(input, 1);
    const letters = parsePathDataExpanded(d).map((c) => c.command);
    expect(letters.filter((c) => c === 'M')).toHaveLength(2);
    expect(letters.filter((c) => c === 'Z' || c === 'z')).toHaveLength(2);
  });

  it('long gentle chains survive to within epsilon (accumulated-run guard)', () => {
    const d = `M 0 0 ${'l 0.4 0 '.repeat(100)}`;
    const result = decimatePathData(d, 0.5);
    // Not collapsed to nothing (0.4-steps pair up into ≥0.5 synthetic lines):
    expect(result.kept).toBeGreaterThanOrEqual(50);
    // Endpoint within epsilon of the true (40, 0):
    const end = endpoint(result.d);
    expect(Math.abs(end.x - 40)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(end.y)).toBeLessThanOrEqual(0.5);
  });

  it('keeps a large-sweep curve whose endpoints nearly coincide', () => {
    // Control points 20 units away; chord ~0.1
    const d = 'M 0 0 c 20 0 20 20 0.1 0';
    const { removed, kept } = decimatePathData(d, 0.5);
    expect(removed).toBe(0);
    expect(kept).toBe(1);
  });

  it('keeps a tiny-chord arc with large radii; culls a fully tiny arc', () => {
    const big = decimatePathData('M 0 0 a 20 20 0 1 1 0.1 0', 0.5);
    expect(big.removed).toBe(0);
    const tiny = decimatePathData('M 0 0 a 0.05 0.05 0 1 1 0.01 0 l 5 5', 0.5);
    expect(tiny.removed).toBe(1);
    expect(tiny.kept).toBe(1);
  });

  it('is monotone in epsilon', () => {
    const d = `M 0 0 ${Array.from({ length: 50 }, (_, i) => `l ${(i % 7) * 0.1} 0.05`).join(' ')}`;
    const r1 = decimatePathData(d, 0.1).removed;
    const r2 = decimatePathData(d, 0.3).removed;
    const r3 = decimatePathData(d, 0.7).removed;
    expect(r2).toBeGreaterThanOrEqual(r1);
    expect(r3).toBeGreaterThanOrEqual(r2);
  });

  it('is idempotent at a fixed epsilon', () => {
    const d = `M 0 0 ${'l 0.4 0 '.repeat(40)} l 10 0 l 0.01 0`;
    const once = decimatePathData(d, 0.5);
    const twice = decimatePathData(once.d, 0.5);
    expect(twice.d).toBe(once.d);
    expect(twice.removed).toBe(0);
  });

  it('counts stay honest: removed = input drawing − kept', () => {
    const d = `M 0 0 ${'l 0.2 0 '.repeat(10)} l 5 0 z`;
    const input = countDrawing(d);
    const { removed, kept } = decimatePathData(d, 0.5);
    expect(removed + kept).toBe(input);
  });

  it('an entirely sub-epsilon subpath collapses to M (+ Z)', () => {
    const { d } = decimatePathData('M 0 0 l 0.01 0 l 0 0.01 z M 10 10 l 5 0', 0.5);
    expect(d).toBe('M 0 0 Z M 10 10 L 15 10');
  });

  it('preserves closure endpoints of surviving geometry', () => {
    const input = 'M 0 0 l 10 0 l 0.01 0.01 l 0 10 l -10 0 z';
    const { d } = decimatePathData(input, 0.5);
    const commands = parsePathDataExpanded(d);
    // First surviving line still lands at (10,0); closing Z returns to (0,0)
    expect(commands[1].end).toEqual({ x: 10, y: 0 });
    expect(commands[commands.length - 1].command.toUpperCase()).toBe('Z');
    expect(commands[commands.length - 1].end).toEqual({ x: 0, y: 0 });
  });

  it('culling a tiny curve before an S does not re-base its reflection', () => {
    // The tiny c (extent 0.06) is S's reflection basis. Because S is
    // normalized to an explicit C at parse time — before decimation — its
    // first control stays anchored near (40.06, 40) even after the tiny c is
    // dropped, instead of re-reflecting off the big surviving C (which would
    // yield (80, 0) — a ~56-unit shape change).
    const d = 'M 0 0 C 0 80 0 80 40 40 c 0.03 0 0.06 0 0.06 0 S 80 0 70 70';
    const { d: out, removed } = decimatePathData(d, 0.5);
    expect(removed).toBe(1);
    const commands = parsePathDataExpanded(out);
    const lastCurve = commands[commands.length - 1];
    expect(lastCurve.command).toBe('C');
    expect(Math.abs(lastCurve.args[0] - 40.06)).toBeLessThan(0.01);
    expect(Math.abs(lastCurve.args[1] - 40)).toBeLessThan(0.01);
  });

  it('handles empty and degenerate input', () => {
    expect(decimatePathData('', 0.5)).toEqual({ d: '', removed: 0, kept: 0 });
    expect(decimatePathData('M 3 4', 0.5)).toEqual({ d: 'M 3 4', removed: 0, kept: 0 });
  });
});
