import { expect } from 'vitest';

import { compile } from '../src';

import type { CompileOptions } from '../src';

/**
 * Compile source and return just the default layer's path data string.
 * Convenience wrapper for tests that don't need the full CompileResult.
 */
export function compilePath(source: string, options?: CompileOptions): string {
  return compile(source, options).layers[0]?.data ?? '';
}

// --- SVG Path Parsing Utilities ---

export interface ParsedCommand {
  command: string; // M, m, L, l, H, h, V, v, C, c, S, s, Q, q, T, t, A, a, Z, z
  args: number[];
}

const CMD_RE = /([MmLlHhVvCcSsQqTtAaZz])\s*((?:[^MmLlHhVvCcSsQqTtAaZz])*)/g;
const NUM_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

/**
 * Parse an SVG path d-string into structured commands.
 * Handles negative numbers, scientific notation, missing spaces, and Z without args.
 */
export function parseSVGPath(d: string): ParsedCommand[] {
  const commands: ParsedCommand[] = [];
  let match: RegExpExecArray | null;
  CMD_RE.lastIndex = 0;

  while ((match = CMD_RE.exec(d)) !== null) {
    const command = match[1];
    const argStr = match[2].trim();
    const args: number[] = [];

    if (argStr) {
      let numMatch: RegExpExecArray | null;
      NUM_RE.lastIndex = 0;
      while ((numMatch = NUM_RE.exec(argStr)) !== null) {
        args.push(parseFloat(numMatch[0]));
      }
    }

    commands.push({ command, args });
  }

  return commands;
}

/** Alias for parseSVGPath — reads better in matcher contexts */
export function svgPath(d: string): ParsedCommand[] {
  return parseSVGPath(d);
}

/** Alias for parseSVGPath — reads better when extracting for inspection */
export function extractSVGCommands(d: string): ParsedCommand[] {
  return parseSVGPath(d);
}

/**
 * Format a parsed command as a readable string: "M 50 100"
 */
function formatCommand(cmd: ParsedCommand): string {
  if (cmd.args.length === 0) return cmd.command;
  return `${cmd.command} ${cmd.args.join(' ')}`;
}

/**
 * Assert that an SVG path d-string matches an expected command sequence.
 *
 * Error messages show:
 * - Which command index mismatched
 * - Expected vs received for that command
 * - Full expected and received paths
 */
export function expectSVGPathCommandSequence(
  result: string,
  expected: Array<[string, ...number[]]>,
  options?: { precision?: number },
): void {
  const precision = options?.precision ?? 10;
  const parsed = parseSVGPath(result);

  const expectedCmds: ParsedCommand[] = expected.map(([command, ...args]) => ({
    command,
    args,
  }));

  expect(parsed.length, `Expected ${expectedCmds.length} commands but got ${parsed.length}.\n  Full received: ${parsed.map(formatCommand).join('  ')}`).toBe(expectedCmds.length);

  for (let i = 0; i < expectedCmds.length; i++) {
    const exp = expectedCmds[i];
    const got = parsed[i];

    if (exp.command !== got.command) {
      throw new Error(
        `SVG path command mismatch at index ${i}:\n` +
        `  Expected: ${formatCommand(exp)}\n` +
        `  Received: ${formatCommand(got)}\n` +
        `  Full expected: ${expectedCmds.map(formatCommand).join('  ')}\n` +
        `  Full received: ${parsed.map(formatCommand).join('  ')}`,
      );
    }

    expect(got.args.length, `SVG path arg count mismatch at index ${i} (${got.command}): expected ${exp.args.length} args, got ${got.args.length}`).toBe(exp.args.length);

    for (let j = 0; j < exp.args.length; j++) {
      const expVal = exp.args[j];
      const gotVal = got.args[j];
      const diff = Math.abs(expVal - gotVal);
      const tolerance = Math.pow(10, -precision);

      if (diff > tolerance) {
        throw new Error(
          `SVG path command mismatch at index ${i}, arg ${j}:\n` +
          `  Expected: ${formatCommand(exp)}\n` +
          `  Received: ${formatCommand(got)}\n` +
          `  Full expected: ${expectedCmds.map(formatCommand).join('  ')}\n` +
          `  Full received: ${parsed.map(formatCommand).join('  ')}`,
        );
      }
    }
  }
}
