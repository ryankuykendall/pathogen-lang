/**
 * Single shared SVG path-data module for both evaluators.
 *
 * Replaces the three near-duplicate regex tokenizers (segments.ts NUMBER_REGEX
 * / commandRegex, annotated.ts parseAndTrackPathString, annotated.ts
 * emitPathString) and the two diverging commandsToRelativeD serializers with
 * one cursor-based tokenizer and one cursor-aware serializer.
 *
 * `serializeRelativeAndTrack` removes the serialize→reparse round-trip that
 * draw()/drawTo() previously performed: it serializes commands AND applies the
 * exact parsed-back numbers to the live PathContext in a single walk, so the
 * tracked positions stay bit-identical to the old serialize-then-regex-reparse
 * pipeline by construction.
 */
import type { PathBlockCommand } from './types';
import { createPathContext, updateContextForCommand, type PathContext } from './context';
import { formatNum } from './format';

// ── Tokenizer ──────────────────────────────────────────────────────────

export interface RawPathCommand {
  command: string;
  args: number[];
}

const COMMAND_LETTERS = new Set('MLHVCSQTAZmlhvcsqtaz');
const isDigit = (ch: string) => ch >= '0' && ch <= '9';

/**
 * Cursor-based scanner for SVG path data. Handles what the old regexes
 * mis-tokenized: implicit-decimal chains (`1.5.5` → 1.5, .5), packed arc
 * flags (`A 5 5 0 1110 0` → flags 1, 1 then 10, 0), sign-as-separator
 * (`10-5`), exponents in both cases, and packed comma/space separators.
 *
 * Arity is deliberately NOT enforced: all numbers between two command letters
 * stay bucketed on the preceding command (matching the previous parser
 * design) — except arc commands, whose flag slots (indices 3 and 4 of each
 * 7-arg group) consume exactly one digit per the SVG grammar.
 */
export function tokenizePathData(d: string): RawPathCommand[] {
  const commands: RawPathCommand[] = [];
  let current: RawPathCommand | null = null;
  let i = 0;
  const len = d.length;

  while (i < len) {
    const ch = d[i];

    if (COMMAND_LETTERS.has(ch)) {
      current = { command: ch, args: [] };
      commands.push(current);
      i++;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ',') {
      i++;
      continue;
    }

    if (current !== null && (isDigit(ch) || ch === '-' || ch === '+' || ch === '.')) {
      const isArc = current.command === 'a' || current.command === 'A';
      if (isArc && (current.args.length % 7 === 3 || current.args.length % 7 === 4)) {
        // Arc flag slot: consumes exactly one digit (SVG grammar), which is
        // what makes packed forms like `1110` parse as 1, 1, 10.
        if (isDigit(ch)) {
          current.args.push(ch === '0' ? 0 : 1);
          i++;
          continue;
        }
        // A sign or dot in a flag slot is malformed (flags must be bare 0/1);
        // fall through to the number scanner so the value lands somewhere
        // rather than looping. NOTE: slot alignment is not re-validated after
        // this — a decimal in a flag slot (e.g. `A 5 5 0 1.0 1 50 50`) shifts
        // subsequent args. Not reachable from evaluator-generated strings
        // (always space-separated bare flags); revisit before exposing this
        // tokenizer to raw user-pasted d strings.
      }
      const start = i;
      if (ch === '-' || ch === '+') i++;
      let sawDigit = false;
      while (i < len && isDigit(d[i])) {
        sawDigit = true;
        i++;
      }
      if (i < len && d[i] === '.') {
        i++;
        while (i < len && isDigit(d[i])) {
          sawDigit = true;
          i++;
        }
      }
      if (!sawDigit) {
        // Stray sign or dot with no digits — skip it (the old regex could
        // push NaN here; skipping is the deliberate fix).
        continue;
      }
      // Exponent only counts when followed by (signed) digits.
      if (i < len && (d[i] === 'e' || d[i] === 'E')) {
        let j = i + 1;
        if (j < len && (d[j] === '-' || d[j] === '+')) j++;
        if (j < len && isDigit(d[j])) {
          j++;
          while (j < len && isDigit(d[j])) j++;
          i = j;
        }
      }
      current.args.push(parseFloat(d.slice(start, i)));
      continue;
    }

    // Unrecognized character (or number before any command letter) — skip,
    // matching the old regex's silent tolerance of junk.
    i++;
  }

  return commands;
}

/** Display-only split preserving raw arg text (annotated emitPathString). */
export function splitPathCommands(d: string): { command: string; argsText: string }[] {
  const out: { command: string; argsText: string }[] = [];
  let i = 0;
  while (i < d.length && !COMMAND_LETTERS.has(d[i])) i++;
  while (i < d.length) {
    const command = d[i];
    let j = i + 1;
    while (j < d.length && !COMMAND_LETTERS.has(d[j])) j++;
    out.push({ command, argsText: d.slice(i + 1, j).trim() });
    i = j;
  }
  return out;
}

// ── String → structured commands (with context tracking) ───────────────

/**
 * Parse a path string, updating `ctx` per command, and return the structured
 * commands with exact start/end cursor positions.
 */
export function parsePathStringToCommands(pathStr: string, ctx: PathContext): PathBlockCommand[] {
  const commands: PathBlockCommand[] = [];
  for (const raw of tokenizePathData(pathStr)) {
    const start = { x: ctx.position.x, y: ctx.position.y };
    updateContextForCommand(ctx, raw.command, raw.args);
    commands.push({ command: raw.command, args: raw.args, start, end: { x: ctx.position.x, y: ctx.position.y } });
  }
  return commands;
}

/**
 * Parse a path string against a throwaway context seeded at `startPos`,
 * without touching any live context.
 */
export function parsePathStringAt(
  pathStr: string,
  startPos: { x: number; y: number },
  subpathStart?: { x: number; y: number },
): PathBlockCommand[] {
  const scratch = createPathContext({});
  scratch.position = { x: startPos.x, y: startPos.y };
  scratch.start = subpathStart ? { x: subpathStart.x, y: subpathStart.y } : { x: startPos.x, y: startPos.y };
  return parsePathStringToCommands(pathStr, scratch);
}

// ── Structured commands → relative d (single cursor-aware walk) ─────────

export interface RelativeDOptions {
  /**
   * When the first command starts off-origin (e.g. fillet-shifted closed
   * paths), prepend a relative `m` bridging the gap so the shape lands at the
   * cursor rather than teleporting.
   */
  bridgeOriginGap?: boolean;
  /** Number formatter; defaults to formatNum (respects --to-fixed). */
  format?: (n: number) => string;
}

export interface SerializeTrackOptions extends RelativeDOptions {
  /** Prepend an absolute `M x y` (drawTo semantics) before the relative body. */
  moveTo?: { x: number; y: number };
}

/**
 * The single serializer walk. Cursor-aware across `z` (after close, the pen
 * is at the subpath start, which may differ from the next command's recorded
 * `start`) — adopted from the main evaluator's implementation.
 */
function walkRelative(
  commands: PathBlockCommand[],
  opts: SerializeTrackOptions,
  emit: (letter: string, formattedArgs: string[]) => void,
): void {
  const fmt = opts.format ?? formatNum;
  let cursorX = 0;
  let cursorY = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;
  if (opts.moveTo) {
    // The emitted M is world-space; the walk's cursor stays BLOCK-LOCAL
    // (command start/end coords are block-local), exactly as when the caller
    // previously prepended `M x y` outside commandsToRelativeD. Tracking of
    // the M against the live world-space context happens in the emit callback.
    emit('M', [fmt(opts.moveTo.x), fmt(opts.moveTo.y)]);
  }
  if (opts.bridgeOriginGap && commands.length > 0) {
    const s = commands[0].start;
    if (Math.abs(s.x) > 1e-10 || Math.abs(s.y) > 1e-10) {
      emit('m', [fmt(s.x), fmt(s.y)]);
      cursorX = s.x;
      cursorY = s.y;
      subpathStartX = s.x;
      subpathStartY = s.y;
    }
  }
  for (const cmd of commands) {
    const c = cmd.command;
    if (c === 'z') {
      emit('z', []);
      cursorX = subpathStartX;
      cursorY = subpathStartY;
    } else if (c === 'm') {
      // Move: relative displacement from the actual cursor position.
      const mx = cmd.end.x - cursorX;
      const my = cmd.end.y - cursorY;
      emit('m', [fmt(mx), fmt(my)]);
      cursorX = cmd.end.x;
      cursorY = cmd.end.y;
      subpathStartX = cmd.end.x;
      subpathStartY = cmd.end.y;
    } else {
      const dx = cmd.end.x - cmd.start.x;
      const dy = cmd.end.y - cmd.start.y;
      if (c === 'h') {
        emit('h', [fmt(dx)]);
      } else if (c === 'v') {
        emit('v', [fmt(dy)]);
      } else if (c === 'c') {
        const [dx1, dy1, dx2, dy2] = cmd.args;
        emit('c', [fmt(dx1), fmt(dy1), fmt(dx2), fmt(dy2), fmt(dx), fmt(dy)]);
      } else if (c === 's') {
        const [dx2, dy2] = cmd.args;
        emit('s', [fmt(dx2), fmt(dy2), fmt(dx), fmt(dy)]);
      } else if (c === 'q') {
        const [dx1, dy1] = cmd.args;
        emit('q', [fmt(dx1), fmt(dy1), fmt(dx), fmt(dy)]);
      } else if (c === 't') {
        emit('t', [fmt(dx), fmt(dy)]);
      } else if (c === 'a') {
        const [rx, ry, rotation, largeArc, sweep] = cmd.args;
        emit('a', [fmt(rx), fmt(ry), fmt(rotation), fmt(largeArc), fmt(sweep), fmt(dx), fmt(dy)]);
      } else {
        // l → relative line (and the historical catch-all for anything else)
        emit(c, [fmt(dx), fmt(dy)]);
      }
      cursorX = cmd.end.x;
      cursorY = cmd.end.y;
    }
  }
}

function joinEmitted(letter: string, formattedArgs: string[]): string {
  return formattedArgs.length > 0 ? `${letter} ${formattedArgs.join(' ')}` : letter;
}

/** Serialize commands to a relative d string (no context involvement). */
export function commandsToRelativeD(commands: PathBlockCommand[], opts: RelativeDOptions = {}): string {
  const parts: string[] = [];
  walkRelative(commands, opts, (letter, args) => parts.push(joinEmitted(letter, args)));
  return parts.join(' ');
}

/**
 * The round-trip killer: serialize AND track in one walk. For each emitted
 * command the FORMATTED numbers are parsed back and applied to `ctx` via
 * updateContextForCommand — numeric parity with the old
 * serialize→regex-reparse pipeline by construction (the old pipeline also
 * rounded through the formatter before tracking).
 *
 * Callers that previously ran parseAndTrackPathString(emittedPath, scope)
 * must still call updateCtxVariable(scope) afterwards.
 */
export function serializeRelativeAndTrack(
  commands: PathBlockCommand[],
  ctx: PathContext,
  opts: SerializeTrackOptions = {},
): { d: string; tracked: PathBlockCommand[] } {
  const parts: string[] = [];
  const tracked: PathBlockCommand[] = [];
  walkRelative(commands, opts, (letter, formattedArgs) => {
    parts.push(joinEmitted(letter, formattedArgs));
    const args = formattedArgs.map((s) => parseFloat(s));
    const start = { x: ctx.position.x, y: ctx.position.y };
    updateContextForCommand(ctx, letter, args);
    tracked.push({ command: letter, args, start, end: { x: ctx.position.x, y: ctx.position.y } });
  });
  return { d: parts.join(' '), tracked };
}
