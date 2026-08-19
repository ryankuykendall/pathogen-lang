/**
 * PDF / raster inspection CLI — the counterpart to the jspdf+svg2pdf
 * *generation* stack. Lists pages and embedded images, extracts them, and
 * reports pixel statistics so "the exported page is actually black/blank"
 * is a one-command diagnosis (the bug class that shipped on 2026-08-18).
 *
 * Usage:
 *   npm run inspect:pdf -- summary <file.pdf>
 *   npm run inspect:pdf -- pixel-stats <file.pdf|file.png|file.jpg> [--index N]
 *   npm run inspect:pdf -- extract-image <file.pdf> --index N --out out.jpg
 *   npm run inspect:pdf -- dump-stream <file.pdf>
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { Command } from 'commander';

import { decodeImage, decodedContentStreams, listImages, loadPdf, pageSummaries, pixelStats } from './lib/pdf-inspect';
import type { PixelStats } from './lib/pdf-inspect';

const fmtStats = (s: PixelStats): string =>
  [
    `${s.width}×${s.height}px`,
    `avgLum=${s.avgLuminance.toFixed(1)}`,
    `lumRange=[${s.minLuminance.toFixed(0)}, ${s.maxLuminance.toFixed(0)}]`,
    `black=${(s.pctBlack * 100).toFixed(1)}%`,
    `white=${(s.pctWhite * 100).toFixed(1)}%`,
    `transparent=${(s.pctTransparent * 100).toFixed(1)}%`,
    s.uniform ? 'UNIFORM (failure signature!)' : 'non-uniform',
  ].join('  ');

const program = new Command();
program.name('inspect-pdf').description('Inspect PDF structure, embedded images, and pixel content');

program
  .command('summary')
  .description('Pages (MediaBox in pt and inches) and embedded images')
  .argument('<file>', 'PDF file')
  .action(async (file: string) => {
    const doc = await loadPdf(readFileSync(file));
    for (const p of pageSummaries(doc)) {
      console.log(
        `page ${p.page}: ${p.widthPt.toFixed(1)} × ${p.heightPt.toFixed(1)} pt  (${p.widthIn.toFixed(2)} × ${p.heightIn.toFixed(2)} in)`,
      );
    }
    const images = listImages(doc);
    if (images.length === 0) console.log('images: none');
    for (const [i, img] of images.entries()) {
      console.log(
        `image ${i}: /${img.name} on page ${img.page} — ${img.width}×${img.height}px, ${img.filter}, ${img.bytes.length.toLocaleString()} bytes`,
      );
    }
  });

program
  .command('pixel-stats')
  .description('Decode embedded images (or a standalone .png/.jpg) and report pixel statistics')
  .argument('<file>', 'PDF, PNG, or JPEG file')
  .option('--index <n>', 'only this image index (PDF input; from `summary` order)')
  .action(async (file: string, opts: { index?: string }) => {
    const bytes = readFileSync(file);
    if ((bytes[0] === 0xff && bytes[1] === 0xd8) || (bytes[0] === 0x89 && bytes[1] === 0x50)) {
      console.log(fmtStats(pixelStats(decodeImage(bytes))));
      return;
    }
    const doc = await loadPdf(bytes);
    const images = listImages(doc);
    if (images.length === 0) {
      console.log('No embedded images.');
      return;
    }
    const wanted = opts.index != null ? [images[Number(opts.index)]] : images;
    for (const img of wanted) {
      if (!img) throw new Error(`No image at index ${opts.index} (found ${images.length})`);
      const label = `image /${img.name} (page ${img.page})`;
      try {
        console.log(`${label}: ${fmtStats(pixelStats(decodeImage(img.bytes)))}`);
      } catch (err) {
        console.log(`${label}: cannot decode ${img.filter} stream (${(err as Error).message})`);
      }
    }
  });

program
  .command('extract-image')
  .description('Write one embedded image stream to a file (DCTDecode streams are valid .jpg)')
  .argument('<file>', 'PDF file')
  .requiredOption('--index <n>', 'image index (from `summary` order)')
  .requiredOption('--out <path>', 'output path')
  .action(async (file: string, opts: { index: string; out: string }) => {
    const doc = await loadPdf(readFileSync(file));
    const images = listImages(doc);
    const img = images[Number(opts.index)];
    if (!img) throw new Error(`No image at index ${opts.index} (found ${images.length})`);
    writeFileSync(opts.out, img.bytes);
    console.log(`Wrote /${img.name} (${img.width}×${img.height}px, ${img.filter}) → ${opts.out}`);
  });

program
  .command('dump-stream')
  .description('Print all decoded (inflated) content streams')
  .argument('<file>', 'PDF file')
  .action((file: string) => {
    console.log(decodedContentStreams(readFileSync(file)));
  });

program.parse();
