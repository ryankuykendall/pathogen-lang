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
 * Extract attributes from SVG/XML elements by tag name.
 * Returns one Record<string, string> per matched opening tag.
 * Attribute-order independent — use with toMatchObject for resilient assertions.
 */
export function extractSVGElements(content: string, tag: string): Record<string, string>[] {
  const regex = new RegExp(`<${tag}\\b([^>]*)`, 'g');
  const elements: Record<string, string>[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const attrs: Record<string, string> = {};
    const attrRegex = /([\w-]+)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(match[1])) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    elements.push(attrs);
  }
  return elements;
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

/** The structural shape shared by PathBlockCommand, CommandTraceEntry, and `.commands` entries. */
export interface CommandLike {
  command: string;
  args: number[];
}

/**
 * Assert a structured command list — `compile(src, { trace: true }).commands`,
 * a layer's `commands`, `compileWithContext(...).context.commands`, or a
 * PathBlockValue's `commands` — matches the expected sequence with float
 * tolerance. Pass a whole result / context object and its `commands` array
 * is used.
 */
export function expectCommandSequence(
  input: CommandLike[] | { commands?: CommandLike[] },
  expected: [string, ...number[]][],
  options?: { precision?: number },
): void {
  const commands = Array.isArray(input) ? input : (input.commands ?? []);
  const precision = options?.precision ?? 10;
  const tolerance = 10 ** -precision;
  const fmt = (c: CommandLike) => `${c.command} ${c.args.join(' ')}`.trim();
  const expectedCmds: CommandLike[] = expected.map(([command, ...args]) => ({ command, args }));
  const full = () =>
    `\n  Full expected: ${expectedCmds.map(fmt).join('  ')}\n  Full received: ${commands.map(fmt).join('  ')}`;

  expect(commands.length, `Expected ${expectedCmds.length} commands but got ${commands.length}.${full()}`).toBe(
    expectedCmds.length,
  );
  for (let i = 0; i < expectedCmds.length; i++) {
    const exp = expectedCmds[i];
    const got = commands[i];
    if (exp.command !== got.command || exp.args.length !== got.args.length) {
      throw new Error(`Command mismatch at index ${i}:\n  Expected: ${fmt(exp)}\n  Received: ${fmt(got)}${full()}`);
    }
    for (let j = 0; j < exp.args.length; j++) {
      if (Math.abs(exp.args[j] - got.args[j]) > tolerance) {
        throw new Error(
          `Command mismatch at index ${i}, arg ${j}:\n  Expected: ${fmt(exp)}\n  Received: ${fmt(got)}${full()}`,
        );
      }
    }
  }
}
