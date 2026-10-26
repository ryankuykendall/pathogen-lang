/**
 * v2 (2026-10-25): the README's two library examples after the round-2
 * docs review, run against the BUILT package entries ('pathogen-lang'
 * resolves to this package's own dist/ through its exports map, so run
 * `npm run build` first). v1 (readme-node-example.ts) is the earlier README.
 *
 *   npx tsx project-docs/modules/verify/readme-node-example-v2.ts
 *
 * 0. The Quick Start output comment and the Syntax Overview block: the first
 *    must be what the CLI prints, the second must compile.
 * 1. "Library Usage", word for word: its path data must equal the CLI's
 *    output for the same program, and generateSvg must hold that path.
 * 2. "Loading fonts in Node", word for word except the file path: the
 *    library's output must equal the built CLI's for the same file.
 *
 * Result 2026-10-25: quick start MATCH; syntax overview exit 0; library
 * usage MATCH (svg and generateSvg hold the path); both entries resolved from
 * dist/, fonts Inter-Regular (file) and Baumans (local), library and CLI
 * 1729 chars each, MATCH.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';

import { buildFontRegistry, compile, ensureOpentype, generateSvg, resolveFonts } from 'pathogen-lang';
import {
  createNodeFontHost,
  defaultCacheDir,
  findProjectRoot,
  fontDirsFromEnv,
  loadProjectFileSync,
  offlineReason,
} from 'pathogen-lang/node';

// --- 0. Quick Start and Syntax Overview --------------------------------------
{
  // `npx pathogen-lang` runs this package's bin, dist/cli.js
  const quick = spawnSync('node', ['dist/cli.js', '-e', 'circle(100, 100, 50);'], { encoding: 'utf8' });
  const promised = 'M 50 100 a 50 50 0 1 1 100 0 a 50 50 0 1 1 -100 0';
  console.log(`quick start: ${quick.stdout.trim() === promised ? 'MATCH' : `DIFFERENT ${quick.stdout}${quick.stderr}`}`);
  // The README's Syntax Overview block, copied out of README.md at run time
  const readme = readFileSync('README.md', 'utf8');
  const overview = readme.split('## Syntax Overview')[1].split('```')[1];
  const compiled = spawnSync('node', ['dist/cli.js', '-e', overview], { encoding: 'utf8' });
  console.log(`syntax overview: exit ${compiled.status}${compiled.stderr ? `, ${compiled.stderr.trim()}` : ''}`);
}

// --- 1. Library Usage -------------------------------------------------------
{
  const libraryProgram = `
  let r = 50;
  let cx = 100;
  let cy = 100;
  circle(cx, cy, r);
`;
  const result = compile(libraryProgram);

  // The path data of the program's drawing
  const pathData = result.layers[0].data;
  const svg = `<svg viewBox="0 0 200 200">
  <path d="${pathData}" fill="none" stroke="black"/>
</svg>`;

  // Or the whole document, with every layer, style and definition
  const svgDocument = generateSvg(result, { viewBox: '0 0 200 200' });

  const cli = spawnSync('node', ['dist/cli.js', '-e', libraryProgram], { encoding: 'utf8' });
  console.log(`library usage: path ${JSON.stringify(pathData)}`);
  console.log(`  CLI ${cli.status === 0 && cli.stdout.trim() === pathData ? 'MATCH' : `DIFFERENT ${cli.stdout}`}`);
  console.log(`  svg holds it: ${svg.includes(pathData)}; generateSvg holds it: ${svgDocument.includes(pathData)}`);
}

// --- 2. Loading fonts in Node -----------------------------------------------
const file = 'project-docs/modules/verify/readme-poster/main.pathogen';
const source = readFileSync(file, 'utf8');
const programDir = dirname(file);

// The project folder, and a check of its pathogen.json, as the CLI does.
const { root, projectFile } = findProjectRoot(programDir);
if (projectFile) {
  const project = loadProjectFileSync(projectFile);
  if (!project.ok) throw new Error(project.message);
}

const host = createNodeFontHost({
  root,
  programDir,
  offlineReason: offlineReason(false), // honours PATHOGEN_OFFLINE=1
  cacheDir: defaultCacheDir(), // honours PATHOGEN_CACHE_DIR
  fontDirs: fontDirsFromEnv(process.env.PATHOGEN_FONT_DIRS),
});

// The program's path inside the project folder, with forward slashes.
const entry = `/${relative(root, file).split(sep).join('/')}`;
const { fonts, messages } = await resolveFonts(source, { host, entry });
for (const m of messages) {
  const where = m.line === undefined ? file : `${file}:${m.line}:${m.column}`;
  console.error(`${where}: ${m.severity}: ${m.message}`);
}
// An error means a font could not be loaded. A warning lets the compile run:
// with downloads off, a family that isn't found leaves only the calls that
// need it (PathBlock.fromGlyph, TextBlock.toPathBlock(), Font.*) to fail.
if (messages.some((m) => m.severity === 'error')) process.exit(1);

// Fonts are parsed with opentype.js, which loads on demand: load it before
// building the font registry.
await ensureOpentype();
const result = compile(source, { fonts: buildFontRegistry(fonts).registry });

const library = result.layers[0]?.data ?? '';
const cli = spawnSync('node', ['dist/cli.js', file], { encoding: 'utf8' });
console.log(`resolved from: ${import.meta.resolve('pathogen-lang')} and ${import.meta.resolve('pathogen-lang/node')}`);
console.log(`project file ${projectFile}, root ${root}, entry ${entry}`);
console.log(`fonts ${fonts.map((f) => `${f.family}/${f.origin}`).join(', ')}`);
console.log(`library ${library.length} chars; CLI exit ${cli.status}, ${cli.stdout.trim().length} chars`);
console.log(library === cli.stdout.trim() ? 'MATCH' : `DIFFERENT\n${cli.stderr}`);
