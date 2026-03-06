import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, basename, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import prettier from 'prettier';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const BBWP_DIR = join(PROJECT_ROOT, 'website', 'bbwp');

/**
 * Auto-detect viewBox/width/height from pathogen source comments.
 * Looks for patterns like:
 *   // Set viewBox: 2200 x 11200, width: 2200, height: 11200
 *   // viewBox="0 0 400 400"
 */
function autoDetectDimensions(source: string): {
  viewBox?: string;
  width?: string;
  height?: string;
} {
  const result: { viewBox?: string; width?: string; height?: string } = {};

  // Pattern 1: "Set viewBox: W x H, width: W, height: H"
  const setMatch = source.match(
    /\/\/\s*Set\s+viewBox:\s*(\d+)\s*x\s*(\d+)\s*,\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)/i
  );
  if (setMatch) {
    result.viewBox = `0 0 ${setMatch[1]} ${setMatch[2]}`;
    result.width = setMatch[3];
    result.height = setMatch[4];
    return result;
  }

  // Pattern 2: viewBox="x y w h"
  const vbMatch = source.match(/viewBox[=:]\s*"?(\d+\s+\d+\s+\d+\s+\d+)"?/i);
  if (vbMatch) {
    result.viewBox = vbMatch[1];
    const parts = vbMatch[1].split(/\s+/);
    result.width = parts[2];
    result.height = parts[3];
  }

  // Pattern 3: width: N, height: N (standalone)
  const wMatch = source.match(/\/\/.*width[=:]\s*(\d+)/i);
  const hMatch = source.match(/\/\/.*height[=:]\s*(\d+)/i);
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

function wrapSvgInHtml(svgContent: string, meta: {
  feature: string;
  roadmap: string;
  timestamp: string;
  viewBox: string;
  width: string;
  height: string;
  scale: number;
  renderMode: 'gpu' | 'cpu';
}): string {
  const renderLabel = meta.renderMode === 'gpu'
    ? `--render-gpu --scale=${meta.scale}`
    : 'string-based (no GPU)';
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
${svgContent}
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
    const renderMode = useGpu ? 'gpu' as const : 'cpu' as const;

    console.log(`Compiling: ${file}`);
    console.log(`  Roadmap:  ${roadmap}`);
    console.log(`  Feature:  ${feature}`);
    console.log(`  ViewBox:  ${viewBox}`);
    console.log(`  Size:     ${width}x${height}${useGpu ? ` @ ${scale}x` : ''}`);
    console.log(`  Render:   ${useGpu ? 'GPU (headless Chrome)' : 'string-based (no Puppeteer)'}`);

    // Step 1: Compile to SVG
    const tmpSvg = join(PROJECT_ROOT, '.compile-bbwp-tmp.svg');
    const cliArgs = [
      `--src=${file}`,
      `--output-svg-file=${tmpSvg}`,
      `--viewBox=${viewBox}`,
      `--width=${width}`,
      `--height=${height}`,
    ];
    if (useGpu) {
      cliArgs.push('--render-gpu', `--scale=${scale}`);
    }
    if (opts.stroke) cliArgs.push(`--stroke=${opts.stroke}`);
    if (opts.fill) cliArgs.push(`--fill=${opts.fill}`);
    if (opts.strokeWidth) cliArgs.push(`--stroke-width=${opts.strokeWidth}`);

    try {
      console.log(useGpu ? '  Rendering via headless Chrome...' : '  Rendering...');
      const result = spawnSync('npx', ['tsx', 'src/cli.ts', ...cliArgs], {
        cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 120_000,
      });
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || 'Unknown error');
      }
    } catch (err: any) {
      console.error(`Compilation failed: ${err.message}`);
      process.exit(1);
    }

    // Step 2: Read the SVG and wrap in HTML
    const svgContent = readFileSync(tmpSvg, 'utf-8');
    const timestamp = generateTimestamp();
    const html = wrapSvgInHtml(svgContent, {
      feature, roadmap, timestamp, viewBox, width, height, scale, renderMode,
    });

    // Step 3: Pretty-print the HTML
    console.log('  Formatting...');
    const formatted = await prettier.format(html, {
      parser: 'html',
      printWidth: 120,
      tabWidth: 2,
      htmlWhitespaceSensitivity: 'ignore',
    });

    // Step 4: Save to website/bbwp/
    const outFilename = `${timestamp}--${roadmap}--${feature}.html`;
    const outPath = join(BBWP_DIR, outFilename);

    if (existsSync(outPath)) {
      console.error(`Error: File already exists (timestamp collision): ${outFilename}`);
      console.error('Wait a second and try again.');
      process.exit(1);
    }

    writeFileSync(outPath, formatted);
    console.log(`  Written:  website/bbwp/${outFilename}`);
    console.log(`  Size:     ${(formatted.length / 1024 / 1024).toFixed(1)} MB`);

    // Step 5: Update the index
    spawnSync('npx', ['tsx', 'scripts/update-bbwp-index.ts'], {
      cwd: PROJECT_ROOT, encoding: 'utf-8',
    });
    console.log('  Index:    updated');

    // Cleanup temp file
    try { unlinkSync(tmpSvg); } catch {}

    console.log(`\nDone. View at: http://localhost:3001/website/bbwp/${outFilename}`);
  });

program.parse();
