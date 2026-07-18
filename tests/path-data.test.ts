import { describe, expect, it } from 'vitest';
import {
  commandsToRelativeD,
  parsePathStringAt,
  parsePathStringToCommands,
  serializeRelativeAndTrack,
  splitPathCommands,
  tokenizePathData,
} from '../src/evaluator/path-data';
import { createPathContext } from '../src/evaluator/context';
import type { PathBlockCommand } from '../src/evaluator/types';

describe('path-data: tokenizePathData', () => {
  it('tokenizes multi-command strings with mixed separators', () => {
    expect(tokenizePathData('M 10 20 L 30 40 h 5')).toEqual([
      { command: 'M', args: [10, 20] },
      { command: 'L', args: [30, 40] },
      { command: 'h', args: [5] },
    ]);
    expect(tokenizePathData('M10,20L30,40')).toEqual([
      { command: 'M', args: [10, 20] },
      { command: 'L', args: [30, 40] },
    ]);
  });

  it('parses implicit-decimal chains per SVG number grammar (1.5.5 = 1.5, .5)', () => {
    expect(tokenizePathData('M 1.5.5 2')).toEqual([{ command: 'M', args: [1.5, 0.5, 2] }]);
  });

  it('treats a sign as a number separator (10-5, -.5-.5)', () => {
    expect(tokenizePathData('L10-5')).toEqual([{ command: 'L', args: [10, -5] }]);
    expect(tokenizePathData('l-.5-.5')).toEqual([{ command: 'l', args: [-0.5, -0.5] }]);
  });

  it('parses leading-dot decimals and explicit plus signs', () => {
    expect(tokenizePathData('h.5')).toEqual([{ command: 'h', args: [0.5] }]);
    expect(tokenizePathData('L +3 .25')).toEqual([{ command: 'L', args: [3, 0.25] }]);
  });

  it('parses scientific notation in both cases', () => {
    expect(tokenizePathData('L 1e-2 1E+3')).toEqual([{ command: 'L', args: [0.01, 1000] }]);
    expect(tokenizePathData('L 5.000000000000001 0')).toEqual([{ command: 'L', args: [5.000000000000001, 0] }]);
  });

  it('does not treat a bare e as an exponent', () => {
    // 'e' with no following digits is junk, not an exponent — 10 survives.
    expect(tokenizePathData('L 10e 5')).toEqual([{ command: 'L', args: [10, 5] }]);
  });

  it('splits packed arc flags per SVG grammar (A 5 5 0 1110 0 = flags 1,1 then 10,0)', () => {
    expect(tokenizePathData('A 5 5 0 1110 0')).toEqual([{ command: 'A', args: [5, 5, 0, 1, 1, 10, 0] }]);
  });

  it('keeps arc flag slots aligned across repeated 7-arg groups', () => {
    expect(tokenizePathData('a 5 5 0 0 1 5 5 6 6 0 1030 0')).toEqual([
      { command: 'a', args: [5, 5, 0, 0, 1, 5, 5, 6, 6, 0, 1, 0, 30, 0] },
    ]);
  });

  it('yields empty args for a command with no numbers', () => {
    expect(tokenizePathData('M 10 20 Q')).toEqual([
      { command: 'M', args: [10, 20] },
      { command: 'Q', args: [] },
    ]);
  });

  it('skips stray signs and dots instead of emitting NaN', () => {
    // The old NUMBER_REGEX matched a lone '.' and pushed NaN; the scanner
    // requires at least one digit.
    expect(tokenizePathData('L 10 . 20 - 30')).toEqual([{ command: 'L', args: [10, 20, 30] }]);
  });

  it('ignores junk before the first command letter', () => {
    expect(tokenizePathData('  12 xy M 1 2')).toEqual([{ command: 'M', args: [1, 2] }]);
  });
});

describe('path-data: parsePathStringToCommands / parsePathStringAt', () => {
  it('tracks start/end per command against a live context', () => {
    const ctx = createPathContext();
    const commands = parsePathStringToCommands('M 10 20 L 30 40 h 5', ctx);
    expect(commands[2]).toMatchObject({ command: 'h', args: [5], start: { x: 30, y: 40 }, end: { x: 35, y: 40 } });
    expect(ctx.position).toEqual({ x: 35, y: 40 });
  });

  it('tracks z to the subpath start and continues after it', () => {
    const ctx = createPathContext();
    const commands = parsePathStringToCommands('M 20 20 h 10 v 10 z h 5', ctx);
    expect(commands[3]).toMatchObject({ command: 'z', end: { x: 20, y: 20 } });
    expect(commands[4]).toMatchObject({ command: 'h', start: { x: 20, y: 20 }, end: { x: 25, y: 20 } });
  });

  it('parsePathStringAt derives geometry from a seed without touching a live context', () => {
    const commands = parsePathStringAt('h 10 z', { x: 5, y: 5 }, { x: 0, y: 0 });
    expect(commands[0]).toMatchObject({ start: { x: 5, y: 5 }, end: { x: 15, y: 5 } });
    expect(commands[1].end).toEqual({ x: 0, y: 0 });
  });
});

// Block-local command fixtures (start/end as recorded inside a path block).
function cmd(command: string, args: number[], start: [number, number], end: [number, number]): PathBlockCommand {
  return { command, args, start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] } };
}

const closedWithTail: PathBlockCommand[] = [
  cmd('h', [10], [0, 0], [10, 0]),
  cmd('v', [10], [10, 0], [10, 10]),
  cmd('z', [], [10, 10], [0, 0]),
  cmd('h', [5], [0, 0], [5, 0]),
];

describe('path-data: commandsToRelativeD', () => {
  it('serializes the full command set from start/end deltas', () => {
    const commands: PathBlockCommand[] = [
      cmd('h', [10], [0, 0], [10, 0]),
      cmd('c', [1, 2, 3, 4, 5, 6], [10, 0], [15, 6]),
      cmd('q', [1, 1, 4, 0], [15, 6], [19, 6]),
      cmd('a', [5, 5, 0, 0, 1, 5, 5], [19, 6], [24, 11]),
      cmd('l', [2, 2], [24, 11], [26, 13]),
      cmd('z', [], [26, 13], [0, 0]),
    ];
    expect(commandsToRelativeD(commands)).toBe('h 10 c 1 2 3 4 5 6 q 1 1 4 0 a 5 5 0 0 1 5 5 l 2 2 z');
  });

  it('is cursor-aware across z: a following m is relative to the subpath start', () => {
    // After z the pen is at (0,0); the move to (30,30) must be m 30 30 —
    // the naive end-minus-start serializer would emit a wrong delta.
    const commands: PathBlockCommand[] = [
      cmd('h', [10], [0, 0], [10, 0]),
      cmd('z', [], [10, 0], [0, 0]),
      cmd('m', [30, 30], [0, 0], [30, 30]),
      cmd('h', [5], [30, 30], [35, 30]),
    ];
    expect(commandsToRelativeD(commands)).toBe('h 10 z m 30 30 h 5');
  });

  it('bridges the origin gap when the first command starts off-origin', () => {
    const commands: PathBlockCommand[] = [cmd('l', [50, 0], [5, 0], [55, 0]), cmd('z', [], [55, 0], [5, 0])];
    expect(commandsToRelativeD(commands, { bridgeOriginGap: true })).toBe('m 5 0 l 50 0 z');
    expect(commandsToRelativeD(commands)).toBe('l 50 0 z');
  });

  it('honors a custom number formatter (legacy annotated toFixed(4))', () => {
    const legacyFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));
    const commands: PathBlockCommand[] = [cmd('l', [], [0, 0], [10.123456789, 5.000000000000001])];
    expect(commandsToRelativeD(commands, { format: legacyFmt })).toBe('l 10.1235 5');
    expect(commandsToRelativeD(commands)).toBe('l 10.123456789 5.000000000000001');
  });
});

describe('path-data: serializeRelativeAndTrack', () => {
  it('produces the identical d string as commandsToRelativeD', () => {
    const ctx = createPathContext();
    const { d } = serializeRelativeAndTrack(closedWithTail, ctx, { bridgeOriginGap: true });
    expect(d).toBe(commandsToRelativeD(closedWithTail, { bridgeOriginGap: true }));
  });

  it('tracks the live context identically to parsing the serialized string (round-trip parity)', () => {
    const fixtures: { commands: PathBlockCommand[]; opts: Parameters<typeof serializeRelativeAndTrack>[2] }[] = [
      { commands: closedWithTail, opts: {} },
      { commands: closedWithTail, opts: { moveTo: { x: 20, y: 20 } } },
      {
        commands: [cmd('l', [50, 0], [5, 0], [55, 0]), cmd('z', [], [55, 0], [5, 0])],
        opts: { bridgeOriginGap: true, moveTo: { x: 10, y: 10 } },
      },
      {
        commands: [
          cmd('c', [1.5, 2.25, 3, 4, 5.000000000000001, 6], [0, 0], [5.000000000000001, 6]),
          cmd('a', [5, 5, 0, 0, 1, 5, 5], [5.000000000000001, 6], [10.000000000000002, 11]),
        ],
        opts: { moveTo: { x: 1.234567891, y: 2 } },
      },
    ];
    for (const { commands, opts } of fixtures) {
      const liveCtx = createPathContext();
      const { d, tracked } = serializeRelativeAndTrack(commands, liveCtx, opts);
      // Old pipeline: serialize, then regex-reparse against a fresh context.
      const reparseCtx = createPathContext();
      const reparsed = parsePathStringToCommands(d, reparseCtx);
      expect(tracked).toEqual(reparsed);
      expect(liveCtx.position).toEqual(reparseCtx.position);
      expect(liveCtx.start).toEqual(reparseCtx.start);
    }
  });

  it('applies moveTo in world space while keeping the relative body block-local', () => {
    const ctx = createPathContext();
    const { d, tracked } = serializeRelativeAndTrack(closedWithTail, ctx, { moveTo: { x: 100, y: 200 } });
    expect(d).toBe('M 100 200 h 10 v 10 z h 5');
    expect(tracked[0]).toMatchObject({ command: 'M', args: [100, 200], end: { x: 100, y: 200 } });
    // z returns to (100,200); trailing h 5 lands at (105,200).
    expect(ctx.position).toEqual({ x: 105, y: 200 });
    expect(ctx.start).toEqual({ x: 100, y: 200 });
  });

  it('tracks the parsed-back FORMATTED numbers, not the raw floats', () => {
    const legacyFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));
    const ctx = createPathContext();
    const { tracked } = serializeRelativeAndTrack(
      [cmd('l', [], [0, 0], [10.123456789, 0])],
      ctx,
      { format: legacyFmt },
    );
    expect(tracked[0].args).toEqual([10.1235, 0]);
    expect(ctx.position).toEqual({ x: 10.1235, y: 0 });
  });
});

describe('path-data: splitPathCommands', () => {
  it('splits into command letters with trimmed raw arg text', () => {
    expect(splitPathCommands('M 10 20 L 30 40 a 5 5 0 0 1 5 5 z')).toEqual([
      { command: 'M', argsText: '10 20' },
      { command: 'L', argsText: '30 40' },
      { command: 'a', argsText: '5 5 0 0 1 5 5' },
      { command: 'z', argsText: '' },
    ]);
  });

  it('keeps exponent characters inside arg text and skips leading junk', () => {
    expect(splitPathCommands('  junk L 1e-2 5')).toEqual([{ command: 'L', argsText: '1e-2 5' }]);
  });
});
