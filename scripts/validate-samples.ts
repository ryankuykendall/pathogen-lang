import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import puppeteer from 'puppeteer';

import { StringTextDocument } from '../src/language-services/document';
import { formatDocument } from '../src/language-services/formatter';

// Margin requirement (px in SVG coordinate space); overridable with --margin
const MARGIN_PX = 15;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ElementInfo {
  tagName: string;
  id: string;
  className: string;
  textContent: string;
  snippetGroup: string; // empty if not in a snippet, otherwise a unique group ID
  bbox: { x: number; y: number; width: number; height: number };
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Warning {
  type:
    | 'margin'
    | 'text-text-collision'
    | 'text-geometry-collision'
    | 'geometry-geometry-collision'
    | 'dead-space'
    | 'grouplayer'
    | 'formatting';
  message: string;
}

interface FileResult {
  file: string;
  warnings: Warning[];
  previewPath: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Compute the overlap area between two rects. Returns 0 if no overlap. */
function overlapArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return overlapX * overlapY;
}

/** Minimum overlap as fraction of the smaller element's area to report a collision. */
const OVERLAP_THRESHOLD = 0.15;

function isTextElement(el: ElementInfo): boolean {
  return el.tagName === 'text' || el.tagName === 'tspan';
}

function isGeometryElement(el: ElementInfo): boolean {
  return ['path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon'].includes(el.tagName);
}

/** Skip structural elements that span the full canvas (backgrounds, grids). */
function isBackgroundElement(el: ElementInfo, viewBox: ViewBox): boolean {
  const b = el.bbox;
  // Element covers >90% of the viewBox in both dimensions → likely bg/grid
  return (
    b.width > viewBox.width * 0.9 &&
    b.height > viewBox.height * 0.9
  );
}

function truncate(s: string, max = 30): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

function runChecks(
  elements: ElementInfo[],
  viewBox: ViewBox,
  sourceHasGroupLayer: boolean,
  sourceLayerCount: number,

  marginPx: number = MARGIN_PX,
): Warning[] {
  const warnings: Warning[] = [];

  // Filter out background/grid elements for collision and margin checks
  const contentElements = elements.filter((el) => !isBackgroundElement(el, viewBox));
  const textElements = contentElements.filter(isTextElement);
  const geometryElements = contentElements.filter(isGeometryElement);

  // 1. Margin check — all content elements must have 15px clearance from viewBox edges
  for (const el of contentElements) {
    const b = el.bbox;
    if (b.width === 0 && b.height === 0) continue; // invisible

    const top = b.y - viewBox.y;
    const left = b.x - viewBox.x;
    const right = (viewBox.x + viewBox.width) - (b.x + b.width);
    const bottom = (viewBox.y + viewBox.height) - (b.y + b.height);

    const violations: string[] = [];
    if (top < marginPx) violations.push(`top: ${top.toFixed(1)}px`);
    if (left < marginPx) violations.push(`left: ${left.toFixed(1)}px`);
    if (right < marginPx) violations.push(`right: ${right.toFixed(1)}px`);
    if (bottom < marginPx) violations.push(`bottom: ${bottom.toFixed(1)}px`);

    if (violations.length > 0) {
      const label = el.textContent
        ? `<${el.tagName}> "${truncate(el.textContent)}"`
        : `<${el.tagName}>${el.id ? '#' + el.id : ''}`;
      warnings.push({
        type: 'margin',
        message: `${label} violates ${marginPx}px margin — ${violations.join(', ')}`,
      });
    }
  }

  // Helper: should we skip collision between two elements?
  // Only skip if BOTH are in the SAME snippet group (intra-group).
  // Cross-group collisions must still be reported.
  function sameSnippet(a: ElementInfo, b: ElementInfo): boolean {
    return a.snippetGroup !== '' && a.snippetGroup === b.snippetGroup;
  }

  // 2. Text-text collision
  for (let i = 0; i < textElements.length; i++) {
    for (let j = i + 1; j < textElements.length; j++) {
      const a = textElements[i];
      const b = textElements[j];
      if (a.bbox.width === 0 || b.bbox.width === 0) continue;
      if (sameSnippet(a, b)) continue;
      if (rectsOverlap(a.bbox, b.bbox)) {
        warnings.push({
          type: 'text-text-collision',
          message: `Text overlap: "${truncate(a.textContent)}" ↔ "${truncate(b.textContent)}"`,
        });
      }
    }
  }

  // 3. Text-geometry collision (with overlap threshold to reduce false positives)
  for (const text of textElements) {
    if (text.bbox.width === 0) continue;
    const textArea = text.bbox.width * text.bbox.height;
    if (textArea === 0) continue;
    for (const geo of geometryElements) {
      if (geo.bbox.width === 0) continue;
      if (sameSnippet(text, geo)) continue;
      const overlap = overlapArea(text.bbox, geo.bbox);
      if (overlap / textArea >= OVERLAP_THRESHOLD) {
        const geoLabel = geo.id ? `<${geo.tagName}>#${geo.id}` : `<${geo.tagName}>`;
        const pct = ((overlap / textArea) * 100).toFixed(0);
        warnings.push({
          type: 'text-geometry-collision',
          message: `Text "${truncate(text.textContent)}" overlaps ${geoLabel} (${pct}% of text area)`,
        });
      }
    }
  }

  // 3b. Geometry-geometry collision — only between snippet bg paths and non-snippet paths.
  // Anatomy diagrams have many legitimately overlapping paths (curves, tangent lines, arcs).
  // We only want to catch shapes that visually intrude into code block regions.
  const snippetGeo = geometryElements.filter((el) => el.snippetGroup !== '');
  const nonSnippetGeo = geometryElements.filter((el) => el.snippetGroup === '');
  for (const shape of nonSnippetGeo) {
    if (shape.bbox.width === 0) continue;
    for (const snippetBg of snippetGeo) {
      if (snippetBg.bbox.width === 0) continue;
      const snippetArea = snippetBg.bbox.width * snippetBg.bbox.height;
      if (snippetArea === 0) continue;
      const overlap = overlapArea(shape.bbox, snippetBg.bbox);
      if (overlap / snippetArea >= OVERLAP_THRESHOLD) {
        warnings.push({
          type: 'geometry-geometry-collision',
          message: `Shape <${shape.tagName}> intrudes into code block (${((overlap / snippetArea) * 100).toFixed(0)}% of block area)`,
        });
      }
    }
  }

  // 4. GroupLayer check — warn if source has >3 named layers but no GroupLayer
  if (!sourceHasGroupLayer && sourceLayerCount > 3) {
    warnings.push({
      type: 'grouplayer',
      message: `Source defines ${sourceLayerCount} layers but uses no GroupLayer for organization`,
    });
  }

  // 5. Dead space check — warn if content uses less than 50% of viewBox height
  if (contentElements.length > 0) {
    let minY = Infinity, maxY = -Infinity;
    for (const el of contentElements) {
      if (el.bbox.width === 0 && el.bbox.height === 0) continue;
      if (el.bbox.y < minY) minY = el.bbox.y;
      if (el.bbox.y + el.bbox.height > maxY) maxY = el.bbox.y + el.bbox.height;
    }
    const contentHeight = maxY - minY;
    const usageRatio = contentHeight / viewBox.height;
    if (usageRatio < 0.5) {
      warnings.push({
        type: 'dead-space',
        message: `Content uses only ${(usageRatio * 100).toFixed(0)}% of viewBox height (${contentHeight.toFixed(0)}px of ${viewBox.height}px) — consider reducing viewBox height`,
      });
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const program = new Command();
program
  .name('validate-samples')
  .description(
    'Validate blog sample SVGs: margins, text collisions, GroupLayer usage. ' +
    'Generates PNG previews for agentic review. ' +
    'Currently a soft gate (warnings only). Add --strict to exit non-zero on any warning.',
  )
  .argument('[dir]', 'Directory of compiled samples, or a parent of per-post directories', 'website/blog/samples')
  .option('--strict', 'Exit with code 1 if any warnings are found')
  .option('--margin <px>', 'Margin requirement in px', String(MARGIN_PX))
  .action(async (dir: string, opts: { strict?: boolean; margin?: string }) => {
    const margin = parseInt(opts.margin || String(MARGIN_PX), 10);
    const sampleDir = resolve(dir);

    if (!existsSync(sampleDir)) {
      console.error(`Directory not found: ${sampleDir}`);
      process.exit(1);
    }

    // A directory of compiled samples, or a parent whose subdirectories are
    // (npm run validate:samples with no argument sweeps every post).
    const svgFiles = readdirSync(sampleDir)
      .filter((f) => f.endsWith('.svg'))
      .sort();
    const subDirs =
      svgFiles.length === 0
        ? readdirSync(sampleDir)
            .filter(
              (f) =>
                f !== 'previews' &&
                statSync(join(sampleDir, f)).isDirectory() &&
                readdirSync(join(sampleDir, f)).some((g) => g.endsWith('.svg')),
            )
            .sort()
        : [];
    if (svgFiles.length === 0 && subDirs.length === 0) {
      console.error(`No .svg files found in ${sampleDir} (run npm run compile:samples first)`);
      process.exit(1);
    }
    if (subDirs.length > 0) {
      let total = 0;
      for (const sub of subDirs) {
        const run = spawnSync(
          'npx',
          [
            'tsx',
            fileURLToPath(import.meta.url),
            join(sampleDir, sub),
            '--margin',
            String(margin),
            ...(opts.strict ? ['--strict'] : []),
          ],
          {
            stdio: 'inherit',
          },
        );
        if (run.status !== 0) total++;
      }
      if (total > 0) process.exit(1);
      return;
    }

    // Create previews directory
    const previewDir = join(sampleDir, 'previews');
    if (!existsSync(previewDir)) {
      mkdirSync(previewDir, { recursive: true });
    }

    console.log(`Validating ${svgFiles.length} samples in ${dir}`);
    console.log(`  Margin requirement: ${margin}px`);
    console.log();

    // Launch Puppeteer
    // chrome-headless-shell: see renderPng in src/cli.ts — the new headless
    // mode's screenshots can stall on a sleeping display.
    const browser = await puppeteer.launch({ headless: 'shell' });
    const page = await browser.newPage();

    const results: FileResult[] = [];
    let totalWarnings = 0;

    for (const svgFile of svgFiles) {
      const svgPath = join(sampleDir, svgFile);
      const name = basename(svgFile, '.svg');
      const pathogenPath = join(sampleDir, `${name}.pathogen`);
      const previewPath = join(previewDir, `${name}.png`);

      // Read source for GroupLayer and formatting checks
      let sourceHasGroupLayer = false;
      let sourceLayerCount = 0;
      let needsFormatting = false;
      if (existsSync(pathogenPath)) {
        const source = readFileSync(pathogenPath, 'utf-8');
        sourceHasGroupLayer = /GroupLayer/.test(source);
        // Count distinct named layer definitions
        const layerDefs = source.match(/(?:define\s+)?(?:PathLayer|TextLayer)\s*\(/g);
        sourceLayerCount = layerDefs ? layerDefs.length : 0;
        // Published samples must be formatter-clean — long one-line style
        // blocks soft-wrap badly in the mini-workspace code panel.
        try {
          const edits = formatDocument(new StringTextDocument(source));
          needsFormatting = edits.length > 0 && edits[0].newText !== source;
        } catch {
          // Unparseable source surfaces as a compile failure elsewhere.
        }
      }

      // Load SVG in Puppeteer
      const svgContent = readFileSync(svgPath, 'utf-8');

      // Parse viewBox from SVG
      const vbMatch = svgContent.match(/viewBox="([^"]+)"/);
      const vbParts = vbMatch ? vbMatch[1].split(/\s+/).map(Number) : [0, 0, 200, 200];
      const viewBox: ViewBox = {
        x: vbParts[0],
        y: vbParts[1],
        width: vbParts[2],
        height: vbParts[3],
      };

      // Set viewport to match SVG dimensions
      await page.setViewport({ width: viewBox.width, height: viewBox.height, deviceScaleFactor: 2 });

      // Load SVG as data URI
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
      const html = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  body { background: #0f172a; }
  img { display: block; width: ${viewBox.width}px; height: ${viewBox.height}px; }
</style></head>
<body><img src="${dataUri}"></body></html>`;

      // For element extraction, load the SVG inline
      const inlineHtml = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  body { background: #0f172a; }
  svg { display: block; }
</style></head>
<body>${svgContent}</body></html>`;

      // Extract element bounding rects from inline SVG
      await page.setContent(inlineHtml, { waitUntil: 'domcontentloaded' });

      const elements: ElementInfo[] = await page.evaluate(() => {
        const svg = document.querySelector('svg');
        if (!svg) return [];

        const results: ElementInfo[] = [];
        const svgRect = svg.getBoundingClientRect();
        const svgVB = svg.viewBox.baseVal;
        const scaleX = svgVB.width / svgRect.width;
        const scaleY = svgVB.height / svgRect.height;

        // Find code snippet groups — .toCodeSnippetBlock() output.
        // Structure: a <g> whose first <path> child has fill="#1e293b" (snippet bg),
        // plus <text> children with monospace font. The bg path is a roundRect.
        const snippetGroupIds = new Map<Element, string>();
        let snippetIdx = 0;
        for (const g of svg.querySelectorAll('g')) {
          const firstPath = g.querySelector(':scope > path');
          if (!firstPath) continue;
          const fill = firstPath.getAttribute('fill');
          if (fill !== '#1e293b') continue;
          const hasText = g.querySelector(':scope > text') !== null;
          if (hasText) {
            snippetGroupIds.set(g, `snippet-${snippetIdx++}`);
          }
        }

        // Collect text elements (not tspans) and geometry elements
        const textEls = svg.querySelectorAll('text');
        const geoEls = svg.querySelectorAll('path, circle, ellipse, line, polyline, polygon, rect');

        for (const el of [...textEls, ...geoEls]) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;

          // Find which snippet group this element belongs to (if any)
          let snippetGroup = '';
          let parent = el.parentElement;
          while (parent && parent !== svg) {
            const gid = snippetGroupIds.get(parent);
            if (gid) { snippetGroup = gid; break; }
            parent = parent.parentElement;
          }

          results.push({
            tagName: el.tagName.toLowerCase(),
            id: el.id || '',
            className: el.getAttribute('class') || '',
            textContent: el.tagName.toLowerCase() === 'text'
              ? (el.textContent?.trim() || '')
              : '',
            snippetGroup,
            bbox: {
              x: svgVB.x + (rect.x - svgRect.x) * scaleX,
              y: svgVB.y + (rect.y - svgRect.y) * scaleY,
              width: rect.width * scaleX,
              height: rect.height * scaleY,
            },
          });
        }

        return results;
      });

      // Run validation checks
      const warnings = runChecks(elements, viewBox, sourceHasGroupLayer, sourceLayerCount, margin);

      // 6. Formatting check — required before review/publication
      if (needsFormatting) {
        warnings.push({
          type: 'formatting',
          message: `Source is not formatter-clean — run: npm run format:samples -- ${sampleDir}`,
        });
      }

      // Screenshot (use the img-based HTML for cleaner rendering)
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await page.screenshot({ path: previewPath, fullPage: true });

      // Report
      const status = warnings.length === 0 ? '✓' : '⚠';
      console.log(`  ${status} ${name} (${viewBox.width}×${viewBox.height}) — ${warnings.length} warning(s)`);
      for (const w of warnings) {
        console.log(`      [${w.type}] ${w.message}`);
      }

      results.push({ file: svgFile, warnings, previewPath });
      totalWarnings += warnings.length;
    }

    await browser.close();

    // Summary
    console.log();
    console.log(`Summary: ${svgFiles.length} files, ${totalWarnings} warning(s)`);
    console.log(`PNG previews: ${previewDir}/`);

    if (totalWarnings > 0 && !opts.strict) {
      console.log();
      console.log(
        'NOTE: This is a soft gate. Fix warnings before agentic review. ' +
        'To enforce as a hard gate, use --strict.',
      );
    }

    if (totalWarnings > 0 && opts.strict) {
      process.exit(1);
    }
  });

program.parse();
