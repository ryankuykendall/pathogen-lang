import { describe, expect, it } from 'vitest';
import {
  createPathStore,
  parsePathStringAt,
  parsePathStringToCommands,
  recordPath,
  recordsFromCommands,
  storeToPathData,
} from '../src/evaluator/segments';
import { createPathContext } from '../src/evaluator/context';

describe('segments: recordPath', () => {
  it('pushes records whose raw fragments join to emit-ready data', () => {
    const store = createPathStore();
    recordPath(store, 'h 10', [{ command: 'h', args: [10], start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }]);
    recordPath(store, 'v 5', [{ command: 'v', args: [5], start: { x: 10, y: 0 }, end: { x: 10, y: 5 } }]);

    expect(store.records).toHaveLength(2);
    expect(store.records.map((r) => r.raw)).toEqual(['h 10', 'v 5']);
    expect(storeToPathData(store)).toBe('h 10 v 5');
  });

  it('wraps derived commands as per-command records', () => {
    const records = recordsFromCommands([
      { command: 'h', args: [10], start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { command: 'v', args: [5], start: { x: 10, y: 0 }, end: { x: 10, y: 5 } },
    ]);
    expect(records).toHaveLength(2);
    expect(records[0].commands).toHaveLength(1);
    expect(records.map((r) => r.raw).join(' ')).toMatch(/^h 10 v 5$/);
  });

  it('carries label and loc extras onto the record', () => {
    const store = createPathStore();
    recordPath(store, 'h 10', [], { label: 'lid', loc: { line: 3, column: 1, offset: 20 } });
    expect(store.records[0].label).toBe('lid');
    expect(store.records[0].loc?.line).toBe(3);
  });
});

describe('segments: parsePathStringToCommands', () => {
  it('parses a multi-command string with exact start/end tracking', () => {
    const ctx = createPathContext();
    const commands = parsePathStringToCommands('M 10 20 L 30 40 h 5', ctx);

    expect(commands).toHaveLength(3);
    expect(commands[0]).toMatchObject({ command: 'M', args: [10, 20], start: { x: 0, y: 0 }, end: { x: 10, y: 20 } });
    expect(commands[1]).toMatchObject({ command: 'L', args: [30, 40], start: { x: 10, y: 20 }, end: { x: 30, y: 40 } });
    expect(commands[2]).toMatchObject({ command: 'h', args: [5], start: { x: 30, y: 40 }, end: { x: 35, y: 40 } });
    // The live context advanced along with the parse
    expect(ctx.position).toEqual({ x: 35, y: 40 });
  });

  it('handles arc flags and exponent notation', () => {
    const ctx = createPathContext();
    const commands = parsePathStringToCommands('M 0 0 A 5 5 0 1 1 1e1 0', ctx);
    expect(commands[1].command).toBe('A');
    expect(commands[1].args).toEqual([5, 5, 0, 1, 1, 10, 0]);
    expect(commands[1].end).toEqual({ x: 10, y: 0 });
  });

  it('tracks z back to the subpath start', () => {
    const ctx = createPathContext();
    const commands = parsePathStringToCommands('M 10 10 h 20 v 20 z', ctx);
    expect(commands[3].command).toBe('z');
    expect(commands[3].start).toEqual({ x: 30, y: 30 });
    expect(commands[3].end).toEqual({ x: 10, y: 10 });
  });

  it('tracks uppercase M starting a second subpath', () => {
    const ctx = createPathContext();
    const commands = parsePathStringToCommands('M 0 0 h 10 M 50 50 h 10 z', ctx);
    expect(commands[2]).toMatchObject({ command: 'M', start: { x: 10, y: 0 }, end: { x: 50, y: 50 } });
    // z closes to the SECOND subpath's start
    expect(commands[4].end).toEqual({ x: 50, y: 50 });
  });
});

describe('segments: always-on record tracking perf', () => {
  it('compiles a 30k-command loop within a generous wall-clock budget', async () => {
    const { compile } = await import('../src/index');
    const source = 'for (i in 0..15000) {\n  h 1\n  v 1\n}';
    const started = performance.now();
    const result = compile(source);
    const elapsed = performance.now() - started;
    expect(result.layers[0].data.length).toBeGreaterThan(100000);
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('segments: parsePathStringAt', () => {
  it('derives relative-command geometry from the seed position without a live context', () => {
    const commands = parsePathStringAt('h 10 v 5', { x: 100, y: 200 });
    expect(commands[0]).toMatchObject({ start: { x: 100, y: 200 }, end: { x: 110, y: 200 } });
    expect(commands[1]).toMatchObject({ start: { x: 110, y: 200 }, end: { x: 110, y: 205 } });
  });

  it('honors an explicit subpath start for z', () => {
    const commands = parsePathStringAt('h 10 z', { x: 5, y: 5 }, { x: 0, y: 0 });
    expect(commands[1].end).toEqual({ x: 0, y: 0 });
  });
});
