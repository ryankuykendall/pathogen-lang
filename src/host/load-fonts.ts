/**
 * The pre-compile font step shared by the Node hosts (CLI, VS Code extension,
 * language server): read every `@font` directive, find each font through the
 * host, and report problems with the severity rules in docs/path-blocks.md
 * § Font Loading by Environment. The evaluator itself never loads fonts; the
 * host builds a FontRegistry from the result and passes it to compile().
 */
import { addFont, addFontData, createFontRegistry } from '../evaluator/font-provider';
import { fontClashError } from '../module-messages';
import { parse } from '../parser';
import {
  CURATED_GOOGLE_FONTS,
  fontFileKind,
  formatWeightSubstitution,
  lookupGoogleFont,
  sfntLooksComplete,
  woffLooksComplete,
} from './google-fonts';
import { classifyFontSource, projectPathStem, resolveProjectPath, respell } from './paths';
import { resolveFontDirectives } from '../parser/font-directives';

import type { FontFileKind, WeightSubstitution } from './google-fonts';
import type { FontHost } from './types';
import type { FontData, FontRegistry } from '../evaluator/types';
import type { Program, SourceLocation } from '../parser/ast';

export interface ResolvedFont {
  /** Stable for the same bytes under the same name: hosts send each id to a preview once. */
  id: string;
  family: string;
  weight: number;
  style: 'normal';
  bytes: Uint8Array;
  kind: FontFileKind;
  origin: 'file' | 'local' | 'cache' | 'google';
}

export interface FontLoadMessage {
  severity: 'error' | 'warning';
  /** Warning codes, usable with --strict (WARNING_CODES). */
  code?: 'font-weight' | 'font-load';
  message: string;
  line?: number;
  column?: number;
  /** The imported file whose `@font` line it is, as a path from the project folder; absent for the compiled file. */
  file?: string;
}

/** One file of a compile, for loading the fonts of every file (docs/modules.md "Fonts in imported files"). */
export interface FontSourceFile {
  /** Project path, e.g. `/parts/labels.pathogen`: `./` paths in its `@font` lines start from its folder. */
  path: string;
  source: string;
  /** For messages, e.g. `parts/labels.pathogen`. */
  label: string;
  /** An imported file: its messages carry its label as `file`. */
  imported?: boolean;
}

export interface ResolveFontsOptions {
  host: FontHost;
  /** Project path of the program being compiled, e.g. `/main.pathogen`. */
  entry: string;
  /** Milliseconds since the epoch; injectable for cache-age tests. */
  now?: () => number;
}

/** How long a downloaded font is trusted before Google is asked about a newer release. */
export const FONT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CacheIndexEntry {
  url: string;
  weightUsed: number;
  fetchedAt: number;
  available: number[];
}

export interface PlannedFontDirective {
  /** The path (`kind: 'file'`) or family name (`kind: 'family'`) as written. */
  source: string;
  kind: 'file' | 'family';
  /** The weight as written; absent means the default (400). */
  weight?: number;
  line?: number;
  column?: number;
}

export interface FontDirectivePlan {
  /** Well-formed directives in source order: files (`./`, `../`, `/`) and family names. */
  directives: PlannedFontDirective[];
  /**
   * Source mistakes, as errors at their directive: `@font` inside a function
   * or block, an identifier that isn't a top-level string, a generic family,
   * a web address, an OS path, a backslash, a bare file name.
   */
  errors: FontLoadMessage[];
}

/**
 * The pure first step of font loading, the same in every tool: sort each
 * top-level `@font` into a file, a family name or a mistake. resolveFonts
 * builds on it, and the playground calls it (through the library global) so
 * its errors match the CLI's exactly. Null when the source doesn't parse —
 * the compile reports that.
 */
export function planFontDirectives(source: string): FontDirectivePlan | null {
  let program: Program;
  try {
    program = parse(source);
  } catch {
    return null;
  }
  const errors: FontLoadMessage[] = [];
  const directives: PlannedFontDirective[] = [];
  for (const loc of nestedFontDirectives(program)) {
    errors.push(at(loc, 'error', '@font must be at the top level of the program, not inside a function or block.'));
  }
  const { resolved, errors: identifierErrors } = resolveFontDirectives(program);
  for (const err of identifierErrors) errors.push(at(err.loc, 'error', err.message));
  for (const directive of resolved) {
    const kind = classifyFontSource(directive.family);
    if (kind.kind === 'invalid') {
      errors.push(at(directive.loc, 'error', kind.message));
      continue;
    }
    directives.push({
      source: kind.kind === 'file' ? kind.path : kind.family,
      kind: kind.kind,
      ...(directive.weight !== undefined ? { weight: directive.weight } : {}),
      ...(directive.loc ? { line: directive.loc.line, column: directive.loc.column } : {}),
    });
  }
  return { directives, errors };
}

export interface ResolveFontsResult {
  fonts: ResolvedFont[];
  messages: FontLoadMessage[];
  /**
   * A family wasn't on this computer or in the cache and downloads were off,
   * so a run with downloads on could load something else. The language server
   * runs offline first so diagnostics never wait, and downloads after only
   * when this is set.
   */
  downloadsSkipped: boolean;
  /**
   * An installed weight stood in because Google Fonts couldn't be reached or
   * a download failed, so loading again later may get the weight asked for.
   * Editors that reuse a load while you type retry such a result after a
   * while, as they do one with an error.
   */
  retryable: boolean;
}

export async function resolveFonts(source: string, options: ResolveFontsOptions): Promise<ResolveFontsResult> {
  return resolveFontsInFiles([{ path: options.entry, source, label: options.entry.replace(/^\//, '') }], options);
}

/**
 * Load the fonts of every file in a compile: the compiled file first, then
 * the files it imports (docs/modules.md "Fonts in imported files"). Each
 * file's `./` paths start from its own folder. Fonts are shared by family and
 * weight: file paths load before family names across all the files, so a
 * family one file loads from a font file serves another file's `@font
 * "Family"` too, and two files naming one family load it once. Two files
 * loading *different* font files as one family and weight is an error naming
 * both. With one file this is resolveFonts, unchanged.
 *
 * `files` is in order, the compiled file first: the first font file loaded
 * for a family and weight is the one used, and a later file's different one
 * is the error, reported against that first.
 */
export async function resolveFontsInFiles(
  files: readonly FontSourceFile[],
  options: Omit<ResolveFontsOptions, 'entry'>,
): Promise<ResolveFontsResult> {
  const fonts: ResolvedFont[] = [];
  const outcome = { downloadsSkipped: false, retryable: false };
  const messages: FontLoadMessage[] = [];
  const planned: { directive: PlannedFontDirective; file: FontSourceFile }[] = [];
  for (const file of files) {
    // A source that doesn't parse has nothing to load yet; the compile reports it.
    const plan = planFontDirectives(file.source);
    if (!plan) continue;
    messages.push(...plan.errors.map((m) => inFile(m, file)));
    for (const directive of plan.directives) planned.push({ directive, file });
  }

  const { host } = options;
  const now = options.now ?? (() => Date.now());
  const fileFamilies = new Set<string>();
  const seen = new Set<string>();
  /** The first font file each family and weight came from, for the clash between two files. */
  const fromFile = new Map<string, { font: ResolvedFont; written: string; file: FontSourceFile }>();

  // File paths first, so a family a file already provides isn't looked up again.
  const ordered = [...planned].sort((a, b) => rank(a.directive) - rank(b.directive));
  for (const { directive, file } of ordered) {
    const weight = directive.weight ?? 400;
    const loc = directive.line !== undefined ? { line: directive.line, column: directive.column } : undefined;
    const own: FontLoadMessage[] = [];

    if (directive.kind === 'file') {
      const font = await loadFile(directive.source, weight, file.path, host, loc, own);
      if (font) {
        const key = `${font.family}:${weight}`;
        fileFamilies.add(key);
        const first = fromFile.get(key);
        if (!first) fromFile.set(key, { font, written: directive.source, file });
        else if (first.font.id !== font.id && first.file.path !== file.path) {
          own.push(
            at(
              loc,
              'error',
              fontClashError(font.family, weight, first.written, first.file.label, directive.source, file.label),
            ),
          );
        }
        if (!seen.has(key)) {
          seen.add(key);
          fonts.push(font);
        }
      }
      messages.push(...own.map((m) => inFile(m, file)));
      continue;
    }

    const family = directive.source;
    const key = `${family}:${weight}`;
    if (seen.has(key) || fileFamilies.has(key)) continue;
    seen.add(key);
    const font = await loadFamily(family, weight, host, now, loc, own, outcome);
    if (font) fonts.push(font);
    messages.push(...own.map((m) => inFile(m, file)));
  }
  return { fonts, messages, downloadsSkipped: outcome.downloadsSkipped, retryable: outcome.retryable };
}

/** A message about an imported file's `@font` line names that file. */
function inFile(message: FontLoadMessage, file: FontSourceFile): FontLoadMessage {
  return file.imported ? { ...message, file: file.label } : message;
}

/** File directives sort before family names. */
function rank(directive: PlannedFontDirective): number {
  return directive.kind === 'file' ? 0 : 1;
}

async function loadFile(
  written: string,
  weight: number,
  entry: string,
  host: FontHost,
  loc: MessageLocation | undefined,
  messages: FontLoadMessage[],
): Promise<ResolvedFont | null> {
  const escape = () =>
    messages.push(
      at(
        loc,
        'error',
        `@font path "${written}" leaves the project folder (${host.projectLabel}). Move the file into the project folder, or move the project's pathogen.json (or add one) to a folder that contains both the program and the file, other than your home folder itself.`,
      ),
    );
  const resolved = resolveProjectPath(written, entry);
  if (!resolved.ok) {
    escape();
    return null;
  }
  const read = await host.readFile(resolved.path);
  if (!read.ok) {
    if (read.code === 'escapes-root') escape();
    else if (read.code === 'case-mismatch') {
      messages.push(
        at(
          loc,
          'error',
          `@font file "${written}" differs from the file on disk only in letter case: "${respell(written, read.actual)}". Paths are case-sensitive on every system.`,
        ),
      );
    } else if (read.code === 'not-found') {
      const rootHint = written.startsWith('/')
        ? " A leading / means the project folder, not your computer's root."
        : '';
      messages.push(at(loc, 'error', `@font file "${written}" was not found (looked for ${read.osPath}).${rootHint}`));
    } else if (read.code === 'folder') {
      messages.push(at(loc, 'error', `@font path "${written}" is a folder, not a font file.`));
    } else {
      messages.push(at(loc, 'error', `@font file "${written}" could not be read: ${read.detail}`));
    }
    return null;
  }

  let bytes = read.bytes;
  let kind = fontFileKind(bytes);
  if (kind === null) {
    messages.push(
      at(
        loc,
        'error',
        `@font file "${written}" is not a font file: expected TrueType (.ttf), OpenType (.otf), WOFF or WOFF2 data.`,
      ),
    );
    return null;
  }
  if (kind === 'collection') {
    messages.push(
      at(
        loc,
        'error',
        `@font file "${written}" is a font collection (.ttc), which isn't supported. Use a single .ttf or .otf file.`,
      ),
    );
    return null;
  }
  if (kind === 'woff2') {
    if (!host.decodeWoff2) {
      messages.push(
        at(
          loc,
          'error',
          `@font file "${written}" is WOFF2, which can't be read here. Use the .ttf or .otf file instead.`,
        ),
      );
      return null;
    }
    try {
      bytes = await host.decodeWoff2(bytes);
    } catch (err) {
      messages.push(
        at(
          loc,
          'error',
          `@font file "${written}" is a damaged WOFF2 file: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      return null;
    }
    kind = fontFileKind(bytes);
    if (kind !== 'ttf' && kind !== 'otf') {
      messages.push(
        at(
          loc,
          'error',
          `@font file "${written}" is a damaged WOFF2 file: it didn't decode to a TrueType or OpenType font.`,
        ),
      );
      return null;
    }
  }
  const complete = kind === 'woff' ? woffLooksComplete(bytes) : sfntLooksComplete(bytes);
  if (!complete) {
    messages.push(
      at(loc, 'error', `@font file "${written}" is damaged or incomplete: its tables run past the end of the file.`),
    );
    return null;
  }
  const family = projectPathStem(resolved.path);
  return { id: fontId(family, weight, bytes), family, weight, style: 'normal', bytes, kind, origin: 'file' };
}

async function loadFamily(
  family: string,
  weight: number,
  host: FontHost,
  now: () => number,
  loc: MessageLocation | undefined,
  messages: FontLoadMessage[],
  outcome: { downloadsSkipped: boolean; retryable: boolean },
): Promise<ResolvedFont | null> {
  // 1–3. Folders on this computer, exact weight.
  const local = await host.findLocalFont?.(family, weight, { nearest: false });
  if (local) return makeFont(family, weight, local.bytes, 'local');

  // 4. Google Fonts, through the cache.
  const indexKey = `css2:${family}:${weight}`;
  const cached = await readIndex(host, indexKey);
  // A cached file that isn't a complete font (a partial write, another
  // program's file) is a miss, never a font.
  const stored = cached ? await host.cache?.get(`font:${cached.url}`) : null;
  const cachedBytes = stored && sfntLooksComplete(stored) ? stored : null;
  const substitutionOf = (entry: CacheIndexEntry): WeightSubstitution | undefined =>
    entry.weightUsed !== weight
      ? { family, requested: weight, used: entry.weightUsed, available: entry.available }
      : undefined;
  const useCached = (entry: CacheIndexEntry, bytes: Uint8Array) => {
    const substitution = substitutionOf(entry);
    if (substitution) messages.push(at(loc, 'warning', formatWeightSubstitution(substitution), 'font-weight'));
    return makeFont(family, weight, bytes, 'cache');
  };
  const fresh = cached !== null && cached.fetchedAt <= now() && now() - cached.fetchedAt < FONT_CACHE_TTL_MS;
  if (cached && cachedBytes && (fresh || !host.fetch)) {
    return useCached(cached, cachedBytes);
  }

  // 5. The last resort, with downloads on or off: the family installed at
  // another weight. `why` says why Google Fonts couldn't help; a failure that
  // may pass (the network, a download) makes the result worth retrying.
  const nearestInstalled = async (why: string, mayPass = false): Promise<ResolvedFont | null> => {
    const nearest = await host.findLocalFont?.(family, weight, { nearest: true });
    if (!nearest) return null;
    if (mayPass) outcome.retryable = true;
    messages.push(
      at(
        loc,
        'warning',
        `${family} is not installed at weight ${weight}${why}; using the installed weight ${nearest.weight} (${nearest.label})`,
        'font-weight',
      ),
    );
    return makeFont(family, weight, nearest.bytes, 'local');
  };
  const fail = (message: string): null => {
    messages.push(at(loc, 'error', message));
    return null;
  };

  if (host.fetch) {
    const lookup = await lookupGoogleFont(family, weight, host.fetch);
    if (lookup.ok) {
      const download = await downloadFont(host, lookup.url, cached?.url === lookup.url ? cachedBytes : null);
      if (download.ok) {
        const entry: CacheIndexEntry = {
          url: lookup.url,
          weightUsed: lookup.weightUsed,
          fetchedAt: now(),
          available: lookup.substitution?.available ?? [],
        };
        await host.cache?.put(indexKey, new TextEncoder().encode(JSON.stringify(entry)));
        if (lookup.substitution)
          messages.push(at(loc, 'warning', formatWeightSubstitution(lookup.substitution), 'font-weight'));
        return makeFont(family, weight, download.bytes, 'google');
      }
      if (cached && cachedBytes) return useCached(cached, cachedBytes);
      return (
        (await nearestInstalled(`, and its download failed (${download.detail})`, true)) ??
        fail(downloadFailed(family, download.detail))
      );
    }
    // A copy downloaded earlier still works when Google can't be reached, and
    // even when Google no longer lists the family.
    if (cached && cachedBytes) return useCached(cached, cachedBytes);
    if (lookup.reason === 'network') {
      return (
        (await nearestInstalled(`, and Google Fonts couldn't be reached (${lookup.detail})`, true)) ??
        fail(downloadFailed(family, lookup.detail))
      );
    }
    return (await nearestInstalled(", and Google Fonts doesn't have it")) ?? fail(notFound(family));
  }

  // Downloads are off.
  outcome.downloadsSkipped = true;
  const nearest = await nearestInstalled('');
  if (nearest) return nearest;
  messages.push(
    at(
      loc,
      'warning',
      `@font "${family}": not on this computer, and downloads are off (${host.offlineReason ?? 'offline'}). Calls that need this font will fail.`,
      'font-load',
    ),
  );
  return null;
}

/**
 * A cache index entry, checked field by field: the cache folder is shared by
 * every tool and version, so an entry that isn't exactly this shape — or
 * names a font host other than Google's — is a miss.
 */
async function readIndex(host: FontHost, key: string): Promise<CacheIndexEntry | null> {
  const raw = await host.cache?.get(key);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
  // `null`, a number, a list: valid JSON, but not an entry.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const entry = parsed as Partial<CacheIndexEntry>;
  const weight = (w: unknown) => typeof w === 'number' && Number.isInteger(w) && w >= 1 && w <= 1000;
  const valid =
    typeof entry.url === 'string' &&
    entry.url.startsWith('https://fonts.gstatic.com/') &&
    weight(entry.weightUsed) &&
    typeof entry.fetchedAt === 'number' &&
    Number.isFinite(entry.fetchedAt) &&
    Array.isArray(entry.available) &&
    entry.available.every(weight);
  return valid ? (entry as CacheIndexEntry) : null;
}

async function downloadFont(
  host: FontHost,
  url: string,
  alreadyCached: Uint8Array | null | undefined,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; detail: string }> {
  if (alreadyCached) return { ok: true, bytes: alreadyCached };
  try {
    const res = await host.fetch!(url);
    if (res.status !== 200) return { ok: false, detail: `HTTP ${res.status} for the font file` };
    const bytes = await res.bytes();
    if (!sfntLooksComplete(bytes)) return { ok: false, detail: 'the download was not a complete font file' };
    await host.cache?.put(`font:${url}`, bytes);
    return { ok: true, bytes };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

function makeFont(family: string, weight: number, bytes: Uint8Array, origin: ResolvedFont['origin']): ResolvedFont {
  return {
    id: fontId(family, weight, bytes),
    family,
    weight,
    style: 'normal',
    bytes,
    kind: fontFileKind(bytes) ?? 'ttf',
    origin,
  };
}

function downloadFailed(family: string, detail: string): string {
  return `Couldn't download "${family}" from Google Fonts (${detail}). Try again when you're online, or put the font in a fonts/ folder in your project.`;
}

function notFound(family: string): string {
  const suggestion = closestFamily(family);
  const hint = suggestion ? ` Did you mean "${suggestion}"?` : '';
  return `@font "${family}": no font of that name is installed on this computer or available from Google Fonts.${hint}`;
}

/** A curated family within two edits (ignoring case), for "did you mean". */
function closestFamily(family: string): string | null {
  const target = family.toLowerCase();
  let best: { name: string; distance: number } | null = null;
  for (const { family: name } of CURATED_GOOGLE_FONTS) {
    const d = editDistance(target, name.toLowerCase());
    if (d <= 2 && (!best || d < best.distance)) best = { name, distance: d };
  }
  return best && best.name !== family ? best.name : null;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Where a message points: a directive's line and column. */
type MessageLocation = Pick<SourceLocation, 'line'> & { column?: number };

function at(
  loc: MessageLocation | undefined,
  severity: FontLoadMessage['severity'],
  message: string,
  code?: FontLoadMessage['code'],
): FontLoadMessage {
  return {
    severity,
    message,
    ...(code ? { code } : {}),
    ...(loc?.line != null ? { line: loc.line } : {}),
    ...(loc?.column != null ? { column: loc.column } : {}),
  };
}

/** Every @font that isn't a top-level statement. */
function nestedFontDirectives(program: Program): (SourceLocation | undefined)[] {
  const found: (SourceLocation | undefined)[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as { type?: unknown; loc?: SourceLocation };
    if (record.type === 'FontDirective') found.push(record.loc);
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'loc' && value && typeof value === 'object') visit(value);
    }
  };
  for (const statement of program.body) {
    for (const [key, value] of Object.entries(statement)) {
      if (key !== 'loc' && value && typeof value === 'object') visit(value);
    }
  }
  return found;
}

/** FNV-1a over the name and every 64th byte plus the length: cheap, and stable for identical fonts. */
function fontId(family: string, weight: number, bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h = Math.imul(h ^ n, 0x01000193) >>> 0;
  };
  for (const ch of `${family}:${weight}:${bytes.length}`) mix(ch.charCodeAt(0));
  // Every byte, four at a time (about 10 ms for a 10 MB font, once per load):
  // a font file edited in place at the same size still gets a new id, so no
  // id-keyed cache keeps the old bytes.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const words = Math.floor(bytes.length / 4);
  for (let i = 0; i < words; i++) mix(view.getUint32(i * 4, true));
  for (let i = words * 4; i < bytes.length; i++) mix(bytes[i]);
  return `f${h.toString(36)}`;
}

/**
 * A FontRegistry for compile(). Pass the registry entries of an earlier call
 * as `reuse` (keyed by font id) to keep already-parsed fonts parsed — a large
 * CJK font then isn't re-parsed on every keystroke in an editor.
 */
export function buildFontRegistry(
  fonts: readonly ResolvedFont[],
  reuse?: Map<string, FontData>,
): { registry: FontRegistry; entries: Map<string, FontData> } {
  const registry = createFontRegistry();
  const entries = new Map<string, FontData>();
  for (const font of fonts) {
    const existing = reuse?.get(font.id);
    if (existing) {
      addFontData(registry, existing);
      entries.set(font.id, existing);
      continue;
    }
    const buffer = font.bytes.buffer.slice(
      font.bytes.byteOffset,
      font.bytes.byteOffset + font.bytes.byteLength,
    ) as ArrayBuffer;
    addFont(registry, font.family, font.weight, font.style, buffer);
    const variants = registry.fonts.get(font.family);
    if (variants) entries.set(font.id, variants[variants.length - 1]);
  }
  return { registry, entries };
}
