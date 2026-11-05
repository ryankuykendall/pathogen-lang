// Phase 1a step 6c: drive the built language server over stdio, as VS Code
// does, on a real project folder, and check each promise of docs/modules.md
// "In each tool" that runs through the server:
//   errors across files, hover, go-to-definition (a file: URI in the other
//   file), completion (exports in { }, a namespace's names, paths with a
//   textEdit and the File kind), parameter hints, F2's refusal as an error,
//   an unsaved file's imports, rechecking an importer when an imported
//   buffer changes, and a file created on disk (didChangeWatchedFiles).
//
// Run after `npm run build` and the server's build:
//   node project-docs/modules/verify/verify-step6c-lsp.mjs
// Writes verify-step6c-lsp-results.json beside this script and exits 1 on a failure.
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
// PATHOGEN_SERVER=packages/vscode-pathogen/server/out/server.js runs the one the .vsix ships (its own node_modules).
const server = process.env.PATHOGEN_SERVER
  ? join(repo, process.env.PATHOGEN_SERVER)
  : join(repo, 'packages', 'pathogen-language-server', 'out', 'server.js');
const resultsFile = process.env.PATHOGEN_SERVER
  ? 'verify-step6c-lsp-bundled-results.json'
  : 'verify-step6c-lsp-results.json';

// --- a project on disk ---
mkdirSync(join(repo, 'tmp'), { recursive: true });
const project = mkdtempSync(join(repo, 'tmp', 'verify-lsp-'));
const write = (path, text) => {
  mkdirSync(join(project, ...path.split('/').slice(0, -1)), { recursive: true });
  writeFileSync(join(project, ...path.split('/')), text);
};
const GEARS = [
  '// parts/gears.pathogen',
  'module;',
  '',
  'export const toothDepth = 6;',
  '',
  'export enum Teeth { Few = 8, Standard = 12, Fine = 20 }',
  '',
  'export fn gear(center, radius, teeth) {',
  '  star(center.x, center.y, radius, radius - toothDepth, teeth);',
  '}',
  '',
].join('\n');
const MAIN = [
  'import { gear, Teeth } from "./parts/gears.pathogen";',
  'import * as gears from "./parts/gears.pathogen";',
  '',
  'gear(Point(55, 50), 40, Teeth.Standard);',
  'log(gears.toothDepth);',
  '',
].join('\n');
write('pathogen.json', '{}\n');
write('parts/gears.pathogen', GEARS);
write('main.pathogen', MAIN);
const uri = (path) => pathToFileURL(join(project, ...path.split('/'))).href;

// --- JSON-RPC over stdio ---
const child = spawn(process.execPath, [server, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] });
let buffer = Buffer.alloc(0);
let nextId = 1;
const pending = new Map();
const diagnostics = new Map();
const diagnosticWaiters = [];
child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const length = Number(/Content-Length: (\d+)/i.exec(buffer.slice(0, headerEnd).toString())[1]);
    if (buffer.length < headerEnd + 4 + length) return;
    const message = JSON.parse(buffer.slice(headerEnd + 4, headerEnd + 4 + length).toString());
    buffer = buffer.slice(headerEnd + 4 + length);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method === 'textDocument/publishDiagnostics') {
      diagnostics.set(message.params.uri, message.params.diagnostics);
      for (const waiter of [...diagnosticWaiters]) waiter();
    } else if (message.id !== undefined && message.method) {
      // A request from the server (workspace/configuration, …): answer with nothing.
      send({ jsonrpc: '2.0', id: message.id, result: null });
    }
  }
});
function send(message) {
  const body = Buffer.from(JSON.stringify(message));
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
}
const request = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
  });
const notify = (method, params) => send({ jsonrpc: '2.0', method, params });
/** Wait until `check` holds of the published diagnostics (or time out). */
const diagnosticsWhere = (check, ms = 8000) =>
  new Promise((resolve) => {
    const done = () => {
      if (check()) {
        diagnosticWaiters.splice(diagnosticWaiters.indexOf(done), 1);
        clearTimeout(timer);
        resolve(true);
      }
    };
    const timer = setTimeout(() => {
      diagnosticWaiters.splice(diagnosticWaiters.indexOf(done), 1);
      resolve(false);
    }, ms);
    diagnosticWaiters.push(done);
    done();
  });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${JSON.stringify(detail)}`}`);
};
let version = 1;
const open = (path, text, scheme = 'file') =>
  notify('textDocument/didOpen', {
    textDocument: { uri: scheme === 'file' ? uri(path) : path, languageId: 'pathogen', version: version++, text },
  });

try {
  await request('initialize', {
    processId: process.pid,
    rootUri: pathToFileURL(project).href,
    capabilities: { textDocument: { completion: { completionItem: { snippetSupport: true } } } },
  });
  notify('initialized', {});
  open('main.pathogen', MAIN);
  check(
    'a project that loads has no problems',
    await diagnosticsWhere(() => diagnostics.get(uri('main.pathogen'))?.length === 0),
    diagnostics.get(uri('main.pathogen')),
  );

  const hover = await request('textDocument/hover', {
    textDocument: { uri: uri('main.pathogen') },
    position: { line: 3, character: 1 },
  });
  check(
    "hover shows an imported fn's signature and file",
    hover.result?.contents?.value ===
      '**gear** — *function*\n\n`fn gear(center, radius, teeth)`\n\nDefined in parts/gears.pathogen, line 8',
    hover.result,
  );

  const definition = await request('textDocument/definition', {
    textDocument: { uri: uri('main.pathogen') },
    position: { line: 3, character: 1 },
  });
  check(
    'go-to-definition opens the other file at the name',
    definition.result?.uri === uri('parts/gears.pathogen') &&
      definition.result.range.start.line === 7 &&
      definition.result.range.start.character === 10,
    definition.result,
  );

  const hints = await request('textDocument/signatureHelp', {
    textDocument: { uri: uri('main.pathogen') },
    position: { line: 3, character: 20 },
  });
  check(
    'parameter hints for an imported fn',
    hints.result?.signatures?.[0]?.label === 'gear(center, radius, teeth)' && hints.result.activeParameter === 1,
    hints.result,
  );

  const member = await request('textDocument/completion', {
    textDocument: { uri: uri('main.pathogen') },
    position: { line: 4, character: 10 },
    context: { triggerKind: 2, triggerCharacter: '.' },
  });
  const memberLabels = (member.result ?? []).map((i) => i.label).sort();
  check(
    "completion after a namespace's dot: its exports",
    JSON.stringify(memberLabels) === JSON.stringify(['Teeth', 'gear', 'toothDepth']),
    memberLabels,
  );

  const rename = await request('textDocument/prepareRename', {
    textDocument: { uri: uri('main.pathogen') },
    position: { line: 3, character: 1 },
  });
  check(
    'F2 on an imported name is refused with the reason',
    rename.error?.message ===
      "gear is imported from parts/gears.pathogen. Renaming across files isn't supported yet: rename it in each file.",
    rename,
  );

  // Paths: the project's modules (listed after the first check), with a textEdit.
  const pathDoc = 'import * as x from "./";\n';
  open('paths.pathogen', pathDoc);
  await diagnosticsWhere(() => diagnostics.has(uri('paths.pathogen')));
  const paths = await request('textDocument/completion', {
    textDocument: { uri: uri('paths.pathogen') },
    position: { line: 0, character: 22 },
    context: { triggerKind: 2, triggerCharacter: '/' },
  });
  const pathItem = (paths.result ?? []).find((i) => i.label === './parts/gears.pathogen');
  check(
    "completion in an import's quotes: the project's modules, File kind, replacing what's typed",
    pathItem &&
      pathItem.kind === 17 &&
      pathItem.textEdit?.range.start.character === 20 &&
      pathItem.textEdit.range.end.character === 22,
    paths.result,
  );
  const slash = await request('textDocument/completion', {
    textDocument: { uri: uri('main.pathogen') },
    position: { line: 5, character: 0 },
    context: { triggerKind: 2, triggerCharacter: '/' },
  });
  check(
    "a '/' outside an import's path opens nothing",
    Array.isArray(slash.result) && slash.result.length === 0,
    slash.result,
  );
  // The new triggers in the places they'll be typed most: a string, a division, a comment.
  const triggers = 'log("\nlet half = calc(10 /\n// a / b\n';
  open('triggers.pathogen', triggers);
  await diagnosticsWhere(() => diagnostics.has(uri('triggers.pathogen')));
  for (const [what, line, character, triggerCharacter] of [
    ['a `"` opening an ordinary string', 0, 5, '"'],
    ['a `/` in calc()', 1, 19, '/'],
    ['a `/` in a comment', 2, 6, '/'],
  ]) {
    const typed = await request('textDocument/completion', {
      textDocument: { uri: uri('triggers.pathogen') },
      position: { line, character },
      context: { triggerKind: 2, triggerCharacter },
    });
    check(`${what} opens nothing`, Array.isArray(typed.result) && typed.result.length === 0, typed.result);
  }

  // An imported buffer changes: the importer is checked again with its text.
  open('parts/gears.pathogen', GEARS);
  notify('textDocument/didChange', {
    textDocument: { uri: uri('parts/gears.pathogen'), version: version++ },
    contentChanges: [{ text: GEARS.replace('export fn gear(', 'export fn cog(') }],
  });
  check(
    'editing an imported file rechecks the open file that imports it',
    await diagnosticsWhere(() =>
      (diagnostics.get(uri('main.pathogen')) ?? []).some((d) => d.message.includes('has no export named gear')),
    ),
    diagnostics.get(uri('main.pathogen')),
  );

  // A file created on disk: a document that couldn't find it can now.
  const waiting = 'import { size } from "./parts/marks.pathogen";\nlog(size);\n';
  open('waiting.pathogen', waiting);
  check(
    'an import of a missing file is an error at its path, in the CLI words',
    await diagnosticsWhere(() =>
      (diagnostics.get(uri('waiting.pathogen')) ?? []).some((d) =>
        d.message.startsWith('import file "./parts/marks.pathogen" was not found'),
      ),
    ),
    diagnostics.get(uri('waiting.pathogen')),
  );
  write('parts/marks.pathogen', 'module;\nexport const size = 2;\n');
  notify('workspace/didChangeWatchedFiles', { changes: [{ uri: uri('parts/marks.pathogen'), type: 1 }] });
  check(
    'a file created on disk clears the error (didChangeWatchedFiles)',
    await diagnosticsWhere(() => diagnostics.get(uri('waiting.pathogen'))?.length === 0),
    diagnostics.get(uri('waiting.pathogen')),
  );

  // Fonts in imported files (step 6c part 4): a module's @font serves the importer's glyphs.
  mkdirSync(join(project, 'fonts'), { recursive: true });
  copyFileSync(join(repo, 'fonts', 'Baumans', 'Baumans-Regular.ttf'), join(project, 'fonts', 'Baumans-Regular.ttf'));
  write('parts/labels.pathogen', 'module;\n@font "../fonts/Baumans-Regular.ttf";\nexport const ready = 1;\n');
  const glyphs =
    'import { ready } from "./parts/labels.pathogen";\nlet s = #{ font-family: Baumans-Regular; font-size: 48; };\nlet g = PathBlock.fromGlyph("A", s);\n';
  open('glyphs.pathogen', glyphs);
  check(
    "an imported file's @font loads for the importer's glyphs: no problems",
    await diagnosticsWhere(() => diagnostics.get(uri('glyphs.pathogen'))?.length === 0),
    diagnostics.get(uri('glyphs.pathogen')),
  );

  // An error in another file, at its own line (docs/modules.md "In each tool":
  // "if that file is open, the error shows at its own line too").
  const CHECKED =
    'module;\n\nexport fn gear(center, radius, teeth) {\n  assert(teeth >= 3, "a gear needs at least 3 teeth");\n  star(center.x, center.y, radius, radius - 6, teeth);\n}\n';
  write('parts/checked.pathogen', CHECKED);
  const caller = (teeth) => `import { gear } from "./parts/checked.pathogen";\ngear(Point(50, 50), 40, ${teeth});\n`;
  const AT_ASSERT = 'assertion failed: a gear needs at least 3 teeth\n  called from caller.pathogen line 2';
  const atAssert = () =>
    (diagnostics.get(uri('parts/checked.pathogen')) ?? []).filter(
      (d) => d.message === AT_ASSERT && d.range.start.line === 3 && d.range.start.character === 2,
    ).length === 1;
  // The caller first: the file opened after it still gets the error.
  open('caller.pathogen', caller(2));
  await diagnosticsWhere(() => (diagnostics.get(uri('caller.pathogen')) ?? []).length === 1);
  open('parts/checked.pathogen', CHECKED);
  check(
    "an error a call causes in another open file shows at that file's own line, with its called-from line",
    (await diagnosticsWhere(atAssert)) &&
      diagnostics.get(uri('caller.pathogen'))?.[0]?.message ===
        'parts/checked.pathogen line 4, col 3: assertion failed: a gear needs at least 3 teeth\n  called from caller.pathogen line 2',
    { checked: diagnostics.get(uri('parts/checked.pathogen')), caller: diagnostics.get(uri('caller.pathogen')) },
  );
  const changeCaller = (teeth) =>
    notify('textDocument/didChange', {
      textDocument: { uri: uri('caller.pathogen'), version: version++ },
      contentChanges: [{ text: caller(teeth) }],
    });
  changeCaller(12);
  check(
    'fixing the call clears it from the other file',
    await diagnosticsWhere(
      () =>
        diagnostics.get(uri('parts/checked.pathogen'))?.length === 0 &&
        diagnostics.get(uri('caller.pathogen'))?.length === 0,
    ),
    { checked: diagnostics.get(uri('parts/checked.pathogen')), caller: diagnostics.get(uri('caller.pathogen')) },
  );
  changeCaller(2);
  await diagnosticsWhere(atAssert);
  notify('textDocument/didClose', { textDocument: { uri: uri('caller.pathogen') } });
  check(
    'closing the calling file clears it from the other file',
    await diagnosticsWhere(() => diagnostics.get(uri('parts/checked.pathogen'))?.length === 0),
    diagnostics.get(uri('parts/checked.pathogen')),
  );

  // An unsaved document.
  open('untitled:Untitled-1', 'import { gear } from "./parts/gears.pathogen";\n', 'untitled');
  check(
    "an unsaved file's import says to save it first",
    await diagnosticsWhere(() =>
      (diagnostics.get('untitled:Untitled-1') ?? []).some(
        (d) =>
          d.message ===
          'Cannot import "./parts/gears.pathogen" until this file is saved: import paths start at the file\'s folder.',
      ),
    ),
    diagnostics.get('untitled:Untitled-1'),
  );
} finally {
  await request('shutdown', null);
  notify('exit', null);
  child.kill();
  rmSync(project, { recursive: true, force: true });
}

writeFileSync(join(here, resultsFile), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
