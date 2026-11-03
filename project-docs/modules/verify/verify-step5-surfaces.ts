/**
 * Phase 0a step 5 (built-in names are a compile error): the probes in
 * step5-probes/ give the same, fixed result on every surface. Run
 * `npm run build` and `npm run build:vscode` first, then:
 *
 *   npx tsx project-docs/modules/verify/verify-step5-surfaces.ts
 *
 * Surfaces, each through the call it really makes (as verify-step4-surfaces.ts):
 *   - engine:     src/ compile()
 *   - cli:        `node dist/cli.js <file> --json`
 *   - playground: dist/index.global.js in a fresh realm, compileWithContext()
 *   - vscode:     packages/vscode-pathogen/compiler/index.global.js, compile()
 *
 * Also, from both bundles (the playground's editor and the VS Code language
 * server call these): every offender is a diagnostic at its name, the quick
 * fix renames a declaration and its references and the result compiles,
 * rename (F2) starts on a declaration with a built-in's name, and the outline
 * survives the mistake.
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
interface Range {
  start: { line: number; character: number };
  end: { line: number; character: number };
}
interface Diag {
  message: string;
  range: Range;
}
interface Edit {
  range: Range;
  newText: string;
}
type Lib = {
  compile: (s: string) => ResultLike;
  compileWithContext: (s: string) => ResultLike;
  StringTextDocument: new (s: string) => { offsetAt: (p: { line: number; character: number }) => number };
  getDiagnostics: (doc: unknown) => Diag[];
  getCodeActions: (doc: unknown, range: Range, diags: Diag[]) => { title: string; edit: { changes: Edit[] } }[];
  prepareRename: (doc: unknown, pos: { line: number; character: number }) => { placeholder: string } | null;
  getRenameEdits: (doc: unknown, pos: { line: number; character: number }, name: string) => Edit[];
  getDocumentSymbols: (doc: unknown) => { name: string }[];
};

const PROBES = join('project-docs', 'modules', 'verify', 'step5-probes');
const FN = 'it is a built-in function';

const EXPECTED: Record<string, { d?: string; logs?: string[]; error?: string }> = {
  'builtin-let.pathogen': {
    error: `Parse error at line 4, column 5: Cannot use line as a name — ${FN}. Use another name`,
  },
  'builtin-shorthand.pathogen': {
    error: `Parse error at line 3, column 7: Cannot use min as a name — ${FN}. Take the property under another name: { min: minValue }`,
  },
  'builtin-param-in-uncalled-fn.pathogen': {
    error: `Parse error at line 5, column 10: Cannot use heading as a name — ${FN}. Use another name`,
  },
  'builtin-enum.pathogen': {
    error: 'Parse error at line 2, column 6: Cannot use Marker as a name — it is a built-in constructor. Use another name',
  },
  'renamed-ok.pathogen': { d: 'M 10 20 h 100', logs: ['2 8 2 20 true 2'] },
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
    const line = text.split('\n').find((l) => /Cannot use \w+ as a name/.test(l));
    throw new Error((line ?? text).replace(/^\s*(Error:\s*)?/, '').trim());
  }
}

function applyEdits(doc: { offsetAt: (p: { line: number; character: number }) => number }, source: string, edits: Edit[]): string {
  let out = source;
  for (const e of [...edits].sort((a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start))) {
    out = out.slice(0, doc.offsetAt(e.range.start)) + e.newText + out.slice(doc.offsetAt(e.range.end));
  }
  return out;
}

const playground = loadBundle('dist/index.global.js');
const vscode = loadBundle(join('packages', 'vscode-pathogen', 'compiler', 'index.global.js'));

let failures = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failures++;
  const shown = detail.length > 240 ? `${detail.slice(0, 240)}… (${detail.length} chars)` : detail;
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

const EDITOR = "let line = 3;\nlet arc = 2;\ndefine PathLayer('a') #{ stroke-width: line; }\nlog(line, arc, `${line}`);";
for (const [surface, lib] of Object.entries({ playground, vscode })) {
  const doc = new lib.StringTextDocument(EDITOR);
  const diags = lib.getDiagnostics(doc);
  check(
    `every offender is a diagnostic at its name [${surface}]`,
    diags.length === 2 &&
      diags[0].message === `Cannot use line as a name — ${FN}. Use another name` &&
      JSON.stringify(diags[0].range) === JSON.stringify({ start: { line: 0, character: 4 }, end: { line: 0, character: 8 } }) &&
      diags[1].message === `Cannot use arc as a name — ${FN}. Use another name` &&
      diags[1].range.start.line === 1,
    JSON.stringify(diags),
  );
  const action = lib.getCodeActions(doc, diags[0].range, [diags[0]]).find((a) => a.title === 'Rename line to lineValue');
  const fixed = action ? applyEdits(doc, EDITOR, action.edit.changes) : '';
  check(
    `quick fix renames everywhere [${surface}]`,
    fixed === "let lineValue = 3;\nlet arc = 2;\ndefine PathLayer('a') #{ stroke-width: lineValue; }\nlog(lineValue, arc, `${lineValue}`);",
    fixed || 'no action',
  );
  const both = fixed.replace(/\barc\b/g, 'span');
  check(`the fixed program compiles [${surface}]`, fingerprint(() => lib.compile(both)).error === undefined, both);
  check(
    `rename starts on a built-in-named declaration [${surface}]`,
    lib.prepareRename(doc, { line: 1, character: 5 })?.placeholder === 'arc',
  );
  const renamed = applyEdits(doc, EDITOR, lib.getRenameEdits(doc, { line: 1, character: 5 }, 'span'));
  check(`rename edits its references [${surface}]`, renamed.includes('let span = 2;') && renamed.includes('log(line, span,'), renamed);
  const symbols = lib.getDocumentSymbols(doc).map((s) => s.name);
  check(
    `the outline survives the mistake [${surface}]`,
    JSON.stringify(symbols) === JSON.stringify(['line', 'arc', "PathLayer('a')"]),
    JSON.stringify(symbols),
  );
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;
