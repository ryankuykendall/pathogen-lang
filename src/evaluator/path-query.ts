/**
 * Path query language — `query(sel)` / `queryAll(sel)` on PathBlock,
 * ProjectedPath, and layer receivers. Single home for the selector grammar,
 * the matcher, and the result-struct builders. Contract: docs/path-queries.md.
 *
 *   query      := selector ( ',' selector )*         one noun across the list
 *   selector   := compound ( WS compound )*          right side searched inside the left
 *   compound   := noun [ '(' arg (',' arg)* ')' ] filter* [ pseudo ]
 *   noun       := command | call | endpoint | segment | subpath
 *   filter     := '[' name [ op value ] ']'           op: = != < <= > >=
 *   pseudo     := :first | :last | :nth( index-list )
 *   index-spec := int | int..int | int..<int          negatives count from the end
 *
 * The legacy `segment/segmentAll/point/pointAll/vertex/vertexAll` methods keep
 * their own grammar in segments.ts; this module reuses their matchers where the
 * semantics coincide (labeled runs, endpoint labels, corner indexes).
 */
import { normalizeToRelativeArgs } from './path-data';
import { getEdgeTangentAtEnd, getEdgeTangentAtStart } from './path-transforms';
import { arcEndpointToCenter, calculateCommandLength, resolveSmooth, wrapToPi } from './sampling';
import {
  collectEndpointLabels,
  collectSegmentLabels,
  findLabeledRuns,
  firstInkedPointOf,
  locateCornerPos,
  recordsFromCommands,
} from './segments';
import { splitSubpaths, subpathIndexOf } from './subpaths';

import type { Point } from './context';
import type { SubpathSpan } from './subpaths';
import type {
  CallValue,
  CommandValue,
  EndpointValue,
  PathBlockCommand,
  PathBlockValue,
  ProjectedPathValue,
  QuerySource,
  SegmentValue,
  SubpathValue,
  Value,
} from './types';

// ---------------------------------------------------------------------------
// Grammar
// ---------------------------------------------------------------------------

export const QUERY_NOUNS = ['command', 'call', 'endpoint', 'segment', 'subpath'] as const;
export type QueryNoun = (typeof QUERY_NOUNS)[number];

export type FilterOp = '=' | '!=' | '<' | '<=' | '>' | '>=';
export interface QueryFilter {
  attr: string;
  op?: FilterOp;
  value?: string;
}
export type IndexSpec = { kind: 'index'; at: number } | { kind: 'range'; from: number; to: number; inclusive: boolean };
export interface QueryPseudo {
  kind: 'first' | 'last' | 'nth';
  specs: IndexSpec[];
}
export interface QueryCompound {
  noun: QueryNoun;
  /** Noun-specific selection keys; null = every one of the kind. */
  args: string[] | null;
  /** Parsed index specs for `subpath(...)`. */
  indexArgs: IndexSpec[] | null;
  filters: QueryFilter[];
  pseudo: QueryPseudo | null;
  text: string;
}
export interface QuerySelector {
  compounds: QueryCompound[];
}
export interface ParsedQuery {
  raw: string;
  noun: QueryNoun;
  selectors: QuerySelector[];
}

const FILTER_ATTRS = [
  'x',
  'y',
  'length',
  'index',
  'absolute',
  'relative',
  'closed',
  'label',
  'cornerOp',
  'x1',
  'y1',
  'x2',
  'y2',
  'rx',
  'ry',
  'rotation',
  'largeArc',
  'sweep',
];
const COMMAND_LETTERS = 'mlhvcsqtaz';
const COMMAND_LETTER_LIST = 'm, l, h, v, c, s, q, t, a, z';
const KIND_ALIASES: Record<string, string[]> = {
  line: ['l', 'h', 'v'],
  cubic: ['c', 's'],
  quadratic: ['q', 't'],
  curve: ['c', 's', 'q', 't'],
  arc: ['a'],
  move: ['m'],
  close: ['z'],
};
const NOUN_LIST = QUERY_NOUNS.join(', ');
const PSEUDO_HINT = 'use :first, :last, or :nth(k)';
const INDEX_HINT = 'use k, a..b, or a..<b (negative indexes count from the end)';

const isIdentStart = (ch: string) => /[A-Za-z]/.test(ch);
const isIdentChar = (ch: string) => /[A-Za-z0-9_-]/.test(ch);

class Parser {
  pos = 0;

  constructor(readonly raw: string) {}

  get atEnd() {
    return this.pos >= this.raw.length;
  }

  peek() {
    return this.raw[this.pos] ?? '';
  }

  skipWs() {
    while (!this.atEnd && /\s/.test(this.peek())) this.pos++;
  }

  fail(msg: string): never {
    throw new Error(`${msg} in '${this.raw}'`);
  }

  readIdent(): string {
    const start = this.pos;
    while (!this.atEnd && isIdentChar(this.peek())) this.pos++;
    return this.raw.slice(start, this.pos);
  }
  /** Read a balanced `(...)` or `[...]` body; returns the inner text. */

  readBracketed(open: string, close: string): string {
    if (this.peek() !== open) this.fail(`Expected '${open}'`);
    this.pos++;
    const start = this.pos;
    let depth = 1;
    while (!this.atEnd) {
      const ch = this.peek();
      if (ch === open) depth++;
      else if (ch === close && --depth === 0) break;
      this.pos++;
    }
    if (this.atEnd) this.fail(`Missing '${close}'`);
    const inner = this.raw.slice(start, this.pos);
    this.pos++;
    return inner;
  }
}

function parseIndexSpec(text: string, raw: string): IndexSpec {
  const t = text.trim();
  const single = /^(-?\d+)$/.exec(t);
  if (single) return { kind: 'index', at: Number(single[1]) };
  const range = /^(-?\d+)\.\.(<?)(-?\d+)$/.exec(t);
  if (range) return { kind: 'range', from: Number(range[1]), to: Number(range[3]), inclusive: range[2] !== '<' };
  throw new Error(`Invalid index spec '${t}' in '${raw}' — ${INDEX_HINT}`);
}

function parseIndexList(text: string, raw: string): IndexSpec[] {
  // An interpolated array arrives with its brackets — `:nth(${picks})` is
  // `:nth([2, 4, 6])` — so a bracketed list is the same list.
  const trimmed = text.trim();
  const body = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : text;
  const parts = body.split(',');
  if (parts.length === 1 && parts[0].trim() === '') throw new Error(`Empty index list in '${raw}' — ${INDEX_HINT}`);
  return parts.map((p) => parseIndexSpec(p, raw));
}

function parseFilter(text: string, p: Parser): QueryFilter {
  const m = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:(!=|<=|>=|==|=|<|>)\s*(.*?))?\s*$/.exec(text);
  if (!m) p.fail(`Malformed filter '[${text}]'`);
  const attr = m[1];
  if (!FILTER_ATTRS.includes(attr)) {
    p.fail(`Unknown filter '${attr}' — filters are ${FILTER_ATTRS.join(', ')}`);
  }
  if (m[2] === undefined) return { attr };
  const op = (m[2] === '==' ? '=' : m[2]) as FilterOp;
  if (m[3] === '') p.fail(`Filter '[${text}]' is missing a value`);
  return { attr, op, value: m[3] };
}

function expandCommandKinds(args: string[], p: Parser, text: string): string[] {
  const out: string[] = [];
  for (const arg of args) {
    const key = arg.trim();
    const lower = key.toLowerCase();
    if (KIND_ALIASES[lower]) out.push(...KIND_ALIASES[lower]);
    else if (lower.length === 1 && COMMAND_LETTERS.includes(lower)) out.push(lower);
    else {
      p.fail(
        `Unknown command kind '${key}' in '${text}' — use letters ${COMMAND_LETTER_LIST} or ${Object.keys(KIND_ALIASES).join(', ')}`,
      );
    }
  }
  return out;
}

function parseCompound(p: Parser): QueryCompound {
  const start = p.pos;
  const ident = p.readIdent();
  if (ident === '') p.fail(`Expected a noun (${NOUN_LIST}) at position ${p.pos}`);
  if (!(QUERY_NOUNS as readonly string[]).includes(ident)) {
    p.fail(`Unknown noun '${ident}' — nouns are ${NOUN_LIST}`);
  }
  const noun = ident as QueryNoun;
  let args: string[] | null = null;
  let indexArgs: IndexSpec[] | null = null;
  if (p.peek() === '(') {
    const inner = p.readBracketed('(', ')');
    const list = inner
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    const text = p.raw.slice(start, p.pos);
    // `noun()` and `noun(*)` both mean every one of the kind; `*` cannot be mixed with keys.
    if (list.length > 1 && list.includes('*')) {
      p.fail(`'*' selects every ${noun} — do not combine it with other keys in '${text}'`);
    }
    if (list.length > 0 && !(list.length === 1 && list[0] === '*')) {
      if (noun === 'command') args = expandCommandKinds(list, p, text);
      else if (noun === 'subpath') indexArgs = list.map((s) => parseIndexSpec(s, p.raw));
      else args = list;
    }
  }
  const filters: QueryFilter[] = [];
  while (p.peek() === '[') filters.push(parseFilter(p.readBracketed('[', ']'), p));
  let pseudo: QueryPseudo | null = null;
  if (p.peek() === ':') {
    p.pos++;
    const name = p.readIdent();
    if (name === 'atomic') {
      p.fail(`':atomic' is not available in query() — ${PSEUDO_HINT}; ':atomic' is only available on segmentAll()`);
    }
    if (name === 'first') pseudo = { kind: 'first', specs: [{ kind: 'index', at: 0 }] };
    else if (name === 'last') pseudo = { kind: 'last', specs: [{ kind: 'index', at: -1 }] };
    else if (name === 'nth') {
      if (p.peek() !== '(') p.fail(`':nth' needs an index list — ${INDEX_HINT}`);
      pseudo = { kind: 'nth', specs: parseIndexList(p.readBracketed('(', ')'), p.raw) };
    } else {
      p.fail(`Unknown pseudo-selector ':${name}' — ${PSEUDO_HINT}`);
    }
    if (p.peek() === ':') p.fail('One pseudo-selector per compound');
    if (p.peek() === '[') p.fail('Filters go before the pseudo-selector');
  }
  return { noun, args, indexArgs, filters, pseudo, text: p.raw.slice(start, p.pos) };
}

function parseSelector(p: Parser): QuerySelector {
  const compounds = [parseCompound(p)];
  for (;;) {
    p.skipWs();
    if (p.atEnd || p.peek() === ',') break;
    if (!isIdentStart(p.peek())) p.fail(`Unexpected '${p.peek()}' at position ${p.pos}`);
    compounds.push(parseCompound(p));
  }
  return { compounds };
}

/** Parse a query string. Throws a plain Error; callers add line formatting. */
export function parsePathQuery(raw: string): ParsedQuery {
  const p = new Parser(raw);
  const selectors: QuerySelector[] = [];
  for (;;) {
    p.skipWs();
    if (p.atEnd) {
      if (selectors.length === 0) p.fail('Empty query');
      p.fail('Trailing comma');
    }
    selectors.push(parseSelector(p));
    p.skipWs();
    if (p.atEnd) break;
    if (p.peek() === ',') {
      p.pos++;
      continue;
    }
    p.fail(`Unexpected '${p.peek()}' at position ${p.pos}`);
  }
  const nouns = [...new Set(selectors.map((s) => s.compounds[s.compounds.length - 1].noun))];
  if (nouns.length > 1) {
    throw new Error(
      `Query '${raw}' mixes nouns (${nouns.join(', ')}) — every selector in a comma list must share one noun`,
    );
  }
  return { raw, noun: nouns[0], selectors };
}

/** The noun a query returns, or null when the string does not parse — for editor typing. */
export function queryNounOf(raw: string): QueryNoun | null {
  try {
    return parsePathQuery(raw).noun;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

interface Match {
  noun: QueryNoun;
  from: number;
  to: number; // exclusive
  /** Position among its kind (segments: run index within the label group). */
  ordinal: number;
  label?: string;
  fn?: string;
  closed?: boolean;
}

/** Per-source derived data, computed once and cached for the source's lifetime. */
interface QueryEnv {
  commands: PathBlockCommand[];
  resolved: PathBlockCommand[]; // S/T resolved to C/Q for control points and tangents
  subpaths: SubpathSpan[];
  subpathOf: number[];
  calls: Match[];
  /** Endpoint ordinal per command index (-1 when the command is not a drawing command). */
  endpointOrdinal: number[];
  endpointCount: number;
  indexOf: Map<PathBlockCommand, number>;
}

const ENV_CACHE = new WeakMap<QuerySource, QueryEnv>();

const isMove = (c: string) => c === 'm' || c === 'M';
const isClose = (c: string) => c === 'z' || c === 'Z';
const EPS = 1e-9;

/**
 * A command that puts ink down. Moves never do; a straight command, a close
 * or an arc that ends where it started drew nothing (SVG omits such an arc
 * outright); a curve back to its own start still counts when a control
 * point gives it reach. Non-drawing commands are not endpoints and `next`
 * steps over them, so turns and headings always describe real strokes.
 */
function isDrawing(cmd: PathBlockCommand): boolean {
  if (isMove(cmd.command)) return false;
  const moved = Math.abs(cmd.end.x - cmd.start.x) > EPS || Math.abs(cmd.end.y - cmd.start.y) > EPS;
  if (moved) return true;
  const c = cmd.command.toLowerCase();
  if (isClose(c) || c === 'l' || c === 'h' || c === 'v' || c === 'a') return false;
  // c, s, q, t with no displacement: a loop if any explicit control point is off the start.
  const rel = normalizeToRelativeArgs(cmd.command, cmd.args, cmd.start);
  for (let i = 0; i + 1 < rel.length - 2; i += 2) {
    if (Math.abs(rel[i]) > EPS || Math.abs(rel[i + 1]) > EPS) return true;
  }
  return false;
}

function envFor(source: QuerySource): QueryEnv {
  const cached = ENV_CACHE.get(source);
  if (cached) return cached;
  const commands = source.commands;
  const subpaths = splitSubpaths(commands);
  const calls: Match[] = [];
  let i = 0;
  while (i < commands.length) {
    const call = commands[i].meta?.call;
    if (!call) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < commands.length && commands[j].meta?.call?.id === call.id) j++;
    calls.push({ noun: 'call', from: i, to: j, ordinal: calls.length, fn: call.fn });
    i = j;
  }
  const endpointOrdinal = new Array<number>(commands.length).fill(-1);
  let endpointCount = 0;
  commands.forEach((c, k) => {
    if (isDrawing(c)) endpointOrdinal[k] = endpointCount++;
  });
  const indexOf = new Map<PathBlockCommand, number>();
  commands.forEach((c, k) => indexOf.set(c, k));
  // Layer records keep authored case; resolveSmooth and the tangent helpers
  // assume relative args, so normalize first (PathBlocks are already relative).
  const relative = commands.map((c) => ({
    ...c,
    command: c.command.toLowerCase(),
    args: normalizeToRelativeArgs(c.command, c.args, c.start),
  }));
  const env: QueryEnv = {
    commands,
    resolved: resolveSmooth(relative),
    subpaths,
    subpathOf: subpathIndexOf(commands, subpaths),
    calls,
    endpointOrdinal,
    endpointCount,
    indexOf,
  };
  ENV_CACHE.set(source, env);
  return env;
}

export function resolveIndexSpecs(specs: IndexSpec[], length: number): number[] {
  const picked = new Set<number>();
  const norm = (k: number) => (k < 0 ? length + k : k);
  for (const spec of specs) {
    if (spec.kind === 'index') {
      const k = norm(spec.at);
      if (k >= 0 && k < length) picked.add(k);
    } else {
      const from = norm(spec.from);
      const toIncl = spec.inclusive ? norm(spec.to) : norm(spec.to) - 1;
      // Ranges read low to high; a descending range selects nothing.
      for (let k = Math.max(0, from); k <= Math.min(length - 1, toIncl); k++) picked.add(k);
    }
  }
  return [...picked].sort((a, b) => a - b);
}

function inScope(m: Match, scope: Set<number> | null): boolean {
  if (!scope) return true;
  for (let i = m.from; i < m.to; i++) if (!scope.has(i)) return false;
  return true;
}

function candidates(env: QueryEnv, c: QueryCompound): Match[] {
  const { commands } = env;
  switch (c.noun) {
    case 'command': {
      const kinds = c.args ? new Set(c.args) : null;
      const out: Match[] = [];
      commands.forEach((cmd, i) => {
        if (kinds && !kinds.has(cmd.command.toLowerCase())) return;
        out.push({ noun: 'command', from: i, to: i + 1, ordinal: i });
      });
      return out;
    }
    case 'call': {
      const fns = c.args ? new Set(c.args) : null;
      return env.calls.filter((m) => !fns || fns.has(m.fn as string));
    }
    case 'endpoint': {
      const labels = c.args ? new Set(c.args) : null;
      const out: Match[] = [];
      commands.forEach((cmd, i) => {
        if (env.endpointOrdinal[i] === -1) return;
        const label = cmd.meta?.endVertex?.label;
        if (labels && (label === undefined || !labels.has(label))) return;
        out.push({
          noun: 'endpoint',
          from: i,
          to: i + 1,
          ordinal: env.endpointOrdinal[i],
          ...(label !== undefined ? { label } : {}),
        });
      });
      return out;
    }
    case 'segment': {
      const out: Match[] = [];
      if (c.args) {
        // Reuse the legacy matcher so `cut` umbrella + `cut.<name>` behave as segmentAll does.
        for (const label of c.args) {
          findLabeledRuns(commands, label).forEach((run, k) => {
            const from = env.indexOf.get(run[0]) as number;
            const to = (env.indexOf.get(run[run.length - 1]) as number) + 1;
            out.push({ noun: 'segment', from, to, ordinal: k, label });
          });
        }
        return out.sort((a, b) => a.from - b.from);
      }
      // Every labeled run: consecutive commands sharing one exact label.
      const runsPerLabel = new Map<string, number>();
      let i = 0;
      while (i < commands.length) {
        const label = commands[i].meta?.segmentLabel;
        if (label === undefined) {
          i++;
          continue;
        }
        let j = i + 1;
        while (j < commands.length && commands[j].meta?.segmentLabel === label) j++;
        const k = runsPerLabel.get(label) ?? 0;
        runsPerLabel.set(label, k + 1);
        out.push({ noun: 'segment', from: i, to: j, ordinal: k, label });
        i = j;
      }
      return out;
    }
    case 'subpath': {
      const all = env.subpaths.map((s, k) => ({
        noun: 'subpath' as const,
        from: s.from,
        to: s.to,
        ordinal: k,
        closed: s.closed,
      }));
      if (!c.indexArgs) return all;
      return resolveIndexSpecs(c.indexArgs, all.length).map((k) => all[k]);
    }
  }
}

type Scalar = number | boolean | string | null;

function isUpper(letter: string): boolean {
  return letter !== letter.toLowerCase();
}

function controlPoint(env: QueryEnv, i: number, which: 'cp1' | 'cp2' | 'cp'): Point | null {
  const r = env.resolved[i]; // relative + smooth-resolved
  const upper = r.command.toUpperCase();
  const abs = (dx: number, dy: number): Point => ({ x: r.start.x + dx, y: r.start.y + dy });
  if (upper === 'C') {
    if (which === 'cp1') return abs(r.args[0], r.args[1]);
    if (which === 'cp2') return abs(r.args[2], r.args[3]);
    return null;
  }
  if (upper === 'Q') return which === 'cp' ? abs(r.args[0], r.args[1]) : null;
  return null;
}

function arcCenter(cmd: PathBlockCommand): Point | null {
  if (cmd.command.toUpperCase() !== 'A') return null;
  const [rx, ry, rotation, largeArc, sweep] = cmd.args;
  const c = arcEndpointToCenter(
    cmd.start.x,
    cmd.start.y,
    rx,
    ry,
    (rotation * Math.PI) / 180,
    largeArc,
    sweep,
    cmd.end.x,
    cmd.end.y,
  );
  return c ? { x: c.cx, y: c.cy } : null;
}

function filterValue(env: QueryEnv, m: Match, i: number, attr: string): Scalar {
  const cmd = env.commands[i];
  const upper = cmd.command.toUpperCase();
  switch (attr) {
    case 'x':
      return cmd.end.x;
    case 'y':
      return cmd.end.y;
    case 'length':
      return calculateCommandLength(env.resolved[i]);
    case 'index':
      return i;
    case 'absolute':
      return isUpper(cmd.command);
    case 'relative':
      return !isUpper(cmd.command);
    case 'label':
      if (m.noun === 'endpoint') return cmd.meta?.endVertex?.label ?? null;
      if (m.noun === 'segment') return m.label ?? null;
      return cmd.meta?.segmentLabel ?? cmd.meta?.endVertex?.label ?? null;
    case 'cornerOp':
      return cmd.meta?.endVertex?.cornerOp?.kind ?? null;
    case 'closed':
      return m.noun === 'subpath' ? (m.closed as boolean) : upper === 'Z';
    case 'x1':
      return controlPoint(env, i, upper === 'Q' || upper === 'T' ? 'cp' : 'cp1')?.x ?? null;
    case 'y1':
      return controlPoint(env, i, upper === 'Q' || upper === 'T' ? 'cp' : 'cp1')?.y ?? null;
    case 'x2':
      return controlPoint(env, i, 'cp2')?.x ?? null;
    case 'y2':
      return controlPoint(env, i, 'cp2')?.y ?? null;
    case 'rx':
      return upper === 'A' ? cmd.args[0] : null;
    case 'ry':
      return upper === 'A' ? cmd.args[1] : null;
    case 'rotation':
      return upper === 'A' ? cmd.args[2] : null;
    case 'largeArc':
      return upper === 'A' ? cmd.args[3] === 1 : null;
    case 'sweep':
      return upper === 'A' ? cmd.args[4] === 1 : null;
    default:
      return null;
  }
}

function parseScalar(text: string): Scalar {
  const t = text.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t.replace(/^['"]|['"]$/g, '');
}

function passes(value: Scalar, f: QueryFilter): boolean {
  if (f.op === undefined) return value !== null && value !== undefined && value !== false;
  if (value === null || value === undefined) return false;
  const want = parseScalar(f.value as string);
  switch (f.op) {
    case '=':
      return typeof value === 'number' && typeof want === 'number' ? Math.abs(value - want) < EPS : value === want;
    case '!=':
      return typeof value === 'number' && typeof want === 'number' ? Math.abs(value - want) >= EPS : value !== want;
    default: {
      if (typeof value !== 'number' || typeof want !== 'number') return false;
      if (f.op === '<') return value < want;
      if (f.op === '<=') return value <= want;
      if (f.op === '>') return value > want;
      return value >= want;
    }
  }
}

function matchPassesFilter(env: QueryEnv, m: Match, f: QueryFilter): boolean {
  // Any member command passing is enough — the documented rule for multi-command matches.
  for (let i = m.from; i < m.to; i++) if (passes(filterValue(env, m, i, f.attr), f)) return true;
  return false;
}

type SubjectFilter = (from: number, to: number) => boolean;

function evalCompound(env: QueryEnv, c: QueryCompound, scope: Set<number> | null, subject?: SubjectFilter): Match[] {
  let matches = candidates(env, c).filter((m) => inScope(m, scope));
  for (const f of c.filters) matches = matches.filter((m) => matchPassesFilter(env, m, f));
  // A subscription window narrows the subject before position pseudos resolve.
  if (subject) matches = matches.filter((m) => subject(m.from, m.to));
  if (c.pseudo) matches = resolveIndexSpecs(c.pseudo.specs, matches.length).map((k) => matches[k]);
  return matches;
}

function evalSelector(env: QueryEnv, s: QuerySelector, subject?: SubjectFilter): Match[] {
  let scope: Set<number> | null = null;
  let matches: Match[] = [];
  const last = s.compounds.length - 1;
  for (const [k, c] of s.compounds.entries()) {
    matches = evalCompound(env, c, scope, k === last ? subject : undefined);
    scope = new Set<number>();
    for (const m of matches) for (let i = m.from; i < m.to; i++) scope.add(i);
  }
  return matches;
}

function runMatcher(env: QueryEnv, q: ParsedQuery, subject?: SubjectFilter): Match[] {
  const seen = new Set<string>();
  const all: Match[] = [];
  for (const s of q.selectors) {
    for (const m of evalSelector(env, s, subject)) {
      const key = `${m.from}:${m.to}:${m.label ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(m);
    }
  }
  // Authoring order regardless of list order.
  return all.sort((a, b) => a.from - b.from || a.to - b.to);
}

// ---------------------------------------------------------------------------
// Result structs
// ---------------------------------------------------------------------------

export function commandValue(source: QuerySource, index: number): CommandValue {
  return { type: 'CommandValue', source, index };
}

/** `.commands` / `.subPathCommands`: every command of a source as Command structs. */
export function commandValues(source: QuerySource): Value {
  return { type: 'ArrayValue', elements: source.commands.map((_, i) => commandValue(source, i)) };
}

/**
 * An Endpoint at the end of `commandIndex`. `point` defaults to the finalized
 * end; legacy vertex() handles pass the authored vertex instead.
 */
export function endpointValue(
  source: QuerySource,
  commandIndex: number,
  opts: { label?: string | null; point?: Point } = {},
): EndpointValue {
  const env = envFor(source);
  const { commands } = env;
  const cmd = commands[commandIndex];
  const sub = env.subpaths[env.subpathOf[commandIndex]];
  let nextIndex: number | null = null;
  for (let j = commandIndex + 1; j < sub.to; j++) {
    if (isDrawing(commands[j])) {
      nextIndex = j;
      break;
    }
  }
  if (nextIndex === null && sub.closed) {
    for (let j = sub.from; j < commandIndex; j++) {
      if (isDrawing(commands[j])) {
        nextIndex = j;
        break;
      }
    }
  }
  return {
    type: 'EndpointValue',
    source,
    commandIndex,
    nextIndex,
    index: env.endpointOrdinal[commandIndex],
    label: opts.label !== undefined ? opts.label : (cmd.meta?.endVertex?.label ?? null),
    point: opts.point ?? { x: cmd.end.x, y: cmd.end.y },
    cornerIndex: locateCornerPos(commands, cmd),
  };
}

function matchValue(source: QuerySource, m: Match): Value {
  switch (m.noun) {
    case 'command':
      return commandValue(source, m.from);
    case 'endpoint':
      return endpointValue(source, m.from);
    case 'call':
      return {
        type: 'CallValue',
        source,
        fn: m.fn as string,
        from: m.from,
        to: m.to,
        index: m.ordinal,
      } satisfies CallValue;
    case 'segment':
      return {
        type: 'SegmentValue',
        source,
        label: m.label as string,
        from: m.from,
        to: m.to,
        index: m.ordinal,
      } satisfies SegmentValue;
    case 'subpath':
      return {
        type: 'SubpathValue',
        source,
        from: m.from,
        to: m.to,
        index: m.ordinal,
        closed: m.closed as boolean,
      } satisfies SubpathValue;
  }
}

/**
 * A run of commands as a standalone block: re-based to its own origin on
 * PathBlock sources (what segment() returns), page coordinates otherwise.
 */
export function wrapCommands(run: PathBlockCommand[], kind: QuerySource['kind']): PathBlockValue | ProjectedPathValue {
  // A run that begins with a move carries, in that move's `start`, the pen
  // position before it — a previous statement's geometry, not this run's. A
  // standalone block starts where that move lands, so the move is dropped
  // (kept, zero-length, only when the run is nothing but a move); bounding
  // boxes, centres and draw() anchors then answer for the run alone.
  const first = run[0];
  const leadingMove = first.command === 'm' || first.command === 'M';
  const runCmds = !leadingMove ? run : run.length > 1 ? run.slice(1) : [{ ...first, start: { ...first.end } }];
  // Layer records preserve the case a command was authored in, but a standalone
  // block is always lowercase-relative — docs/path-queries.md states it three
  // times ("Path blocks always report lowercase relative commands"; `absolute` is
  // "always false on blocks and projections"). Normalizing once here is what makes
  // that true, and it is the single point that keeps the ~20 curve-argument reads
  // in path-transforms.ts correct: they all treat args as deltas from `start`, so
  // an absolutely-authored C/S/Q/T reaching them silently produced the wrong
  // shape from `subPath`, `offset`, `reverse`, `startAt`, `scale`, `mirror`,
  // `boundingBox`, `dash`, `outline` and `fillet` (ISSUE-026). Args must be
  // rebased against the ORIGINAL start, before the pathblock branch re-origins
  // them. normalizeToRelativeArgs returns lowercase args untouched, so nothing
  // moves for the overwhelmingly common case.
  const source = runCmds.map((c) => ({
    command: c.command.toLowerCase(),
    args: normalizeToRelativeArgs(c.command, c.args, c.start),
    start: c.start,
    end: c.end,
    ...(c.meta !== undefined ? { meta: c.meta } : {}),
  }));
  if (kind === 'pathblock') {
    const runStart = source[0].start;
    const rebased = source.map((c) => ({
      command: c.command,
      args: [...c.args],
      start: { x: c.start.x - runStart.x, y: c.start.y - runStart.y },
      end: { x: c.end.x - runStart.x, y: c.end.y - runStart.y },
      ...(c.meta !== undefined ? { meta: c.meta } : {}),
    }));
    const block: PathBlockValue = {
      type: 'PathBlockValue',
      commands: rebased,
      records: recordsFromCommands(rebased),
      startPoint: firstInkedPointOf(rebased) ?? { x: 0, y: 0 },
      endPoint: { x: rebased[rebased.length - 1].end.x, y: rebased[rebased.length - 1].end.y },
    };
    // The run's position in the receiver's coordinates — the translation this
    // re-base removed. Without it a caller can only recover the position by
    // re-querying the receiver. See buildRebasedWithAnchor in evaluator/index.ts.
    (block as PathBlockValue & { anchor: { x: number; y: number } }).anchor = { ...runStart };
    return block;
  }
  const copies = source.map((c) => ({
    command: c.command,
    args: [...c.args],
    start: { ...c.start },
    end: { ...c.end },
    ...(c.meta !== undefined ? { meta: c.meta } : {}),
  }));
  return {
    type: 'ProjectedPathValue',
    commands: copies,
    startPoint: firstInkedPointOf(copies) ?? { ...copies[0].start },
    endPoint: { ...copies[copies.length - 1].end },
  };
}

export function blockOf(source: QuerySource, from: number, to: number): Value {
  return wrapCommands(source.commands.slice(from, to), source.kind);
}

// ---------------------------------------------------------------------------
// Struct member helpers (used by struct-properties.ts)
// ---------------------------------------------------------------------------

const point = (p: Point): Value => ({ type: 'PointValue', x: p.x, y: p.y });
const bool = (b: boolean): Value => ({ type: 'BooleanValue', value: b ? 1 : 0 });

export function commandMembers(v: CommandValue): Record<string, () => Value> {
  const env = envFor(v.source);
  const cmd = env.commands[v.index];
  const upper = cmd.command.toUpperCase();
  const base: Record<string, () => Value> = {
    command: () => cmd.command.toLowerCase(),
    absolute: () => bool(isUpper(cmd.command)),
    args: () => ({ type: 'ArrayValue', elements: [...cmd.args] as Value[] }),
    start: () => point(cmd.start),
    end: () => point(cmd.end),
    index: () => v.index,
    subpath: () => env.subpathOf[v.index],
    length: () => calculateCommandLength(env.resolved[v.index]),
    block: () => blockOf(v.source, v.index, v.index + 1),
    segment: () => cmd.meta?.segmentLabel ?? null,
    endpoint: () => cmd.meta?.endVertex?.label ?? null,
    startHeading: () => headingOf(getEdgeTangentAtStart(env.resolved[v.index])),
    endHeading: () => headingOf(getEdgeTangentAtEnd(env.resolved[v.index])),
  };
  if (upper === 'C' || upper === 'S') {
    base.cp1 = () => point(controlPoint(env, v.index, 'cp1') as Point);
    base.cp2 = () => point(controlPoint(env, v.index, 'cp2') as Point);
  }
  if (upper === 'Q' || upper === 'T') {
    base.cp = () => point(controlPoint(env, v.index, 'cp') as Point);
  }
  if (upper === 'A') {
    base.rx = () => cmd.args[0];
    base.ry = () => cmd.args[1];
    base.rotation = () => cmd.args[2];
    base.largeArc = () => bool(cmd.args[3] === 1);
    base.sweep = () => bool(cmd.args[4] === 1);
    base.center = () => {
      const c = arcCenter(cmd);
      return c ? point(c) : null;
    };
  }
  return base;
}

export function endpointMembers(v: EndpointValue): Record<string, () => Value> {
  const env = envFor(v.source);
  return {
    point: () => point(v.point),
    x: () => v.point.x,
    y: () => v.point.y,
    label: () => v.label,
    index: () => v.index,
    command: () => commandValue(v.source, v.commandIndex),
    next: () => (v.nextIndex === null ? null : commandValue(v.source, v.nextIndex)),
    isJoint: () => bool(v.nextIndex !== null),
    turn: () => {
      if (v.nextIndex === null) return null;
      const inT = getEdgeTangentAtEnd(env.resolved[v.commandIndex]);
      const outT = getEdgeTangentAtStart(env.resolved[v.nextIndex]);
      const radians = wrapToPi(Math.atan2(outT.dy, outT.dx) - Math.atan2(inT.dy, inT.dx));
      return { type: 'AngleValue', radians, unit: 'rad' };
    },
    arriving: () => headingOf(getEdgeTangentAtEnd(env.resolved[v.commandIndex])),
    leaving: () => (v.nextIndex === null ? null : headingOf(getEdgeTangentAtStart(env.resolved[v.nextIndex]))),
    // The direction that points away from both commands: the bisector of
    // the exterior angle, on the side normal(t) picks at a straight joint.
    // At an open end there is nothing to bisect, so it is the arriving heading.
    outward: () => {
      const inT = getEdgeTangentAtEnd(env.resolved[v.commandIndex]);
      const arriving = Math.atan2(inT.dy, inT.dx);
      if (v.nextIndex === null) return { type: 'AngleValue', radians: arriving, unit: 'rad' };
      const outT = getEdgeTangentAtStart(env.resolved[v.nextIndex]);
      const turn = wrapToPi(Math.atan2(outT.dy, outT.dx) - arriving);
      return { type: 'AngleValue', radians: wrapToPi(arriving + turn / 2 - Math.PI / 2), unit: 'rad' };
    },
  };
}

/** A tangent as an Angle value; a zero-length tangent reads as heading 0. */
function headingOf(t: { dx: number; dy: number }): Value {
  return { type: 'AngleValue', radians: Math.atan2(t.dy, t.dx), unit: 'rad' };
}

function spanCommands(source: QuerySource, from: number, to: number): Value {
  const elements: Value[] = [];
  for (let i = from; i < to; i++) elements.push(commandValue(source, i));
  return { type: 'ArrayValue', elements };
}

function spanLength(source: QuerySource, from: number, to: number): number {
  const env = envFor(source);
  let total = 0;
  for (let i = from; i < to; i++) total += calculateCommandLength(env.resolved[i]);
  return total;
}

export function callMembers(v: CallValue): Record<string, () => Value> {
  const { commands } = v.source;
  return {
    // `fn` is a keyword in Pathogen (function declarations), so the member is `name`.
    name: () => v.fn,
    commands: () => spanCommands(v.source, v.from, v.to),
    block: () => blockOf(v.source, v.from, v.to),
    start: () => point(commands[v.from].start),
    end: () => point(commands[v.to - 1].end),
    index: () => v.index,
  };
}

export function segmentMembers(v: SegmentValue): Record<string, () => Value> {
  const { commands } = v.source;
  return {
    label: () => v.label,
    block: () => blockOf(v.source, v.from, v.to),
    commands: () => spanCommands(v.source, v.from, v.to),
    start: () => point(commands[v.from].start),
    end: () => point(commands[v.to - 1].end),
    length: () => spanLength(v.source, v.from, v.to),
    index: () => v.index,
  };
}

export function subpathMembers(v: SubpathValue): Record<string, () => Value> {
  const { commands } = v.source;
  return {
    index: () => v.index,
    closed: () => bool(v.closed),
    block: () => blockOf(v.source, v.from, v.to),
    commands: () => spanCommands(v.source, v.from, v.to),
    start: () => point(firstInkedPointOf(commands.slice(v.from, v.to)) ?? commands[v.from].start),
    end: () => point(commands[v.to - 1].end),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function noMatchMessage(env: QueryEnv, q: ParsedQuery): string {
  const quoted = (xs: string[]) => (xs.length ? xs.map((x) => `'${x}'`).join(', ') : '(none)');
  let has: string;
  switch (q.noun) {
    case 'segment':
      has = `available segment labels: ${quoted(collectSegmentLabels(env.commands))}`;
      break;
    case 'endpoint':
      has = `available endpoint labels: ${quoted(collectEndpointLabels(env.commands))}`;
      break;
    case 'command': {
      const letters = [...new Set(env.commands.map((c) => c.command.toLowerCase()))];
      has = `the path has commands: ${letters.length ? letters.join(', ') : '(none)'}`;
      break;
    }
    case 'call': {
      const fns = [...new Set(env.calls.map((m) => m.fn as string))];
      has = `the path has calls: ${fns.length ? fns.join(', ') : '(none)'}`;
      break;
    }
    case 'subpath': {
      const n = env.subpaths.length;
      has = `the path has ${n} subpath${n === 1 ? '' : 's'} (indexes are 0-based)`;
      break;
    }
  }
  return `No match for '${q.raw}' — ${has}`;
}

/** One match of a selector with the identity subscriptions dedupe on. */
export interface QueryHit {
  value: Value;
  /** Stable across rounds: noun + record sequence + offset within the record + span + label. */
  key: string;
  /** Global record sequence of the match's first command (null when unstamped). */
  record: number | null;
}

/**
 * Matches of a selector as hits, optionally narrowed to a subject window
 * (subscriptions). Throws plain Errors like runPathQuery.
 */
export function matchPathQuery(source: QuerySource, raw: string, opts: { subject?: SubjectFilter } = {}): QueryHit[] {
  const parsed = parsePathQuery(raw);
  const env = envFor(source);
  return runMatcher(env, parsed, opts.subject).map((m) => {
    const seq = env.commands[m.from].meta?.record ?? null;
    let offset = 0;
    if (seq !== null) {
      let j = m.from;
      while (j > 0 && env.commands[j - 1].meta?.record === seq) j--;
      offset = m.from - j;
    }
    return {
      value: matchValue(source, m),
      key: `${m.noun}:${seq ?? 'x'}:${offset}:${m.to - m.from}:${m.label ?? ''}`,
      record: seq,
    };
  });
}

/**
 * Run `query` (first match; throws on none) or `queryAll` (array) against a
 * source. Throws plain Errors; the evaluator wraps them with line info.
 */
export function runPathQuery(source: QuerySource, method: 'query' | 'queryAll', raw: string): Value {
  const parsed = parsePathQuery(raw);
  const env = envFor(source);
  const matches = runMatcher(env, parsed);
  if (method === 'queryAll') {
    return { type: 'ArrayValue', elements: matches.map((m) => matchValue(source, m)) };
  }
  if (matches.length === 0) throw new Error(noMatchMessage(env, parsed));
  return matchValue(source, matches[0]);
}
