import { promises as fs } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PLAYGROUND = join(ROOT, 'playground');
const OUT = join(ROOT, 'public', 'pathogen');

/** Glob helper using fs — returns relative paths matching extensions */
async function walkDir(dir: string, extensions: Set<string>): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'types' || entry.name === 'node_modules') continue;
      results.push(...(await walkDir(fullPath, extensions)));
    } else if (extensions.has(extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function buildPlayground(options: { watch?: boolean } = {}): Promise<void> {
  const startTime = Date.now();

  // Collect all .ts and .js source files (excluding types/)
  const sourceFiles = await walkDir(PLAYGROUND, new Set(['.ts', '.js']));

  if (sourceFiles.length === 0) {
    console.warn('No source files found in playground/');
    return;
  }

  const buildOptions: esbuild.BuildOptions = {
    entryPoints: sourceFiles,
    outdir: OUT,
    outbase: PLAYGROUND,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    loader: { '.css': 'text' },
    // Rename .ts outputs to .js
    outExtension: { '.js': '.js' },
    // Keep original structure — no bundling
    bundle: false,
    write: true,
    logLevel: 'warning',
  };

  if (options.watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching playground/ for changes...');
    // Copy assets once at start
    await copyAssets();
    console.log(`Initial build done in ${Date.now() - startTime}ms`);
    // Keep process alive
    await new Promise(() => {});
  } else {
    await esbuild.build(buildOptions);

    // Copy non-JS assets
    await copyAssets();

    console.log(`Playground built in ${Date.now() - startTime}ms (${sourceFiles.length} files → public/pathogen/)`);
  }
}

async function copyAssets(): Promise<void> {
  // Copy global stylesheets (loaded via <link> tags, not imported by JS)
  await copyDir(join(PLAYGROUND, 'styles'), join(OUT, 'styles'));

  // Copy and modify index.html for production
  let indexHtml = await fs.readFile(join(PLAYGROUND, 'index.html'), 'utf-8');
  indexHtml = indexHtml
    .replace('<head>', '<head>\n    <base href="/pathogen/">')
    .replace('../dist/index.global.js', 'dist/index.global.js');
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(join(OUT, 'index.html'), indexHtml);
  // SPA fallback for subdirectory routing
  await fs.writeFile(join(OUT, '404.html'), indexHtml);
}

// Only run CLI when executed directly (not when imported by build-website.ts)
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('build-playground.ts') || process.argv[1].endsWith('build-playground.js'));

if (isDirectExecution) {
  const program = new Command();
  program
    .name('build-playground')
    .description('Build playground TypeScript/JavaScript to public/pathogen/')
    .option('-w, --watch', 'Watch for changes and rebuild')
    .action(async (opts) => {
      try {
        await buildPlayground({ watch: opts.watch });
      } catch (err) {
        console.error('Playground build failed:', err);
        process.exit(1);
      }
    });
  program.parse();
}
