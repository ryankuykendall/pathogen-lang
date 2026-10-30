/**
 * Phase 0a step 4 (`const`): the probes in step4-probes/ give the same, fixed
 * result on every surface. Run `npm run build` and `npm run build:vscode`
 * first, then:
 *
 *   npx tsx project-docs/modules/verify/verify-step4-surfaces.ts
 *
 * Surfaces, each through the call it really makes (as verify-step3-surfaces.ts):
 *   - engine:     src/ compile()
 *   - cli:        `node dist/cli.js <file> --json`
 *   - playground: dist/index.global.js in a fresh realm, compileWithContext()
 *   - vscode:     packages/vscode-pathogen/compiler/index.global.js, compile()
 *
 * Also, from both bundles: @font reads a const (planFontDirectives), the
 * editor services know the keyword (hover, completion, a readonly semantic
 * token, a Constant in the outline), the formatter keeps `const`, and a
 * reassigned const in an uncalled fn is a diagnostic at the assignment.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import { compile } from '../../../src/index';

interface LayerLike {
  data?: string;
  d?: string;
}
interface LogLike {
  parts: { value: unknown }[];
  severity?: string;
}
interface ResultLike {
  layers?: LayerLike[];
  logs?: LogLike[];
}
type Lib = {
  compile: (s: string) => ResultLike;
  compileWithContext: (s: string) => ResultLike;
  planFontDirectives: (s: string) => { directives: { source: string }[]; errors: { message: string }[] } | null;
  StringTextDocument: new (s: string) => unknown;
  getHoverInfo: (doc: unknown, pos: { line: number; character: number }) => { contents: string } | null;
  getCompletions: (doc: unknown, pos: { line: number; character: number }) => { label: string }[];
  getSemanticTokens: (doc: unknown) => { line: number; character: number; modifiers: number }[];
  TOKEN_MODIFIERS: readonly string[];
  getDocumentSymbols: (doc: unknown) => { name: string; kind: number }[];
  formatDocument: (doc: unknown) => { newText: string }[];
  getDiagnostics: (doc: unknown) => { message: string; range: { start: { line: number; character: number } } }[];
};

const PROBES = join('project-docs', 'modules', 'verify', 'step4-probes');
const REASSIGN = 'Cannot assign to LIMIT — it is a const. Declare it with let if it needs to change';

const EXPECTED: Record<string, { d?: string; logs?: string[]; error?: string }> = {
  'const-basics.pathogen': {
    d: 'M 10 10 L 90 10 M 10 30 L 90 30 M 10 50 L 90 50',
    logs: ['10 20 [10, 30, 50]'],
  },
  'const-reassigned-in-uncalled-fn.pathogen': { error: `Parse error at line 8, column 3: ${REASSIGN}` },
  'const-redeclared.pathogen': {
    error: 'Parse error at line 6, column 1: Cannot declare margin again in this scope — it is a const. Use another name',
  },
  'const-reassigned-at-run-time.pathogen': { error: `Line 7: ${REASSIGN}` },
};

interface Fingerprint {
  d?: string;
  logs?: string[];
  error?: string;
}

function fingerprint(run: () => ResultLike): Fingerprint {
  try {
    const result = run();
    const d = (result.layers ?? [])
      .map((l) => (l.d ?? l.data ?? '').trim())
      .filter(Boolean)
      .join(' ');
    const logs = (result.logs ?? [])
      .filter((l) => l.severity !== 'warn')
      .map((l) => l.parts.map((p) => String(p.value)).join(' '));
    return { d, logs };
  } catch (e) {
    return { error: (e instanceof Error ? e.message : String(e)).split('\n')[0].replace(/^Error: /, '') };
  }
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

/** The CLI's --json result, or its error line. */
function viaCli(file: string): ResultLike {
  try {
    return JSON.parse(
      execFileSync(process.execPath, ['dist/cli.js', file, '--json'], {
        encoding: 'utf-8',
        maxBuffer: 1 << 28,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    const text = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
    const line = text.split('\n').find((l) => /Cannot (assign|declare)/.test(l));
    throw new Error((line ?? text).replace(/^\s*(Error:\s*)?/, '').trim());
  }
}

const playground = loadBundle('dist/index.global.js');
const vscode = loadBundle(join('packages', 'vscode-pathogen', 'compiler', 'index.global.js'));

let failures = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failures++;
  const shown = detail.length > 200 ? `${detail.slice(0, 200)}… (${detail.length} chars)` : detail;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${shown ? `  — ${shown}` : ''}`);
};

for (const [name, want] of Object.entries(EXPECTED)) {
  const file = join(PROBES, name);
  const source = readFileSync(file, 'utf-8');
  const surfaces: Record<string, Fingerprint> = {
    engine: fingerprint(() => compile(source)),
    cli: fingerprint(() => viaCli(file)),
    playground: fingerprint(() => playground.compileWithContext(source)),
    vscode: fingerprint(() => vscode.compile(source)),
  };
  for (const [surface, fp] of Object.entries(surfaces)) {
    if (want.error) {
      check(`${name} [${surface}] error`, (fp.error ?? '').endsWith(want.error), fp.error ?? JSON.stringify(fp));
    } else {
      check(
        `${name} [${surface}] output`,
        fp.error === undefined && fp.d === want.d && JSON.stringify(fp.logs) === JSON.stringify(want.logs),
        JSON.stringify(fp),
      );
    }
  }
}

const fontSource = readFileSync(join(PROBES, 'const-font-family.pathogen'), 'utf-8');
const EDITOR = 'const margin = 10;\nlet width = margin;';
for (const [surface, lib] of Object.entries({ playground, vscode })) {
  const plan = lib.planFontDirectives(fontSource);
  check(
    `@font reads a const [${surface}]`,
    !!plan && plan.errors.length === 0 && plan.directives.map((d) => d.source).join() === 'Inter',
    JSON.stringify(plan),
  );
  const doc = new lib.StringTextDocument(EDITOR);
  const hover = lib.getHoverInfo(doc, { line: 0, character: 2 });
  check(`hover on const [${surface}]`, !!hover?.contents.includes('**const**'), hover?.contents ?? 'null');
  const labels = lib.getCompletions(new lib.StringTextDocument('con'), { line: 0, character: 3 }).map((c) => c.label);
  check(`completion offers const [${surface}]`, labels.includes('const'));
  const readonly = 1 << lib.TOKEN_MODIFIERS.indexOf('readonly');
  const token = lib.getSemanticTokens(doc).find((t) => t.line === 1 && t.character === 12);
  check(`semantic token readonly on a const read [${surface}]`, !!token && (token.modifiers & readonly) === readonly);
  const symbols = lib.getDocumentSymbols(doc);
  check(`outline: margin is a Constant (14) [${surface}]`, symbols[0]?.kind === 14, JSON.stringify(symbols));
  const formatted = lib.formatDocument(new lib.StringTextDocument('const   margin=10;'));
  check(`formatter keeps const [${surface}]`, formatted[0]?.newText === 'const margin = 10;', formatted[0]?.newText);
  const diagnostics = lib.getDiagnostics(new lib.StringTextDocument('const LIMIT = 5;\nfn reset() { LIMIT = 0; }'));
  check(
    `diagnostic at the assignment in an uncalled fn [${surface}]`,
    diagnostics.length === 1 &&
      diagnostics[0].message === REASSIGN &&
      diagnostics[0].range.start.line === 1 &&
      diagnostics[0].range.start.character === 13,
    JSON.stringify(diagnostics),
  );
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;
