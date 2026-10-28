/**
 * AUDIT.md §2.17: the union repros (a speck, a shared stretch, a kiss) finish
 * and give the same result on every surface. Run `npm run build` and
 * `npm run build:vscode` first, then:
 *
 *   npx tsx project-docs/path-block-boolean-operations-audit/verify-union-oom-surfaces.ts
 *
 * Surfaces, each through the call it really makes:
 *   - engine:     src/ compile() (what the tests use)
 *   - cli:        `node dist/cli.js <file> --json` (the published binary)
 *   - playground: dist/index.global.js in a fresh realm, compileWithContext()
 *                 (the compiler worker's call)
 *   - vscode:     packages/vscode-pathogen/compiler/index.global.js in a fresh
 *                 realm, compile() (the preview's call)
 *
 * The glyph cell needs fonts, which the bundles can't load in a bare realm;
 * tests/boolean-ops.test.ts covers it through the engine.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import { compile } from '../../src/index';

interface LayerLike {
  data?: string;
  d?: string;
}
interface ResultLike {
  layers?: LayerLike[];
  path?: string;
}
type Lib = { compile: (s: string) => ResultLike; compileWithContext: (s: string) => ResultLike };

const DIR = join('project-docs', 'path-block-boolean-operations-audit');
const REPROS = ['union-speck-repro.pathogen', 'union-partial-overlap-repro.pathogen', 'union-kissing-repro.pathogen'];

/** The library's layers carry `data`; the CLI's JSON names the same string `d`. */
function pathData(result: ResultLike): string[] {
  return result.layers ? result.layers.map((l) => (l.d ?? l.data ?? '').trim()) : [String(result.path ?? '').trim()];
}

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
  return JSON.parse(execFileSync(process.execPath, ['dist/cli.js', file, '--json'], { encoding: 'utf-8' }));
}

const playground = loadBundle('dist/index.global.js');
const vscode = loadBundle(join('packages', 'vscode-pathogen', 'compiler', 'index.global.js'));

let failures = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failures++;
  const shown = detail.length > 160 ? `${detail.slice(0, 160)}… (${detail.length} chars)` : detail;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${shown ? `  — ${shown}` : ''}`);
};

for (const name of REPROS) {
  const file = join(DIR, name);
  const source = readFileSync(file, 'utf-8');
  const timed = (run: () => ResultLike): { d: string[]; ms: number } => {
    const started = Date.now();
    const d = pathData(run());
    return { d, ms: Date.now() - started };
  };
  const surfaces = {
    engine: timed(() => compile(source)),
    cli: timed(() => viaCli(file)),
    playground: timed(() => playground.compileWithContext(source)),
    vscode: timed(() => vscode.compile(source)),
  };
  const engine = JSON.stringify(surfaces.engine.d);
  check(`${name} [engine] draws a closed outline`, /z\s*$/.test(surfaces.engine.d[0] ?? ''), `${surfaces.engine.ms} ms`);
  for (const [surface, result] of Object.entries(surfaces)) {
    if (surface !== 'engine') {
      check(`${name} [${surface}] matches the engine`, JSON.stringify(result.d) === engine, `${result.ms} ms`);
    }
  }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;
