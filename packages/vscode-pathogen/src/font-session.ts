/**
 * Fonts for the preview. The extension host runs on Node, so it loads what a
 * program's `@font` directives name with the same shared loader and Node host
 * as the CLI (`pathogen-lang` + `pathogen-lang/node`): project files, then
 * installed fonts, then Google Fonts' complete file through the shared cache.
 * The webview gets each font's bytes once and keeps them by id.
 *
 * No `vscode` import: tests drive this with the real library.
 */
import * as path from 'node:path';

/** A font the shared loader resolved (pathogen-lang `ResolvedFont`). */
export interface ResolvedFontLike {
  id: string;
  family: string;
  weight: number;
  style: 'normal';
  bytes: Uint8Array;
  kind: string;
}

/** A loader message (pathogen-lang `FontLoadMessage`). */
export interface FontLoadMessageLike {
  severity: 'error' | 'warning';
  code?: string;
  message: string;
  line?: number;
  column?: number;
  /** An imported file's `@font` line, as a path from the project folder. */
  file?: string;
}

/** The parts of a `ModuleGraph` the session reads: the files a document imports. */
export interface ModuleGraphLike {
  order: readonly string[];
  files: ReadonlyMap<string, { source: string }>;
}

/** One file of a compile (pathogen-lang `FontSourceFile`). */
interface FontSourceFileLike {
  path: string;
  source: string;
  label: string;
  imported?: boolean;
}

/** The parts of a `FontDirectivePlan` the session reads. */
interface PlanLike {
  directives: { source: string; kind: 'file' | 'family' }[];
}

/** What the session needs from `pathogen-lang`. */
export interface PathogenLib {
  planFontDirectives: (source: string) => PlanLike | null;
  resolveFonts: (
    source: string,
    options: { host: unknown; entry: string },
  ) => Promise<{ fonts: ResolvedFontLike[]; messages: FontLoadMessageLike[]; retryable: boolean }>;
  /** A document's import lines: one with imports gets a broken pathogen.json's message from them instead. */
  planImports?: (source: string) => readonly unknown[];
  /** The fonts of every file in a compile, for a document that imports files with `@font`. */
  resolveFontsInFiles?: (
    files: readonly FontSourceFileLike[],
    options: { host: unknown },
  ) => Promise<{ fonts: ResolvedFontLike[]; messages: FontLoadMessageLike[]; retryable: boolean }>;
}

/** What the session needs from `pathogen-lang/node`. */
export interface PathogenNodeLib {
  createNodeFontHost: (options: {
    root: string;
    programDir: string;
    offlineReason: string | null;
    cacheDir: string | null;
    fontDirs?: string[];
  }) => unknown;
  findProjectRoot: (programDir: string) => { root: string; projectFile: string | null };
  projectEntry: (root: string, programFile: string) => string | null;
  loadProjectFile: (projectFile: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  fontFileStamps: (root: string, entry: string, writtenPaths: readonly string[], projectFile: string | null) => string;
  defaultCacheDir: () => string;
  offlineReason: (flag: boolean) => string | null;
  fontDirsFromEnv: (value: string | undefined) => string[];
}

/** One font as the webview receives it. */
export interface FontPayload {
  id: string;
  family: string;
  weight: number;
  style: 'normal';
  kind: string;
  buffer: ArrayBuffer;
}

/** What a document's directives loaded. */
export interface DocumentFonts {
  /** The fonts the program may use, by id: the webview builds its registry from exactly these. */
  fontIds: string[];
  /** Warnings (`font-weight`, `font-load`), as `Line 3, col 1: …`. */
  notices: string[];
  /** Errors. As in the CLI, they stop the compile. */
  errors: string[];
}

export interface FontSessionOptions {
  lib: PathogenLib;
  node: PathogenNodeLib;
  /** An extra reason downloads are off (e.g. an untrusted workspace), or null. PATHOGEN_OFFLINE is read too. */
  offline?: () => string | null;
  /** Milliseconds since the epoch (tests). */
  now?: () => number;
}

const NO_FONTS: DocumentFonts = { fontIds: [], notices: [], errors: [] };
const UNSAVED = 'save the file first: paths in @font start at the file';
/** How long a result with a problem in it is reused before trying again. */
export const RETRY_AFTER_MS = 10_000;

export class FontSession {
  private readonly loaded = new Map<string, FontPayload>();

  private readonly delivered = new Set<string>();

  /** Display fonts already looked up, by `family:weight`: the ids found (none for a miss). */
  private readonly displayed = new Map<string, string[]>();

  private memo?: { key: string; result: DocumentFonts; until: number };

  private readonly inFlight = new Map<string, Promise<DocumentFonts>>();

  constructor(private readonly options: FontSessionOptions) {}

  /**
   * Load the fonts `source` names. `filePath` is the document's file, or
   * undefined for an unsaved one (its file paths can't be read).
   *
   * While typing, a load is reused as long as the directives, the project
   * folder, the download setting and the named files (size and time) stay the
   * same. A result with an error, a skipped download, or a weight that stood
   * in because the network failed is reused for RETRY_AFTER_MS only, so a
   * fixed network or a newly installed font is picked up without hammering.
   * Identical loads in progress share one run.
   */
  async load(source: string, filePath: string | undefined, modules?: ModuleGraphLike): Promise<DocumentFonts> {
    // The files the document imports that have @font lines (docs/modules.md
    // "Fonts in imported files"), in load order, as the CLI loads them.
    const imported: FontSourceFileLike[] = [];
    for (const projectPath of modules?.order ?? []) {
      const file = modules?.files.get(projectPath);
      if (file?.source.includes('@font')) {
        imported.push({ path: projectPath, source: file.source, label: projectPath.slice(1), imported: true });
      }
    }
    if (!source.includes('@font') && imported.length === 0) return NO_FONTS;
    const plan = this.options.lib.planFontDirectives(source);
    // A source that doesn't parse loads nothing; the compile shows the parse error.
    if (plan === null) return NO_FONTS;

    const where = this.locate(filePath);
    const filePaths = (p: PlanLike | null) =>
      (p?.directives ?? []).filter((d) => d.kind === 'file').map((d) => d.source);
    const stamps = where.unsaved
      ? ''
      : this.options.node.fontFileStamps(where.root, where.entry, filePaths(plan), where.projectFile);
    // An imported file's @font lines and their files are part of the key, so
    // editing one (or adding the font file it names) loads again.
    const importedKey = imported.map((file) => {
      const filePlan = this.options.lib.planFontDirectives(file.source);
      return [file.path, filePlan, this.options.node.fontFileStamps(where.root, file.path, filePaths(filePlan), null)];
    });
    // A document with imports gets a broken pathogen.json's message from its
    // imports (previewModules, through resolveEditorModules), so it isn't repeated here.
    const reportProjectFile = (this.options.lib.planImports?.(source).length ?? 0) === 0;
    const key = JSON.stringify([
      plan,
      importedKey,
      where.root,
      where.entry,
      this.offlineReason(),
      stamps,
      reportProjectFile,
    ]);
    const now = this.options.now?.() ?? Date.now();
    if (this.memo?.key === key && now < this.memo.until) return this.memo.result;

    const running = this.inFlight.get(key);
    if (running) return running;
    const run = this.run(source, where, key, imported, reportProjectFile).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  private async run(
    source: string,
    where: Where,
    key: string,
    imported: FontSourceFileLike[],
    reportProjectFile: boolean,
  ): Promise<DocumentFonts> {
    const errors: string[] = [];
    if (where.projectFile && reportProjectFile) {
      const project = await this.options.node.loadProjectFile(where.projectFile);
      if (!project.ok) errors.push(project.message);
    }
    const { lib } = this.options;
    const host = this.host(where);
    const { fonts, messages, retryable } =
      imported.length > 0 && lib.resolveFontsInFiles
        ? await lib.resolveFontsInFiles(
            [{ path: where.entry, source, label: where.entry.replace(/^\//, '') }, ...imported],
            { host },
          )
        : await lib.resolveFonts(source, { host, entry: where.entry });
    for (const font of fonts) this.remember(font);
    const result: DocumentFonts = {
      fontIds: fonts.map((f) => f.id),
      notices: messages.filter((m) => m.severity === 'warning').map(positioned),
      errors: [...errors, ...messages.filter((m) => m.severity === 'error').map(positioned)],
    };
    const settled = result.errors.length === 0 && !retryable && !messages.some((m) => m.code === 'font-load');
    const now = this.options.now?.() ?? Date.now();
    this.memo = { key, result, until: settled ? Infinity : now + RETRY_AFTER_MS };
    return result;
  }

  /**
   * Fonts for `<text>` that names a family only in a style block (no
   * `@font`), as the playground loads them: curated Google families, local
   * copies first. Each family and weight is looked up once; a miss is silent,
   * since the webview may still find the font installed on the computer. A
   * webview that reloaded asks again and gets the same fonts back.
   */
  async loadDisplayFonts(
    families: readonly { family: string; weight?: number }[],
    filePath: string | undefined,
  ): Promise<FontPayload[]> {
    const keyOf = (f: { family: string; weight?: number }) => `${f.family}:${clampWeight(f.weight)}`;
    const fresh = families.filter((f) => !this.displayed.has(keyOf(f)));
    if (fresh.length > 0) {
      for (const f of fresh) this.displayed.set(keyOf(f), []);
      const source = fresh.map((f) => `@font ${JSON.stringify(f.family)} ${clampWeight(f.weight)};`).join('\n');
      const where = this.locate(filePath);
      const { fonts } = await this.options.lib.resolveFonts(source, { host: this.host(where), entry: where.entry });
      for (const font of fonts) {
        this.remember(font);
        this.displayed.get(`${font.family}:${font.weight}`)?.push(font.id);
      }
    }
    return this.undelivered(families.flatMap((f) => this.displayed.get(keyOf(f)) ?? []));
  }

  /** Fonts among `ids` the webview doesn't hold yet; from here on they count as delivered. */
  undelivered(ids: readonly string[]): FontPayload[] {
    const out: FontPayload[] = [];
    for (const id of new Set(ids)) {
      const font = this.loaded.get(id);
      if (!font || this.delivered.has(id)) continue;
      this.delivered.add(id);
      out.push(font);
    }
    return out;
  }

  /** Fonts by id, delivered or not, for a webview that asks again. */
  payloads(ids: readonly string[]): FontPayload[] {
    const out: FontPayload[] = [];
    for (const id of new Set(ids)) {
      const font = this.loaded.get(id);
      if (font) {
        this.delivered.add(id);
        out.push(font);
      }
    }
    return out;
  }

  /** The webview reloaded (the panel was hidden and shown again) and holds no fonts. */
  forgetDelivered(): void {
    this.delivered.clear();
  }

  private remember(font: ResolvedFontLike): void {
    if (this.loaded.has(font.id)) return;
    const { bytes } = font;
    this.loaded.set(font.id, {
      id: font.id,
      family: font.family,
      weight: font.weight,
      style: font.style,
      kind: font.kind,
      buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    });
  }

  private offlineReason(): string | null {
    return this.options.offline?.() ?? this.options.node.offlineReason(false);
  }

  /** The project folder and the program's project path (docs/projects.md § In each tool). */
  private locate(filePath: string | undefined): Where {
    if (!filePath) {
      return { root: '', programDir: '', entry: '/<unsaved>', projectFile: null, unsaved: true };
    }
    const programDir = path.dirname(filePath);
    const { root, projectFile } = this.options.node.findProjectRoot(programDir);
    // Spelled as on disk: VS Code may hand over `c:\…\POSTERS\…` for `C:\…\posters\…`.
    const entry =
      this.options.node.projectEntry(root, filePath) ?? `/${path.relative(root, filePath).split(path.sep).join('/')}`;
    return { root, programDir, entry, projectFile, unsaved: false };
  }

  private host(where: Where): unknown {
    const { node } = this.options;
    const host = node.createNodeFontHost({
      root: where.root || path.sep,
      programDir: where.programDir || path.sep,
      offlineReason: this.offlineReason(),
      cacheDir: node.defaultCacheDir(),
      fontDirs: node.fontDirsFromEnv(process.env.PATHOGEN_FONT_DIRS),
    }) as { readFile: (p: string) => Promise<unknown> };
    // An unsaved document has no folder: its file paths can't be read.
    if (where.unsaved) host.readFile = async () => ({ ok: false, code: 'unreadable', detail: UNSAVED });
    return host;
  }
}

interface Where {
  root: string;
  programDir: string;
  entry: string;
  projectFile: string | null;
  unsaved: boolean;
}

/** A display weight on the 100–900 grid: a program can't drive a lookup per odd weight. */
function clampWeight(weight: number | undefined): number {
  const w = typeof weight === 'number' && Number.isFinite(weight) ? weight : 400;
  return Math.min(900, Math.max(100, Math.round(w / 100) * 100));
}

function positioned(m: FontLoadMessageLike): string {
  const column = m.column !== undefined ? `, col ${m.column}` : '';
  // An imported file's message names it, as an error from another file does.
  if (m.file !== undefined) return `${m.file}${m.line === undefined ? '' : ` line ${m.line}${column}`}: ${m.message}`;
  if (m.line === undefined) return m.message;
  return `Line ${m.line}${column}: ${m.message}`;
}
