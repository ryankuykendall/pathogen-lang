/**
 * Phase 1a step 7: modules on every surface, each through the call it really
 * makes. Run `npm run build` and `npm run build:vscode` first, then:
 *
 *   npx tsx project-docs/modules/verify/verify-phase1-surfaces.ts
 *
 * The project is the docs' gears library, a kit passing two of its names on,
 * and a few programs (written to a temp folder, deleted after):
 *   - engine:     src/ resolveModules (Node host) + compile()
 *   - cli:        `node dist/cli.js <file> --json`
 *   - vscode:     the preview's path as shipped. The files are read by the
 *                 bundled server/node_modules pathogen-lang/node
 *                 (resolveEditorModules), sent as JSON (files as entries), and
 *                 compiled by compiler/index.global.js in a fresh realm
 *   - playground: dist/index.global.js in a fresh realm, compileWithContext().
 *                 A workspace has no files, so an import is the documented
 *                 "no project folder" error at its line; the other rules hold
 *
 * The language server is checked by verify-step6c-lsp.mjs (run it with
 * PATHOGEN_SERVER=packages/vscode-pathogen/server/out/server.js for the
 * bundled one), the preview's page by verify-step6d-preview.mjs, and the real
 * playground by verify-phase1-playground.mjs.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';

import { compile, resolveModules } from '../../../src/index';
import { createNodeProjectHost } from '../../../src/node';

interface ResultLike {
  layers?: { data?: string; d?: string; type?: string }[];
}

const root = process.cwd();
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
};

// ── The project ──────────────────────────────────────────────────────────────
mkdirSync(join(root, 'tmp'), { recursive: true });
const project = mkdtempSync(join(root, 'tmp', 'phase1-surfaces-'));
const FILES: Record<string, string> = {
  'pathogen.json': '{}\n',
  'parts/gears.pathogen': [
    '// parts/gears.pathogen',
    'module;',
    '',
    'export const toothDepth = 6;',
    '',
    'export enum Teeth { Few = 8, Standard = 12, Fine = 20 }',
    '',
    'export fn gear(center, radius, teeth) {',
    '  star(center.x, center.y, radius, radius - toothDepth, teeth);',
    '  hub(center, radius);',
    '}',
    '',
    '// Not exported: only this file can use it.',
    'fn hub(center, radius) {',
    '  circle(center.x, center.y, radius * 0.3);',
    '}',
    '',
  ].join('\n'),
  'parts/kit.pathogen': 'module;\n\nimport * as gears from "./gears.pathogen";\n\nexport const gear = gears.gear;\nexport const Teeth = gears.Teeth;\n',
  'main.pathogen': [
    'import { gear, Teeth as Kind } from "./parts/gears.pathogen";',
    'import * as kit from "./parts/kit.pathogen";',
    '',
    'define ViewBox(0, 0, 200, 100);',
    'gear(Point(55, 50), 40, Kind.Standard);',
    'kit.gear(Point(150, 50), 28, kit.Teeth.Few);',
    '',
  ].join('\n'),
  'export-without-module.pathogen': 'export const size = 4;\nM 0 0 L 10 10\n',
  'module-alone.pathogen': 'module;\n\nexport fn dot(x) {\n  circle(x, 0, 2);\n}\nlog("loaded");\n',
  'module-draws.pathogen': 'module;\n\nM 0 0 L 10 10\n',
  'one-file.pathogen': 'define ViewBox(0, 0, 100, 100);\nM 10 10 L 90 90\n',
};
for (const [path, text] of Object.entries(FILES)) {
  mkdirSync(join(project, ...path.split('/').slice(0, -1)), { recursive: true });
  writeFileSync(join(project, ...path.split('/')), text);
}

// ── The four surfaces ────────────────────────────────────────────────────────
type Outcome = { paths: string[] } | { error: string };
const pathsOf = (r: ResultLike): string[] =>
  (r.layers ?? []).map((l) => l.data ?? l.d ?? '').filter((d) => d.trim() !== '');
const firstLine = (e: unknown) => String((e as Error).message ?? e).split('\n')[0];

async function engine(file: string): Promise<Outcome> {
  const source = FILES[file];
  const { graph, errors } = await resolveModules(source, { host: createNodeProjectHost(project), entry: `/${file}` });
  if (errors.length > 0) return { error: errors[0].message };
  try {
    return { paths: pathsOf(compile(source, { modules: graph })) };
  } catch (e) {
    return { error: firstLine(e) };
  }
}

function cli(file: string): Outcome {
  try {
    const out = execFileSync('node', [join(root, 'dist', 'cli.js'), join(project, file), '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const json = JSON.parse(out) as { layers: { type: string; d?: string }[] };
    return { paths: json.layers.filter((l) => l.type === 'path' && l.d?.trim()).map((l) => l.d!) };
  } catch (e) {
    const stderr = String((e as { stderr?: string }).stderr ?? '');
    return { error: stderr.split('\n')[0] };
  }
}

function realmLib(bundle: string): Record<string, (...args: unknown[]) => unknown> {
  const context = vm.createContext({ console, TextEncoder, TextDecoder, setTimeout, clearTimeout, URL });
  vm.runInContext(readFileSync(bundle, 'utf8'), context);
  return (context as { PathogenLang: Record<string, (...args: unknown[]) => unknown> }).PathogenLang;
}
const vscodeBundle = realmLib(join(root, 'packages', 'vscode-pathogen', 'compiler', 'index.global.js'));
const playgroundBundle = realmLib(join(root, 'dist', 'index.global.js'));
const bundledRequire = createRequire(join(root, 'packages', 'vscode-pathogen', 'server', 'node_modules', '_resolve.js'));
const bundledNode = bundledRequire('pathogen-lang/node') as {
  resolveEditorModules: (
    f: string,
    s: string,
    o: () => undefined,
  ) => Promise<{ graph: { entry: string; order: string[]; files: Map<string, unknown> }; errors: { message: string }[] }>;
};

async function vscode(file: string): Promise<Outcome> {
  const source = FILES[file];
  const { graph, errors } = await bundledNode.resolveEditorModules(join(project, file), source, () => undefined);
  if (errors.length > 0) return { error: errors[0].message };
  // As preview-modules.ts sends it, and the webview rebuilds it.
  const sent = JSON.parse(JSON.stringify({ entry: graph.entry, order: graph.order, files: [...graph.files.entries()] }));
  const options = sent.files.length > 0 ? { modules: { ...sent, files: new Map(sent.files) } } : {};
  try {
    return { paths: pathsOf(vscodeBundle.compile(source, options) as ResultLike) };
  } catch (e) {
    return { error: firstLine(e) };
  }
}

function playground(file: string): Outcome {
  try {
    return { paths: pathsOf(playgroundBundle.compileWithContext(FILES[file]) as ResultLike) };
  } catch (e) {
    return { error: firstLine(e) };
  }
}

const same = (a: Outcome, b: Outcome) => JSON.stringify(a) === JSON.stringify(b);
const show = (o: Outcome) => ('error' in o ? `error: ${o.error}` : `${o.paths.length} path(s)`);

try {
  // A program that imports: engine, CLI and VS Code draw the same; the playground says it can't import.
  const main = await engine('main.pathogen');
  check('main: the engine draws the gears', 'paths' in main && main.paths.length === 1, show(main));
  check('main: the CLI draws exactly what the engine draws', same(cli('main.pathogen'), main), show(cli('main.pathogen')));
  const vs = await vscode('main.pathogen');
  check("main: VS Code's preview path draws exactly what the engine draws", same(vs, main), show(vs));
  const pg = playground('main.pathogen');
  check(
    "main: the playground gives the docs' no-project-folder error at the import",
    'error' in pg &&
      pg.error ===
        'Line 1, col 1: Cannot import "./parts/gears.pathogen": this program has no project folder to read files from. Imports work in the CLI and VS Code; a playground workspace is one program for now.',
    show(pg),
  );

  // The module rules hold everywhere, the playground included.
  const exportError = 'export only works in a module. Remove export, or add module; at the top of the file to make it a module, which can\'t draw at its top level.';
  for (const [name, outcome] of [
    ['engine', await engine('export-without-module.pathogen')],
    ['vscode', await vscode('export-without-module.pathogen')],
    ['playground', playground('export-without-module.pathogen')],
  ] as const) {
    check(`export without module;: an error (${name})`, 'error' in outcome && outcome.error.endsWith(exportError), show(outcome));
  }
  const cliExport = cli('export-without-module.pathogen');
  check('export without module;: an error (cli)', 'error' in cliExport && cliExport.error.includes(exportError), show(cliExport));

  for (const [name, outcome] of [
    ['engine', await engine('module-alone.pathogen')],
    ['cli', cli('module-alone.pathogen')],
    ['vscode', await vscode('module-alone.pathogen')],
    ['playground', playground('module-alone.pathogen')],
  ] as const) {
    check(`a module compiled by itself draws nothing (${name})`, 'paths' in outcome && outcome.paths.length === 0, show(outcome));
  }

  const drawsError = "A module can't draw while it loads. Draw in an exported fn, and call it from the file that imports this one.";
  for (const [name, outcome] of [
    ['engine', await engine('module-draws.pathogen')],
    ['cli', cli('module-draws.pathogen')],
    ['vscode', await vscode('module-draws.pathogen')],
    ['playground', playground('module-draws.pathogen')],
  ] as const) {
    check(`a module's top-level path command is an error (${name})`, 'error' in outcome && outcome.error.includes(drawsError), show(outcome));
  }

  // A one-file program is the same on all four.
  const one = await engine('one-file.pathogen');
  const others = [cli('one-file.pathogen'), await vscode('one-file.pathogen'), playground('one-file.pathogen')];
  check('a program without imports draws the same on all four', others.every((o) => same(o, one)), others.map(show).join(' | '));
} finally {
  rmSync(project, { recursive: true, force: true });
}

writeFileSync(
  join(root, 'project-docs', 'modules', 'verify', 'verify-phase1-surfaces-results.json'),
  `${JSON.stringify(results, null, 2)}\n`,
);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
