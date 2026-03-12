import type { ParsedCommand } from './helpers';

declare module 'vitest' {
  interface Assertion<T = unknown> {
    /** Validate full SVG path command sequence with float tolerance */
    toMatchSVGPath(expected: ParsedCommand[], options?: { precision?: number }): T;
    /** Validate command types appear in order (count and sequence) */
    toContainSVGCommands(commands: string[]): T;
    /** Validate exact occurrence count of a command type */
    toHaveSVGCommandCount(command: string, count: number): T;
    /** Validate path ends with Z/z */
    toClosePath(): T;
  }

  interface AsymmetricMatchersContaining {
    toMatchSVGPath(expected: ParsedCommand[], options?: { precision?: number }): unknown;
    toContainSVGCommands(commands: string[]): unknown;
    toHaveSVGCommandCount(command: string, count: number): unknown;
    toClosePath(): unknown;
  }
}
