/**
 * One program of the chip's list, drawn small (2f; docs/projects.md "The
 * preview in VS Code"), as the playground draws its rows
 * (playground/services/program-drawings.ts): its imports and fonts loaded as
 * the CLI loads them, compiled, and either its row's error ("Error in
 * parts/gears.pathogen line 9") or its miniature. A drawing too large to draw
 * small gets a blank tile, never an error.
 *
 * It runs on the preview's drawing thread (programs-worker.ts), never on the
 * extension host's own, so a slow program holds nothing up.
 *
 * The playground's rules here (MINIATURE_MAX_CHARS, drawingOf, withBackground,
 * errorPlace, errorRowText) are pinned to the originals by
 * tests/vscode-preview-parity.test.ts.
 *
 * No `vscode` import: tests drive this with the real library.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { NOT_FOUND } from './preview-programs';

import type { FontSession } from './font-session';

/** About this many characters of drawing (path data, text, defs) at most, for a miniature (the playground's). */
export const MINIATURE_MAX_CHARS = 250_000;

/** The preview's canvas colour (webview-html.ts #preview-bg), behind each miniature. */
export const MINIATURE_BACKGROUND = '#ffffff';

/** A program's row, drawn. */
export interface DrawResult {
  /** Its row's words; null when it draws. */
  error: string | null;
  /** A `data:` URL of its drawing on the canvas colour; null for a blank tile (or an error). */
  miniature: string | null;
  /** Its drawing was too large to draw small: the tile is blank on purpose. */
  tooLarge: boolean;
  /** The OS paths of the files its imports reach; null when they couldn't be read. */
  files: string[] | null;
}

/** A module load error (pathogen-lang `ModuleLoadError`), as far as a row reads it. */
interface LoadErrorLike {
  file: string;
  line: number;
}

/** What drawing needs from `pathogen-lang`. */
export interface DrawingLib {
  compile: (source: string, options: { fonts?: unknown; modules?: unknown }) => unknown;
  generateSvg: (result: never) => string;
  createFontRegistry: () => unknown;
  addFontData: (registry: never, font: { family: string; weight: number; style: string; buffer: ArrayBuffer }) => void;
  ensureOpentype: () => Promise<void>;
}

/** What drawing needs from `pathogen-lang/node`. */
export interface DrawingNodeLib {
  resolveEditorModules: (
    filePath: string | null,
    source: string,
    openText: (absolutePath: string) => string | undefined,
    options?: { maxDataBytes?: number },
  ) => Promise<{
    root: string | null;
    graph: { files: Map<string, unknown>; order: string[]; entry: string; data?: Map<string, unknown> };
    errors: unknown[];
  }>;
  editorModulePaths: (modules: never) => string[];
}

/**
 * Draw `program` (an OS path) small. `openText` gives an open tab's text,
 * which counts over the disk's for the program and every file it imports.
 * `fonts` is this thread's own session (not the preview's: each keeps one
 * program's fonts at hand).
 */
export async function drawProgram(
  libs: { lib: DrawingLib; node: DrawingNodeLib },
  fonts: Pick<FontSession, 'load' | 'payloads'>,
  program: string,
  openText: (absolutePath: string) => string | undefined,
  /** The `pathogen.maxDataSize` setting, in bytes; 50 MB unless given. */
  maxDataBytes?: number,
): Promise<DrawResult> {
  let source = openText(program);
  if (source === undefined) {
    try {
      source = readFileSync(program, 'utf8');
    } catch {
      return { error: NOT_FOUND, miniature: null, tooLarge: false, files: null };
    }
  }
  const modules = await libs.node.resolveEditorModules(
    program,
    source,
    openText,
    maxDataBytes === undefined ? {} : { maxDataBytes },
  );
  const files = libs.node.editorModulePaths(modules as never);
  // Its own name, as the error panel and the rows say it: a path in its project folder.
  const own =
    modules.root === null ? path.basename(program) : path.relative(modules.root, program).split(path.sep).join('/');
  const failed = (place: ErrorPlace): DrawResult => ({
    error: errorRowText(place),
    miniature: null,
    tooLarge: false,
    files,
  });

  // An import that can't be loaded stops the compile, at its import line.
  const [loadError] = modules.errors as LoadErrorLike[];
  if (loadError) return failed({ file: loadError.file.replace(/^\/+/, ''), line: loadError.line });

  const loaded = await fonts.load(source, program, modules.graph as never);
  if (loaded.errors.length > 0) return failed(errorPlace(loaded.errors[0], own));
  let registry: unknown;
  if (loaded.fontIds.length > 0) {
    await libs.lib.ensureOpentype();
    registry = libs.lib.createFontRegistry();
    for (const f of fonts.payloads(loaded.fontIds)) {
      libs.lib.addFontData(registry as never, { family: f.family, weight: f.weight, style: f.style, buffer: f.buffer });
    }
  }

  let result: CompileResultLike;
  try {
    result = libs.lib.compile(source, {
      ...(registry ? { fonts: registry } : {}),
      // Modules or data files: either is a graph the compile needs.
      ...(modules.graph.files.size > 0 || (modules.graph.data?.size ?? 0) > 0 ? { modules: modules.graph } : {}),
    }) as CompileResultLike;
  } catch (err) {
    return failed(errorPlace(err instanceof Error ? err.message : String(err), own));
  }
  const drawing = drawingOf(result);
  if (drawing === null) return { error: null, miniature: null, tooLarge: true, files };
  const svg = withBackground(
    libs.lib.generateSvg(drawing as never),
    MINIATURE_BACKGROUND,
    drawing.viewBox ?? DEFAULT_BOX,
  );
  return {
    error: null,
    miniature: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    tooLarge: false,
    files,
  };
}

// --- The playground's rules (program-drawings.ts, error-place.ts), pinned by tests/vscode-preview-parity.test.ts ---

/** A drawing's box: `define ViewBox`, or the 200 × 200 default. */
export interface DrawingBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

const DEFAULT_BOX: DrawingBox = { originX: 0, originY: 0, width: 200, height: 200 };

interface LayerLike {
  records?: unknown;
  commands?: unknown;
  children?: LayerLike[];
  [key: string]: unknown;
}

/** A compile result, as far as a drawing reads it. */
export interface CompileResultLike {
  layers?: LayerLike[];
  masks?: unknown[];
  clipPaths?: unknown[];
  gradients?: unknown[];
  patterns?: unknown[];
  markers?: unknown[];
  filters?: unknown[];
  cssProperties?: unknown[];
  viewBox?: DrawingBox;
}

/** What a compile result keeps to be drawn: no records, logs or font files. */
export interface Drawing {
  layers: LayerLike[];
  masks: unknown[];
  clipPaths: unknown[];
  gradients: unknown[];
  patterns: unknown[];
  markers: unknown[];
  filters: unknown[];
  cssProperties: unknown[];
  viewBox?: DrawingBox;
}

/** A layer without what only the inspector reads (records, commands). */
function lean(layer: LayerLike): LayerLike {
  const copy: LayerLike = { ...layer };
  delete copy.records;
  delete copy.commands;
  if (layer.children) copy.children = layer.children.map(lean);
  return copy;
}

const NOT_DRAWN = new Set(['records', 'commands']);

/** About how many characters `value` draws, counted until past `limit`. */
function drawingSize(value: unknown, limit: number, size = 0): number {
  if (size > limit) return size;
  if (typeof value === 'string') return size + value.length;
  if (typeof value === 'number') return size + 4;
  if (Array.isArray(value)) {
    for (const item of value) {
      size = drawingSize(item, limit, size);
      if (size > limit) break;
    }
    return size;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (NOT_DRAWN.has(key)) continue;
      size = drawingSize(item, limit, size);
      if (size > limit) break;
    }
  }
  return size;
}

/** The playground's drawingOf: the drawing to keep from a compile result, or null when it's too large to draw small. */
export function drawingOf(result: CompileResultLike): Drawing | null {
  const drawing: Drawing = {
    layers: (result.layers ?? []).map(lean),
    masks: result.masks ?? [],
    clipPaths: result.clipPaths ?? [],
    gradients: result.gradients ?? [],
    patterns: result.patterns ?? [],
    markers: result.markers ?? [],
    filters: result.filters ?? [],
    cssProperties: result.cssProperties ?? [],
    ...(result.viewBox ? { viewBox: result.viewBox } : {}),
  };
  return drawingSize(drawing, MINIATURE_MAX_CHARS) > MINIATURE_MAX_CHARS ? null : drawing;
}

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The playground's withBackground: the canvas colour behind the drawing, over
 * the drawing's box only, right after the root tag (generateSvg's root tag
 * holds only xmlns, viewBox, width and height, none of which can hold a `>`).
 */
export function withBackground(svg: string, background: string, box: DrawingBox): string {
  const open = svg.indexOf('<svg');
  const end = open < 0 ? -1 : svg.indexOf('>', open);
  if (end < 0 || !background) return svg;
  const rect = `<rect x="${box.originX}" y="${box.originY}" width="${box.width}" height="${box.height}" fill="${attr(background)}"/>`;
  return `${svg.slice(0, end + 1)}${rect}${svg.slice(end + 1)}`;
}

/** The file where a compile failed (a path in the project folder, no leading slash), and its line when known. */
export interface ErrorPlace {
  file: string;
  line: number | null;
}

const OWN_RUNTIME = /^Line (\d+)(?:, col (\d+))?: ?([\s\S]*)$/;
const OWN_PARSE = /^Parse error at line (\d+), column (\d+): ?([\s\S]*)$/;
// A workspace path has no spaces (its name rules), so words before ".pathogen line" aren't a file.
const OTHER_FILE = /^(\S+?\.pathogen) line (\d+)(?:, col (\d+))?: ?([\s\S]*)$/;
// A file with no line: an error with no place in it ("main.pathogen: …").
const FILE_ONLY = /^(\S+?\.pathogen): ([\s\S]*)$/;

/** The playground's errorPlace: where `program`'s compile failed, from its message's first error. */
export function errorPlace(message: string, program: string): ErrorPlace {
  const first = message.split('\n').find((line) => line.trim() !== '') ?? '';
  const own = OWN_RUNTIME.exec(first) ?? OWN_PARSE.exec(first);
  if (own) return { file: program, line: Number(own[1]) };
  const other = OTHER_FILE.exec(first);
  if (other) return { file: other[1].replace(/^\/+/, ''), line: Number(other[2]) };
  const fileOnly = FILE_ONLY.exec(first);
  if (fileOnly) return { file: fileOnly[1].replace(/^\/+/, ''), line: null };
  return { file: program, line: null };
}

/** The playground's errorRowText: "Error in parts/gears.pathogen line 9". */
export function errorRowText(place: ErrorPlace): string {
  return place.line === null ? `Error in ${place.file}` : `Error in ${place.file} line ${place.line}`;
}
