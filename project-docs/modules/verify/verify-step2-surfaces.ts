/**
 * Phase 0a step 2: the probes in step2-probes/ give the same, fixed result on
 * every surface. Run `npm run build` and `npm run build:vscode` first, then:
 *
 *   npx tsx project-docs/modules/verify/verify-step2-surfaces.ts
 *
 * Surfaces, each through the call it really makes (as verify-step1-surfaces.ts):
 *   - engine:     src/ compile() (what the tests use)
 *   - cli:        `node dist/cli.js <file> --json` (the published binary)
 *   - playground: dist/index.global.js in a fresh realm, compileWithContext()
 *                 (the compiler worker's call)
 *   - vscode:     packages/vscode-pathogen/compiler/index.global.js in a fresh
 *                 realm, compile() (the preview's call)
 *
 * Also: a block rule that now reaches called code (an absolute command in a
 * fn called inside a block) gives the same error on every surface.
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

const PROBES = join('project-docs', 'modules', 'verify', 'step2-probes');

/** What each probe logs once the drawing context follows the call. */
const EXPECTED_LOGS: Record<string, string[]> = {
  'callback-in-block.pathogen': ['[5]'],
  'ctx-after-block.pathogen': ['10'],
  'ctx-in-block.pathogen': ['5'],
  'fn-reads-ctx-in-block.pathogen': ['5'],
  'lambda-draws-in-block.pathogen': ['l 10 0'],
  'lambda-written-in-block.pathogen': ['70'],
  'loop-in-block-reads-ctx.pathogen': ['10', '20'],
  'stateless-control.pathogen': ['30', '70', '33'],
};

function fingerprint(result: ResultLike): Fingerprint {
  const d = result.layers ? result.layers.map((l) => (l.d ?? l.data ?? '').trim()) : [String(result.path ?? '').trim()];
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
  return JSON.parse(execFileSync(process.execPath, ['dist/cli.js', file, '--json'], { encoding: 'utf-8', maxBuffer: 1 << 28 }));
}

/** The error message a surface gives, or '(no error)'. */
function errorOf(run: () => unknown): string {
  try {
    run();
    return '(no error)';
  } catch (e) {
    return (e instanceof Error ? e.message : String(e)).split('\n')[0];
  }
}

const playground = loadBundle('dist/index.global.js');
const vscode = loadBundle(join('packages', 'vscode-pathogen', 'compiler', 'index.global.js'));

let failures = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failures++;
  const shown = detail.length > 160 ? `${detail.slice(0, 160)}… (${detail.length} chars)` : detail;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${shown ? `  — ${shown}` : ''}`);
};

for (const name of readdirSync(PROBES).filter((f) => f.endsWith('.pathogen')).sort()) {
  const file = join(PROBES, name);
  const source = readFileSync(file, 'utf-8');
  const surfaces: Record<string, Fingerprint> = {
    engine: fingerprint(compile(source)),
    cli: fingerprint(viaCli(file)),
    playground: fingerprint(playground.compileWithContext(source)),
    vscode: fingerprint(vscode.compile(source)),
  };
  const engine = JSON.stringify(surfaces.engine);
  for (const [surface, fp] of Object.entries(surfaces)) {
    if (surface !== 'engine') check(`${name} [${surface}] matches the engine`, JSON.stringify(fp) === engine, JSON.stringify(fp));
  }
  const want = EXPECTED_LOGS[name];
  check(`${name} logs`, JSON.stringify(surfaces.engine.logs) === JSON.stringify(want), surfaces.engine.logs.join(' | '));
}

// A block rule reaching called code: the same error on every surface.
const RULE = 'fn edge() { L 10 10 }\nlet block = @{ edge(); };';
const want = "Absolute path command 'L' is not allowed inside path blocks";
const ruleErrors: Record<string, string> = {
  engine: errorOf(() => compile(RULE)),
  playground: errorOf(() => playground.compileWithContext(RULE)),
  vscode: errorOf(() => vscode.compile(RULE)),
};
for (const [surface, message] of Object.entries(ruleErrors)) {
  check(`absolute command in a fn called in a block [${surface}]`, message.includes(want), message);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;
