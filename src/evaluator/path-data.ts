/**
 * Single shared SVG path-data module for the evaluator and the render pipeline.
 *
 * Replaces the near-duplicate regex tokenizers that used to live in
 * segments.ts (NUMBER_REGEX / commandRegex) and the retired annotated
 * evaluator, and the two diverging commandsToRelativeD serializers, with
 * one cursor-based tokenizer and one cursor-aware serializer.
 *
 * `serializeRelativeAndTrack` removes the serialize→reparse round-trip that
 * draw()/drawTo() previously performed: it serializes commands AND applies the
 * exact parsed-back numbers to the live PathContext in a single walk, so the
 * tracked positions stay bit-identical to the old serialize-then-regex-reparse
 * pipeline by construction.
 */
import { createPathContext, updateContextForCommand, type PathContext } from './context';
import { formatNum } from './format';

import type { PathBlockCommand, PathCommandMeta } from './types';

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

/** Display-only split preserving raw arg text (no numeric round-trip). */
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
  /**
   * Start the walk's cursor at this point instead of (0,0). Required when
   * the caller's commands are ALREADY WORLD-SPACE (ProjectedPath values):
   * a mid-list `m` computes its delta from the cursor, and a (0,0) cursor
   * against world coordinates double-offsets every subsequent subpath
   * (boolean-op results, cut pieces with holes). Block-local callers must
   * NOT set this — their commands live in the (0,0)-based block frame.
   */
  startCursor?: { x: number; y: number };
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
  emit: (letter: string, formattedArgs: string[], source?: PathBlockCommand) => void,
): void {
  const fmt = opts.format ?? formatNum;
  let cursorX = opts.startCursor ? opts.startCursor.x : 0;
  let cursorY = opts.startCursor ? opts.startCursor.y : 0;
  let subpathStartX = cursorX;
  let subpathStartY = cursorY;
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
      emit('z', [], cmd);
      cursorX = subpathStartX;
      cursorY = subpathStartY;
    } else if (c === 'm') {
      // Move: relative displacement from the actual cursor position.
      const mx = cmd.end.x - cursorX;
      const my = cmd.end.y - cursorY;
      emit('m', [fmt(mx), fmt(my)], cmd);
      cursorX = cmd.end.x;
      cursorY = cmd.end.y;
      subpathStartX = cmd.end.x;
      subpathStartY = cmd.end.y;
    } else {
      const dx = cmd.end.x - cmd.start.x;
      const dy = cmd.end.y - cmd.start.y;
      if (c === 'h') {
        emit('h', [fmt(dx)], cmd);
      } else if (c === 'v') {
        emit('v', [fmt(dy)], cmd);
      } else if (c === 'c') {
        const [dx1, dy1, dx2, dy2] = cmd.args;
        emit('c', [fmt(dx1), fmt(dy1), fmt(dx2), fmt(dy2), fmt(dx), fmt(dy)], cmd);
      } else if (c === 's') {
        const [dx2, dy2] = cmd.args;
        emit('s', [fmt(dx2), fmt(dy2), fmt(dx), fmt(dy)], cmd);
      } else if (c === 'q') {
        const [dx1, dy1] = cmd.args;
        emit('q', [fmt(dx1), fmt(dy1), fmt(dx), fmt(dy)], cmd);
      } else if (c === 't') {
        emit('t', [fmt(dx), fmt(dy)], cmd);
      } else if (c === 'a') {
        const [rx, ry, rotation, largeArc, sweep] = cmd.args;
        emit('a', [fmt(rx), fmt(ry), fmt(rotation), fmt(largeArc), fmt(sweep), fmt(dx), fmt(dy)], cmd);
      } else {
        // l → relative line (and the historical catch-all for anything else)
        emit(c, [fmt(dx), fmt(dy)], cmd);
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

// ── Arbitrary d input → normalized commands → absolute d ────────────────
//
// Additive support for the export-time optimization passes (precision
// trimming, decimation). Nothing here is used by the evaluator's own
// serialization, whose byte-locked defaults are unchanged.

/** Args consumed per command-letter group (SVG grammar). */
const COMMAND_ARITY: Record<string, number> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
};

/**
 * Expand multi-group commands (`L 10 10 20 20` → two `L`s) into one command
 * per argument group, applying the SVG rule that argument groups after the
 * first on an `M`/`m` are implicit LineTos. Incomplete trailing groups are
 * dropped. Evaluator-generated strings are single-group already; this makes
 * downstream passes safe for arbitrary well-formed d input.
 */
export function expandCommandGroups(raw: RawPathCommand[]): RawPathCommand[] {
  const out: RawPathCommand[] = [];
  for (const cmd of raw) {
    const upper = cmd.command.toUpperCase();
    const arity = COMMAND_ARITY[upper];
    if (arity === undefined) continue;
    if (arity === 0) {
      out.push(cmd);
      continue;
    }
    if (cmd.args.length < arity) continue; // incomplete group — drop
    if (cmd.args.length === arity) {
      out.push(cmd);
      continue;
    }
    const isRelative = cmd.command !== upper;
    for (let i = 0; i + arity <= cmd.args.length; i += arity) {
      let letter = cmd.command;
      if (upper === 'M' && i > 0) letter = isRelative ? 'l' : 'L';
      out.push({ command: letter, args: cmd.args.slice(i, i + arity) });
    }
  }
  return out;
}

/**
 * Parse arbitrary well-formed path data into single-group commands with
 * absolute start/end tracking (multi-group commands expanded per the SVG
 * grammar). Unlike parsePathStringToCommands, safe for input the evaluator
 * did not generate.
 *
 * Smooth shorthands are normalized away: `S`→explicit `C` and `T`→explicit
 * `Q`, with the reflected control point resolved HERE, while the original
 * command adjacency is still known. Downstream passes (decimation) may remove
 * commands; a surviving raw `S`/`T` would then silently reflect off whatever
 * unrelated curve precedes it in the output stream — an unbounded shape
 * change. Explicit controls make every command self-contained.
 */
export function parsePathDataExpanded(
  d: string,
  startPos: { x: number; y: number } = { x: 0, y: 0 },
): PathBlockCommand[] {
  const scratch = createPathContext({});
  scratch.position = { x: startPos.x, y: startPos.y };
  scratch.start = { x: startPos.x, y: startPos.y };
  const commands: PathBlockCommand[] = [];
  // Absolute control points driving S/T reflection (SVG rules: reflection
  // applies only when the previous command is same-family, else the control
  // collapses to the current point).
  let prevCubicCtrl: { x: number; y: number } | null = null;
  let prevQuadCtrl: { x: number; y: number } | null = null;

  for (const raw of expandCommandGroups(tokenizePathData(d))) {
    const pos = { x: scratch.position.x, y: scratch.position.y };
    let command = raw.command;
    let args = raw.args;
    const upper = command.toUpperCase();
    const isRelative = command !== upper;

    if (upper === 'S') {
      const x2 = isRelative ? pos.x + args[0] : args[0];
      const y2 = isRelative ? pos.y + args[1] : args[1];
      const ex = isRelative ? pos.x + args[2] : args[2];
      const ey = isRelative ? pos.y + args[3] : args[3];
      const x1 = prevCubicCtrl ? 2 * pos.x - prevCubicCtrl.x : pos.x;
      const y1 = prevCubicCtrl ? 2 * pos.y - prevCubicCtrl.y : pos.y;
      command = 'C';
      args = [x1, y1, x2, y2, ex, ey];
    } else if (upper === 'T') {
      const ex = isRelative ? pos.x + args[0] : args[0];
      const ey = isRelative ? pos.y + args[1] : args[1];
      const qx = prevQuadCtrl ? 2 * pos.x - prevQuadCtrl.x : pos.x;
      const qy = prevQuadCtrl ? 2 * pos.y - prevQuadCtrl.y : pos.y;
      command = 'Q';
      args = [qx, qy, ex, ey];
    }

    // Track reflection state from the (possibly rewritten) command.
    const u = command.toUpperCase();
    const rel = command !== u;
    if (u === 'C') {
      prevCubicCtrl = { x: rel ? pos.x + args[2] : args[2], y: rel ? pos.y + args[3] : args[3] };
      prevQuadCtrl = null;
    } else if (u === 'Q') {
      prevQuadCtrl = { x: rel ? pos.x + args[0] : args[0], y: rel ? pos.y + args[1] : args[1] };
      prevCubicCtrl = null;
    } else {
      prevCubicCtrl = null;
      prevQuadCtrl = null;
    }

    updateContextForCommand(scratch, command, args);
    commands.push({
      command,
      args,
      start: pos,
      end: { x: scratch.position.x, y: scratch.position.y },
    });
  }
  return commands;
}

export interface AbsoluteDOptions {
  /** Number formatter; defaults to String (full precision). */
  format?: (n: number) => string;
}

/**
 * Serialize commands as ABSOLUTE path data (uppercase letters, world
 * coordinates). Relative curve control points are absolutized against each
 * command's tracked start point. Rounding absolute coordinates never
 * accumulates drift the way rounding relative deltas does, which is why the
 * export-time passes emit through this rather than commandsToRelativeD.
 * Expects single-group commands (see parsePathDataExpanded).
 *
 * Note: parsePathDataExpanded never yields `S`/`T` (normalized to explicit
 * `C`/`Q` at parse time); the S/T branches below exist only for
 * evaluator-native command lists, where original adjacency is guaranteed.
 */
export function commandsToAbsoluteD(commands: PathBlockCommand[], opts: AbsoluteDOptions = {}): string {
  const fmt = opts.format ?? String;
  const parts: string[] = [];
  for (const cmd of commands) {
    const upper = cmd.command.toUpperCase();
    const isRelative = cmd.command !== upper;
    const { start, end, args } = cmd;
    switch (upper) {
      case 'Z':
        parts.push('Z');
        break;
      case 'M':
        parts.push(`M ${fmt(end.x)} ${fmt(end.y)}`);
        break;
      case 'L':
      case 'T':
        parts.push(`${upper} ${fmt(end.x)} ${fmt(end.y)}`);
        break;
      case 'H':
        parts.push(`H ${fmt(end.x)}`);
        break;
      case 'V':
        parts.push(`V ${fmt(end.y)}`);
        break;
      case 'C': {
        const [a1, a2, a3, a4] = args;
        const x1 = isRelative ? start.x + a1 : a1;
        const y1 = isRelative ? start.y + a2 : a2;
        const x2 = isRelative ? start.x + a3 : a3;
        const y2 = isRelative ? start.y + a4 : a4;
        parts.push(`C ${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(end.x)} ${fmt(end.y)}`);
        break;
      }
      case 'S':
      case 'Q': {
        const [a1, a2] = args;
        const x1 = isRelative ? start.x + a1 : a1;
        const y1 = isRelative ? start.y + a2 : a2;
        parts.push(`${upper} ${fmt(x1)} ${fmt(y1)} ${fmt(end.x)} ${fmt(end.y)}`);
        break;
      }
      case 'A': {
        const [rx, ry, rotation, largeArc, sweep] = args;
        parts.push(
          `A ${fmt(rx)} ${fmt(ry)} ${fmt(rotation)} ${fmt(largeArc)} ${fmt(sweep)} ${fmt(end.x)} ${fmt(end.y)}`,
        );
        break;
      }
      default:
        // Unknown letters were filtered by expandCommandGroups; tolerate
        // evaluator-native lists by treating anything else as a line.
        parts.push(`L ${fmt(end.x)} ${fmt(end.y)}`);
        break;
    }
  }
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
  walkRelative(commands, opts, (letter, formattedArgs, source) => {
    parts.push(joinEmitted(letter, formattedArgs));
    const args = formattedArgs.map((s) => parseFloat(s));
    const start = { x: ctx.position.x, y: ctx.position.y };
    updateContextForCommand(ctx, letter, args);
    // Carry labels / seam / call identity into the receiving store so
    // layer('x').segment('lid') finds geometry drawn from a labeled block;
    // pending corner ops were consumed by the source block and are stripped.
    const meta = source ? derivedMeta(source.meta) : undefined;
    tracked.push({
      command: letter,
      args,
      start,
      end: { x: ctx.position.x, y: ctx.position.y },
      ...(meta !== undefined ? { meta } : {}),
    });
  });
  return { d: parts.join(' '), tracked };
}

// ---------------------------------------------------------------------------
// Shared command/meta rules (single home; segments.ts re-exports the meta ones)
// ---------------------------------------------------------------------------

/**
 * Normalize a raw path-context history entry to the PathBlockCommand invariant:
 * command is lowercase, and positional args are relative to the command's start point.
 *
 * The context history preserves the original command character (so 'Q' stays 'Q') and
 * stores args exactly as the source wrote them. For uppercase (absolute) originals, the
 * args are absolute coordinates and must be converted to relative before the lowercased
 * command is stored on the PathBlockValue.
 *
 * After the stdlib-to-relative refactor, shape helpers (circle, rect, roundRect, polygon,
 * star, line, quadratic, cubic) emit absolute `M` + relative body, so this helper is a
 * no-op for their body commands. It still runs meaningfully for:
 *   - The initial absolute `M` those shapes emit (M → m: no arg read by the emitter, but
 *     we normalize for interface consistency).
 *   - Continuation helpers that stay uppercase: arc (A), moveTo (M), lineTo (L),
 *     closePath (Z) — for these, commandsToRelativeD reads only non-positional args or
 *     end/start deltas, but consistency of the interface still matters.
 */
export function normalizeToRelativeArgs(command: string, args: number[], start: { x: number; y: number }): number[] {
  // Already lowercase: args are already relative
  if (command === command.toLowerCase()) return [...args];
  const sx = start.x;
  const sy = start.y;
  const c = command.toUpperCase();
  switch (c) {
    case 'M':
    case 'L':
    case 'T':
      return [args[0] - sx, args[1] - sy];
    case 'H':
      return [args[0] - sx];
    case 'V':
      return [args[0] - sy];
    case 'C':
      return [args[0] - sx, args[1] - sy, args[2] - sx, args[3] - sy, args[4] - sx, args[5] - sy];
    case 'S':
    case 'Q':
      return [args[0] - sx, args[1] - sy, args[2] - sx, args[3] - sy];
    case 'A':
      // rx, ry, rotation, large-arc, sweep are non-positional; only end (args[5], args[6]) is positional
      return [args[0], args[1], args[2], args[3], args[4], args[5] - sx, args[6] - sy];
    case 'Z':
      return [];
    default:
      return [...args];
  }
}

export function normalizeMeta(meta: PathCommandMeta | undefined): PathCommandMeta | undefined {
  if (!meta) return undefined;
  const endVertex =
    meta.endVertex && (meta.endVertex.label !== undefined || meta.endVertex.cornerOp !== undefined)
      ? meta.endVertex
      : undefined;
  if (
    meta.segmentLabel === undefined &&
    endVertex === undefined &&
    meta.seamId === undefined &&
    meta.call === undefined
  ) {
    return undefined;
  }
  return {
    ...(meta.segmentLabel !== undefined ? { segmentLabel: meta.segmentLabel } : {}),
    ...(endVertex ? { endVertex } : {}),
    ...(meta.seamId !== undefined ? { seamId: meta.seamId } : {}),
    ...(meta.call !== undefined ? { call: meta.call } : {}),
  };
}

/**
 * Meta for a DERIVED path (transform/boolean/cut result): labels carry, but
 * pending corner-op suffixes are consumed by the source block and must not
 * re-apply at the derived block's emit-time finalization — carrying them
 * would change the geometry of existing programs.
 */
export function derivedMeta(meta: PathCommandMeta | undefined): PathCommandMeta | undefined {
  if (!meta) return undefined;
  const endVertexLabel = meta.endVertex?.label;
  return normalizeMeta({
    ...(meta.segmentLabel !== undefined ? { segmentLabel: meta.segmentLabel } : {}),
    ...(endVertexLabel !== undefined ? { endVertex: { label: endVertexLabel } } : {}),
    // seamId is label-like identity, not a pending geometric op — it
    // carries (the corner-op strip rationale doesn't apply).
    ...(meta.seamId !== undefined ? { seamId: meta.seamId } : {}),
    // call provenance is identity too — a transformed circle is still the
    // circle statement's geometry.
    ...(meta.call !== undefined ? { call: meta.call } : {}),
  });
}
