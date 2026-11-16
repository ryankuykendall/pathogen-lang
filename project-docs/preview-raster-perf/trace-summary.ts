// Where a Chrome trace's time goes: complete events summed by thread and name, heaviest
// first; then every Paint event (which node, what clip) and what invalidated paint.
// The traces in this investigation came from page.tracing with the categories
// devtools.timeline, disabled-by-default-devtools.timeline, blink, cc, gpu, viz, toplevel.
//
//   npx tsx project-docs/preview-raster-perf/trace-summary.ts <trace.json>

import { readFileSync } from 'node:fs';

interface TraceEvent {
  name: string;
  ph: string;
  pid: number;
  tid: number;
  dur?: number;
  ts: number;
  args?: { name?: string; data?: Record<string, unknown> };
}

const file = process.argv[2] ?? '';
const raw = JSON.parse(readFileSync(file, 'utf8')) as { traceEvents?: TraceEvent[] } | TraceEvent[];
const events = Array.isArray(raw) ? raw : (raw.traceEvents ?? []);

const threadName = new Map<string, string>();
for (const e of events) {
  if (e.ph === 'M' && e.name === 'thread_name') threadName.set(`${e.pid}:${e.tid}`, String(e.args?.name ?? ''));
}

const sums = new Map<string, { ms: number; count: number; max: number }>();
for (const e of events) {
  if (e.ph !== 'X' || !e.dur) continue;
  const thread = threadName.get(`${e.pid}:${e.tid}`) ?? `${e.pid}:${e.tid}`;
  const key = `${thread.padEnd(26)} ${e.name}`;
  const s = sums.get(key) ?? { ms: 0, count: 0, max: 0 };
  s.ms += e.dur / 1000;
  s.count += 1;
  s.max = Math.max(s.max, e.dur / 1000);
  sums.set(key, s);
}
console.log('     total ms   count     max ms  thread / event');
for (const [key, s] of [...sums].sort((a, b) => b[1].ms - a[1].ms).slice(0, 40)) {
  console.log(
    `${s.ms.toFixed(0).padStart(11)} ${String(s.count).padStart(7)} ${s.max.toFixed(0).padStart(10)}  ${key}`,
  );
}

const paints = events.filter((e) => e.ph === 'X' && e.name === 'Paint');
console.log(`\nPaint events: ${paints.length}`);
for (const p of paints.slice(0, 40)) {
  console.log(`  ${((p.dur ?? 0) / 1000).toFixed(1)} ms  ${JSON.stringify(p.args?.data ?? {}).slice(0, 220)}`);
}
const invalidations = events.filter((e) => /Invalidat/i.test(e.name));
const reasons = new Map<string, number>();
for (const e of invalidations) {
  const data = e.args?.data as { reason?: string; nodeName?: string } | undefined;
  const key = `${e.name}: ${data?.reason ?? '?'} @ ${data?.nodeName ?? '?'}`;
  reasons.set(key, (reasons.get(key) ?? 0) + 1);
}
console.log(`\nInvalidations: ${invalidations.length}`);
for (const [k, n] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 30))
  console.log(`  ${String(n).padStart(4)}  ${k}`);
