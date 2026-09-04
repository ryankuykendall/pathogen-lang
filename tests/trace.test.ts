import { describe, expect, it } from 'vitest';

import { compile, compileWithContext, toJsonDocument } from '../src';

const PROGRAM = [
  "define PathLayer('lid') #{ stroke: red; }",
  "layer('lid').apply {",
  '  M 10 10',
  "  h 40 as segment('top')",
  '  v 20',
  '}',
  'M 0 0',
  'l 5 5',
].join('\n');

/**
 * `trace: true` keeps provenance in the result: per-fragment records with
 * source locations, and each path layer's executed command history. Off by
 * default so ordinary compiles carry nothing extra.
 */
describe('trace output', () => {
  it('is absent unless requested', () => {
    const result = compile(PROGRAM);
    expect(result.commands).toBeUndefined();
    expect(result.layers.every((l) => l.records === undefined && l.commands === undefined)).toBe(true);
  });

  it('records carry the emitting statement location and label', () => {
    const result = compile(PROGRAM, { trace: true });
    const lid = result.layers.find((l) => l.name === 'lid')!;
    expect(lid.records).toEqual([
      { loc: { line: 3, column: 3, offset: expect.any(Number) }, raw: 'M 10 10', commandCount: 1 },
      { loc: { line: 4, column: 3, offset: expect.any(Number) }, label: 'top', raw: 'h 40', commandCount: 1 },
      { loc: { line: 5, column: 3, offset: expect.any(Number) }, raw: 'v 20', commandCount: 1 },
    ]);
  });

  it('each path layer carries its own command history with cursor positions', () => {
    const result = compile(PROGRAM, { trace: true });
    const lid = result.layers.find((l) => l.name === 'lid')!;
    expect(lid.commands).toEqual([
      { command: 'M', args: [10, 10], start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { command: 'h', args: [40], start: { x: 10, y: 10 }, end: { x: 50, y: 10 } },
      { command: 'v', args: [20], start: { x: 50, y: 10 }, end: { x: 50, y: 30 } },
    ]);
    const main = result.layers.find((l) => l.isDefault)!;
    expect(main.commands).toEqual([
      { command: 'M', args: [0, 0], start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      { command: 'l', args: [5, 5], start: { x: 0, y: 0 }, end: { x: 5, y: 5 } },
    ]);
    // the result-level trace is the default layer's
    expect(result.commands).toEqual(main.commands);
  });

  it('a first-class PathLayer value traces like a defined layer', () => {
    const result = compile("let lid = PathLayer('lid');\nlid.apply {\n  M 10 10\n  h 40\n}\nM 0 0", { trace: true });
    const lid = result.layers.find((l) => l.name === 'lid')!;
    expect(lid.commands).toEqual([
      { command: 'M', args: [10, 10], start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { command: 'h', args: [40], start: { x: 10, y: 10 }, end: { x: 50, y: 10 } },
    ]);
    expect(lid.records).toHaveLength(2);
  });

  it('compileWithContext honours trace too', () => {
    const result = compileWithContext(PROGRAM, { trace: true });
    expect(result.layers.find((l) => l.name === 'lid')!.records).toHaveLength(3);
    expect(result.commands).toHaveLength(2);
  });

  it('toJsonDocument renames data to d and keeps defs, logs, warnings, and trace', () => {
    const result = compile(`${PROGRAM}\nlog("done");`, { trace: true });
    const doc = toJsonDocument(result);
    expect(Object.keys(doc.defs)).toEqual(['masks', 'clipPaths', 'gradients', 'patterns', 'markers', 'filters']);
    const lid = doc.layers.find((l) => l.name === 'lid')!;
    expect(lid.d).toBe('M 10 10 h 40 v 20');
    expect(lid.records).toHaveLength(3);
    expect(lid.commands).toHaveLength(3);
    expect(doc.logs[0].parts[0].value).toBe('done');
    expect(doc.warnings).toEqual([]);
    expect(doc.commands).toHaveLength(2);
    expect('data' in lid).toBe(false);
  });
});
