import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SAMPLES_DIR = join(PROJECT_ROOT, 'website', 'blog', 'samples');

/**
 * Auto-detect viewBox/width/height from pathogen source.
 *
 * Recognizes the canonical `define ViewBox(originX, originY, width, height);`
 * statement and the two legacy comment forms for backwards compatibility.
 */
function autoDetectDimensions(source: string): {
  viewBox: string;
  width: string;
  height: string;
} {
  // Canonical: `define ViewBox(originX, originY, width, height);`
  const defineMatch =
    /define\s+ViewBox\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/.exec(
      source,
    );
  if (defineMatch) {
    return {
      viewBox: `${defineMatch[1]} ${defineMatch[2]} ${defineMatch[3]} ${defineMatch[4]}`,
      width: defineMatch[3],
      height: defineMatch[4],
    };
  }

  // Legacy comment: "Set viewBox: W x H, width: W, height: H"
  const setMatch = /\/\/\s*Set\s+viewBox:\s*(\d+)\s*x\s*(\d+)\s*,\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)/i.exec(source);
  if (setMatch) {
    return {
      viewBox: `0 0 ${setMatch[1]} ${setMatch[2]}`,
      width: setMatch[3],
      height: setMatch[4],
    };
  }

  // Legacy comment: viewBox="x y w h"
  const vbMatch = /viewBox[=:]\s*"?(\d+\s+\d+\s+\d+\s+\d+)"?/i.exec(source);
  if (vbMatch) {
    const parts = vbMatch[1].split(/\s+/);
    return { viewBox: vbMatch[1], width: parts[2], height: parts[3] };
  }

  // Default
  return { viewBox: '0 0 400 300', width: '400', height: '300' };
}

/**
 * Detect whether source uses GPU gradient types that require --render-gpu.
 */
function hasGpuGradients(source: string): boolean {
  return /\b(ConicGradient|MeshGradient|FreeformGradient|TopoGradient)\s*\(/.test(source);
}

/**
 * Find all .pathogen files in sample directories, optionally filtered by post number.
 */
function findSamples(postFilter?: number): string[] {
  if (!existsSync(SAMPLES_DIR)) {
    return [];
  }

  const dirs = readdirSync(SAMPLES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('post'))
    .map((d) => d.name)
    .sort();

  const filtered = postFilter ? dirs.filter((d) => d === `post${postFilter}`) : dirs;

  const files: string[] = [];
  for (const dir of filtered) {
    const dirPath = join(SAMPLES_DIR, dir);
    const entries = readdirSync(dirPath)
      .filter((f) => f.endsWith('.pathogen'))
      .sort();
    for (const entry of entries) {
      files.push(join(dirPath, entry));
    }
  }

  return files;
}

/**
 * Check if output SVG is newer than source .pathogen file (incremental build).
 */
function isUpToDate(pathogenPath: string, svgPath: string): boolean {
  if (!existsSync(svgPath)) return false;
  const srcStat = statSync(pathogenPath);
  const outStat = statSync(svgPath);
  return outStat.mtimeMs > srcStat.mtimeMs;
}

const program = new Command();
program
  .name('compile-samples')
  .description('Batch-compile blog sample .pathogen files to SVG')
  .option('--post <n>', 'Compile only post N samples (default: all)')
  .option('--dry-run', 'List files without compiling')
  .option('--force', 'Recompile all files, ignoring timestamps')
  .action(async (opts) => {
    const postFilter = opts.post ? parseInt(opts.post, 10) : undefined;
    const dryRun = opts.dryRun === true;
    const force = opts.force === true;

    const files = findSamples(postFilter);
    if (files.length === 0) {
      console.log('No .pathogen sample files found.');
      process.exit(0);
    }

    console.log(`Found ${files.length} sample(s)${postFilter ? ` in post${postFilter}` : ''}:\n`);

    let compiled = 0;
    let skipped = 0;
    let errors = 0;

    for (const pathogenPath of files) {
      const rel = relative(PROJECT_ROOT, pathogenPath);
      const svgPath = pathogenPath.replace(/\.pathogen$/, '.svg');
      const svgRel = relative(PROJECT_ROOT, svgPath);

      if (dryRun) {
        const upToDate = isUpToDate(pathogenPath, svgPath);
        console.log(`  ${rel} → ${svgRel}${upToDate ? ' (up to date)' : ''}`);
        continue;
      }

      // Incremental: skip if SVG is newer (unless --force)
      if (!force && isUpToDate(pathogenPath, svgPath)) {
        console.log(`  skip  ${rel} (up to date)`);
        skipped++;
        continue;
      }

      const source = readFileSync(pathogenPath, 'utf-8');
      const { viewBox, width, height } = autoDetectDimensions(source);
      const useGpu = hasGpuGradients(source);

      const cliArgs = [
        `--src=${pathogenPath}`,
        `--output-svg-file=${svgPath}`,
        `--viewBox=${viewBox}`,
        `--width=${width}`,
        `--height=${height}`,
        '--include-metadata',
      ];
      if (useGpu) {
        cliArgs.push('--render-gpu', '--scale=2');
      }

      process.stdout.write(`  build ${rel} ...`);

      const result = spawnSync('npx', ['tsx', 'src/cli.ts', ...cliArgs], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        // Some samples (e.g., post16/wedge-diag-*) do dozens of boolean
        // XOR ops and legitimately take 2+ minutes; raise from 120s to
        // 10min so they don't get silently killed and reported as
        // "Unknown error".
        timeout: 600_000,
      });

      if (result.status !== 0) {
        console.log(' ERROR');
        const errMsg = (result.stderr || result.stdout || 'Unknown error').trim();
        console.log(`        ${errMsg.split('\n')[0]}`);
        errors++;
      } else {
        console.log(' ok');
        compiled++;
      }
    }

    if (!dryRun) {
      console.log(`\nDone: ${compiled} compiled, ${skipped} skipped, ${errors} error(s)`);
      if (errors > 0) process.exit(1);
    }
  });

program.parse();
