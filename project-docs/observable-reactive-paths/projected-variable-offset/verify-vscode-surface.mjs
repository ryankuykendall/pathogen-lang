// VS Code surface: the .vsix bundles its OWN copy of the compiler
// (packages/vscode-pathogen/compiler/index.global.js) and the preview webview
// calls PathogenLang.compile() + buildSvgTree() on it. Compile the same program
// through that bundle and diff against the CLI.
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const bundle = readFileSync('packages/vscode-pathogen/compiler/index.global.js', 'utf8');
const sandbox = { console, TextEncoder, TextDecoder, performance, fetch: undefined };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.self = sandbox;
runInNewContext(bundle, sandbox);
const API = sandbox.PathogenLang;
if (!API) throw new Error('PathogenLang not exported by the extension bundle');

const dir = 'project-docs/observable-reactive-paths/projected-variable-offset';
const program = readFileSync(`${dir}/repro-subscription-offset.pathogen`, 'utf8');
const out = API.compile(program);
console.log('compiled without error; layers:', out.layers.length);
console.log('warnings:', JSON.stringify(out.warnings ?? []));
console.log('buildSvgTree available:', typeof API.buildSvgTree === 'function');
writeFileSync(process.argv[2] ?? 'vscode-layers.txt',
  out.layers.map((l) => `[${l.name}] ${l.data}`).join('\n') + '\n');
