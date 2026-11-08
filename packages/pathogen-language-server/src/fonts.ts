/**
 * Fonts for diagnostics. The server loads what a document's `@font`
 * directives name with the CLI's loader and Node host, so the Problems panel
 * shows what a real compile would: font problems at their `@font` lines, and
 * every warning and error after a font call (docs/projects.md § In each tool).
 *
 * Diagnostics never wait for the network. A first pass uses local files,
 * installed fonts and the download cache only. When that pass had to skip a
 * download, diagnostics run without font information — as before — while the
 * download happens in the background, and the document is checked again when
 * it lands. The cache is shared with the CLI and the preview, and concurrent
 * downloads of one font share a transfer (src/node), so several open files
 * naming one family download it once.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFontRegistry, ensureOpentype, planFontDirectives, planImports, resolveFontsInFiles } from 'pathogen-lang';
import {
  createNodeFontHost,
  defaultCacheDir,
  findProjectRoot,
  fontDirsFromEnv,
  fontFileStamps,
  loadProjectFile,
  offlineReason,
  projectEntry,
} from 'pathogen-lang/node';

import type {
  DiagnosticsOptions,
  FontData,
  FontLoadMessage,
  FontSourceFile,
  ModuleGraph,
  PlannedFontDirective,
  ResolveFontsResult,
} from 'pathogen-lang';

type FontInfo = NonNullable<DiagnosticsOptions['fonts']>;

export interface Where {
  root: string;
  programDir: string;
  entry: string;
  projectFile: string | null;
}

interface MemoEntry {
  key: string;
  fonts: FontInfo;
  /** Parsed fonts this document uses, by id. */
  entries: Map<string, FontData>;
  /** Reused until then: forever for a clean result, briefly for one with a problem. */
  until: number;
}

/** Shown nowhere: a first-pass result that skipped a download is never published. */
const FIRST_PASS = 'first pass: cached and installed fonts only';
const UNSAVED = 'save the file first: paths in @font start at the file';
/** How long a result with a problem (an error, a font skipped offline, a weight standing in for a failed download) is reused before trying again. */
export const RETRY_AFTER_MS = 10_000;

export class DiagnosticFonts {
  private readonly memo = new Map<string, MemoEntry>();

  /** Background downloads in progress, by key. */
  private readonly downloading = new Set<string>();

  /** Documents closed since they were last checked: a late download must not bring them back. */
  private readonly closed = new Set<string>();

  /** Parsed fonts by id, kept while an open document uses them, so a large font is parsed once. */
  private parsed = new Map<string, FontData>();

  /**
   * `recheck` runs a document's diagnostics again after a background
   * download. `resolve` is the loader call and `now` the clock (both replaced
   * in tests, which never use the network).
   */
  constructor(
    private readonly recheck: (uri: string) => void,
    private readonly resolve: typeof resolveWith = resolveWith,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Font information for a document's diagnostics, or undefined while a
   * download is pending. With `modules`, the files it imports load their
   * `@font` lines too, each from its own folder (docs/modules.md "Fonts in
   * imported files"), as in the CLI.
   */
  async forDocument(uri: string, source: string, modules?: ModuleGraph): Promise<FontInfo | undefined> {
    this.closed.delete(uri);
    const imported: FontSourceFile[] = [];
    for (const projectPath of modules?.order ?? []) {
      const file = modules?.files.get(projectPath);
      if (file?.source.includes('@font')) {
        imported.push({ path: projectPath, source: file.source, label: projectPath.slice(1), imported: true });
      }
    }
    if (!source.includes('@font') && imported.length === 0) return { messages: [] };
    const plan = planFontDirectives(source);
    // A source that doesn't parse: diagnostics report the parse error first.
    if (!plan) return undefined;
    const where = locate(uri.startsWith('file:') ? fileURLToPath(uri) : undefined);
    const envOffline = offlineReason(false);
    const filePaths = (directives: PlannedFontDirective[]) =>
      directives.filter((d) => d.kind === 'file').map((d) => d.source);
    const stamps =
      where.entry === '/<unsaved>'
        ? ''
        : fontFileStamps(where.root, where.entry, filePaths(plan.directives), where.projectFile);
    // An imported file's @font lines and their files are part of the key, so
    // editing one (or adding the font file it names) loads again.
    const importedKey = imported.map((file) => {
      const filePlan = planFontDirectives(file.source);
      return [file.path, filePlan, fontFileStamps(where.root, file.path, filePaths(filePlan?.directives ?? []), null)];
    });
    // A document with imports gets a broken pathogen.json's message from its
    // imports (resolveEditorModules), so it isn't repeated here.
    const reportProjectFile = planImports(source).length === 0;
    const key = JSON.stringify([plan, importedKey, where.root, where.entry, envOffline, stamps, reportProjectFile]);
    const known = this.memo.get(uri);
    if (known?.key === key && this.now() < known.until) return known.fonts;
    // Already downloading for this document: its recheck will come.
    if (this.downloading.has(key)) return undefined;

    const first = await this.resolve(source, where, envOffline ?? FIRST_PASS, imported);
    if (envOffline !== null || !first.downloadsSkipped) {
      return this.remember(uri, key, first, where, reportProjectFile);
    }
    this.downloading.add(key);
    this.resolve(source, where, null, imported)
      .then(async (full) => {
        if (!this.closed.has(uri)) await this.remember(uri, key, full, where, reportProjectFile);
      })
      .catch((err: unknown) => {
        // Past the loader's own messages (which cover a failed download).
        // Remembered like any problem, so the recheck below lands on it
        // instead of starting another download.
        if (this.closed.has(uri)) return;
        const message = `Fonts couldn't be loaded: ${err instanceof Error ? err.message : String(err)}`;
        this.memo.set(uri, {
          key,
          fonts: { messages: [{ severity: 'error', message }] },
          entries: new Map(),
          until: this.now() + RETRY_AFTER_MS,
        });
      })
      .finally(() => {
        this.downloading.delete(key);
        if (!this.closed.has(uri)) this.recheck(uri);
      });
    return undefined;
  }

  /** A closed document's font information, and the fonts only it used, are let go. */
  forget(uri: string): void {
    this.closed.add(uri);
    this.memo.delete(uri);
    this.collectParsed();
  }

  private async remember(
    uri: string,
    key: string,
    result: ResolveFontsResult,
    where: Where,
    reportProjectFile: boolean,
  ): Promise<FontInfo> {
    const messages: FontLoadMessage[] = [...result.messages];
    if (where.projectFile && reportProjectFile) {
      const project = await loadProjectFile(where.projectFile);
      if (!project.ok) messages.unshift({ severity: 'error', message: project.message });
    }
    let fonts: FontInfo = { messages };
    let entries = new Map<string, FontData>();
    if (result.fonts.length > 0) {
      await ensureOpentype();
      const built = buildFontRegistry(result.fonts, this.parsed);
      fonts = { registry: built.registry, messages };
      entries = built.entries;
    }
    // A weight that stood in because the network failed is retried like an error.
    const settled = !result.retryable && !messages.some((m) => m.severity === 'error' || m.code === 'font-load');
    this.memo.set(uri, { key, fonts, entries, until: settled ? Infinity : this.now() + RETRY_AFTER_MS });
    this.collectParsed();
    return fonts;
  }

  /** Keep only the parsed fonts some open document still uses. */
  private collectParsed(): void {
    const kept = new Map<string, FontData>();
    for (const entry of this.memo.values()) {
      for (const [id, data] of entry.entries) kept.set(id, data);
    }
    this.parsed = kept;
  }
}

function locate(filePath: string | undefined): Where {
  if (!filePath) return { root: path.sep, programDir: path.sep, entry: '/<unsaved>', projectFile: null };
  const programDir = path.dirname(filePath);
  const { root, projectFile } = findProjectRoot(programDir);
  // Spelled as on disk: VS Code may hand over `c:\…\POSTERS\…` for `C:\…\posters\…`.
  const entry = projectEntry(root, filePath) ?? `/${path.relative(root, filePath).split(path.sep).join('/')}`;
  return { root, programDir, entry, projectFile };
}

/**
 * Load with the Node host; `offline` is why downloads are off, or null to
 * allow them. `imported` are the files the document imports that have `@font`
 * lines, in load order (resolveFontsInFiles, as the CLI does).
 */
export async function resolveWith(
  source: string,
  where: Where,
  offline: string | null,
  imported: readonly FontSourceFile[] = [],
): Promise<ResolveFontsResult> {
  const host = createNodeFontHost({
    root: where.root,
    programDir: where.programDir,
    offlineReason: offline,
    cacheDir: defaultCacheDir(),
    fontDirs: fontDirsFromEnv(process.env.PATHOGEN_FONT_DIRS),
  });
  // An unsaved document has no folder: its file paths can't be read.
  if (where.entry === '/<unsaved>') {
    host.readFile = async () => ({ ok: false, code: 'unreadable', detail: UNSAVED });
  }
  const entry: FontSourceFile = { path: where.entry, source, label: where.entry.replace(/^\//, '') };
  return resolveFontsInFiles([entry, ...imported], { host });
}
