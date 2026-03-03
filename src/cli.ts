import { compile, compileAnnotated } from './index';
import type { CompileResult } from './index';
import { readFileSync, writeFileSync } from 'fs';
import { renderConicToWedges } from './conic-renderer';

interface CliOptions {
  svgOutput?: string;
  viewBox?: string;
  width?: string;
  height?: string;
  stroke?: string;
  fill?: string;
  strokeWidth?: string;
  annotated?: boolean;
  toFixed?: number;
}

function printUsage() {
  console.log(`
svg-path-extended - Extended SVG path syntax compiler

Usage:
  svg-path-extended <file>       Compile a file
  svg-path-extended -            Read from stdin
  svg-path-extended -e <code>    Compile inline code
  svg-path-extended --src=<file> Compile a file (explicit flag)

Options:
  -h, --help                     Show this help message
  -v, --version                  Show version
  --src=<file>                   Input source file
  -o, --output <file>            Write path output to file
  --output-svg-file=<file>       Output as complete SVG file
  --annotated                    Output annotated/debug format with comments
  --viewBox=<box>                SVG viewBox (default: "0 0 200 200")
  --width=<w>                    SVG width (default: "200")
  --height=<h>                   SVG height (default: "200")
  --stroke=<color>               Path stroke color (default: "#000")
  --fill=<color>                 Path fill color (default: "none")
  --stroke-width=<w>             Path stroke width (default: "2")
  --to-fixed=<N>                 Round decimals to N digits (0-20)

Examples:
  svg-path-extended input.svgx
  svg-path-extended --src=input.svgx --output-svg-file=./output.svg
  echo 'let x = 10; M x 0' | svg-path-extended -
  svg-path-extended -e 'M 0 0 L calc(10 + 5) 20'
  svg-path-extended -e 'circle(100, 100, 50)' --output-svg-file=./circle.svg
`);
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function radToDeg(rad: number): number {
  return rad * 180 / Math.PI;
}

function generateSvg(result: CompileResult, options: CliOptions): string {
  const viewBox = options.viewBox || '0 0 200 200';
  const width = options.width || '200';
  const height = options.height || '200';
  const defaultStroke = options.stroke || '#000';
  const defaultFill = options.fill || 'none';
  const defaultStrokeWidth = options.strokeWidth || '2';

  const elements = result.layers.map((layer) => {
    if (layer.type === 'text' && layer.textElements) {
      return layer.textElements.map(te => {
        const attrs = Object.entries(layer.styles)
          .map(([k, v]) => `${k}="${escapeXml(String(v))}"`).join(' ');
        const transform = te.rotation != null
          ? ` transform="rotate(${radToDeg(te.rotation)}, ${te.x}, ${te.y})"` : '';
        const content = te.children.map(child => {
          if (child.type === 'run') return escapeXml(child.text);
          const spAttrs = [
            child.dx != null ? `dx="${child.dx}"` : '',
            child.dy != null ? `dy="${child.dy}"` : '',
            child.rotation != null ? `rotate="${radToDeg(child.rotation)}"` : '',
          ].filter(Boolean).join(' ');
          return `<tspan${spAttrs ? ' ' + spAttrs : ''}>${escapeXml(child.text)}</tspan>`;
        }).join('');
        return `  <text x="${te.x}" y="${te.y}"${transform}${attrs ? ' ' + attrs : ''}>${content}</text>`;
      }).join('\n');
    }
    const stroke = layer.styles['stroke'] || defaultStroke;
    const fill = layer.styles['fill'] || defaultFill;
    const strokeWidth = layer.styles['stroke-width'] || defaultStrokeWidth;
    const handled = new Set(['stroke', 'fill', 'stroke-width']);
    const extraAttrs = Object.entries(layer.styles)
      .filter(([key]) => !handled.has(key))
      .map(([key, value]) => `${key}="${escapeXml(String(value))}"`)
      .join(' ');
    const extra = extraAttrs ? ' ' + extraAttrs : '';
    const transformAttr = layer.transform ? ` transform="${escapeXml(layer.transform)}"` : '';
    return `  <path d="${escapeXml(layer.data)}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${escapeXml(strokeWidth)}"${extra}${transformAttr}/>`;
  }).join('\n');

  // Build defs section for masks and clip-paths
  const defsContent: string[] = [];
  for (const mask of result.masks) {
    const children = mask.elements.map(el => {
      const styleAttrs = Object.entries(el.styles)
        .map(([k, v]) => `${k}="${escapeXml(String(v))}"`).join(' ');
      return `    <path d="${escapeXml(el.pathData)}"${styleAttrs ? ' ' + styleAttrs : ''}/>`;
    }).join('\n');
    defsContent.push(`  <mask id="${escapeXml(mask.id)}">\n${children}\n  </mask>`);
  }
  for (const clip of result.clipPaths) {
    const children = clip.elements.map(el => {
      return `    <path d="${escapeXml(el.pathData)}"/>`;
    }).join('\n');
    defsContent.push(`  <clipPath id="${escapeXml(clip.id)}">\n${children}\n  </clipPath>`);
  }
  for (const grad of result.gradients) {
    // Conic gradient: render as wedge paths wrapped in <pattern>
    if (grad.type === 'conic') {
      const svgW = parseInt(width, 10) || 200;
      const svgH = parseInt(height, 10) || 200;
      const wedges = renderConicToWedges(
        grad.cx ?? 0, grad.cy ?? 0,
        grad.from ?? 0, grad.to ?? (2 * Math.PI),
        grad.direction ?? 'cw', grad.spread ?? 'clamp',
        grad.stopsWithOklch ?? grad.stops,
        svgW, svgH,
      );
      const children = wedges.map(w =>
        `    <path d="${w.d}" fill="${escapeXml(w.fill)}"/>`
      ).join('\n');
      defsContent.push(`  <pattern id="${escapeXml(grad.id)}" x="0" y="0" width="${svgW}" height="${svgH}" patternUnits="userSpaceOnUse">\n${children}\n  </pattern>`);
      if ((grad.innerRadius ?? 0) > 0 || (grad.innerFill && grad.innerFill !== 'transparent')) {
        console.warn('[svg-path-extended] innerRadius/innerFill on conic gradients requires WebGPU (playground only); ignored in CLI output');
      }
      continue;
    }

    // Mesh/Freeform gradients: warn + solid-color approximation
    if (grad.type === 'mesh' || grad.type === 'freeform') {
      console.warn(`[svg-path-extended] ${grad.type} gradients require WebGPU; CLI outputs solid color approximation`);
      const svgW = grad.type === 'mesh' ? (grad.meshWidth ?? 200) : (grad.freeformWidth ?? 200);
      const svgH = grad.type === 'mesh' ? (grad.meshHeight ?? 200) : (grad.freeformHeight ?? 200);
      // Average all point colors to get a solid approximation
      let avgColor = '#808080'; // fallback gray
      const points = grad.type === 'mesh'
        ? (grad.meshGrid ?? []).flat()
        : (grad.freeformPoints ?? []);
      if (points.length > 0) {
        avgColor = points[0].color;
      }
      defsContent.push(`  <pattern id="${escapeXml(grad.id)}" x="0" y="0" width="${svgW}" height="${svgH}" patternUnits="userSpaceOnUse">\n    <rect width="${svgW}" height="${svgH}" fill="${escapeXml(avgColor)}"/>\n  </pattern>`);
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
      const stops = grad.stops.map(s =>
        `    <stop offset="${s.offset}" stop-color="${escapeXml(s.color)}"/>`
      ).join('\n');
      defsContent.push(`  <${tagName} ${attrParts.join(' ')}>\n${stops}\n  </${tagName}>`);
    }
  }
  // Pattern serialization
  if (result.patterns) {
    for (const pat of result.patterns) {
      const attrParts = [`id="${escapeXml(pat.id)}" x="${pat.x}" y="${pat.y}" width="${pat.width}" height="${pat.height}"`];
      if (pat.patternUnits) attrParts.push(`patternUnits="${escapeXml(pat.patternUnits)}"`);
      if (pat.patternTransform) attrParts.push(`patternTransform="${escapeXml(pat.patternTransform)}"`);
      if (pat.patternContentUnits) attrParts.push(`patternContentUnits="${escapeXml(pat.patternContentUnits)}"`);
      const children = pat.elements.map(el => {
        const styleStr = Object.entries(el.styles)
          .map(([k, v]) => `${k}="${escapeXml(String(v))}"`).join(' ');
        return `    <path d="${escapeXml(el.pathData)}"${styleStr ? ' ' + styleStr : ''}/>`;
      }).join('\n');
      defsContent.push(`  <pattern ${attrParts.join(' ')}>\n${children}\n  </pattern>`);
    }
  }
  const defsSection = defsContent.length > 0
    ? `\n<defs>\n${defsContent.join('\n')}\n</defs>\n` : '';

  // Build @property style block for CSS custom property registrations
  let styleSection = '';
  if (result.cssProperties && result.cssProperties.length > 0) {
    const rules = result.cssProperties.map(prop =>
      `    @property ${prop.name} {\n      syntax: "${prop.syntax}";\n      inherits: ${prop.inherits};\n      initial-value: ${prop.initialValue};\n    }`
    ).join('\n');
    styleSection = `\n  <style>\n${rules}\n  </style>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeXml(viewBox)}" width="${escapeXml(width)}" height="${escapeXml(height)}">${styleSection}
  <rect width="100%" height="100%" fill="#f5f5f5"/>${defsSection}
${elements}
</svg>`;
}

function parseArgs(args: string[]): { source: string; options: CliOptions; outputFile?: string } {
  const options: CliOptions = {};
  let source: string | null = null;
  let outputFile: string | undefined;
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

    if (arg === '--annotated') {
      options.annotated = true;
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

    // If not a flag, treat as input file or stdin
    if (arg === '-') {
      source = readFileSync(0, 'utf-8');
    } else if (!arg.startsWith('-')) {
      try {
        source = readFileSync(arg, 'utf-8');
      } catch (err) {
        console.error(`Error: Could not read file '${arg}'`);
        process.exit(1);
      }
    }
    i++;
  }

  if (source === null) {
    printUsage();
    process.exit(1);
  }

  return { source, options, outputFile };
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const { source, options, outputFile } = parseArgs(args);

  try {
    // Annotated output mode
    if (options.annotated) {
      const annotatedOutput = compileAnnotated(source);

      if (outputFile) {
        writeFileSync(outputFile, annotatedOutput);
        console.log(`Annotated output written to: ${outputFile}`);
        return;
      }

      console.log(annotatedOutput);
      return;
    }

    const compileOptions = options.toFixed != null ? { toFixed: options.toFixed } : undefined;
    const result = compile(source, compileOptions);
    const defaultPath = result.layers[0]?.data ?? '';

    // Output as SVG file
    if (options.svgOutput) {
      const svg = generateSvg(result, options);
      writeFileSync(options.svgOutput, svg);
      console.log(`SVG written to: ${options.svgOutput}`);
      console.log(`Path data: ${defaultPath}`);
      return;
    }

    // Output path to file
    if (outputFile) {
      if (result.layers.length > 1) {
        const output = result.layers.map(l => `[${l.name}] ${l.data}`).join('\n');
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
