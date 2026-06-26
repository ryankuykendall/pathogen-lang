import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import prettier from 'prettier';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const BBWP_DIR = join(PROJECT_ROOT, 'website', 'bbwp');

/**
 * Auto-detect viewBox/width/height from pathogen source.
 *
 * Recognizes the canonical `define ViewBox(originX, originY, width, height);`
 * statement and the two legacy comment forms (`// Set viewBox: ...`,
 * `// viewBox="..."`) for backwards compatibility with older `.pathogen`
 * fixtures that have not yet been migrated.
 */
function autoDetectDimensions(source: string): {
  viewBox?: string;
  width?: string;
  height?: string;
} {
  const result: { viewBox?: string; width?: string; height?: string } = {};

  // Canonical: `define ViewBox(originX, originY, width, height);`
  const defineMatch =
    /define\s+ViewBox\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/.exec(
      source,
    );
  if (defineMatch) {
    result.viewBox = `${defineMatch[1]} ${defineMatch[2]} ${defineMatch[3]} ${defineMatch[4]}`;
    result.width = defineMatch[3];
    result.height = defineMatch[4];
    return result;
  }

  // Legacy comment: `// Set viewBox: W x H, width: W, height: H`
  const setMatch = /\/\/\s*Set\s+viewBox:\s*(\d+)\s*x\s*(\d+)\s*,\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)/i.exec(source);
  if (setMatch) {
    result.viewBox = `0 0 ${setMatch[1]} ${setMatch[2]}`;
    result.width = setMatch[3];
    result.height = setMatch[4];
    return result;
  }

  // Legacy comment: viewBox="x y w h"
  const vbMatch = /viewBox[=:]\s*"?(\d+\s+\d+\s+\d+\s+\d+)"?/i.exec(source);
  if (vbMatch) {
    result.viewBox = vbMatch[1];
    const parts = vbMatch[1].split(/\s+/);
    result.width = parts[2];
    result.height = parts[3];
  }

  // Legacy standalone comments: width: N, height: N
  const wMatch = /\/\/.*width[=:]\s*(\d+)/i.exec(source);
  const hMatch = /\/\/.*height[=:]\s*(\d+)/i.exec(source);
  if (wMatch && !result.width) result.width = wMatch[1];
  if (hMatch && !result.height) result.height = hMatch[1];

  return result;
}

/**
 * Detect whether source uses GPU gradient types that require --render-gpu.
 */
function hasGpuGradients(source: string): boolean {
  return /\b(ConicGradient|MeshGradient|FreeformGradient|TopoGradient)\s*\(/.test(source);
}

/**
 * Derive roadmap and feature names from a file path.
 * For project-docs/topological-gradient/topo-showcase-large.pathogen:
 *   roadmap = "topological-gradient"
 *   feature = "topo-showcase-large"
 */
function deriveNames(filePath: string): { roadmap: string; feature: string } {
  const absPath = filePath.startsWith('/') ? filePath : join(process.cwd(), filePath);
  const rel = relative(PROJECT_ROOT, absPath);
  const parts = rel.split('/');
  const feature = basename(filePath, '.pathogen');

  // If under project-docs/<roadmap>/, use the roadmap dir name
  if (parts[0] === 'project-docs' && parts.length >= 3) {
    return { roadmap: parts[1], feature };
  }

  // Otherwise use "misc" as roadmap
  return { roadmap: 'misc', feature };
}

function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function wrapSvgInHtml(
  svgContent: string,
  meta: {
    feature: string;
    roadmap: string;
    timestamp: string;
    viewBox: string;
    width: string;
    height: string;
    scale: number;
    renderMode: 'gpu' | 'cpu';
  },
): string {
  const renderLabel = meta.renderMode === 'gpu' ? `--render-gpu --scale=${meta.scale}` : 'string-based (no GPU)';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BBWP: ${meta.feature} — ${meta.roadmap}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1e1e2e; color: #cdd6f4; font-family: system-ui, sans-serif; }
    .header { padding: 1rem 2rem; border-bottom: 1px solid #313244; }
    .header h1 { font-size: 1rem; color: #89b4fa; margin-bottom: 0.25rem; }
    .header p { font-size: 0.75rem; color: #a6adc8; }
    .svg-container { display: flex; justify-content: center; padding: 1rem; }
    .svg-container svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${meta.feature}</h1>
    <p>Roadmap: ${meta.roadmap} | Generated: ${meta.timestamp.replace(/-(\d{2}:\d{2}:\d{2})$/, ' $1')} | ${renderLabel} | viewBox: ${meta.viewBox}</p>
  </div>
  <div class="svg-container">
    <!-- prettier-ignore -->
${svgContent}
  </div>
</body>
</html>`;
}

function wrapMiniWorkspaceHtml(
  svgContent: string,
  source: string,
  meta: {
    feature: string;
    roadmap: string;
    timestamp: string;
  },
): string {
  const escapedSource = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const displayTime = meta.timestamp.replace(/-(\d{2}:\d{2}:\d{2})$/, ' $1');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MW: ${meta.feature} — ${meta.roadmap}</title>
  <link rel="stylesheet" href="../../playground/styles/theme.css">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100dvw; height: 100dvh; overflow: hidden; }
    body { background: var(--bg-primary, #1e1e2e); color: var(--text-primary, #cdd6f4); font-family: system-ui, sans-serif; display: flex; flex-direction: column; }
    .header { padding: 0.625rem 1rem; border-bottom: 1px solid var(--border-color, #313244); flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .header-text h1 { font-size: 0.875rem; color: var(--accent-color, #89b4fa); margin-bottom: 0.125rem; }
    .header-text p { font-size: 0.6875rem; color: var(--text-secondary, #a6adc8); }
    .workspace-container { flex: 1; min-height: 0; padding: 0.75rem 1rem; }
    mini-workspace { width: 100%; height: 100%; min-height: 0; max-height: none; margin: 0; }
  </style>
  <!-- shared pan/zoom controller (window.PathogenPanZoom) — must load before mini-preview -->
  <script src="../../public/dist/pan-zoom.global.js"></script>
  <script type="module" src="../../public/components/blog/mini-workspace.js"></script>
  <script type="module" src="../../public/components/shared/theme-toggle.js"></script>
</head>
<body>
  <div class="header">
    <div class="header-text">
      <h1>${meta.feature}</h1>
      <p>Roadmap: ${meta.roadmap} | Generated: ${displayTime}</p>
    </div>
    <theme-toggle></theme-toggle>
  </div>
  <div class="workspace-container">
    <!-- prettier-ignore -->
    <mini-workspace code-open>
      <code>${escapedSource}</code>
${svgContent}
    </mini-workspace>
  </div>
</body>
</html>`;
}

const program = new Command();
program
  .name('compile-bbwp')
  .description('Compile a .pathogen file to SVG, wrap as HTML, and archive as a BBWP artifact')
  .argument('<file>', 'Path to .pathogen source file')
  .option('--roadmap <name>', 'Roadmap name (default: auto-detect from path)')
  .option('--feature <name>', 'Feature name (default: auto-detect from filename)')
  .option('--viewBox <box>', 'SVG viewBox (default: auto-detect from source)')
  .option('--width <w>', 'SVG width (default: auto-detect from source)')
  .option('--height <h>', 'SVG height (default: auto-detect from source)')
  .option('--scale <n>', 'GPU scale factor 1-4 (default: 2)', '2')
  .option('--gpu', 'Force GPU rendering via headless Chrome')
  .option('--no-gpu', 'Force string-based rendering (skip Puppeteer)')
  .option('--stroke <color>', 'Default stroke color')
  .option('--fill <color>', 'Default fill color')
  .option('--stroke-width <w>', 'Default stroke width')
  .option('--svg <path>', 'Skip compilation and use this pre-built SVG file. The .pathogen <file> arg is still required for naming/source-display in mw.html.')
  .action(async (file, opts) => {
    // Validate input file
    if (!existsSync(file)) {
      console.error(`Error: File not found: ${file}`);
      process.exit(1);
    }

    const source = readFileSync(file, 'utf-8');

    // Derive names
    const derived = deriveNames(file);
    const roadmap = opts.roadmap || derived.roadmap;
    const feature = opts.feature || derived.feature;

    // Auto-detect dimensions
    const detected = autoDetectDimensions(source);
    const viewBox = opts.viewBox || detected.viewBox || '0 0 200 200';
    const width = opts.width || detected.width || '200';
    const height = opts.height || detected.height || '200';
    const scale = parseInt(opts.scale, 10);

    // Determine render mode: auto-detect unless forced
    let useGpu: boolean;
    if (opts.gpu === true) {
      useGpu = true;
    } else if (opts.gpu === false) {
      useGpu = false;
    } else {
      useGpu = hasGpuGradients(source);
    }
    const renderMode = useGpu ? ('gpu' as const) : ('cpu' as const);

    if (opts.svg) {
      if (!existsSync(opts.svg)) {
        console.error(`Error: --svg file not found: ${opts.svg}`);
        process.exit(1);
      }
      console.log(`Wrapping pre-built SVG: ${opts.svg}`);
      console.log(`  Source:   ${file}`);
      console.log(`  Roadmap:  ${roadmap}`);
      console.log(`  Feature:  ${feature}`);
    } else {
      console.log(`Compiling: ${file}`);
      console.log(`  Roadmap:  ${roadmap}`);
      console.log(`  Feature:  ${feature}`);
      console.log(`  ViewBox:  ${viewBox}`);
      console.log(`  Size:     ${width}x${height}${useGpu ? ` @ ${scale}x` : ''}`);
      console.log(`  Render:   ${useGpu ? 'GPU (headless Chrome)' : 'string-based (no Puppeteer)'}`);
    }

    // Step 1: Compile to SVG (skipped when --svg is provided)
    const tmpSvg = join(PROJECT_ROOT, '.compile-bbwp-tmp.svg');
    if (!opts.svg) {
      const cliArgs = [
        `--src=${file}`,
        `--output-svg-file=${tmpSvg}`,
        `--viewBox=${viewBox}`,
        `--width=${width}`,
        `--height=${height}`,
      ];
      cliArgs.push('--include-metadata');
      if (useGpu) {
        cliArgs.push('--render-gpu', `--scale=${scale}`);
      }
      if (opts.stroke) cliArgs.push(`--stroke=${opts.stroke}`);
      if (opts.fill) cliArgs.push(`--fill=${opts.fill}`);
      if (opts.strokeWidth) cliArgs.push(`--stroke-width=${opts.strokeWidth}`);

      try {
        console.log(useGpu ? '  Rendering via headless Chrome...' : '  Rendering...');
        const result = spawnSync('npx', ['tsx', 'src/cli.ts', ...cliArgs], {
          cwd: PROJECT_ROOT,
          encoding: 'utf-8',
          timeout: 120_000,
        });
        if (result.status !== 0) {
          throw new Error(result.stderr || result.stdout || 'Unknown error');
        }
      } catch (err: any) {
        console.error(`Compilation failed: ${err.message}`);
        process.exit(1);
      }
    }

    // Step 2: Read the SVG (compiled output, or the pre-built one) and wrap in HTML
    const svgPath = opts.svg ?? tmpSvg;
    const svgContent = readFileSync(svgPath, 'utf-8');
    const timestamp = generateTimestamp();
    const bbwpHtml = wrapSvgInHtml(svgContent, {
      feature,
      roadmap,
      timestamp,
      viewBox,
      width,
      height,
      scale,
      renderMode,
    });
    const mwHtml = wrapMiniWorkspaceHtml(svgContent, source, {
      feature,
      roadmap,
      timestamp,
    });

    // Step 3: Pretty-print both HTML files
    console.log('  Formatting...');
    const prettierOpts = {
      parser: 'html' as const,
      printWidth: 120,
      tabWidth: 2,
      htmlWhitespaceSensitivity: 'ignore' as const,
    };
    const [formattedBbwp, formattedMw] = await Promise.all([
      prettier.format(bbwpHtml, prettierOpts),
      prettier.format(mwHtml, prettierOpts),
    ]);

    // Step 4: Save to website/bbwp/
    const baseFilename = `${timestamp}--${roadmap}--${feature}`;
    const bbwpFilename = `${baseFilename}.bbwp.html`;
    const mwFilename = `${baseFilename}.mw.html`;
    const bbwpPath = join(BBWP_DIR, bbwpFilename);
    const mwPath = join(BBWP_DIR, mwFilename);

    if (existsSync(bbwpPath)) {
      console.error(`Error: File already exists (timestamp collision): ${bbwpFilename}`);
      console.error('Wait a second and try again.');
      process.exit(1);
    }

    writeFileSync(bbwpPath, formattedBbwp);
    writeFileSync(mwPath, formattedMw);
    console.log(`  Written:  website/bbwp/${bbwpFilename}`);
    console.log(`            website/bbwp/${mwFilename}`);
    console.log(
      `  Size:     bbwp ${(formattedBbwp.length / 1024 / 1024).toFixed(1)} MB | mw ${(formattedMw.length / 1024).toFixed(0)} KB`,
    );

    // Step 5: Update the index
    spawnSync('npx', ['tsx', 'scripts/update-bbwp-index.ts'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    });
    console.log('  Index:    updated');

    // Cleanup temp file
    try {
      unlinkSync(tmpSvg);
    } catch {
      // Ignore cleanup errors
    }

    console.log(`\nDone.`);
    console.log(`  BBWP: http://localhost:3001/website/bbwp/${bbwpFilename}`);
    console.log(`  MW:   http://localhost:3001/website/bbwp/${mwFilename}`);
  });

program.parse();
