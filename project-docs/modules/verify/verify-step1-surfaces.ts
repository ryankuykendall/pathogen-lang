/**
 * Phase 0a step 1: the probes in step1-probes/ give the same, fixed result on
 * every surface. Run `npm run build` and `npm run build:vscode` first, then:
 *
 *   npx tsx project-docs/modules/verify/verify-step1-surfaces.ts
 *
 * Surfaces, each through the call it really makes:
 *   - engine:     src/ compile() (what the tests use)
 *   - cli:        `node dist/cli.js <file> --json` (the published binary)
 *   - playground: dist/index.global.js in a fresh realm, compileWithContext()
 *                 (the compiler worker's call)
 *   - vscode:     packages/vscode-pathogen/compiler/index.global.js in a fresh
 *                 realm, compile() (the preview's call)
 *
 * random-pen.pathogen is checked for agreement between the line's end and the
 * circle drawn at ctx.position, since its numbers differ run to run.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import { compile } from '../../../src/index';

interface Fingerprint {
  d: string[];
  logs: string[];
}

/** The library's layers carry `data`; the CLI's JSON names the same string `d`. */
interface LayerLike {
  data?: string;
  d?: string;
}
interface LogLike {
  parts: { value: string }[];
}
interface ResultLike {
  layers?: LayerLike[];
  path?: string;
  logs?: LogLike[];
}

const PROBES = join('project-docs', 'modules', 'verify', 'step1-probes');

/** What each probe must produce once a path argument is evaluated once. */
const EXPECTED: Record<string, Partial<Fingerprint>> = {
  'cycler-pick.pathogen': { d: ['M 0 0 L 10 0 L 20 0'] },
  'index-side-effect.pathogen': { d: ['M 0 0 L 5 0 L 6 0'] },
  'side-effect-next-line.pathogen': { logs: ['1'] },
  'arc-rotation-count.pathogen': { d: ['M 0 0 A 10 10 30 0 1 20 0'], logs: ['1'] },
  // 25,000 `l` commands taking 1, 2, 3, 1, … in turn.
  'cycler-over-trace-limit.pathogen': {
    d: [['M 0 0', ...Array.from({ length: 25000 }, (_, i) => `l ${(i % 3) + 1} 0`)].join(' ')],
  },
};

function fingerprint(result: ResultLike): Fingerprint {
  const d = result.layers
    ? result.layers.map((l) => (l.d ?? l.data ?? '').trim())
    : [String(result.path ?? '').trim()];
  return { d, logs: (result.logs ?? []).map((l) => l.parts.map((p) => p.value).join(' ')) };
}

type Lib = { compile: (s: string) => ResultLike; compileWithContext: (s: string) => ResultLike };

function loadBundle(file: string): Lib {
  const realm = vm.createContext({
    console,
    TextEncoder,
    TextDecoder,
    URL,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    structuredClone,
  });
  vm.runInContext(readFileSync(file, 'utf-8'), realm, { filename: file });
  const lib = (realm as { PathogenLang?: Lib }).PathogenLang;
  if (!lib) throw new Error(`${file} did not define PathogenLang`);
  return lib;
}

function viaCli(file: string): ResultLike {
  // --json turns trace on, so a big probe prints well over the default 1 MB.
  return JSON.parse(
    execFileSync(process.execPath, ['dist/cli.js', file, '--json'], { encoding: 'utf-8', maxBuffer: 1 << 28 }),
  );
}

const playground = loadBundle('dist/index.global.js');
const vscode = loadBundle(join('packages', 'vscode-pathogen', 'compiler', 'index.global.js'));

let failures = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failures++;
  const shown = detail.length > 160 ? `${detail.slice(0, 160)}… (${detail.length} chars)` : detail;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${shown ? `  — ${shown}` : ''}`);
};

/** The circle after the line starts at (cx - 2), so its centre must equal the line's end. */
function penMatchesText(fp: Fingerprint): boolean {
  const m = /^M 0 0 L (\S+) 0 M (\S+) 0 [Aa] /.exec(fp.d[0] ?? '');
  return !!m && Math.abs(Number(m[2]) + 2 - Number(m[1])) < 1e-9;
}

for (const name of readdirSync(PROBES).filter((f) => f.endsWith('.pathogen')).sort()) {
  const file = join(PROBES, name);
  const source = readFileSync(file, 'utf-8');
  const surfaces: Record<string, Fingerprint> = {
    engine: fingerprint(compile(source)),
    cli: fingerprint(viaCli(file)),
    playground: fingerprint(playground.compileWithContext(source)),
    vscode: fingerprint(vscode.compile(source)),
  };

  if (name === 'random-pen.pathogen') {
    for (const [surface, fp] of Object.entries(surfaces)) {
      check(`${name} [${surface}] circle sits at the line's end`, penMatchesText(fp), fp.d[0]);
    }
    continue;
  }

  const engine = JSON.stringify(surfaces.engine);
  for (const [surface, fp] of Object.entries(surfaces)) {
    if (surface !== 'engine') check(`${name} [${surface}] matches the engine`, JSON.stringify(fp) === engine, JSON.stringify(fp));
  }
  const want = EXPECTED[name];
  if (want?.d) check(`${name} path data`, JSON.stringify(surfaces.engine.d) === JSON.stringify(want.d), surfaces.engine.d.join(' | '));
  if (want?.logs) check(`${name} logs`, JSON.stringify(surfaces.engine.logs) === JSON.stringify(want.logs), surfaces.engine.logs.join(' | '));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;
