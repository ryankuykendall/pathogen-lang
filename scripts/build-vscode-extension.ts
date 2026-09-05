#!/usr/bin/env tsx
/**
 * Build and package the Pathogen VS Code extension as a .vsix file.
 *
 * Steps:
 *   1. Build root library (npm run build)
 *   2. Build language server (tsc)
 *   3. Build extension (tsc)
 *   4. Bundle language server + library into extension/server/
 *   5. Package with vsce
 *
 * Usage:
 *   npx tsx scripts/build-vscode-extension.ts [--install]
 *
 *   --install   Install the .vsix into VS Code after packaging
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
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

// Copy language server package.json (needed for Node module resolution)
fs.copyFileSync(
  path.join(SERVER_DIR, 'package.json'),
  path.join(BUNDLED_SERVER_DIR, 'package.json'),
);

// Install language server runtime deps first (vscode-languageserver, vscode-languageserver-textdocument)
// at the exact ranges the server's package.json declares — not @latest — so the
// bundled runtime matches the types the server was compiled against.
const serverPkg = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'package.json'), 'utf-8'));
const serverDeps = Object.entries<string>(serverPkg.dependencies || {}).filter(([d]) => d !== 'pathogen-lang');
if (serverDeps.length > 0) {
  run(`npm install --prefix "${BUNDLED_SERVER_DIR}" ${serverDeps.map(([d, range]) => `"${d}@${range}"`).join(' ')} --omit=dev --no-save 2>/dev/null || true`);
}

// Now replace the pathogen-lang symlink (created by npm workspace) with real files
const serverNodeModules = path.join(BUNDLED_SERVER_DIR, 'node_modules', 'pathogen-lang');
// Remove symlink or existing directory
if (fs.existsSync(serverNodeModules)) {
  fs.rmSync(serverNodeModules, { recursive: true, force: true });
}
fs.mkdirSync(serverNodeModules, { recursive: true });

// Copy CJS dist entry needed by the server
const sveDistDir = path.join(serverNodeModules, 'dist');
fs.mkdirSync(sveDistDir, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'dist', 'index.cjs'), path.join(sveDistDir, 'index.cjs'));

// Write minimal package.json pointing to CJS entry
fs.writeFileSync(path.join(serverNodeModules, 'package.json'), JSON.stringify({
  name: 'pathogen-lang',
  main: './dist/index.cjs',
}, null, 2));

// Copy external dependencies required by the CJS bundle (@lezer/*, opentype.js)
const rootNM = path.join(ROOT, 'node_modules');
const bundledNM = path.join(BUNDLED_SERVER_DIR, 'node_modules');
const cjsExternalDeps = ['@lezer/lr', '@lezer/highlight', '@lezer/common', 'opentype.js'];
for (const dep of cjsExternalDeps) {
  const src = path.join(rootNM, dep);
  const dest = path.join(bundledNM, dep);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  if (fs.existsSync(src)) {
    const realSrc = fs.realpathSync(src);
    fs.cpSync(realSrc, dest, { recursive: true });
    console.log(`  Copied ${dep} (CJS external)`);
  }
}

console.log(`  Bundled server to ${path.relative(ROOT, BUNDLED_SERVER_DIR)}`);

// Bundle compiler IIFE for the preview webview
const COMPILER_DIR = path.join(EXT_DIR, 'compiler');
if (fs.existsSync(COMPILER_DIR)) fs.rmSync(COMPILER_DIR, { recursive: true });
fs.mkdirSync(COMPILER_DIR, { recursive: true });
fs.copyFileSync(
  path.join(ROOT, 'dist', 'index.global.js'),
  path.join(COMPILER_DIR, 'index.global.js'),
);
// Shared pan/zoom controller bundle (window.PathogenPanZoom) for the webview.
fs.copyFileSync(
  path.join(ROOT, 'dist', 'pan-zoom.global.js'),
  path.join(COMPILER_DIR, 'pan-zoom.global.js'),
);
console.log('  Bundled compiler + pan/zoom controller for preview webview');

// Copy extension's runtime dependency (vscode-languageclient + transitive deps)
// into server/node_modules which vsce --no-dependencies includes (it skips
// the extension's own node_modules/ but includes server/ as a regular directory)
step('5/6  Bundling extension runtime dependencies');
const rootNodeModules = path.join(ROOT, 'node_modules');
const bundledNodeModules = path.join(BUNDLED_SERVER_DIR, 'node_modules');
const clientDeps = [
  'vscode-languageclient',
  'vscode-languageserver-protocol',
  'vscode-languageserver-types',
  'vscode-jsonrpc',
  // Transitive dependencies of vscode-languageclient
  'semver',
  'minimatch',
  'brace-expansion',
  'balanced-match',
  'concat-map',
];
for (const dep of clientDeps) {
  const src = path.join(rootNodeModules, dep);
  const dest = path.join(bundledNodeModules, dep);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  if (fs.existsSync(src)) {
    const realSrc = fs.realpathSync(src);
    fs.cpSync(realSrc, dest, { recursive: true });
    console.log(`  Copied ${dep}`);
  }
}

// --- Step 6: Package with vsce ---
step('6/6  Packaging .vsix');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const vsixPath = path.join(OUTPUT_DIR, 'vscode-pathogen.vsix');

run(
  `npx @vscode/vsce package --allow-missing-repository --no-dependencies --out "${vsixPath}"`,
  EXT_DIR,
);

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
