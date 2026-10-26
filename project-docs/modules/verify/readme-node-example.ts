/**
 * The README's "Loading fonts in Node" example, word for word except the file
 * path, run against the BUILT package entries ('pathogen-lang' resolves to
 * this package's own dist/ through its exports map, so run `npm run build`
 * first). Then the same file through the built CLI: the outputs must match.
 *
 *   npx tsx project-docs/modules/verify/readme-node-example.ts
 *
 * Result 2026-10-24: both entries resolved from dist/, fonts Inter-Regular
 * (file) and Baumans (local), library and CLI outputs identical (MATCH).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';

import { buildFontRegistry, compile, ensureOpentype, resolveFonts } from 'pathogen-lang';
import { createNodeFontHost, defaultCacheDir, findProjectRoot, offlineReason } from 'pathogen-lang/node';

const file = 'project-docs/modules/verify/readme-poster/main.pathogen';
const source = readFileSync(file, 'utf8');
const programDir = dirname(file);
const { root } = findProjectRoot(programDir);
const host = createNodeFontHost({
  root,
  programDir,
  offlineReason: offlineReason(false), // honours PATHOGEN_OFFLINE=1
  cacheDir: defaultCacheDir(),
});

// The program's path inside the project folder, with forward slashes.
const entry = `/${relative(root, file).split(sep).join('/')}`;
const { fonts, messages } = await resolveFonts(source, { host, entry });
for (const m of messages) console.error(`${file}:${m.line ?? 1}: ${m.severity}: ${m.message}`);
if (messages.some((m) => m.severity === 'error')) process.exit(1);

await ensureOpentype();
const result = compile(source, { fonts: buildFontRegistry(fonts).registry });

const library = result.layers[0]?.data ?? '';
const cli = spawnSync('node', ['dist/cli.js', file], { encoding: 'utf8' });
console.log(`resolved from: ${import.meta.resolve('pathogen-lang')} and ${import.meta.resolve('pathogen-lang/node')}`);
console.log(`root ${root}, entry ${entry}, fonts ${fonts.map((f) => `${f.family}/${f.origin}`).join(', ')}`);
console.log(`library ${library.length} chars; CLI exit ${cli.status}, ${cli.stdout.trim().length} chars`);
console.log(library === cli.stdout.trim() ? 'MATCH' : `DIFFERENT\n${cli.stderr}`);
