import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildFontRegistry,
  compile,
  ensureOpentype,
  formatModuleLoadError,
  generateSvg,
  planFontDirectives,
  planImports,
  PROJECT_FILE_NAME,
  resolveFonts,
  resolveModules,
  toJsonDocument,
  WARNING_CODES,
} from '.';
import { groupWarnings } from './evaluator/warning-groups';
import {
  createNodeFontHost,
  createNodeProjectHost,
  defaultCacheDir,
  findProjectRoot,
  fontDirsFromEnv,
  loadProjectFileSync,
  offlineReason,
  projectEntry,
} from './node';

import type {
  CompileOptions,
  CompileResult,
  CompileWarning,
  FontRegistry,
  LogEntry,
  ModuleGraph,
  WarningCode,
} from '.';
import type { SvgGeneratorOptions } from './svg-generator';

interface CliOptions {
  svgOutput?: string;
  viewBox?: string;
  width?: string;
  height?: string;
  stroke?: string;
  fill?: string;
  strokeWidth?: string;
  toFixed?: number;
  renderGpu?: boolean;
  scale?: number;
  printLogs?: boolean;
  logFile?: string;
  includeMetadata?: boolean;
  json?: boolean;
  pngOutput?: string;
  /** --strict (every warning is an error) or --strict=<codes>. */
  strict?: true | WarningCode[];
  /** --offline: never download fonts. */
  offline?: boolean;
  /** --root=<folder>: the project folder, overriding the pathogen.json search. */
  root?: string;
}

function printUsage() {
  console.log(`
pathogen-lang - Extended SVG path syntax compiler

Usage:
  pathogen-lang <file>       Compile a file
  pathogen-lang <folder>     Compile the "main" named in <folder>/pathogen.json
  pathogen-lang -            Read from stdin
  pathogen-lang -e <code>    Compile inline code
  pathogen-lang --src=<file> Compile a file (explicit flag)

Options:
  -h, --help                     Show this help message
  -v, --version                  Show version
  --src=<file>                   Input source file
  -o, --output <file>            Write path output to file
  --output-svg-file=<file>       Output as complete SVG file
  --png=<file>                   Rasterize the compiled SVG to a PNG at the
                                 viewBox size × --scale (needs the puppeteer
                                 dev dependency). Composes with --render-gpu.
  --json                         Print one JSON document: every layer's path
                                 data, styles, and source records, the defs,
                                 logs, warnings, and the command trace.
                                 Combines with -o; not with --output-svg-file,
                                 --render-gpu, or --png.
  --strict[=<codes>]             Treat warnings as errors: the first one stops
                                 compilation with exit code 1. With no value,
                                 every warning; with a comma-separated list,
                                 only those codes (e.g. --strict=non-finite).
  --viewBox=<box>                SVG viewBox (default: "0 0 200 200").
                                 Overridden when the source has a
                                 'define ViewBox(...)' statement.
  --width=<w>                    SVG width (default: "200"). Overridden
                                 when the source has 'define ViewBox'.
  --height=<h>                   SVG height (default: "200"). Overridden
                                 when the source has 'define ViewBox'.
  --stroke=<color>               Path stroke color (default: "#000")
  --fill=<color>                 Path fill color (default: "none")
  --stroke-width=<w>             Path stroke width (default: "2")
  --to-fixed=<N>                 Round decimals to N digits (0-20)
  --print-logs                   Print log() output to stderr
  --log-file=<file>              Write structured log data as JSON to file
  --render-gpu                   Use headless browser for GPU gradient rendering
  --scale=<N>                    GPU render resolution multiplier (1-4, default: 2)
  --include-metadata             Emit a <script id="pathogen-metadata"> JSON block
                                 powering the blog mini-workspace inspector
                                 (Layers / Palette / CSS Vars). Off by default;
                                 npm run compile:samples / compile:bbwp pass this.
  --root=<folder>                The project folder that @font paths may reach
                                 (default: the nearest folder with a
                                 pathogen.json, else the file's own folder)
  --offline                      Never download fonts from Google Fonts
                                 (PATHOGEN_OFFLINE=1 does the same)

Examples:
  pathogen-lang input.svgx
  pathogen-lang --src=input.svgx --output-svg-file=./output.svg
  echo 'let x = 10; M x 0' | pathogen-lang -
  pathogen-lang -e 'M 0 0 L calc(10 + 5) 20'
  pathogen-lang -e 'circle(100, 100, 50)' --output-svg-file=./circle.svg
`);
}

function generateSvgFromCli(result: CompileResult, options: CliOptions): string {
  return generateSvg(result, {
    viewBox: options.viewBox,
    width: options.width,
    height: options.height,
    stroke: options.stroke,
    fill: options.fill,
    strokeWidth: options.strokeWidth,
    includeMetadata: options.includeMetadata,
  } as SvgGeneratorOptions);
}

// The original generateSvg implementation has been extracted to src/svg-generator.ts.
// This copy is UNREACHABLE (no callers) and kept only for reference; the live
// conic wedge path is src/render/build-defs.ts `buildConicWedgeDefs`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _legacyGenerateSvg(result: CompileResult, options: CliOptions): string {
  const viewBox = options.viewBox || '0 0 200 200';
  const width = options.width || '200';
  const height = options.height || '200';
  const defaultStroke = options.stroke || '#000';
  const defaultFill = options.fill || 'none';
  const defaultStrokeWidth = options.strokeWidth || '2';

  function renderLayerElement(layer: (typeof result.layers)[0], indent: string): string {
    const idAttr = layer.name && !layer.isDefault ? ` id="${escapeXml(layer.name)}"` : '';

    if (layer.type === 'group') {
      const attrs = Object.entries(layer.styles).map(([k, v]) => `${k}="${escapeXml(String(v))}"`);
      if (layer.transform) attrs.push(`transform="${escapeXml(layer.transform)}"`);
      const attrStr = attrs.length ? ` ${attrs.join(' ')}` : '';
      const children = (layer.children || []).map((c) => renderLayerElement(c, `${indent}  `)).join('\n');
      if (children) {
        return `${indent}<g${idAttr}${attrStr}>\n${children}\n${indent}</g>`;
      }
      return `${indent}<g${idAttr}${attrStr}/>`;
    }
    if (layer.type === 'text' && layer.textElements) {
      return layer.textElements
        .map((te, i) => {
          // Merge layer styles with per-element styles (element overrides layer)
          const mergedStyles = te.styles ? { ...layer.styles, ...te.styles } : layer.styles;
          const attrs = Object.entries(mergedStyles)
            .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
            .join(' ');
          const teIdAttr = i === 0 ? idAttr : '';
          // The layer's transform applies to every text; a per-text rotation
          // turns the text about its own anchor inside it (same as build-layers).
          const transforms = [
            ...(layer.transform ? [escapeXml(layer.transform)] : []),
            ...(te.rotation != null ? [`rotate(${radToDeg(te.rotation)}, ${te.x}, ${te.y})`] : []),
          ];
          const transform = transforms.length > 0 ? ` transform="${transforms.join(' ')}"` : '';
          const content = te.children
            .map((child) => {
              if (child.type === 'run') return escapeXml(child.text);
              const spAttrs = [
                child.x != null ? `x="${child.x}"` : '',
                child.dx != null ? `dx="${child.dx}"` : '',
                child.dy != null ? `dy="${child.dy}"` : '',
                child.rotation != null ? `rotate="${radToDeg(child.rotation)}"` : '',
                ...Object.entries(child.styles || {}).map(([k, v]) => `${k}="${escapeXml(String(v))}"`),
              ]
                .filter(Boolean)
                .join(' ');
              return `<tspan${spAttrs ? ` ${spAttrs}` : ''}>${escapeXml(child.text)}</tspan>`;
            })
            .join('');
          return `${indent}<text${teIdAttr} x="${te.x}" y="${te.y}"${transform}${attrs ? ` ${attrs}` : ''}>${content}</text>`;
        })
        .join('\n');
    }
    const stroke = layer.styles.stroke || defaultStroke;
    const fill = layer.styles.fill || defaultFill;
    const strokeWidth = layer.styles['stroke-width'] || defaultStrokeWidth;
    const handled = new Set(['stroke', 'fill', 'stroke-width']);
    const extraAttrs = Object.entries(layer.styles)
      .filter(([key]) => !handled.has(key))
      .map(([key, value]) => `${key}="${escapeXml(String(value))}"`)
      .join(' ');
    const extra = extraAttrs ? ` ${extraAttrs}` : '';
    const transformAttr = layer.transform ? ` transform="${escapeXml(layer.transform)}"` : '';
    if (layer.subpaths) {
      // marker-scope: subpath — a group per layer, a path per run (see build-layers).
      const runs = layer.subpaths.map((d) => `${indent}  <path d="${escapeXml(d)}"/>`).join('\n');
      return `${indent}<g${idAttr} fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${escapeXml(strokeWidth)}"${extra}${transformAttr}>\n${runs}\n${indent}</g>`;
    }
    return `${indent}<path${idAttr} d="${escapeXml(layer.data)}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${escapeXml(strokeWidth)}"${extra}${transformAttr}/>`;
  }

  const elements = result.layers.map((layer) => renderLayerElement(layer, '  ')).join('\n');

  // Build defs section for masks and clip-paths
  const defsContent: string[] = [];
  for (const mask of result.masks) {
    const children = mask.elements
      .map((el) => {
        const styleAttrs = Object.entries(el.styles)
          .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
          .join(' ');
        return `    <path d="${escapeXml(el.pathData)}"${styleAttrs ? ` ${styleAttrs}` : ''}/>`;
      })
      .join('\n');
    defsContent.push(`  <mask id="${escapeXml(mask.id)}">\n${children}\n  </mask>`);
  }
  for (const clip of result.clipPaths) {
    const children = clip.elements.map((el) => `    <path d="${escapeXml(el.pathData)}"/>`).join('\n');
    defsContent.push(`  <clipPath id="${escapeXml(clip.id)}">\n${children}\n  </clipPath>`);
  }
  for (const grad of result.gradients) {
    // Conic gradient: render as wedge paths wrapped in <pattern>
    if (grad.type === 'conic') {
      const svgW = parseInt(width, 10) || 200;
      const svgH = parseInt(height, 10) || 200;
      const wedges = renderConicToWedges({
        cx: grad.cx ?? svgW / 2,
        cy: grad.cy ?? svgH / 2,
        from: grad.from ?? 0,
        to: grad.to ?? (grad.from ?? 0) + 2 * Math.PI,
        direction: grad.direction ?? 'cw',
        spread: grad.spread ?? 'clamp',
        stops: grad.stopsWithOklch ?? grad.stops,
        viewWidth: svgW,
        viewHeight: svgH,
        innerRadius: grad.innerRadius ?? 0,
        innerFill: grad.innerFill,
      });
      const children = wedges.map((w) => `    <path d="${w.d}" fill="${escapeXml(w.fill)}"/>`).join('\n');
      defsContent.push(
        `  <pattern id="${escapeXml(grad.id)}" x="0" y="0" width="${svgW}" height="${svgH}" patternUnits="userSpaceOnUse">\n${children}\n  </pattern>`,
      );
      continue;
    }

    // Mesh/Freeform/Topo gradients: warn + solid-color approximation
    if (grad.type === 'mesh' || grad.type === 'freeform' || grad.type === 'topo') {
      console.warn(`[pathogen-lang] ${grad.type} gradients require WebGPU; CLI outputs solid color approximation`);
      let svgW: number;
      let svgH: number;
      if (grad.type === 'mesh') {
        svgW = grad.meshWidth ?? 200;
        svgH = grad.meshHeight ?? 200;
      } else if (grad.type === 'freeform') {
        svgW = grad.freeformWidth ?? 200;
        svgH = grad.freeformHeight ?? 200;
      } else {
        svgW = grad.topoWidth ?? 200;
        svgH = grad.topoHeight ?? 200;
      }
      // Pick a solid color approximation
      let avgColor = '#808080'; // fallback gray
      if (grad.type === 'topo') {
        // Use base color if set, otherwise first contour's color
        if (grad.topoBaseColor) {
          avgColor = grad.topoBaseColor;
        } else {
          const contours = grad.topoContours ?? [];
          if (contours.length > 0) avgColor = contours[0].color;
        }
      } else {
        const points = grad.type === 'mesh' ? (grad.meshGrid ?? []).flat() : (grad.freeformPoints ?? []);
        if (points.length > 0) {
          avgColor = points[0].color;
        }
      }
      defsContent.push(
        `  <pattern id="${escapeXml(grad.id)}" x="0" y="0" width="${svgW}" height="${svgH}" patternUnits="userSpaceOnUse">\n    <rect width="${svgW}" height="${svgH}" fill="${escapeXml(avgColor)}"/>\n  </pattern>`,
      );
      continue;
    }

    const tagName = grad.type === 'linear' ? 'linearGradient' : 'radialGradient';
    const attrParts = [`id="${escapeXml(grad.id)}"`];
    for (const [key, value] of Object.entries(grad.attrs)) {
      attrParts.push(`${key}="${escapeXml(value)}"`);
    }
    if (grad.spreadMethod) attrParts.push(`spreadMethod="${escapeXml(grad.spreadMethod)}"`);
    if (grad.gradientUnits) attrParts.push(`gradientUnits="${escapeXml(grad.gradientUnits)}"`);
    if (grad.gradientTransform) attrParts.push(`gradientTransform="${escapeXml(grad.gradientTransform)}"`);
    if (grad.colorInterpolation) attrParts.push(`color-interpolation="${escapeXml(grad.colorInterpolation)}"`);
    if (grad.href) attrParts.push(`href="#${escapeXml(grad.href)}"`);
    if (grad.stops.length === 0) {
      defsContent.push(`  <${tagName} ${attrParts.join(' ')}/>`);
    } else {
      const stops = grad.stops
        .map((s) => `    <stop offset="${s.offset}" stop-color="${escapeXml(s.color)}"/>`)
        .join('\n');
      defsContent.push(`  <${tagName} ${attrParts.join(' ')}>\n${stops}\n  </${tagName}>`);
    }
  }
  // Pattern serialization
  if (result.patterns) {
    for (const pat of result.patterns) {
      const attrParts = [
        `id="${escapeXml(pat.id)}" x="${pat.x}" y="${pat.y}" width="${pat.width}" height="${pat.height}"`,
      ];
      if (pat.patternUnits) attrParts.push(`patternUnits="${escapeXml(pat.patternUnits)}"`);
      if (pat.patternTransform) attrParts.push(`patternTransform="${escapeXml(pat.patternTransform)}"`);
      if (pat.patternContentUnits) attrParts.push(`patternContentUnits="${escapeXml(pat.patternContentUnits)}"`);
      const children = pat.elements
        .map((el) => {
          const styleStr = Object.entries(el.styles)
            .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
            .join(' ');
          return `    <path d="${escapeXml(el.pathData)}"${styleStr ? ` ${styleStr}` : ''}/>`;
        })
        .join('\n');
      defsContent.push(`  <pattern ${attrParts.join(' ')}>\n${children}\n  </pattern>`);
    }
  }
  const defsSection = defsContent.length > 0 ? `\n<defs>\n${defsContent.join('\n')}\n</defs>\n` : '';

  // Build @property style block for CSS custom property registrations
  let styleSection = '';
  if (result.cssProperties && result.cssProperties.length > 0) {
    const rules = result.cssProperties
      .map(
        (prop) =>
          `    @property ${prop.name} {\n      syntax: "${prop.syntax}";\n      inherits: ${prop.inherits};\n      initial-value: ${prop.initialValue};\n    }`,
      )
      .join('\n');
    styleSection = `\n  <style><![CDATA[\n${rules}\n  ]]></style>`;
  }

  // Optional inspector metadata for downstream consumers (blog embeds, etc.)
  let metadataSection = '';
  if (options.includeMetadata) {
    const stripLayerData = (layer: (typeof result.layers)[0]): Record<string, unknown> => {
      const { data: _d, fragmentDefs: _fd, fragmentVisuals: _fv, textElements: _te, children, ...rest } = layer;
      if (children) return { ...rest, children: children.map(stripLayerData) };
      return rest;
    };
    const metadata = {
      layers: result.layers.map(stripLayerData),
      masks: result.masks,
      clipPaths: result.clipPaths,
      gradients: result.gradients,
      cssProperties: result.cssProperties,
    };
    metadataSection = `\n<script type="application/json" id="pathogen-metadata"><![CDATA[${JSON.stringify(metadata)}]]></script>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeXml(viewBox)}" width="${escapeXml(width)}" height="${escapeXml(height)}">${styleSection}
${defsSection}
${elements}${metadataSection}
</svg>`;
}

/** Print `Error: <message>` and exit 1. */
function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/** Read a text file the CLI needs, or stop with a message naming it (never a stack trace). */
function readText(file: string, label: string): string {
  try {
    if (statSync(file).isDirectory()) fail(`${label} is a folder, not a file.`);
    return readFileSync(file, 'utf-8');
  } catch (err) {
    fail(`${label} could not be read: ${(err as Error).message}`);
  }
}

/**
 * Read the program named on the command line. A folder means "the main in
 * its pathogen.json" (docs/projects.md); the folder is then the project folder.
 */
function readInput(arg: string): { source: string; sourceFile: string; projectRoot?: string } {
  let isFolder = false;
  try {
    isFolder = statSync(arg).isDirectory();
  } catch {
    // Not there at all: the read below reports it.
  }
  if (!isFolder) {
    try {
      return { source: readFileSync(arg, 'utf-8'), sourceFile: arg };
    } catch {
      fail(`Could not read file '${arg}'`);
    }
  }
  const folder = arg.replace(/[\\/]+$/, '') || arg;
  const projectFile = join(folder, PROJECT_FILE_NAME);
  if (!existsSync(projectFile)) {
    fail(`${folder} is a folder with no pathogen.json. Add one with "main", or compile a file directly.`);
  }
  const parsed = loadProjectFileSync(resolve(projectFile));
  if (!parsed.ok) fail(parsed.message);
  const mainPath = parsed.project.main;
  if (!mainPath) fail(`${projectFile} has no "main". Add "main": "your-program.pathogen", or compile a file directly.`);
  const mainFile = join(folder, ...mainPath.split('/').filter(Boolean));
  if (!existsSync(mainFile)) fail(`${projectFile} names "main": "${mainPath}", which doesn't exist.`);
  return { source: readText(mainFile, mainFile), sourceFile: mainFile, projectRoot: resolve(folder) };
}

function parseArgs(args: string[]): {
  source: string;
  options: CliOptions;
  outputFile?: string;
  sourceFile?: string;
  projectRoot?: string;
} {
  const options: CliOptions = {};
  let source: string | null = null;
  let outputFile: string | undefined;
  let sourceFile: string | undefined;
  let projectRoot: string | undefined;
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }

    if (arg === '-v' || arg === '--version') {
      console.log('0.1.0');
      process.exit(0);
    }

    if (arg === '-e') {
      if (!args[i + 1]) {
        console.error('Error: -e requires an argument');
        process.exit(1);
      }
      source = args[i + 1];
      i += 2;
      continue;
    }

    if (arg === '-o' || arg === '--output') {
      outputFile = args[i + 1];
      i += 2;
      continue;
    }

    if (arg.startsWith('--src=')) {
      const srcFile = arg.split('=')[1];
      try {
        source = readFileSync(srcFile, 'utf-8');
        sourceFile = srcFile;
      } catch (err) {
        console.error(`Error: Could not read file '${srcFile}'`);
        process.exit(1);
      }
      i++;
      continue;
    }

    if (arg.startsWith('--output-svg-file=')) {
      options.svgOutput = arg.split('=')[1];
      i++;
      continue;
    }

    if (arg.startsWith('--viewBox=')) {
      options.viewBox = arg.split('=')[1];
      i++;
      continue;
    }

    if (arg.startsWith('--width=')) {
      options.width = arg.split('=')[1];
      i++;
      continue;
    }

    if (arg.startsWith('--height=')) {
      options.height = arg.split('=')[1];
      i++;
      continue;
    }

    if (arg.startsWith('--stroke=')) {
      options.stroke = arg.split('=')[1];
      i++;
      continue;
    }

    if (arg.startsWith('--fill=')) {
      options.fill = arg.split('=')[1];
      i++;
      continue;
    }

    if (arg.startsWith('--stroke-width=')) {
      options.strokeWidth = arg.split('=')[1];
      i++;
      continue;
    }

    if (arg === '--print-logs') {
      options.printLogs = true;
      i++;
      continue;
    }

    if (arg.startsWith('--log-file=')) {
      options.logFile = arg.split('=').slice(1).join('=');
      i++;
      continue;
    }

    if (arg === '--render-gpu') {
      options.renderGpu = true;
      i++;
      continue;
    }

    if (arg.startsWith('--scale=')) {
      const val = arg.split('=')[1];
      const n = parseInt(val, 10);
      if (isNaN(n) || n < 1 || n > 4) {
        console.error('Error: --scale must be an integer between 1 and 4');
        process.exit(1);
      }
      options.scale = n;
      i++;
      continue;
    }

    if (arg === '--include-metadata') {
      options.includeMetadata = true;
      i++;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      i++;
      continue;
    }

    if (arg === '--strict') {
      options.strict = true;
      i++;
      continue;
    }

    if (arg.startsWith('--strict=')) {
      const codes = arg
        .slice('--strict='.length)
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean);
      const known: readonly string[] = WARNING_CODES;
      const unknown = codes.filter((code) => !known.includes(code));
      if (codes.length === 0 || unknown.length > 0) {
        const problem =
          codes.length === 0 ? '--strict= needs at least one code' : `unknown warning code '${unknown[0]}'`;
        console.error(
          `Error: ${problem}. Valid codes: ${WARNING_CODES.join(', ')}. Use --strict alone for all of them.`,
        );
        process.exit(1);
      }
      options.strict = codes as WarningCode[];
      i++;
      continue;
    }

    if (arg.startsWith('--png=')) {
      options.pngOutput = arg.split('=').slice(1).join('=');
      i++;
      continue;
    }

    if (arg === '--offline') {
      options.offline = true;
      i++;
      continue;
    }

    if (arg.startsWith('--root=')) {
      const root = arg.slice('--root='.length);
      if (!root) fail('--root= needs a folder, e.g. --root=.');
      let isFolder = false;
      try {
        isFolder = statSync(root).isDirectory();
      } catch {
        // reported below
      }
      if (!isFolder) fail(`--root=${root} is not a folder.`);
      options.root = root;
      i++;
      continue;
    }

    if (arg.startsWith('--to-fixed=')) {
      const val = arg.split('=')[1];
      const n = parseInt(val, 10);
      if (isNaN(n) || n < 0 || n > 20) {
        console.error('Error: --to-fixed must be an integer between 0 and 20');
        process.exit(1);
      }
      options.toFixed = n;
      i++;
      continue;
    }

    // If not a flag, treat as input file, folder, or stdin
    if (arg === '-') {
      source = readFileSync(0, 'utf-8');
    } else if (!arg.startsWith('-')) {
      const input = readInput(arg);
      source = input.source;
      sourceFile = input.sourceFile;
      projectRoot = input.projectRoot;
    } else {
      // A dash-prefixed argument no branch above recognized. Failing here
      // (rather than ignoring it) keeps a mistyped or retired flag such as
      // --annotated from silently producing the default output.
      console.error(`Error: Unknown option '${arg}'. Run with --help for the list of options.`);
      process.exit(1);
    }
    i++;
  }

  if (source === null) {
    printUsage();
    process.exit(1);
  }

  return { source, options, outputFile, sourceFile, projectRoot };
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

async function startBBWPServer(
  projectRoot: string,
): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      const pathname = url.pathname;
      let filePath = join(projectRoot, pathname);
      const wantsDirectory = pathname.endsWith('/');
      if (wantsDirectory) filePath += 'index.html';

      try {
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(content);
      } catch {
        // Fallback chain — accommodate the playground's TypeScript module graph:
        //   1. .js miss → look for the .ts source and transpile on the fly
        //      (playground source uses .ts but imports declare .js extensions)
        //   2. Extensionless miss with a co-located .ts/.js file → transpile
        //      and serve that file at the requested URL.
        //   3. Extensionless miss pointing at a directory with an index → 308
        //      redirect to `${pathname}/` so the browser uses the directory as
        //      the resolution base for relative imports inside the served
        //      module (this is what makes `import '../../src/render'` work
        //      when src/render/index.ts imports './build-defs').
        //   4. Trailing-slash request → serve `<dir>/index.ts` /
        //      `<dir>/index.js` (after the redirect from step 3 lands here).
        const tryServe = async (p: string): Promise<boolean> => {
          try {
            const source = readFileSync(p);
            if (p.endsWith('.ts')) {
              const { transformSync } = await import('esbuild');
              const result = transformSync(source.toString('utf-8'), {
                loader: 'ts',
                format: 'esm',
                target: 'es2022',
              });
              res.writeHead(200, { 'Content-Type': 'application/javascript' });
              res.end(result.code);
            } else {
              const ext = extname(p);
              res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
              res.end(source);
            }
            return true;
          } catch {
            return false;
          }
        };

        if (filePath.endsWith('.js')) {
          if (await tryServe(filePath.replace(/\.js$/, '.ts'))) return;
        } else if (wantsDirectory) {
          // After a redirect from step 3, filePath ends in 'index.html' but we
          // also want to try index.ts / index.js for module directories.
          const dir = filePath.slice(0, -'index.html'.length);
          if (await tryServe(join(dir, 'index.ts'))) return;
          if (await tryServe(join(dir, 'index.js'))) return;
        } else if (!extname(filePath)) {
          // Could be `<path>.ts`, `<path>.js`, or a directory `<path>/`.
          if (await tryServe(`${filePath}.ts`)) return;
          if (await tryServe(`${filePath}.js`)) return;
          try {
            const stat = (await import('node:fs')).statSync(filePath);
            if (stat.isDirectory()) {
              res.writeHead(308, { Location: `${pathname}/` });
              res.end();
              return;
            }
          } catch {
            // Path doesn't exist — fall through to 404.
          }
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        resolve({ server, port: addr.port });
      } else {
        reject(new Error('Failed to bind server'));
      }
    });

    server.on('error', reject);
  });
}

async function renderGpuSvg(result: CompileResult, options: CliOptions): Promise<string> {
  let puppeteer: typeof import('puppeteer'); // eslint-disable-line @typescript-eslint/consistent-type-imports
  try {
    puppeteer = await import('puppeteer');
  } catch {
    throw new Error('--render-gpu requires puppeteer. Install it with: npm install --save-dev puppeteer');
  }

  const __cliDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = join(__cliDir, '..');

  const { server, port } = await startBBWPServer(projectRoot);
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--enable-unsafe-webgpu', '--no-sandbox'],
    });

    const page = await browser.newPage();

    // Set the Puppeteer flag before navigating
    await page.evaluateOnNewDocument(() => {
      (window as any).__PUPPETEER__ = true;
    });

    // PATHOGEN_GPU=off renders through the playground's Canvas 2D fallback
    // instead of WebGPU — the same `?gpu=off` switch the playground honours,
    // for checking what a browser without WebGPU will show.
    const gpuQuery = process.env.PATHOGEN_GPU === 'off' ? '?gpu=off' : '';
    await page.goto(`http://127.0.0.1:${port}/playground/bbwp.html${gpuQuery}`, {
      waitUntil: 'networkidle0',
    });

    // Wait for BBWP to signal ready. 30s allows for cold-start on-the-fly
    // TS→JS transpilation of the playground module chain on the first compile.
    await page.waitForFunction(() => (window as any).__BBWP_READY__ === true, { timeout: 30000 });

    const svgOptions = {
      viewBox: options.viewBox || '0 0 200 200',
      width: options.width || '200',
      height: options.height || '200',
      background: 'transparent',
      defaultStroke: options.stroke || '#000',
      defaultFill: options.fill || 'none',
      defaultStrokeWidth: options.strokeWidth || '2',
      _scale: options.scale || 2,
    };

    const svgString = await page.evaluate(
      async (json: string, opts: any) => {
        const compileResult = JSON.parse(json);
        return (window as any).__renderToSvg(compileResult, opts);
      },
      JSON.stringify(result),
      svgOptions,
    );

    return svgString as string;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

/**
 * The project folder and the program's place in it (docs/projects.md "In
 * each tool"), shared by `@font` paths and imports. `entry` is the program's
 * project path; code from -e or stdin sits in the current folder (or the
 * --root folder, when the current folder isn't in it). `outside` is a file
 * outside the --root folder, which compiles but has nowhere for its paths to
 * start. A broken pathogen.json stops the CLI here, so it is read only when
 * a program needs it (it has `@font` or an import).
 */
function projectForCli(
  sourceFile: string | undefined,
  options: CliOptions,
  projectRoot: string | undefined,
): { root: string; entry: string; outside: boolean; fontSearchDir: string } {
  const programDir = sourceFile ? dirname(resolve(sourceFile)) : process.cwd();
  let root: string;
  if (options.root) root = resolve(options.root);
  else if (projectRoot) root = projectRoot;
  else if (sourceFile) {
    const found = findProjectRoot(programDir);
    root = found.root;
    if (found.projectFile) {
      const parsed = loadProjectFileSync(found.projectFile);
      if (!parsed.ok) fail(parsed.message);
    }
  } else root = process.cwd();

  // The program's own project path. Code from -e or stdin sits in the
  // current folder, so its ./ paths start there (docs/projects.md) — or at
  // the project folder, when --root names one the current folder isn't in.
  const programFile = sourceFile ? resolve(sourceFile) : join(process.cwd(), '<inline>');
  // Spelled as on disk, so `--root=Poster` for `poster/` is the same folder.
  const inProject = projectEntry(root, programFile);
  const outside = inProject === null;
  // Where installed-font search looks for a fonts/ folder first.
  if (outside && !sourceFile) return { root, entry: '/<inline>', outside: false, fontSearchDir: root };
  return { root, entry: inProject ?? '/<outside>', outside, fontSearchDir: programDir };
}

/**
 * Read every file the program imports (docs/modules.md), through the shared
 * loader (src/host/load-modules.ts) and the Node host — before the compile,
 * as for fonts. A mistake stops the CLI (exit 1): in the compiled file in the
 * `file:line:col: error:` form, elsewhere with its `imported from` lines.
 * A program without imports reads nothing.
 */
async function loadModulesForCli(
  source: string,
  sourceFile: string | undefined,
  options: CliOptions,
  projectRoot: string | undefined,
): Promise<ModuleGraph | undefined> {
  if (planImports(source).length === 0) return undefined;
  const { root, entry, outside } = projectForCli(sourceFile, options, projectRoot);
  if (outside && sourceFile) {
    fail(`${sourceFile} is outside the project folder ${root} given by --root, so its import paths can't be followed.`);
  }
  const { graph, errors } = await resolveModules(source, { host: createNodeProjectHost(root), entry });
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`${formatModuleLoadError(error, sourceFile ?? '<inline>')}\n`);
    process.exit(1);
  }
  return graph;
}

/**
 * Load the fonts a program's @font directives name, through the shared loader
 * (src/host/load-fonts.ts) and the Node host (src/node) — the same code the
 * VS Code extension and language server use. Errors stop the CLI (exit 1) in
 * the `file:line:col: error:` form warnings use; warnings are returned to be
 * listed (and counted by --json and --strict) with the compile's own.
 *
 * A program without `@font` skips all of it, as in the editors: it reads no
 * files, so a pathogen.json it doesn't need can't stop it.
 */
async function loadFontsForCli(
  source: string,
  sourceFile: string | undefined,
  options: CliOptions,
  projectRoot: string | undefined,
): Promise<{ registry?: FontRegistry; warnings: CompileWarning[] }> {
  if (!source.includes('@font')) return { warnings: [] };
  const where = sourceFile ?? '<inline>';
  const { root, entry, outside, fontSearchDir } = projectForCli(sourceFile, options, projectRoot);
  if (outside && sourceFile && planFontDirectives(source)?.directives.some((d) => d.kind === 'file')) {
    // A file outside the project folder still compiles; only @font paths
    // would have nowhere to start from.
    fail(`${sourceFile} is outside the project folder ${root} given by --root, so its @font paths can't be followed.`);
  }

  const host = createNodeFontHost({
    root,
    programDir: fontSearchDir,
    offlineReason: offlineReason(!!options.offline),
    cacheDir: defaultCacheDir(),
    fontDirs: fontDirsFromEnv(process.env.PATHOGEN_FONT_DIRS),
  });
  const { fonts, messages } = await resolveFonts(source, { host, entry });

  const warnings: CompileWarning[] = [];
  let failed = false;
  for (const m of messages) {
    const pos = m.line != null ? `:${m.line}${m.column != null ? `:${m.column}` : ''}` : '';
    const strict =
      m.severity === 'warning' && m.code !== undefined && (options.strict === true || options.strict?.includes(m.code));
    if (m.severity === 'error' || strict) {
      process.stderr.write(`${where}${pos}: error: ${m.message}${strict ? ` (strict: ${m.code})` : ''}\n`);
      failed = true;
    } else if (m.code) {
      warnings.push({
        code: m.code,
        message: m.message,
        ...(m.line != null ? { line: m.line } : {}),
        ...(m.column != null ? { column: m.column } : {}),
      });
    } else {
      // A warning without a code can't join --json or --strict, but is never dropped.
      process.stderr.write(`${where}${pos}: warning: ${m.message}\n`);
    }
  }
  if (failed) process.exit(1);
  if (fonts.length === 0) return { warnings };
  await ensureOpentype();
  return { registry: buildFontRegistry(fonts).registry, warnings };
}

function formatLogEntry(entry: LogEntry): string {
  const parts = entry.parts.map((p) => {
    if (p.type === 'value' && p.label) return `${p.label} = ${p.value}`;
    return p.value;
  });
  const msg = parts.join(' ');
  // A log from an imported file names it (docs/cli.md "Print to stderr").
  if (entry.file) return `[${entry.file}${entry.line != null ? ` line ${entry.line}` : ''}] ${msg}`;
  return entry.line != null ? `[line ${entry.line}] ${msg}` : msg;
}

function outputLogs(logs: LogEntry[], options: CliOptions): void {
  if (options.printLogs && logs.length > 0) {
    for (const entry of logs) {
      // Warnings are printed by outputWarnings with their file:line:col; skip
      // their `[warn]` log mirror here so nothing prints twice.
      if (entry.severity === 'warn') continue;
      process.stderr.write(formatLogEntry(entry) + '\n');
    }
  }
  if (options.logFile) {
    writeFileSync(options.logFile, JSON.stringify(logs, null, 2));
  }
}

/**
 * Rasterize an SVG string to a PNG at the program's viewBox size times
 * `scale`, on a white background, via headless Chrome. Puppeteer is a dev
 * dependency of this repo, not of the published package, so it is loaded
 * lazily with a clear error when absent.
 */
async function renderPng(svg: string, pngPath: string, scale: number): Promise<{ width: number; height: number }> {
  let puppeteer: typeof import('puppeteer'); // eslint-disable-line @typescript-eslint/consistent-type-imports
  try {
    puppeteer = await import('puppeteer');
  } catch {
    throw new Error('--png requires puppeteer. Install it with: npm install --save-dev puppeteer');
  }
  const vb = /viewBox="([^"]+)"/.exec(svg);
  const [, , w, h] = (vb ? vb[1] : '0 0 200 200').split(/\s+/).map(Number);
  const width = Math.max(1, Math.ceil(w));
  const height = Math.max(1, Math.ceil(h));
  // chrome-headless-shell: the classic screenshot renderer. The new headless
  // mode's captureScreenshot can stall indefinitely on a stalled compositor
  // (seen on macOS with the display asleep); the shell has no such dependency.
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    // The generated SVG already carries width/height from --width/--height;
    // replace them rather than relying on duplicate-attribute parsing.
    const sized = svg.replace(/<svg\b[^>]*>/, (openTag) =>
      openTag.replace(/\s(?:width|height)="[^"]*"/g, '').replace(/^<svg/, `<svg width="${width}" height="${height}" `),
    );
    await page.setContent(`<html><body style="margin:0;background:#fff">${sized}</body></html>`, {
      waitUntil: 'domcontentloaded',
    });
    await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width, height } });
  } finally {
    await browser.close();
  }
  return { width: width * scale, height: height * scale };
}

/**
 * Compiler warnings always go to stderr in `file:line:col: warning: message`
 * form — one line per family (code + position + message with its numbers
 * removed), followed by `… N more like this` when the family repeats. The
 * raw list is in `--json`.
 */
function outputWarnings(warnings: CompileWarning[], sourceFile: string | undefined): void {
  const where = sourceFile ?? '<inline>';
  for (const group of groupWarnings(warnings)) {
    const w = group.first;
    const pos = w.line != null ? `:${w.line}${w.column != null ? `:${w.column}` : ''}` : '';
    // A warning from an imported file names it by its path from the project folder (docs/cli.md).
    process.stderr.write(`${w.file ?? where}${pos}: warning: ${w.message}\n`);
    if (group.count > 1) {
      process.stderr.write(`  … ${(group.count - 1).toLocaleString('en-US')} more like this\n`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const { source, options, outputFile, sourceFile, projectRoot } = parseArgs(args);

  try {
    if (options.json && (options.svgOutput || options.renderGpu || options.pngOutput)) {
      console.error('Error: --json cannot be combined with --output-svg-file, --render-gpu, or --png');
      process.exit(1);
    }
    const modules = await loadModulesForCli(source, sourceFile, options, projectRoot);
    const fontLoad = await loadFontsForCli(source, sourceFile, options, projectRoot);
    // Printed before compiling: a call that needs a font that didn't load
    // stops the compile, and its error says to look for this message above.
    outputWarnings(fontLoad.warnings, sourceFile);
    const compileOptions: CompileOptions = {
      ...(options.toFixed != null ? { toFixed: options.toFixed } : {}),
      ...(fontLoad.registry ? { fonts: fontLoad.registry } : {}),
      ...(options.json ? { trace: true } : {}),
      ...(options.strict ? { strict: options.strict } : {}),
      ...(modules ? { modules } : {}),
    };
    const result = compile(source, Object.keys(compileOptions).length > 0 ? compileOptions : undefined);
    outputLogs(result.logs, options);
    outputWarnings(result.warnings, sourceFile);
    // --json lists every warning, font loading first.
    result.warnings = [...fontLoad.warnings, ...result.warnings];
    const defaultPath = result.layers[0]?.data ?? '';

    // --json: the structured document instead of path data
    if (options.json) {
      const doc = `${JSON.stringify(toJsonDocument(result), null, 2)}\n`;
      if (outputFile) {
        writeFileSync(outputFile, doc);
        console.log(`JSON written to: ${outputFile}`);
      } else {
        process.stdout.write(doc);
      }
      return;
    }

    const pngScale = options.scale || 2;
    const writePng = async (svg: string): Promise<void> => {
      if (!options.pngOutput) return;
      const { width, height } = await renderPng(svg, options.pngOutput, pngScale);
      console.log(`PNG written to: ${options.pngOutput} (${width}×${height})`);
    };

    // Output as SVG file (and optionally a PNG of it)
    if (options.svgOutput) {
      if (options.renderGpu) {
        renderGpuSvg(result, options)
          .then(async (svg) => {
            writeFileSync(options.svgOutput!, svg);
            console.log(`SVG written to: ${options.svgOutput} (GPU rendered)`);
            console.log(`Path data: ${defaultPath}`);
            await writePng(svg);
          })
          .catch((err) => {
            console.error(`Error: ${err.message}`);
            process.exit(1);
          });
        return;
      }
      const svg = generateSvgFromCli(result, options);
      writeFileSync(options.svgOutput, svg);
      console.log(`SVG written to: ${options.svgOutput}`);
      console.log(`Path data: ${defaultPath}`);
      writePng(svg).catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      });
      return;
    }

    // --png alone: rasterize the in-memory SVG
    if (options.pngOutput) {
      const svgPromise = options.renderGpu
        ? renderGpuSvg(result, options)
        : Promise.resolve(generateSvgFromCli(result, options));
      svgPromise.then(writePng).catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      });
      return;
    }

    // --render-gpu without --output-svg-file: output SVG to stdout
    if (options.renderGpu) {
      renderGpuSvg(result, options)
        .then((svg) => {
          process.stdout.write(svg);
        })
        .catch((err) => {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        });
      return;
    }

    // Output path to file
    if (outputFile) {
      if (result.layers.length > 1) {
        const output = result.layers.map((l) => `[${l.name}] ${l.data}`).join('\n');
        writeFileSync(outputFile, output);
      } else {
        writeFileSync(outputFile, defaultPath);
      }
      console.log(`Path written to: ${outputFile}`);
      return;
    }

    // Output to stdout
    if (result.layers.length > 1) {
      for (const layer of result.layers) {
        console.log(`[${layer.name}] ${layer.data}`);
      }
    } else {
      console.log(defaultPath);
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
