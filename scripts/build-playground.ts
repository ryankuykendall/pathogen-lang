import { promises as fs } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import * as esbuild from 'esbuild';

import { buildVendor } from './build-vendor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PLAYGROUND = join(ROOT, 'playground');
// Pathogen Studio is hosted at the apex of pathogen.studio so build output
// goes directly under public/. The Pages worker SSRs the apex (renderHomepage
// claims `/`) and serves /spa.html for SPA fallback routes; static assets
// (styles, components, etc.) live alongside.
const OUT = join(ROOT, 'public');

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

/**
 * esbuild plugin that inlines CSS imports as text strings.
 *
 * With `bundle: false`, esbuild doesn't resolve imports so the built-in
 * `{ '.css': 'text' }` loader never fires.  This plugin rewrites
 * `import styles from './foo.css'` → `const styles = "…css content…"`
 * at the source transform level, which works in unbundled mode.
 */
function cssTextPlugin(): esbuild.Plugin {
  return {
    name: 'css-text-inline',
    setup(build) {
      build.onLoad({ filter: /\.[tj]s$/ }, async (args) => {
        const source = await fs.readFile(args.path, 'utf-8');

        // Quick check — skip files without CSS imports
        if (!source.includes('.css')) return undefined;

        // Match: import <identifier> from '<relative>.css';
        const cssImportRe = /import\s+(\w+)\s+from\s+['"]([^'"]+\.css)['"]\s*;/g;
        let match: RegExpExecArray | null;
        let transformed = source;
        let didTransform = false;

        // Collect matches with their positions, then process in reverse to preserve offsets
        const matches: { fullMatch: string; varName: string; cssPath: string; index: number }[] = [];
        while ((match = cssImportRe.exec(source)) !== null) {
          matches.push({ fullMatch: match[0], varName: match[1], cssPath: match[2], index: match.index });
        }

        for (const { fullMatch, varName, cssPath, index } of matches.reverse()) {
          const resolvedCss = resolve(dirname(args.path), cssPath);
          try {
            const cssContent = await fs.readFile(resolvedCss, 'utf-8');
            // Escape backticks and backslashes for template literal
            const escaped = cssContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
            const replacement = `const ${varName} = \`${escaped}\`;`;
            transformed =
              transformed.slice(0, index) +
              replacement +
              transformed.slice(index + fullMatch.length);
            didTransform = true;
          } catch {
            // CSS file not found — leave the import as-is
          }
        }

        if (!didTransform) return undefined;

        return {
          contents: transformed,
          loader: args.path.endsWith('.ts') ? 'ts' : 'js',
        };
      });
    },
  };
}

export async function buildPlayground(options: { watch?: boolean } = {}): Promise<void> {
  const startTime = Date.now();

  // Bundle npm vendor deps (hdr-color-input, etc.) into public/pathogen/vendor/
  await buildVendor({ watch: options.watch });

  // Collect all .ts and .js source files (excluding types/)
  const sourceFiles = await walkDir(PLAYGROUND, new Set(['.ts', '.js']));

  if (sourceFiles.length === 0) {
    console.warn('No source files found in playground/');
    return;
  }

  // SPA reaches the API at this base. Production default is the dedicated
  // API Worker at api.pathogen.studio (cutover landed in commit ?). Local
  // dev overrides via PATHOGEN_API_BASE=http://localhost:8787 to point at
  // a wrangler-dev API Worker.
  const apiBase = process.env.PATHOGEN_API_BASE ?? 'https://api.pathogen.studio';

  const buildOptions: esbuild.BuildOptions = {
    entryPoints: sourceFiles,
    outdir: OUT,
    outbase: PLAYGROUND,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins: [cssTextPlugin()],
    define: {
      __PATHOGEN_API_BASE__: JSON.stringify(apiBase),
    },
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

    console.log(`Playground built in ${Date.now() - startTime}ms (${sourceFiles.length} files → public/)`);
  }
}

async function copyAssets(): Promise<void> {
  // Copy global stylesheets (loaded via <link> tags, not imported by JS)
  await copyDir(join(PLAYGROUND, 'styles'), join(OUT, 'styles'));

  // Copy static assets (material-icons-sprite.svg, etc.)
  await copyDir(join(PLAYGROUND, 'assets'), join(OUT, 'assets'));

  // Copy and modify index.html → spa.html (the SPA shell). The Pages
  // worker SSRs the apex `/`, so we can't drop the SPA shell at
  // public/index.html — it would clobber the homepage. The worker fetches
  // /spa.html internally for extensionless routes (workspaces, workspace/:id,
  // preferences, etc.). 404.html stays as a hard-fallback for CF Pages's
  // built-in SPA-handling.
  let indexHtml = await fs.readFile(join(PLAYGROUND, 'index.html'), 'utf-8');
  indexHtml = indexHtml
    .replace('<head>', '<head>\n    <base href="/">')
    .replace('../dist/index.global.js', 'dist/index.global.js');
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(join(OUT, 'spa.html'), indexHtml);
  await fs.writeFile(join(OUT, '404.html'), indexHtml);

  // Copy library bundle + worker bundle from dist/ → public/pathogen/dist/.
  // The playground loads `dist/index.global.js` (window.PathogenLang) and
  // spawns `dist/worker.worker.js` for async compilation. If we don't stage
  // them here, a dev who runs `npm run build` + `npm run build:playground`
  // ends up with a fresh playground pointing at stale lib/worker bundles —
  // which manifested today as `@font` directives silently being dropped
  // because the pre-fix worker didn't pass the font registry into compile.
  await copyLibArtifacts();
}

async function copyLibArtifacts(): Promise<void> {
  const distSrc = join(ROOT, 'dist');
  const distDest = join(OUT, 'dist');
  await fs.mkdir(distDest, { recursive: true });

  const required = ['index.global.js', 'worker.worker.js'];
  const optional = ['index.global.js.map', 'worker.worker.js.map'];

  let missing = 0;
  for (const name of required) {
    const src = join(distSrc, name);
    try {
      await fs.copyFile(src, join(distDest, name));
    } catch {
      console.warn(
        `  ${name} not found in dist/ — playground will load a stale or missing bundle. ` +
          `Run \`npm run build\` first.`,
      );
      missing++;
    }
  }
  for (const name of optional) {
    try {
      await fs.copyFile(join(distSrc, name), join(distDest, name));
    } catch {
      // Source map is optional — esbuild may not have emitted it.
    }
  }

  if (missing === 0) {
    console.log(`  Copied ${required.length} library artifact(s) from dist/`);
  }
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
