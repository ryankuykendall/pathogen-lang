/**
 * Semantics audit for phase 0a (project-docs/modules/06-phase-0a-plan.md):
 * compile every Pathogen program in the repository with the evaluator at a
 * baseline commit and with the working tree, and sort what changed.
 *
 *   npx tsx scripts/audit-semantics.ts                      # baseline HEAD, all programs
 *   npx tsx scripts/audit-semantics.ts --step 1 --markdown project-docs/modules/verify/semantics-audit-step1.md
 *
 * Both runs get the same seeded Math.random per program, the same fonts
 * (loaded once, downloads off) and trace on, and are compared on the thrown
 * message or the whole CompileResult plus generateSvg(). The baseline runs
 * twice; a program that differs from itself is set aside as flaky.
 *
 * Programs run in small batches, each in its own process (`--jobs` at a
 * time), so one heavy program or an evaluator cache can't exhaust the heap
 * for the rest. A batch writes one JSON line per program as it goes. When a
 * batch dies (out of memory) or reports nothing for `--timeout` seconds, the
 * program it was on is listed as too-large and the rest of the batch runs
 * again in a fresh process.
 *
 * Trace is for programs of ordinary size only. With trace on, every pen keeps
 * its command history and the evaluator copies all of it into a new `ctx`
 * after each command, so a traced compile takes time in the square of the
 * commands drawn: 20,000 commands take about 4 s, and a 480,000-command
 * program never finished. So each program is first compiled once with trace
 * off to count the commands it draws. Above `--trace-limit`, all three
 * compiles run with trace off, and the report lists those programs. They also
 * run with trace off when that compile throws: an error is compared on its
 * message alone, so trace changes nothing there.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { Command } from 'commander';

import { AUDIT_DIR, loadBaseline, loadFromDir, loadScopeAudit, resolveCommit } from './lib/semantics-audit/baseline';
import { canonical, outcomeDifference } from './lib/semantics-audit/compare';
import { collectCorpus, ORIGINS, probes } from './lib/semantics-audit/corpus';
import { withSeededRandom } from './lib/semantics-audit/random';
import { tagsFor } from './lib/semantics-audit/tags';

import type { PathogenModule, ScopeAuditHook } from './lib/semantics-audit/baseline';
import type { Outcome } from './lib/semantics-audit/compare';
import type { Origin, Program } from './lib/semantics-audit/corpus';
import type { ResolvedFont } from '../src/host/load-fonts';
import type * as NodeApi from '../src/node';

type Bucket = 'unchanged' | 'expected' | 'unexplained' | 'error→ok' | 'ok→error' | 'flaky' | 'too-large' | 'skipped';

interface Entry {
  id: string;
  origin: Origin;
  bucket: Bucket;
  tags: string[];
  difference?: string;
  randomCalls?: [number, number];
  ms?: number;
  note?: string;
  /** False when the three compiles ran with trace off (see the file comment). */
  traced?: boolean;
  /** Commands the baseline draws, from the trace-off size check. */
  commands?: number;
  /**
   * Step 3: names in a named fn that the new (lexical) rule resolves
   * differently from the old (caller-scope) rule, as "kind fn.name" — from
   * the evaluator's scope recorder, so silent cases show up even when the
   * output didn't change.
   */
  scope?: string[];
}

/**
 * What a batch is doing right now, written to `<out>.phase` before each
 * stage, so a batch that dies can be reported with the stage it died in.
 */
interface Phase {
  id: string;
  stage: 'size check' | 'traced compiles' | 'trace-off compiles';
  commands?: number;
}

const BUCKET_ORDER: Bucket[] = [
  'unexplained',
  'ok→error',
  'error→ok',
  'expected',
  'flaky',
  'too-large',
  'skipped',
  'unchanged',
];

// ─── One program ───────────────────────────────────────────────────────

async function loadFonts(p: Program, lib: PathogenModule, node: typeof NodeApi): Promise<ResolvedFont[]> {
  if (!lib.planFontDirectives(p.source)?.directives.length) return [];
  const programFile = p.file ? resolve(p.file) : resolve('<inline>.pathogen');
  const programDir = dirname(programFile);
  const { root } = node.findProjectRoot(programDir);
  const host = node.createNodeFontHost({
    root,
    programDir,
    offlineReason: 'the semantics audit runs offline',
    cacheDir: node.defaultCacheDir(),
    fontDirs: node.fontDirsFromEnv(process.env.PATHOGEN_FONT_DIRS),
  });
  const entry = (p.file && node.projectEntry(root, programFile)) || '/<inline>.pathogen';
  const { fonts } = await lib.resolveFonts(p.source, { host, entry });
  return fonts;
}

/** Path command letters across a result's path layers (no `e`, so exponents don't count). */
function countCommands(layers: readonly { data?: unknown }[]): number {
  let n = 0;
  for (const layer of layers) {
    if (typeof layer.data === 'string') n += layer.data.match(/[MLHVCSQTAZmlhvcsqtaz]/g)?.length ?? 0;
  }
  return n;
}

function compileWith(
  lib: PathogenModule,
  p: Program,
  fonts: readonly ResolvedFont[],
  trace: boolean,
): Outcome & { commands?: number } {
  const registry = fonts.length ? lib.buildFontRegistry(fonts).registry : undefined;
  const { value, randomCalls } = withSeededRandom(p.id, (): Omit<Outcome, 'randomCalls'> & { commands?: number } => {
    try {
      const result = lib.compile(p.source, { fonts: registry, trace });
      return {
        result: JSON.stringify(canonical(result)),
        svg: lib.generateSvg(result),
        commands: countCommands(result.layers),
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
  return { ...value, randomCalls };
}

function classify(before: Outcome, after: Outcome, tags: string[]): Bucket {
  if (outcomeDifference(before, after) === null) return 'unchanged';
  if (before.error === undefined && after.error !== undefined) return 'ok→error';
  if (before.error !== undefined && after.error === undefined) return 'error→ok';
  return tags.length ? 'expected' : 'unexplained';
}

interface Libraries {
  before: PathogenModule;
  after: PathogenModule;
  node: typeof NodeApi;
  /** Step 3: the scope recorder of `after`. */
  scopeAudit?: ScopeAuditHook;
}

/** Compile with `after`, collecting the scope recorder's events when it is loaded. */
function compileAfter(
  libs: Libraries,
  p: Program,
  fonts: readonly ResolvedFont[],
  traced: boolean,
): { outcome: Outcome; scope: string[] } {
  const seen = new Set<string>();
  libs.scopeAudit?.((e) => seen.add(`${e.kind} ${e.fn}.${e.name}`));
  try {
    return { outcome: compileWith(libs.after, p, fonts, traced), scope: [...seen].sort() };
  } finally {
    libs.scopeAudit?.(null);
  }
}

async function auditProgram(
  p: Program,
  libs: Libraries,
  step: number,
  traceLimit: number,
  setPhase: (phase: Phase) => void,
): Promise<Entry> {
  const started = Date.now();
  const base = { id: p.id, origin: p.origin, tags: [] as string[] };
  try {
    libs.before.parse(p.source);
  } catch {
    return { ...base, bucket: 'skipped', note: 'the baseline parser rejects it' };
  }
  const fonts = await loadFonts(p, libs.after, libs.node);
  // Size check: trace off is cheap at any size. One mode for all three
  // compiles, so before and after are always compared like for like.
  setPhase({ id: p.id, stage: 'size check' });
  const sized = compileWith(libs.before, p, fonts, false);
  const { commands } = sized;
  const traced = sized.error === undefined && commands !== undefined && commands <= traceLimit;
  setPhase({ id: p.id, stage: traced ? 'traced compiles' : 'trace-off compiles', commands });
  const first = traced ? compileWith(libs.before, p, fonts, true) : sized;
  const second = compileWith(libs.before, p, fonts, traced);
  const mode = { traced, ...(commands !== undefined ? { commands } : {}) };
  const unstable = outcomeDifference(first, second);
  if (unstable !== null) return { ...base, ...mode, bucket: 'flaky', difference: unstable };
  const { outcome: now, scope } = compileAfter(libs, p, fonts, traced);
  const tags = step ? tagsFor(step, p.source, libs.after) : [];
  // Step 3's tags come from the recorder: what each name actually resolved to.
  for (const kind of new Set(scope.map((e) => e.split(' ')[0]))) tags.push(`scope:${kind}`);
  const bucket = classify(first, now, tags);
  return {
    ...base,
    ...mode,
    tags,
    ...(scope.length ? { scope } : {}),
    bucket,
    ...(bucket !== 'unchanged' ? { difference: outcomeDifference(first, now) ?? undefined } : {}),
    randomCalls: [first.randomCalls, now.randomCalls],
    ms: Date.now() - started,
  };
}

// ─── A batch, in its own process ───────────────────────────────────────

async function runBatch(
  batchFile: string,
  outFile: string,
  baseline: string,
  step: number,
  traceLimit: number,
  afterDir: string | undefined,
): Promise<void> {
  // Run in the batch file's order: the parent takes the first unreported id
  // as the program a dead batch was on.
  const ids = JSON.parse(readFileSync(batchFile, 'utf-8')) as string[];
  const byId = new Map((await collectCorpus(new Set(ORIGINS))).map((p) => [p.id, p]));
  // An id the corpus doesn't hold is a --probe file.
  const programs = ids.flatMap((id) => byId.get(id) ?? (existsSync(id) ? probes([id]) : []));
  const libs: Libraries = {
    before: await loadBaseline(baseline),
    after: afterDir ? await loadFromDir(afterDir) : await import('../src'),
    node: await import('../src/node'),
    ...(step === 3 ? { scopeAudit: await loadScopeAudit(afterDir) } : {}),
  };
  await libs.before.ensureOpentype();
  await libs.after.ensureOpentype();
  const setPhase = (phase: Phase) => writeFileSync(`${outFile}.phase`, JSON.stringify(phase));
  for (const p of programs) {
    const entry = await auditProgram(p, libs, step, traceLimit, setPhase);
    appendFileSync(outFile, `${JSON.stringify(entry)}\n`);
    if (entry.bucket !== 'unchanged') process.stdout.write(`${entry.bucket.padEnd(12)} ${p.id}\n`);
  }
}

/** The stage a dead batch was in, if it was on `id`. */
function readPhase(outFile: string, id: string): Phase | undefined {
  try {
    const phase = JSON.parse(readFileSync(`${outFile}.phase`, 'utf-8')) as Phase;
    return phase.id === id ? phase : undefined;
  } catch {
    return undefined;
  }
}

/** " in the <stage>" for a too-large note, or nothing when the stage is unknown. */
function describeStage(phase: Phase | undefined): string {
  if (!phase) return '';
  if (phase.stage === 'size check') return ' in the size check (one trace-off compile with the baseline)';
  return ` in the ${phase.stage}${phase.commands !== undefined ? ` (${phase.commands} commands)` : ''}`;
}

/** The entries a batch has written; a line cut off by a killed process is ignored. */
function readEntries(outFile: string): Entry[] {
  if (!existsSync(outFile)) return [];
  return readFileSync(outFile, 'utf-8')
    .split('\n')
    .flatMap((line) => {
      if (!line) return [];
      try {
        return [JSON.parse(line) as Entry];
      } catch {
        return [];
      }
    });
}

function appendEntry(outFile: string, entry: Entry): void {
  const text = existsSync(outFile) ? readFileSync(outFile, 'utf-8') : '';
  const sep = text && !text.endsWith('\n') ? '\n' : '';
  appendFileSync(outFile, `${sep}${JSON.stringify(entry)}\n`);
}

interface BatchExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

/**
 * Run one batch in its own node process. Node runs directly (not through
 * npx) so a kill reaches the process doing the work. A watchdog stops the
 * batch when it has written nothing for `timeoutMs`.
 */
async function spawnBatch(
  batchFile: string,
  outFile: string,
  baseline: string,
  step: number,
  traceLimit: number,
  afterDir: string | undefined,
  heapMb: number,
  timeoutMs: number,
): Promise<BatchExit> {
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [
        `--max-old-space-size=${heapMb}`,
        '--import',
        'tsx',
        'scripts/audit-semantics.ts',
        '--batch',
        batchFile,
        '--out',
        outFile,
        '--baseline',
        baseline,
        '--step',
        String(step),
        '--trace-limit',
        String(traceLimit),
        ...(afterDir ? ['--after-dir', afterDir] : []),
      ],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    let written = readEntries(outFile).length;
    let progressAt = Date.now();
    let timedOut = false;
    const watchdog = setInterval(() => {
      const now = readEntries(outFile).length;
      if (now !== written) {
        written = now;
        progressAt = Date.now();
      } else if (!timedOut && Date.now() - progressAt > timeoutMs) {
        timedOut = true;
        child.kill('SIGKILL');
      }
    }, 2000);
    child.on('close', (code, signal) => {
      clearInterval(watchdog);
      done({ code, signal, timedOut });
    });
  });
}

// ─── Report ────────────────────────────────────────────────────────────

function markdown(
  entries: Entry[],
  meta: { baseline: string; step: number; date: string; traceLimit: number; afterDir?: string },
): string {
  const counts = new Map<Bucket, number>();
  for (const e of entries) counts.set(e.bucket, (counts.get(e.bucket) ?? 0) + 1);
  // Over the limit. (A program whose baseline throws also runs with trace off,
  // but an error is compared on its message alone, so trace changes nothing there.)
  const untraced = entries.filter((e) => e.traced === false && e.commands !== undefined);
  const untracedNote = untraced.length
    ? ` (${untraced.length} larger ones are listed under "compared with trace off").`
    : '.';
  const lines = [
    `# Semantics audit${meta.step ? ` (phase 0a step ${meta.step})` : ''}`,
    '',
    `${entries.length} programs, ${meta.date}. Baseline \`${meta.baseline.slice(0, 12)}\` vs ` +
      `${meta.afterDir ? `the \`src/\` in \`${meta.afterDir}\`` : 'the working tree'}. ` +
      'Seeded `Math.random`, fonts loaded once with downloads off; compared on the error message, ' +
      'the whole CompileResult and `generateSvg()`, with trace on for programs that draw up to ' +
      `${meta.traceLimit} commands${untracedNote}`,
    '',
    '| Outcome | Programs |',
    '|---|---|',
    ...BUCKET_ORDER.filter((b) => counts.has(b)).map((b) => `| ${b} | ${counts.get(b)} |`),
    '',
  ];
  if (untraced.length) {
    lines.push(
      '## compared with trace off',
      '',
      `These draw more than ${meta.traceLimit} commands, where a traced compile takes minutes to hours. ` +
        'They are compared the same way without the per-command trace (`records`, `commands`): path data, ' +
        'layers, logs, warnings and the SVG still have to match.',
      '',
    );
    for (const e of untraced) lines.push(`- \`${e.id}\` (${e.commands} commands; ${e.bucket})`);
    lines.push('');
  }
  const rebound = entries.filter((e) => e.scope?.length);
  if (rebound.length) {
    lines.push(
      '## names the two scope rules resolve differently',
      '',
      "From the evaluator's scope recorder (step 3): every program where a name used in a named fn resolves " +
        'differently under the lexical rule than under the old caller-scope rule, as `kind fn.name`, whether ' +
        'or not its output changed. `bound-elsewhere` is the silent case (another binding, or a built-in, is ' +
        'used now); `only-where-written` was an error before; `only-where-called` is the new hinted error.',
      '',
    );
    for (const e of rebound) lines.push(`- \`${e.id}\` (${e.bucket}): ${e.scope!.join('; ')}`);
    lines.push('');
  }
  for (const bucket of BUCKET_ORDER) {
    if (bucket === 'unchanged') continue;
    const list = entries.filter((e) => e.bucket === bucket);
    if (!list.length) continue;
    lines.push(`## ${bucket}`, '');
    for (const e of list) {
      const extra = [
        e.tags.length ? `tags: ${e.tags.join(', ')}` : '',
        e.randomCalls && e.randomCalls[0] !== e.randomCalls[1]
          ? `random() calls ${e.randomCalls[0]} → ${e.randomCalls[1]}`
          : '',
        e.note ?? '',
      ].filter(Boolean);
      lines.push(`- \`${e.id}\`${extra.length ? ` (${extra.join('; ')})` : ''}`);
      if (e.difference) lines.push(`  - ${e.difference.replace(/\n/g, ' ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const program = new Command();
program
  .name('audit-semantics')
  .description('Compile every program in the repo with a baseline commit and the working tree, and sort what changed')
  .option('--baseline <ref>', 'commit whose src/ is the old evaluator', 'HEAD')
  .option('--step <n>', 'phase 0a step whose tags explain expected differences (0: none)', '0')
  .option('--origin <list>', `comma-separated subset of ${ORIGINS.join(',')}`, ORIGINS.join(','))
  .option('--only <text>', 'only programs whose id contains this text')
  .option('--probe <files>', 'comma-separated extra .pathogen files to audit too (origin "probes"), tracked or not')
  .option(
    '--probe-dir <dir>',
    'every .pathogen file in this folder is a probe too (e.g. stored workspaces from export-workspace-sources.ts)',
  )
  .option('--jobs <n>', 'batches to run at once', '4')
  .option('--batch-size <n>', 'programs per process', '25')
  .option('--heap <mb>', 'heap limit per batch process', '6144')
  .option('--timeout <s>', 'seconds a program may run (three compiles) before it is listed as too-large', '240')
  .option('--trace-limit <n>', 'compare programs that draw more commands than this with trace off', '20000')
  .option(
    '--after-dir <dir>',
    'folder holding the src/ to compare against the baseline, instead of the working tree ' +
      '(a snapshot, so edits made elsewhere during the run cannot leak in)',
  )
  .option(
    '--work-dir <dir>',
    'folder for the default report and batches/ (batches/ is emptied at the start)',
    AUDIT_DIR,
  )
  .option('--report <file>', 'JSON report (default: <work-dir>/report.json)')
  .option('--markdown <file>', 'also write a Markdown summary')
  .option('--batch <file>', '(internal) run the program ids listed in this JSON file')
  .option('--out <file>', '(internal) JSON-lines output for --batch')
  .action(
    async (opts: {
      baseline: string;
      step: string;
      origin: string;
      only?: string;
      probe?: string;
      probeDir?: string;
      jobs: string;
      batchSize: string;
      heap: string;
      timeout: string;
      traceLimit: string;
      afterDir?: string;
      workDir: string;
      report?: string;
      markdown?: string;
      batch?: string;
      out?: string;
    }) => {
      const step = Number(opts.step);
      const traceLimit = Number(opts.traceLimit);
      if (!Number.isInteger(traceLimit) || traceLimit < 0) {
        throw new Error(`--trace-limit must be a whole number of commands, got "${opts.traceLimit}"`);
      }
      if (opts.batch) {
        if (!opts.out) throw new Error('--batch needs --out');
        await runBatch(opts.batch, opts.out, opts.baseline, step, traceLimit, opts.afterDir);
        return;
      }
      if (opts.afterDir) await loadFromDir(opts.afterDir); // fail before the batches start
      const batchDir = join(opts.workDir, 'batches');
      const report = opts.report ?? join(opts.workDir, 'report.json');

      const origins = new Set(opts.origin.split(',').map((o) => o.trim()) as Origin[]);
      for (const o of origins) {
        if (!(ORIGINS as readonly string[]).includes(o)) throw new Error(`Unknown origin "${o}"`);
      }
      const baseline = resolveCommit(opts.baseline);
      await loadBaseline(baseline); // export it once, before the batches start
      let programs = await collectCorpus(origins);
      if (opts.only) programs = programs.filter((p) => p.id.includes(opts.only!));
      const known = new Set(programs.map((p) => p.id));
      const fromDir = opts.probeDir
        ? readdirSync(opts.probeDir)
            .filter((f) => f.endsWith('.pathogen'))
            .sort()
            .map((f) => join(opts.probeDir!, f))
        : [];
      const extra = [...(opts.probe ?? '').split(','), ...fromDir]
        .map((f) => f.trim())
        .filter((f) => f && !known.has(f));
      programs.push(...probes(extra));

      rmSync(batchDir, { recursive: true, force: true });
      mkdirSync(batchDir, { recursive: true });
      const size = Math.max(1, Number(opts.batchSize));
      const batches: { file: string; out: string }[] = [];
      for (let i = 0; i < programs.length; i += size) {
        const n = batches.length;
        const file = join(batchDir, `batch-${n}.json`);
        writeFileSync(file, JSON.stringify(programs.slice(i, i + size).map((p) => p.id)));
        batches.push({ file, out: join(batchDir, `batch-${n}.jsonl`) });
      }
      process.stdout.write(
        `${programs.length} programs in ${batches.length} batches; baseline ${baseline.slice(0, 12)}\n`,
      );

      const byId = new Map(programs.map((p) => [p.id, p]));
      const started = Date.now();
      let next = 0;
      let finished = 0;
      // A batch that dies or stalls: the program it was on is too-large, and
      // the rest of its ids go back on the queue as a new batch.
      const settle = (b: { file: string; out: string }, exit: BatchExit): void => {
        const ids = JSON.parse(readFileSync(b.file, 'utf-8')) as string[];
        const done = new Set(readEntries(b.out).map((e) => e.id));
        const left = ids.filter((id) => !done.has(id));
        if (!left.length) return;
        if (exit.code === 0 && !exit.timedOut) {
          process.stdout.write(`batch ${b.file} ended without reporting ${left.length} programs\n`);
          return;
        }
        const [stuck, ...rest] = left;
        const stage = describeStage(readPhase(b.out, stuck));
        const note = exit.timedOut
          ? `no result after ${opts.timeout} s${stage}, so it was stopped`
          : `its process died (${exit.signal ?? `exit ${exit.code}`})${stage}, most likely out of memory at ${opts.heap} MB`;
        appendEntry(b.out, { id: stuck, origin: byId.get(stuck)!.origin, tags: [], bucket: 'too-large', note });
        process.stdout.write(`too-large    ${stuck} (${note})\n`);
        if (!rest.length) return;
        const n = batches.length;
        const file = join(batchDir, `batch-${n}.json`);
        writeFileSync(file, JSON.stringify(rest));
        batches.push({ file, out: join(batchDir, `batch-${n}.jsonl`) });
      };
      const worker = async () => {
        while (next < batches.length) {
          const b = batches[next++];
          const exit = await spawnBatch(
            b.file,
            b.out,
            baseline,
            step,
            traceLimit,
            opts.afterDir,
            Number(opts.heap),
            Number(opts.timeout) * 1000,
          );
          finished++;
          settle(b, exit);
          if (finished % 10 === 0) process.stdout.write(`… ${finished}/${batches.length} batches\n`);
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Number(opts.jobs)) }, worker));

      const reported = new Map<string, Entry>();
      for (const b of batches) {
        for (const e of readEntries(b.out)) reported.set(e.id, e);
      }
      const entries = programs.map(
        (p): Entry =>
          reported.get(p.id) ?? {
            id: p.id,
            origin: p.origin,
            tags: [],
            bucket: 'skipped',
            note: 'its batch process died before reporting it (out of memory or a crash); rerun with --only',
          },
      );

      const meta = {
        baseline,
        step,
        date: new Date().toISOString().slice(0, 10),
        traceLimit,
        ...(opts.afterDir ? { afterDir: opts.afterDir } : {}),
      };
      mkdirSync(dirname(report), { recursive: true });
      writeFileSync(report, JSON.stringify({ ...meta, entries }, null, 2));
      const summary = markdown(entries, meta);
      if (opts.markdown) {
        mkdirSync(dirname(opts.markdown), { recursive: true });
        writeFileSync(opts.markdown, summary);
      }
      const counts = BUCKET_ORDER.map((b) => [b, entries.filter((e) => e.bucket === b).length] as const).filter(
        ([, n]) => n,
      );
      const untraced = entries.filter((e) => e.traced === false && e.commands !== undefined).length;
      process.stdout.write(
        `\n${counts.map(([b, n]) => `${b}: ${n}`).join(', ')} (${((Date.now() - started) / 1000).toFixed(0)} s)\n` +
          `${untraced} compared with trace off (over ${traceLimit} commands)\n` +
          `Report: ${report}${opts.markdown ? `, ${opts.markdown}` : ''}\n`,
      );
      process.exitCode = entries.some((e) => e.bucket === 'unexplained' || e.bucket === 'ok→error') ? 1 : 0;
    },
  );
program.parse();
