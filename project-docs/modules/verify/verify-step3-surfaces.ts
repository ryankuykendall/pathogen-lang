/**
 * Phase 0a step 3: the probes in step3-probes/ give the same, fixed result on
 * every surface — output where the lexical rule draws, and the same hinted
 * error where it stops. Run `npm run build` and `npm run build:vscode` first,
 * then:
 *
 *   npx tsx project-docs/modules/verify/verify-step3-surfaces.ts
 *
 * Surfaces, each through the call it really makes (as verify-step2-surfaces.ts):
 *   - engine:     src/ compile() (what the tests use)
 *   - cli:        `node dist/cli.js <file> --json` (the published binary)
 *   - playground: dist/index.global.js in a fresh realm, compileWithContext()
 *                 (the compiler worker's call)
 *   - vscode:     packages/vscode-pathogen/compiler/index.global.js in a fresh
 *                 realm, compile() (the preview's call)
 *
 * Also: the editor services in both bundles — the `fn` hover states the new
 * rule, and "Did you mean" is still offered on a hinted error.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
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
  path?: string;
  logs?: LogLike[];
}
interface DiagnosticLike {
  message: string;
  range: unknown;
}
type Lib = {
  compile: (s: string) => ResultLike;
  compileWithContext: (s: string) => ResultLike;
  StringTextDocument: new (s: string) => unknown;
  getHoverInfo: (doc: unknown, pos: { line: number; character: number }) => { contents: string } | null;
  getDiagnostics: (doc: unknown) => DiagnosticLike[];
  getCodeActions: (doc: unknown, range: unknown, diags: DiagnosticLike[]) => { title: string }[];
};

const PROBES = join('project-docs', 'modules', 'verify', 'step3-probes');
const RULE = 'a function sees the variables where it is written, not where it is called';

/** What each probe gives under the lexical rule: its paths and logs, or its error. */
const EXPECTED: Record<string, { d?: string; logs?: string[]; error?: string }> = {
  'caller-local-silent.pathogen': { d: 'M 0 10 L 10 10 M 0 30 L 10 30', logs: ['1 1'] },
  'caller-shadows-builtin.pathogen': { d: 'M 0 20 L 20 20', logs: [] },
  'factory-fn.pathogen': { d: 'M 0 20 L 15 20', logs: [] },
  'caller-local-read.pathogen': {
    error: `Line 8, col 19: Undefined variable: spacing — ${RULE}. Pass it in: add spacing to f's parameters, fn f(n, spacing), and pass it where f is called`,
  },
  'caller-local-assign.pathogen': {
    error: `Line 7: Cannot assign to count here — ${RULE}. Return the new value instead: count = bump();`,
  },
  'named-worker-caller-local.pathogen': {
    error: `Undefined variable: k — ${RULE}. scale is applied with <<, so it can't take k as a parameter: write it where k is visible, as a trailing block or a let-bound lambda`,
  },
  'stateless-control.pathogen': { d: 'M 10 10 h 20 M 10 20 h 30 M 10 30 h 40 M 10 40 h 50', logs: [] },
  'style-value-caller-local.pathogen': {
    error: `Line 8, col 37: Style value for "stroke": Undefined variable: col — ${RULE}. Pass it in: add col to mk's parameters, fn mk(col), and pass it where mk is called`,
  },
};

interface Fingerprint {
  d?: string;
  logs?: string[];
  error?: string;
}

function fingerprint(run: () => ResultLike): Fingerprint {
  try {
    const result = run();
    const d = result.layers
      ? result.layers
          .map((l) => (l.d ?? l.data ?? '').trim())
          .filter(Boolean)
          .join(' ')
      : String(result.path ?? '').trim();
    const logs = (result.logs ?? [])
      .filter((l) => l.severity !== 'warn')
      .map((l) => l.parts.map((p) => String(p.value)).join(' '));
    return { d, logs };
  } catch (e) {
    return { error: (e instanceof Error ? e.message : String(e)).split('\n')[0] };
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

/** The CLI's --json result, or its error line (it exits non-zero and prints the message). */
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
    try {
      const json = JSON.parse(err.stdout ?? '') as { error?: string | { message?: string } };
      const message = typeof json.error === 'string' ? json.error : json.error?.message;
      if (message) throw new Error(message);
    } catch (parsed) {
      if (parsed instanceof Error && !(parsed instanceof SyntaxError)) throw parsed;
    }
    const line = text.split('\n').find((l) => /Undefined variable|Cannot assign/.test(l));
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

for (const name of readdirSync(PROBES).filter((f) => f.endsWith('.pathogen')).sort()) {
  const file = join(PROBES, name);
  const source = readFileSync(file, 'utf-8');
  const surfaces: Record<string, Fingerprint> = {
    engine: fingerprint(() => compile(source)),
    cli: fingerprint(() => viaCli(file)),
    playground: fingerprint(() => playground.compileWithContext(source)),
    vscode: fingerprint(() => vscode.compile(source)),
  };
  const want = EXPECTED[name];
  if (!want) {
    check(`${name} has an expected result`, false);
    continue;
  }
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

// Editor services from both bundles (the playground's and the VS Code extension's).
const HOVER_SOURCE = 'fn f() { return 1; }';
const MISS_SOURCE = 'let radius = 50;\nfn f() { return radiuss; }\nfn g() { let radiuss = 2; return f(); }\nlet r = g();';
for (const [surface, lib] of Object.entries({ playground, vscode })) {
  const hover = lib.getHoverInfo(new lib.StringTextDocument(HOVER_SOURCE), { line: 0, character: 1 });
  check(`fn hover states the rule [${surface}]`, !!hover?.contents.includes('where it is written'), hover?.contents ?? 'null');
  const doc = new lib.StringTextDocument(MISS_SOURCE);
  const diagnostics = lib.getDiagnostics(doc);
  const hinted = diagnostics.find((d) => d.message.includes(RULE));
  check(`hinted error reaches diagnostics [${surface}]`, !!hinted, diagnostics.map((d) => d.message).join(' | '));
  const actions = hinted ? lib.getCodeActions(doc, hinted.range, diagnostics) : [];
  check(`"Did you mean radius" offered [${surface}]`, actions.some((a) => a.title.includes('radius')), actions.map((a) => a.title).join(' | '));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;
