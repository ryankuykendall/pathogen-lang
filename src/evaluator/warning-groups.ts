/**
 * Grouping of near-identical compiler warnings.
 *
 * A program that fillets every glyph contour emits thousands of `corner-op`
 * warnings from one call site whose messages differ only in numbers
 * (`Fillet radius clamped at vertex 67: effective radius 8.98`). Every
 * surface that shows warnings — the playground console, CLI stderr, LSP
 * diagnostics, the debug capture — groups them by *family*: the warning code,
 * its source position, and the message with every number outside quotes
 * replaced by `#`. Groups keep their first occurrence order, their count, and
 * the individual instances. Warnings without a source position are never
 * merged. The raw `CompileResult.warnings` list is never changed; `--json`
 * carries every instance.
 */
import type { CompileWarning, LogEntry, WarningCode } from './types';

/** Upper bound on instances any surface expands for one group. */
export const WARNING_GROUP_INSTANCE_LIMIT = 200;

/**
 * The family of a warning message: the `[warn] ` log-mirror prefix stripped,
 * every number (integers, decimals, negatives) outside single quotes replaced
 * by `#`, whitespace collapsed. Quoted names (gradient ids, font families) are
 * kept verbatim, digits included, so `TopoGradient 'surface1'` and
 * `TopoGradient 'surface2'` stay distinct groups.
 */
export function warningFamily(message: string): string {
  return message
    .replace(/^\[warn\]\s*/, '')
    .split(/('[^']*')/)
    .map((segment, i) => (i % 2 === 1 ? segment : segment.replace(/-?\d+(?:\.\d+)?/g, '#')))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface WarningGroup {
  code: WarningCode;
  family: string;
  line?: number;
  column?: number;
  /** Instances in this group, the first included. */
  count: number;
  first: CompileWarning;
  instances: CompileWarning[];
}

/**
 * Group warnings by code + position + family, in first-occurrence order.
 *
 * A warning without a source position (`gradient`, `font-glyph`) is emitted
 * once per entity, and its message is the only thing that identifies that
 * entity — merging two of them would hide the second name. Those are never
 * grouped: each is its own group with `count: 1`.
 */
export function groupWarnings(warnings: CompileWarning[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>();
  for (const w of warnings) {
    const family = warningFamily(w.message);
    const key = w.line == null ? `solo|${groups.size}` : `${w.code}|${w.line}:${w.column ?? ''}|${family}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      existing.instances.push(w);
      continue;
    }
    groups.set(key, {
      code: w.code,
      family,
      ...(w.line != null ? { line: w.line } : {}),
      ...(w.column != null ? { column: w.column } : {}),
      count: 1,
      first: w,
      instances: [w],
    });
  }
  return Array.from(groups.values());
}

/** A console row: a plain log entry, or a group of warning mirrors that share a family. */
export type LogRow =
  | { kind: 'entry'; entry: LogEntry }
  | { kind: 'group'; first: LogEntry; count: number; instances: LogEntry[] };

function mirrorText(entry: LogEntry): string {
  return entry.parts.map((p) => p.value).join(' ');
}

/**
 * Group the `[warn]` log mirrors of a log stream by line + family, each group
 * taking the position of its first occurrence; every other entry passes
 * through unchanged and in order. A group with `count === 1` is still a
 * group row so consumers have one code path for warnings. Mirrors without a
 * line (gradient and font warnings) are never merged — see `groupWarnings`.
 */
export function groupWarnLogEntries(logs: LogEntry[]): LogRow[] {
  const rows: LogRow[] = [];
  const groups = new Map<string, Extract<LogRow, { kind: 'group' }>>();
  for (const entry of logs) {
    if (entry.severity !== 'warn') {
      rows.push({ kind: 'entry', entry });
      continue;
    }
    if (entry.line == null) {
      rows.push({ kind: 'group', first: entry, count: 1, instances: [entry] });
      continue;
    }
    const key = `${entry.line}|${warningFamily(mirrorText(entry))}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      existing.instances.push(entry);
      continue;
    }
    const group: Extract<LogRow, { kind: 'group' }> = { kind: 'group', first: entry, count: 1, instances: [entry] };
    groups.set(key, group);
    rows.push(group);
  }
  return rows;
}
