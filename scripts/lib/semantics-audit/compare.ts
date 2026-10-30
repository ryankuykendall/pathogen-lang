/**
 * What a compile produced, in a form two evaluators can be compared on:
 * the thrown message, or the whole CompileResult (trace on, so the pen's
 * path is included) plus the SVG document generateSvg() builds from it.
 */

export interface Outcome {
  error?: string;
  /** Canonical JSON of the CompileResult. */
  result?: string;
  svg?: string;
  randomCalls: number;
}

/** Plain data with sorted keys: Maps become objects, Sets arrays, functions and undefined drop out. */
export function canonical(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'undefined') return undefined;
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    return value;
  }
  if (seen.has(value)) return '[cycle]';
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((v) => canonical(v, seen) ?? null);
    if (value instanceof Map) {
      return canonical(Object.fromEntries([...value].map(([k, v]) => [String(k), v])), seen);
    }
    if (value instanceof Set) return [...value].map((v) => canonical(v, seen) ?? null);
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return `[${value.byteLength} bytes]`;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = canonical((value as Record<string, unknown>)[key], seen);
      if (v !== undefined) out[key] = v;
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/** The first place two canonical values differ, as a dotted path with both sides, or null. */
export function firstDifference(a: unknown, b: unknown, path = '$'): string | null {
  if (a === b) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return `${path}: ${short(a)} → ${short(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: ${short(a)} → ${short(b)}`;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  for (const key of [...new Set([...Object.keys(ao), ...Object.keys(bo)])].sort()) {
    const d = firstDifference(ao[key], bo[key], `${path}.${key}`);
    if (d) return d;
  }
  return null;
}

function short(v: unknown): string {
  const text = JSON.stringify(v) ?? String(v);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

/** Where two outcomes first differ, or null when they're the same. */
export function outcomeDifference(before: Outcome, after: Outcome): string | null {
  if (before.error !== undefined || after.error !== undefined) {
    if (before.error === after.error) return null;
    return `error: ${short(before.error ?? null)} → ${short(after.error ?? null)}`;
  }
  if (before.result !== after.result) {
    return firstDifference(JSON.parse(before.result ?? 'null'), JSON.parse(after.result ?? 'null')) ?? 'result';
  }
  if (before.svg !== after.svg) return 'svg (result identical)';
  return null;
}
