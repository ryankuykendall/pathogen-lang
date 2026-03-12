import { expect } from 'vitest';

import { parseSVGPath } from './helpers';

import type { ParsedCommand } from './helpers';

function formatCommand(cmd: ParsedCommand): string {
  if (cmd.args.length === 0) return cmd.command;
  return `${cmd.command} ${cmd.args.join(' ')}`;
}

expect.extend({
  toMatchSVGPath(received: string, expected: ParsedCommand[], options?: { precision?: number }) {
    const precision = options?.precision ?? 10;
    const parsed = parseSVGPath(received);

    if (parsed.length !== expected.length) {
      return {
        pass: false,
        message: () =>
          `Expected ${expected.length} SVG commands but received ${parsed.length}.\n` +
          `  Expected: ${expected.map(formatCommand).join('  ')}\n` +
          `  Received: ${parsed.map(formatCommand).join('  ')}`,
      };
    }

    for (let i = 0; i < expected.length; i++) {
      const exp = expected[i];
      const got = parsed[i];

      if (exp.command !== got.command) {
        return {
          pass: false,
          message: () =>
            `SVG path command mismatch at index ${i}:\n` +
            `  Expected command: ${exp.command}\n` +
            `  Received command: ${got.command}\n` +
            `  Full expected: ${expected.map(formatCommand).join('  ')}\n` +
            `  Full received: ${parsed.map(formatCommand).join('  ')}`,
        };
      }

      if (exp.args.length !== got.args.length) {
        return {
          pass: false,
          message: () =>
            `SVG path arg count mismatch at index ${i} (${got.command}):\n` +
            `  Expected ${exp.args.length} args: ${formatCommand(exp)}\n` +
            `  Received ${got.args.length} args: ${formatCommand(got)}`,
        };
      }

      const tolerance = Math.pow(10, -precision);
      for (let j = 0; j < exp.args.length; j++) {
        if (Math.abs(exp.args[j] - got.args[j]) > tolerance) {
          return {
            pass: false,
            message: () =>
              `SVG path value mismatch at index ${i}, arg ${j}:\n` +
              `  Expected: ${formatCommand(exp)}\n` +
              `  Received: ${formatCommand(got)}\n` +
              `  Full expected: ${expected.map(formatCommand).join('  ')}\n` +
              `  Full received: ${parsed.map(formatCommand).join('  ')}`,
          };
        }
      }
    }

    return {
      pass: true,
      message: () => `SVG path matches expected command sequence`,
    };
  },

  toContainSVGCommands(received: string, commands: string[]) {
    const parsed = parseSVGPath(received);
    const actualCommands = parsed.map((c) => c.command);

    let searchIdx = 0;
    const missing: Array<{ command: string; index: number }> = [];

    for (let i = 0; i < commands.length; i++) {
      const found = actualCommands.indexOf(commands[i], searchIdx);
      if (found === -1) {
        missing.push({ command: commands[i], index: i });
      } else {
        searchIdx = found + 1;
      }
    }

    return {
      pass: missing.length === 0,
      message: () =>
        missing.length === 0
          ? `SVG path contains expected command sequence`
          : `SVG path missing commands in sequence:\n` +
            `  Missing: ${missing.map((m) => `${m.command} (at expected index ${m.index})`).join(', ')}\n` +
            `  Expected sequence: [${commands.join(', ')}]\n` +
            `  Actual commands: [${actualCommands.join(', ')}]`,
    };
  },

  toHaveSVGCommandCount(received: string, command: string, count: number) {
    const parsed = parseSVGPath(received);
    const actual = parsed.filter((c) => c.command.toLowerCase() === command.toLowerCase()).length;

    return {
      pass: actual === count,
      message: () =>
        actual === count
          ? `SVG path has ${count} '${command}' commands`
          : `Expected ${count} '${command}' commands but found ${actual}.\n` +
            `  Full path: ${received}`,
    };
  },

  toClosePath(received: string) {
    const parsed = parseSVGPath(received);
    const lastCmd = parsed[parsed.length - 1];
    const closes = lastCmd && (lastCmd.command === 'Z' || lastCmd.command === 'z');

    return {
      pass: !!closes,
      message: () =>
        closes
          ? `SVG path closes with Z/z`
          : `Expected SVG path to end with Z/z but last command is '${lastCmd?.command ?? '(empty)'}'\n` +
            `  Full path: ${received}`,
    };
  },
});
