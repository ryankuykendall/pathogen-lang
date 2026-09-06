#!/usr/bin/env tsx
/**
 * Build and package the Pathogen VS Code extension as a .vsix file.
 *
 * Steps:
 *   1. Build root library (npm run build)
 *   2. Build language server (tsc)
 *   3. Build extension (tsc)
 *   4. Bundle language server + every runtime dependency into extension/server/
 *   5. Package with vsce
 *
 * Usage:
 *   npx tsx scripts/build-vscode-extension.ts [--install]
 *
 *   --install   Install the .vsix into VS Code after packaging
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import { builtinModules, createRequire } from 'module';
import * as path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXT_DIR = path.join(ROOT, 'packages', 'vscode-pathogen');
const SERVER_DIR = path.join(ROOT, 'packages', 'pathogen-language-server');
const BUNDLED_SERVER_DIR = path.join(EXT_DIR, 'server');
const OUTPUT_DIR = path.join(ROOT, 'dist-vsix');

const install = process.argv.includes('--install');

function run(cmd: string, cwd = ROOT) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function step(label: string) {
  console.log(`\n── ${label} ──`);
}

// --- Step 1: Build root library ---
step('1/5  Building root library');
run('npm run build');

// --- Step 2: Build language server ---
step('2/5  Building language server');
run('npm run build', SERVER_DIR);

// --- Step 3: Build extension ---
step('3/5  Building extension');
run('npm run build', EXT_DIR);

// --- Step 4: Bundle server into extension ---
step('4/5  Bundling language server into extension');

// Clean previous bundle
if (fs.existsSync(BUNDLED_SERVER_DIR)) {
  fs.rmSync(BUNDLED_SERVER_DIR, { recursive: true });
}
fs.mkdirSync(BUNDLED_SERVER_DIR, { recursive: true });

// Copy language server output
const serverOut = path.join(SERVER_DIR, 'out');
fs.cpSync(serverOut, path.join(BUNDLED_SERVER_DIR, 'out'), { recursive: true });

// --- Runtime dependencies for the bundle -------------------------------------
// vsce is run with --no-dependencies, which strips the extension's own module
// directory, so EVERYTHING the extension host and the server subprocess
// require at runtime must live under server/node_modules/. Three groups:
//
//   1. the language server's runtime deps (vscode-languageserver, …), at the
//      ranges packages/pathogen-language-server/package.json declares;
//   2. the extension's runtime deps (vscode-languageclient), at the ranges
//      packages/vscode-pathogen/package.json declares — extension.ts falls back
//      to server/node_modules when the top-level require fails;
//   3. the packages the CJS library bundle (dist/index.cjs) leaves external —
//      derived by scanning the bundle for bare require() specifiers, at the
//      ranges the root package.json declares.
//
// One `npm install` resolves all of them (plus transitive deps such as
// vscode-jsonrpc / semver / minimatch) into a single consistent tree. Earlier
// versions of this script hand-copied directories out of the root install
// and silently shipped without vscode-languageclient, which is why the .vsix
// never started the language server.
interface PackageManifest {
  name?: string;
  version?: string;
  main?: string;
  dependencies?: Record<string, string>;
}
const readJson = (p: string): PackageManifest => JSON.parse(fs.readFileSync(p, 'utf-8')) as PackageManifest;
const serverPkg = readJson(path.join(SERVER_DIR, 'package.json'));
const extPkg = readJson(path.join(EXT_DIR, 'package.json'));
const rootPkg = readJson(path.join(ROOT, 'package.json'));

const cjsBundle = fs.readFileSync(path.join(ROOT, 'dist', 'index.cjs'), 'utf-8');
const nodeBuiltins = new Set(builtinModules.flatMap((b) => [b, `node:${b}`]));
const cjsExternals = [...new Set([...cjsBundle.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1]))]
  .filter((spec) => !spec.startsWith('.') && !nodeBuiltins.has(spec))
  // "@scope/name/sub" → "@scope/name"; "name/sub" → "name"
  .map((spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]));

const runtimeDeps: Record<string, string> = {};
for (const [name, range] of Object.entries(serverPkg.dependencies || {})) {
  if (name !== 'pathogen-lang') runtimeDeps[name] = range;
}
for (const [name, range] of Object.entries(extPkg.dependencies || {})) {
  runtimeDeps[name] = range;
}
for (const name of cjsExternals) {
  const range = rootPkg.dependencies?.[name];
  if (!range) {
    throw new Error(
      `dist/index.cjs requires "${name}" but it is not in the root package.json dependencies — ` +
        'add it there so the VS Code bundle can install it.',
    );
  }
  runtimeDeps[name] = range;
}

// Minimal package.json for the bundle: Node's resolver needs `main`; npm needs
// `dependencies`. pathogen-lang itself is written below from dist/index.cjs.
fs.writeFileSync(
  path.join(BUNDLED_SERVER_DIR, 'package.json'),
  JSON.stringify(
    {
      name: serverPkg.name,
      version: serverPkg.version,
      private: true,
      main: serverPkg.main,
      dependencies: runtimeDeps,
    },
    null,
    2,
  ),
);

console.log(
  `  Runtime deps: ${Object.entries(runtimeDeps)
    .map(([n, r]) => `${n}@${r}`)
    .join(', ')}`,
);
run('npm install --omit=dev --no-audit --no-fund --loglevel=error', BUNDLED_SERVER_DIR);

// Now write pathogen-lang itself: the CJS entry the server requires
const bundledModulesDir = path.join(BUNDLED_SERVER_DIR, 'node_modules');
const bundledPathogenLang = path.join(bundledModulesDir, 'pathogen-lang');
if (fs.existsSync(bundledPathogenLang)) {
  fs.rmSync(bundledPathogenLang, { recursive: true, force: true });
}
fs.mkdirSync(path.join(bundledPathogenLang, 'dist'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'dist', 'index.cjs'), path.join(bundledPathogenLang, 'dist', 'index.cjs'));
fs.writeFileSync(
  path.join(bundledPathogenLang, 'package.json'),
  JSON.stringify({ name: 'pathogen-lang', version: rootPkg.version, main: './dist/index.cjs' }, null, 2),
);

// Verify every runtime dependency actually resolves from the bundle before packaging.
const bundleRequire = createRequire(path.join(bundledModulesDir, '_resolve.js'));
for (const name of [
  ...Object.keys(runtimeDeps),
  'pathogen-lang',
  'vscode-languageclient/node',
  'vscode-languageserver/node',
]) {
  try {
    bundleRequire.resolve(name);
  } catch (err) {
    throw new Error(`Bundle is missing "${name}" — the .vsix would not activate. ${(err as Error).message}`);
  }
}
console.log(
  `  Bundled server + ${Object.keys(runtimeDeps).length} runtime deps to ${path.relative(ROOT, BUNDLED_SERVER_DIR)}`,
);

// Bundle compiler IIFE for the preview webview
const COMPILER_DIR = path.join(EXT_DIR, 'compiler');
if (fs.existsSync(COMPILER_DIR)) fs.rmSync(COMPILER_DIR, { recursive: true });
fs.mkdirSync(COMPILER_DIR, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'dist', 'index.global.js'), path.join(COMPILER_DIR, 'index.global.js'));
// Shared pan/zoom controller bundle (window.PathogenPanZoom) for the webview.
fs.copyFileSync(path.join(ROOT, 'dist', 'pan-zoom.global.js'), path.join(COMPILER_DIR, 'pan-zoom.global.js'));
console.log('  Bundled compiler + pan/zoom controller for preview webview');

// --- Step 5: Package with vsce ---
step('5/5  Packaging .vsix');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const vsixPath = path.join(OUTPUT_DIR, 'vscode-pathogen.vsix');

run(`npx @vscode/vsce package --allow-missing-repository --no-dependencies --out "${vsixPath}"`, EXT_DIR);

const size = (fs.statSync(vsixPath).size / 1024).toFixed(1);
console.log(`\n✓ Extension packaged: ${path.relative(ROOT, vsixPath)} (${size} KB)`);

// --- Optional: Install ---
if (install) {
  step('Installing into VS Code');
  try {
    run(`code --install-extension "${vsixPath}" --force`);
    console.log('\n✓ Extension installed. Reload VS Code to activate.');
  } catch {
    console.log('\n⚠ Could not install — is the `code` CLI available?');
    console.log(`  Install manually: code --install-extension "${vsixPath}" --force`);
  }
} else {
  console.log(`\nTo install: npx tsx scripts/build-vscode-extension.ts --install`);
  console.log(`Or manually: code --install-extension "${vsixPath}" --force`);
}
