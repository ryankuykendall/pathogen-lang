/**
 * Shared structured-path-record machinery for both evaluators.
 *
 * A PathStore pairs the byte-exact string fragments that the emit path joins
 * into `LayerOutput.data` with the structured commands behind them. During
 * the segments-everywhere transition the strings remain authoritative for
 * output (byte parity by construction); the records are the queryable source
 * of truth for labels and geometry.
 */
import type { PathBlockCommand, PathCommandMeta, PathRecord, PathStore, RecordedCornerOp } from './types';
import type { SourceLocation } from '../parser/ast';
import {
  chamferCommands,
  commandToPathString,
  ellipticalFilletCommands,
  filletCommands,
  identifyCornerVertices,
} from './path-transforms';

/** Evaluated (expression-free) annotation values ready to attach to a record. */
export interface EvaluatedAnnotations {
  cornerOp?: RecordedCornerOp;
  segmentLabel?: string;
  endpointLabel?: string;
}

const isMove = (c: string) => c === 'm' || c === 'M';
const isClose = (c: string) => c === 'z' || c === 'Z';

/**
 * Attach evaluated `with` / `as` annotations to the most recently recorded
 * fragment in the store. Validates corner-op placement; duplicate labels are
 * allowed by design (shared names form groups — see the *All queries).
 * `fail` reports errors with the caller's line formatting and must throw.
 */
export function applyAnnotationsToStore(
  store: PathStore,
  ann: EvaluatedAnnotations,
  fail: (message: string) => never,
): void {
  const record = store.records[store.records.length - 1];
  if (!record || record.commands.length === 0) {
    fail('with/as clauses require the statement to emit path data');
  }

  // Duplicate labels are allowed by design: a name shared by several
  // statements forms a GROUP. Singular queries return the first match;
  // the *All queries (segmentAll/pointAll/vertexAll) return every match.
  if (ann.segmentLabel !== undefined) {
    const label = ann.segmentLabel;
    record.label = label;
    for (const cmd of record.commands) {
      cmd.meta = { ...cmd.meta, segmentLabel: label };
    }
  }

  if (ann.endpointLabel !== undefined) {
    const label = ann.endpointLabel;
    const last = record.commands[record.commands.length - 1];
    last.meta = { ...last.meta, endVertex: { ...last.meta?.endVertex, label } };
  }

  if (ann.cornerOp !== undefined) {
    const first = record.commands[0];
    if (isMove(first.command)) {
      fail(`with ${ann.cornerOp.kind}(...) cannot apply to a statement that begins a new subpath — there is no previous joint to round`);
    }
    // Find the previous drawing command in the same subpath (walk backwards
    // across records; stop at a move or the beginning of the store).
    const flat: PathBlockCommand[] = [];
    for (const r of store.records) flat.push(...r.commands);
    const firstIdx = flat.length - record.commands.length;
    let prev: PathBlockCommand | null = null;
    for (let i = firstIdx - 1; i >= 0; i--) {
      const cmd = flat[i];
      if (isMove(cmd.command)) break;
      if (!isClose(cmd.command)) {
        prev = cmd;
        break;
      }
    }
    if (!prev) {
      fail(`with ${ann.cornerOp.kind}(...) requires a previous drawing command in the same subpath — there is no joint to round`);
    }
    if (prev.meta?.endVertex?.cornerOp) {
      fail(`This vertex already has a ${prev.meta.endVertex.cornerOp.kind} recorded — only one corner operation per vertex`);
    }
    prev.meta = { ...prev.meta, endVertex: { ...prev.meta?.endVertex, cornerOp: ann.cornerOp } };
  }
}

export function createPathStore(): PathStore {
  return { records: [] };
}

/**
 * The single write path for emitted path fragments. Each record pairs the
 * byte-exact `raw` fragment (joined into LayerOutput.data) with its
 * structured commands. Nothing else may push to a PathStore.
 */
export function recordPath(
  store: PathStore,
  raw: string,
  commands: PathBlockCommand[],
  extras?: { label?: string; loc?: SourceLocation },
): void {
  const record: PathRecord = { raw, commands };
  if (extras?.label !== undefined) record.label = extras.label;
  if (extras?.loc !== undefined) record.loc = extras.loc;
  store.records.push(record);
}

/** Join a store's raw fragments into emit-ready path data. */
export function storeToPathData(store: PathStore): string {
  return store.records.map((r) => r.raw).join(' ');
}

/**
 * Wrap derived commands (transform results, projections) as per-command
 * records, serializing each with the canonical serializer — the same strings
 * the old per-command pathStrings arrays held.
 */
export function recordsFromCommands(commands: PathBlockCommand[]): PathRecord[] {
  return commands.map((c) => ({ raw: commandToPathString(c), commands: [c] }));
}

const isMoveCmd = (c: string) => c === 'm' || c === 'M';
const isCloseCmd = (c: string) => c === 'z' || c === 'Z';

function normalizeMeta(meta: PathCommandMeta | undefined): PathCommandMeta | undefined {
  if (!meta) return undefined;
  const endVertex =
    meta.endVertex && (meta.endVertex.label !== undefined || meta.endVertex.cornerOp !== undefined)
      ? meta.endVertex
      : undefined;
  if (meta.segmentLabel === undefined && endVertex === undefined && meta.seamId === undefined) return undefined;
  return {
    ...(meta.segmentLabel !== undefined ? { segmentLabel: meta.segmentLabel } : {}),
    ...(endVertex ? { endVertex } : {}),
    ...(meta.seamId !== undefined ? { seamId: meta.seamId } : {}),
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
  });
}

/** Shallow-clone commands with cloned meta so finalization never mutates the authored store. */
function cloneForFinalize(commands: PathBlockCommand[]): PathBlockCommand[] {
  return commands.map((c) => ({
    command: c.command,
    args: [...c.args],
    start: { ...c.start },
    end: { ...c.end },
    ...(c.meta !== undefined
      ? { meta: { ...c.meta, ...(c.meta.endVertex ? { endVertex: { ...c.meta.endVertex } } : {}) } }
      : {}),
  }));
}

/**
 * Apply corner operations recorded by `with <op>(...)` clauses. Non-destructive:
 * the input commands are cloned; the authored store keeps its annotations.
 * Identity (labels) propagates through the trims and splices inside
 * path-transforms, so labeled segments survive finalization.
 *
 * Returns changed:false (input untouched) when no ops are recorded — the
 * zero-op path is identity by construction, preserving byte-exact emit.
 */
export function applyRecordedCornerOps(commands: PathBlockCommand[]): {
  commands: PathBlockCommand[];
  warnings: string[];
  changed: boolean;
} {
  if (!commands.some((c) => c.meta?.endVertex?.cornerOp)) {
    return { commands, warnings: [], changed: false };
  }

  const warnings: string[] = [];
  const working = cloneForFinalize(commands);

  // Split into subpaths at move boundaries (applyCornerOperations drops moves
  // from its result, so each subpath is finalized independently and its moves
  // re-attached).
  const subpaths: PathBlockCommand[][] = [];
  let current: PathBlockCommand[] = [];
  for (const cmd of working) {
    if (isMoveCmd(cmd.command) && current.length > 0) {
      subpaths.push(current);
      current = [];
    }
    current.push(cmd);
  }
  if (current.length > 0) subpaths.push(current);

  const out: PathBlockCommand[] = [];
  for (const sub of subpaths) {
    out.push(...finalizeSubpath(sub, warnings));
  }
  return { commands: out, warnings, changed: true };
}

/**
 * Locate the corner at the END of `target` in the vertex-index space the
 * corner-op appliers use: z popped (replaced by a closing line when it has
 * length), moves absent, corners from identifyCornerVertices + closure.
 * Returns -1 when the target isn't present or its end isn't a corner.
 */
export function locateCornerPos(commands: PathBlockCommand[], target: PathBlockCommand): number {
  let expanded = commands.filter((c) => !isMoveCmd(c.command));
  let closed = false;
  if (expanded.length > 0 && isCloseCmd(expanded[expanded.length - 1].command)) {
    closed = true;
    const z = expanded[expanded.length - 1];
    expanded = expanded.slice(0, -1);
    const zdx = z.end.x - z.start.x;
    const zdy = z.end.y - z.start.y;
    if (Math.abs(zdx) > 1e-10 || Math.abs(zdy) > 1e-10) {
      expanded = [...expanded, { command: 'l', args: [zdx, zdy], start: { ...z.start }, end: { ...z.end } }];
    }
  }
  const allCorners = identifyCornerVertices(expanded);
  if (closed && expanded.length >= 2) allCorners.push(expanded.length - 1);
  const k = expanded.indexOf(target);
  return k === -1 ? -1 : allCorners.indexOf(k);
}

/** Distinct segment labels in authoring order. */
export function collectSegmentLabels(commands: PathBlockCommand[]): string[] {
  const seen = new Set<string>();
  for (const c of commands) {
    const label = c.meta?.segmentLabel;
    if (label !== undefined) seen.add(label);
  }
  return [...seen];
}

/** Distinct endpoint labels in authoring order. */
export function collectEndpointLabels(commands: PathBlockCommand[]): string[] {
  const seen = new Set<string>();
  for (const c of commands) {
    const label = c.meta?.endVertex?.label;
    if (label !== undefined) seen.add(label);
  }
  return [...seen];
}

/**
 * All maximal contiguous runs of commands labeled `as segment(label)`, in
 * authoring order. Consecutive same-labeled statements merge into one run;
 * runs separated by other commands are distinct group members.
 */
export function findLabeledRuns(commands: PathBlockCommand[], label: string): PathBlockCommand[][] {
  // The umbrella query 'cut' matches the whole seam namespace — plain 'cut'
  // and every 'cut.<name>' sub-label — with adjacent matches merging into one
  // run regardless of sub-label, preserving pre-namespace behavior. Every
  // other label (sub-labels included) matches exactly.
  const matches =
    label === 'cut'
      ? (l: string | undefined) => l === 'cut' || (l !== undefined && l.startsWith('cut.'))
      : (l: string | undefined) => l === label;
  const runs: PathBlockCommand[][] = [];
  let current: PathBlockCommand[] = [];
  for (const c of commands) {
    if (matches(c.meta?.segmentLabel)) {
      current.push(c);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/** The first contiguous run of commands labeled `as segment(label)`, or null. */
export function findLabeledRun(commands: PathBlockCommand[], label: string): PathBlockCommand[] | null {
  const runs = findLabeledRuns(commands, label);
  return runs.length > 0 ? runs[0] : null;
}

/** Identifier-shaped label names keep all punctuation free for the
 *  query language. Pure core shared by BOTH evaluators (F2 parity —
 *  annotated must reject the same names compile() rejects); the
 *  callers wrap with their own line formatting. Returns the error
 *  message, or null when the name is valid. */
const LABEL_IDENT = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** B2: startPoint = FIRST INKED POINT — the last leading move's end
 *  (a leading run of m/M positions the pen; the last one is where ink
 *  lands), else the first command's own start. Null for empty command
 *  lists (callers keep their existing default). This is the only
 *  definition that matches the serializer's pen-landing math and makes
 *  `get(0) == startPoint` true; the day-one type comment specified the
 *  m-exception but it was never implemented (hardcoded {0,0} instead). */
export function firstInkedPointOf(cmds: PathBlockCommand[]): { x: number; y: number } | null {
  if (cmds.length === 0) return null;
  let lastLeadingMove: PathBlockCommand | null = null;
  for (const c of cmds) {
    if (c.command === 'm' || c.command === 'M') {
      lastLeadingMove = c;
    } else {
      break;
    }
  }
  const p = lastLeadingMove ? lastLeadingMove.end : cmds[0].start;
  return { x: p.x, y: p.y };
}

export function labelNameError(value: string, kind: 'segment' | 'endpoint'): string | null {
  if (kind === 'segment') {
    if (value === 'cut') {
      return "segment() label 'cut' is reserved for healed seam edges; use 'cut.<name>' to join the seam group explicitly";
    }
    // The one legal dotted form: the explicit seam-namespace opt-in.
    const bare = value.startsWith('cut.') ? value.slice(4) : value;
    if (LABEL_IDENT.test(bare)) return null;
  } else if (LABEL_IDENT.test(value)) {
    return null;
  }
  return `${kind}() label name '${value}' is invalid: names use letters, digits, '-' and '_', starting with a letter${kind === 'segment' ? " (the explicit seam opt-in 'cut.<name>' is the one exception)" : ''} — '.' and ':' are reserved for queries`;
}

export type SegmentQueryPseudo =
  | { kind: 'atomic' }
  | { kind: 'first' }
  | { kind: 'last' }
  | { kind: 'nth'; n: number };

export interface ParsedSegmentQuery {
  label: string;
  pseudo?: SegmentQueryPseudo;
}

const PSEUDO_SET_HINT = "the available pseudo-selectors are ':atomic', ':first', ':last', and ':nth(k)'";

/**
 * Parse a segment-query string into a label plus an optional CSS-style
 * pseudo-selector. Authored labels can never contain ':' (validated at
 * authoring time), so a ':' in a query is unambiguously a pseudo. One
 * pseudo per query. Throws on unknown or chained pseudos.
 */
export function parseSegmentQuery(raw: string): ParsedSegmentQuery {
  const colon = raw.indexOf(':');
  if (colon === -1) return { label: raw };
  const label = raw.slice(0, colon);
  const rest = raw.slice(colon + 1);
  if (rest.includes(':')) {
    throw new Error(`'${raw}': one pseudo-selector per query — ${PSEUDO_SET_HINT}`);
  }
  if (rest === 'atomic') return { label, pseudo: { kind: 'atomic' } };
  if (rest === 'first') return { label, pseudo: { kind: 'first' } };
  if (rest === 'last') return { label, pseudo: { kind: 'last' } };
  const nth = rest.match(/^nth\((\d+)\)$/);
  if (nth) return { label, pseudo: { kind: 'nth', n: Number(nth[1]) } };
  throw new Error(`unknown pseudo-selector ':${rest}' in '${raw}' — ${PSEUDO_SET_HINT}`);
}

/**
 * Resolve a segment query — label matching (findLabeledRuns, umbrella
 * rules included) followed by the pseudo, which applies AFTER matching
 * and merging. `labelMatched` distinguishes "no such label" (unknown-
 * label error with the available list) from "label exists but the
 * pseudo selected nothing" (nth out of range) at singular call sites.
 */
export interface SegmentQueryResult {
  runs: PathBlockCommand[][];
  /** Whether the LABEL matched anything, before the pseudo filtered. */
  labelMatched: boolean;
  /** Run count after label matching, before the pseudo — for range errors. */
  matchedCount: number;
  parsed: ParsedSegmentQuery;
}

export function queryLabeledRuns(commands: PathBlockCommand[], raw: string): SegmentQueryResult {
  const parsed = parseSegmentQuery(raw);
  const matched = findLabeledRuns(commands, parsed.label);
  const base = { labelMatched: matched.length > 0, matchedCount: matched.length, parsed };
  if (parsed.pseudo === undefined) return { runs: matched, ...base };
  switch (parsed.pseudo.kind) {
    case 'atomic':
      // Drawing commands only: a labeled stdlib call includes its leading
      // move in the run, and a move-only block carries no geometry.
      return {
        runs: matched.flatMap((run) => run.filter((c) => c.command.toLowerCase() !== 'm').map((c) => [c])),
        ...base,
      };
    case 'first':
      return { runs: matched.slice(0, 1), ...base };
    case 'last':
      return { runs: matched.slice(-1), ...base };
    case 'nth': {
      const n = parsed.pseudo.n;
      return { runs: n < matched.length ? [matched[n]] : [], ...base };
    }
  }
}

/** Singular-query error when the label matched but the pseudo selected
 *  nothing — `:nth(k)` out of range, or `:atomic` on runs with no drawing
 *  commands (`:first`/`:last` on a matched group can never come up empty). */
export function pseudoRangeError(raw: string, matchedCount: number, pseudo?: SegmentQueryPseudo): string {
  const runs = `${matchedCount} run${matchedCount === 1 ? '' : 's'}`;
  if (pseudo?.kind === 'atomic') {
    return `'${raw}' selected nothing — the matched ${runs} contain${matchedCount === 1 ? 's' : ''} no drawing commands`;
  }
  return `'${raw}' selected nothing — the group has ${runs} (nth is 0-indexed)`;
}

/** Guard for point/vertex queries: pseudos have no meaning there. */
export function rejectPseudoOnNonSegmentQuery(method: string, name: string): void {
  if (name.includes(':')) {
    throw new Error(
      `${method}() does not accept pseudo-selectors ('${name}') — pseudo-selectors apply to segment queries only`,
    );
  }
}

/** Every command whose end vertex carries `as endpoint(label)`, in authoring order. */
export function findEndpointCommands(commands: PathBlockCommand[], label: string): PathBlockCommand[] {
  return commands.filter((c) => c.meta?.endVertex?.label === label);
}

/** The first command whose end vertex carries `as endpoint(label)`, or null. */
export function findEndpointCommand(commands: PathBlockCommand[], label: string): PathBlockCommand | null {
  for (const c of commands) {
    if (c.meta?.endVertex?.label === label) return c;
  }
  return null;
}

function finalizeSubpath(sub: PathBlockCommand[], warnings: string[]): PathBlockCommand[] {
  const moves: PathBlockCommand[] = [];
  let body = sub;
  while (body.length > 0 && isMoveCmd(body[0].command)) {
    moves.push(body[0]);
    body = body.slice(1);
  }

  let guard = 0;
  while (guard++ < 1000) {
    const opIdx = body.findIndex((c) => c.meta?.endVertex?.cornerOp);
    if (opIdx === -1) break;
    const opCmd = body[opIdx];
    const op = opCmd.meta!.endVertex!.cornerOp!;

    // Consume the op (meta was cloned, so the authored store is untouched).
    opCmd.meta = normalizeMeta({
      ...opCmd.meta,
      endVertex: { ...(opCmd.meta!.endVertex!.label !== undefined ? { label: opCmd.meta!.endVertex!.label } : {}) },
    });

    // Locate the corner at the END of opCmd in the same vertex-index space the
    // corner-op appliers use (shared with vertex-handle queries).
    const pos = locateCornerPos(body, opCmd);
    if (pos === -1) {
      warnings.push(`${op.kind} skipped: no corner at the annotated vertex (collinear edges or terminal command)`);
      continue;
    }

    let res: { commands: PathBlockCommand[]; warnings: string[] };
    if (op.kind === 'fillet') {
      res = filletCommands(body, op.args[0], [pos]);
    } else if (op.kind === 'chamfer') {
      res = chamferCommands(body, op.args[0], op.args[1] ?? op.args[0], [pos]);
    } else {
      res = ellipticalFilletCommands(body, op.args[0], op.args[1], op.args[2] ?? 0, [pos]);
    }
    warnings.push(...res.warnings);
    body = res.commands;
  }

  return [...moves, ...body];
}

/** Serialize finalized commands to emit-ready path data. */
export function commandsToPathData(commands: PathBlockCommand[]): string {
  return commands.map((c) => commandToPathString(c)).join(' ');
}

// Path-string parsing moved to the shared path-data module (single
// cursor-based tokenizer for both evaluators); re-exported here so existing
// importers keep working.
export { parsePathStringAt, parsePathStringToCommands } from './path-data';
