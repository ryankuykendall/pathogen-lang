/**
 * PDF + raster-image inspection helpers for dev tooling and the export E2E
 * harness. jspdf/svg2pdf only *generate* PDFs; these helpers let scripts and
 * tests look inside one — pages, embedded images, decoded pixel content —
 * so regressions like "the artwork page is solid black" (2026-08-18) are
 * mechanically checkable.
 *
 * Node-only (uses zlib); dev-dependencies: pdf-lib, jpeg-js, pngjs.
 */

import { inflateSync } from 'node:zlib';

import jpeg from 'jpeg-js';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from 'pdf-lib';
import { PNG } from 'pngjs';

export interface PdfPageSummary {
  page: number;
  widthPt: number;
  heightPt: number;
  widthIn: number;
  heightIn: number;
}

export interface PdfImageInfo {
  /** 1-based page the image is referenced from (first page seen for shared resources). */
  page: number;
  /** Resource name, e.g. "I1". */
  name: string;
  width: number;
  height: number;
  filter: string;
  /** Raw (still encoded) stream bytes — JPEG bytes for DCTDecode. */
  bytes: Uint8Array;
}

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array | Buffer;
}

export interface PixelStats {
  width: number;
  height: number;
  avgLuminance: number;
  minLuminance: number;
  maxLuminance: number;
  /** Fraction of pixels with luminance < 8 (near-black). */
  pctBlack: number;
  /** Fraction of pixels with luminance > 247 (near-white). */
  pctWhite: number;
  /** Fraction of pixels with alpha < 8 (PNG only; JPEG is always opaque). */
  pctTransparent: number;
  /** True when every pixel is byte-identical — the failure signature. */
  uniform: boolean;
}

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { updateMetadata: false });
}

export function pageSummaries(doc: PDFDocument): PdfPageSummary[] {
  return doc.getPages().map((p, i) => {
    const { width, height } = p.getSize();
    return { page: i + 1, widthPt: width, heightPt: height, widthIn: width / 72, heightIn: height / 72 };
  });
}

/**
 * Every image XObject reachable from page resources, deduplicated by object
 * reference (jsPDF shares one Resources dict across pages).
 */
export function listImages(doc: PDFDocument): PdfImageInfo[] {
  const out: PdfImageInfo[] = [];
  const seen = new Set<string>();
  doc.getPages().forEach((page, pi) => {
    const resources = page.node.Resources();
    const xobjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjects) return;
    for (const [name, value] of xobjects.entries()) {
      const refTag = value instanceof PDFRef ? value.toString() : `${pi}/${name.decodeText()}`;
      if (seen.has(refTag)) continue;
      seen.add(refTag);
      const stream = doc.context.lookup(value);
      if (!(stream instanceof PDFRawStream)) continue;
      const subtype = stream.dict.lookupMaybe(PDFName.of('Subtype'), PDFName);
      if (subtype?.decodeText() !== 'Image') continue;
      const filterObj = stream.dict.get(PDFName.of('Filter'));
      let filter = 'none';
      if (filterObj instanceof PDFArray) {
        filter = filterObj
          .asArray()
          .map((f) => (f instanceof PDFName ? f.decodeText() : String(f)))
          .join('+');
      } else if (filterObj instanceof PDFName) {
        filter = filterObj.decodeText();
      }
      out.push({
        page: pi + 1,
        name: name.decodeText().replace(/^\//, ''),
        width: stream.dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber() ?? 0,
        height: stream.dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber() ?? 0,
        filter,
        bytes: stream.getContents(),
      });
    }
  });
  return out;
}

export function decodeJpeg(bytes: Uint8Array): DecodedImage {
  const { width, height, data } = jpeg.decode(Buffer.from(bytes), { maxMemoryUsageInMB: 2048 });
  return { width, height, data };
}

export function decodePng(bytes: Uint8Array): DecodedImage {
  const { width, height, data } = PNG.sync.read(Buffer.from(bytes));
  return { width, height, data };
}

/** Decode JPEG or PNG bytes by magic-number sniffing. */
export function decodeImage(bytes: Uint8Array): DecodedImage {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return decodeJpeg(bytes);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return decodePng(bytes);
  throw new Error('Unrecognized image format (expected JPEG or PNG magic bytes)');
}

export function pixelStats(img: DecodedImage): PixelStats {
  const { width, height, data } = img;
  const count = width * height;
  let sum = 0;
  let minL = 255;
  let maxL = 0;
  let black = 0;
  let white = 0;
  let transparent = 0;
  let uniform = true;
  const r0 = data[0];
  const g0 = data[1];
  const b0 = data[2];
  const a0 = data[3];
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += lum;
    if (lum < minL) minL = lum;
    if (lum > maxL) maxL = lum;
    if (lum < 8) black++;
    if (lum > 247) white++;
    if (data[i + 3] < 8) transparent++;
    if (uniform && (data[i] !== r0 || data[i + 1] !== g0 || data[i + 2] !== b0 || data[i + 3] !== a0)) {
      uniform = false;
    }
  }
  return {
    width,
    height,
    avgLuminance: sum / count,
    minLuminance: minL,
    maxLuminance: maxL,
    pctBlack: black / count,
    pctWhite: white / count,
    pctTransparent: transparent / count,
    uniform,
  };
}

/**
 * All decoded (inflated where FlateDecode) non-image stream contents,
 * concatenated — the classic "grep the content streams" primitive the export
 * harness uses for operator-level assertions.
 */
export function decodedContentStreams(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const pieces: string[] = [];
  const re = /stream\r?\n/g;
  const text = raw.toString('latin1');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) continue;
    const chunk = raw.subarray(start, end);
    // JPEG image streams are not content streams — skip by magic number.
    if (chunk[0] === 0xff && chunk[1] === 0xd8) continue;
    if (chunk[0] === 0x78) {
      try {
        pieces.push(inflateSync(chunk).toString('latin1'));
        continue;
      } catch {
        /* not deflate after all — fall through to raw */
      }
    }
    pieces.push(chunk.toString('latin1'));
  }
  return pieces.join('\n');
}
