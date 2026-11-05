import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as nodeModule from 'node:module';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { FontSession } from './font-session';
import { previewModules, samePathKey } from './preview-modules';
import { getWebviewContent } from './webview-html';

import type { DocumentFonts, FontPayload, PathogenLib, PathogenNodeLib } from './font-session';
import type { PreviewLib, PreviewModules, PreviewNodeLib } from './preview-modules';

// Headless webview tests load the page directly (project-docs/modules/verify/).
export { getWebviewContent } from './webview-html';

let current: PreviewPanel | undefined;

/**
 * Open (or focus) the SVG preview panel for the active .pathogen file.
 */
export function openPreview(context: vscode.ExtensionContext): void {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.languageId !== 'pathogen') {
    vscode.window.showWarningMessage('Open a .pathogen file first.');
    return;
  }
  if (current) {
    current.reveal();
    current.show(editor.document);
    return;
  }
  const compilerUri = findBundle(context, 'index.global.js');
  if (!compilerUri) {
    vscode.window.showErrorMessage('Pathogen: Could not find compiler bundle.');
    return;
  }
  current = new PreviewPanel(context, compilerUri, editor.document);
}

/**
 * One preview panel. It shows one document at a time — the active .pathogen
 * editor — and owns every listener it registers, so closing the panel removes
 * them all. Fonts are loaded here, in the extension host, by the same loader
 * and Node host as the CLI; the webview gets each font's bytes once.
 */
class PreviewPanel {
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly fonts: FontSession | null;
  private readonly fontsUnavailable: string | null;
  /** The libraries for reading imports; null when they couldn't be loaded (fontsUnavailable says why). */
  private readonly imports: { lib: PreviewLib; node: PreviewNodeLib } | null;
  /** The files the document on show imports (real paths): a change to one draws it again. */
  private watched = new Set<string>();
  /** An import couldn't be loaded: any .pathogen tab may be the fix (a file it couldn't find), so any edit redraws. */
  private importFailed = false;
  private document: vscode.TextDocument;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  /** The newest push's number: the webview orders updates by it, and only its result is sent. */
  private latest = 0;
  private disposed = false;

  constructor(context: vscode.ExtensionContext, compilerUri: vscode.Uri, document: vscode.TextDocument) {
    this.document = document;
    const libs = loadPathogen(context);
    if (libs instanceof Error) {
      this.fonts = null;
      this.imports = null;
      this.fontsUnavailable = `Fonts and imported files can't be loaded in this preview: ${libs.message} Rebuild the extension with \`npm run build:vscode:install\`.`;
    } else {
      this.imports = libs as unknown as { lib: PreviewLib; node: PreviewNodeLib };
      this.fonts = new FontSession({
        ...libs,
        // The extension doesn't run in Restricted Mode (package.json declares
        // untrustedWorkspaces unsupported); this guards the switch anyway.
        offline: () => (vscode.workspace.isTrusted ? null : 'VS Code Restricted Mode'),
      });
      this.fontsUnavailable = null;
    }

    this.panel = vscode.window.createWebviewPanel(
      'pathogenPreview',
      'Pathogen Preview',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'server'),
          vscode.Uri.joinPath(context.extensionUri, 'compiler'),
        ],
      },
    );
    const panZoomUri = findBundle(context, 'pan-zoom.global.js');
    const { webview } = this.panel;
    // The webview CSP matches the playground iframe's contract — see
    // project-docs/security/iframe-sandbox-rationale.md and docs/security.md.
    webview.html = getWebviewContent(
      webview.asWebviewUri(compilerUri).toString(),
      panZoomUri ? webview.asWebviewUri(panZoomUri).toString() : '',
      webview.cspSource,
      generateNonce(),
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    webview.onDidReceiveMessage((msg: unknown) => this.onMessage(msg), null, this.disposables);
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        // The document on show, or a file it imports (its unsaved text counts):
        // draw it again. Edits to other files never replace it.
        if (e.document.uri.toString() === this.document.uri.toString()) {
          this.document = e.document;
        } else {
          const watched = e.document.uri.scheme === 'file' && this.watched.has(samePathKey(e.document.uri.fsPath));
          if (!watched && !(this.importFailed && e.document.languageId === 'pathogen')) return;
        }
        this.redraw();
      },
      null,
      this.disposables,
    );
    // A .pathogen file changed, created or deleted on disk (in the workspace
    // folders): it may be one the document imports, or one it couldn't find.
    const onDisk = vscode.workspace.createFileSystemWatcher('**/*.pathogen');
    const fromDisk = () => {
      if (this.watched.size > 0 || /\bimport\b/.test(this.document.getText())) this.redraw();
    };
    onDisk.onDidChange(fromDisk, null, this.disposables);
    onDisk.onDidCreate(fromDisk, null, this.disposables);
    onDisk.onDidDelete(fromDisk, null, this.disposables);
    this.disposables.push(onDisk);
    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor?.document.languageId === 'pathogen') this.show(editor.document);
      },
      null,
      this.disposables,
    );
  }

  reveal(): void {
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  /** Draw the document on show again, once a burst of edits settles. */
  private redraw(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.push(this.document), 150);
  }

  show(document: vscode.TextDocument): void {
    this.document = document;
    this.push(document);
  }

  private onMessage(msg: unknown): void {
    if (!msg || typeof msg !== 'object') return;
    const { type } = msg as { type?: unknown };
    if (type === 'ready') {
      // A hidden panel reloads its page and loses its fonts: send them again.
      this.fonts?.forgetDelivered();
      this.push(this.document);
    } else if (type === 'needFonts' && this.fonts) {
      const ids = (msg as { ids?: unknown }).ids;
      if (Array.isArray(ids)) {
        // Always answer, even with nothing: the page then knows the fonts
        // aren't coming and says so, rather than waiting.
        this.post({
          type: 'fonts',
          reply: true,
          fonts: copies(this.fonts.payloads(ids.filter((id): id is string => typeof id === 'string'))),
        }).catch(() => undefined);
      }
    } else if (type === 'displayFonts' && this.fonts) {
      const families = (msg as { families?: unknown }).families;
      if (Array.isArray(families)) {
        this.loadDisplayFonts(families).catch(() => undefined);
      }
    }
  }

  /**
   * Send a document to the webview: its fonts first (only new ones), then the
   * update, numbered so the page never applies an older update over a newer
   * one. Pushes don't wait for each other — a slow download for one file
   * never holds up another — and a push that finishes after a newer one has
   * started is dropped. (Identical font loads share one run in FontSession.)
   */
  private push(document: vscode.TextDocument): void {
    const seq = ++this.latest;
    this.send(document, seq).catch((err: unknown) => {
      console.warn('[pathogen] preview update failed:', err);
    });
  }

  private async send(document: vscode.TextDocument, seq: number): Promise<void> {
    const source = document.getText();
    const filePath = document.uri.scheme === 'file' ? document.uri.fsPath : undefined;
    // The files it imports first: open tabs over the disk (docs/modules.md "In each tool").
    let imported: PreviewModules = { errors: [], notices: [], watched: [] };
    if (this.imports) {
      try {
        imported = await previewModules(this.imports, filePath, source, openBufferText);
      } catch (err) {
        imported = { errors: [`Imported files couldn't be read: ${(err as Error).message}`], notices: [], watched: [] };
      }
    }
    if (this.disposed || seq !== this.latest) return;
    this.watched = new Set(imported.watched.map(samePathKey));
    this.importFailed = imported.errors.length > 0;
    let loaded: DocumentFonts = { fontIds: [], notices: [], errors: [] };
    if (this.fonts) {
      // A first download can take a while: say so rather than look frozen.
      const slow = setTimeout(() => {
        if (seq === this.latest) this.post({ type: 'status', text: 'Loading fonts…' }).catch(() => undefined);
      }, 400);
      try {
        loaded = await this.fonts.load(source, filePath, imported.graph);
      } catch (err) {
        loaded = { fontIds: [], notices: [], errors: [`Fonts couldn't be loaded: ${(err as Error).message}`] };
      } finally {
        clearTimeout(slow);
      }
    } else if (this.fontsUnavailable && /@font\b/.test(source)) {
      loaded = { fontIds: [], notices: [this.fontsUnavailable], errors: [] };
    }
    if (this.disposed || seq !== this.latest) return;
    const fresh = this.fonts?.undelivered(loaded.fontIds) ?? [];
    if (fresh.length > 0) await this.post({ type: 'fonts', fonts: copies(fresh) });
    await this.post({
      type: 'update',
      seq,
      uri: document.uri.toString(),
      source,
      fontIds: loaded.fontIds,
      // A file that couldn't be loaded stops the compile, like a font error.
      notices: [...imported.notices, ...loaded.notices],
      errors: [...imported.errors, ...loaded.errors],
      ...(imported.message ? { modules: imported.message } : {}),
    });
  }

  private async loadDisplayFonts(families: unknown[]): Promise<void> {
    // The session puts weights on the 100–900 grid.
    const wanted = families
      .filter(
        (f): f is { family: string; weight?: unknown } => !!f && typeof (f as { family?: unknown }).family === 'string',
      )
      .map((f) => ({ family: f.family, weight: typeof f.weight === 'number' ? f.weight : 400 }));
    const filePath = this.document.uri.scheme === 'file' ? this.document.uri.fsPath : undefined;
    try {
      const fresh = (await this.fonts?.loadDisplayFonts(wanted, filePath)) ?? [];
      if (fresh.length > 0 && !this.disposed) await this.post({ type: 'fonts', fonts: copies(fresh) });
    } catch (err) {
      // Best effort, as in the playground: the face may still be installed on
      // this computer, and the geometry never depends on it.
      console.warn('[pathogen] display font load failed:', err);
    }
  }

  private async post(message: unknown): Promise<void> {
    if (this.disposed) return;
    await this.panel.webview.postMessage(message);
  }

  private dispose(): void {
    this.disposed = true;
    current = undefined;
    if (this.debounce) clearTimeout(this.debounce);
    for (const d of this.disposables.splice(0)) d.dispose();
  }
}

/** An open tab's text by absolute path, so unsaved edits in an imported file show. */
function openBufferText(absolutePath: string): string | undefined {
  const key = samePathKey(absolutePath);
  const open = vscode.workspace.textDocuments.find(
    (doc) => doc.uri.scheme === 'file' && samePathKey(doc.uri.fsPath) === key,
  );
  return open?.getText();
}

/** Each message gets its own copy of the font bytes, so a send can never empty the session's copy. */
function copies(fonts: FontPayload[]): FontPayload[] {
  return fonts.map((f) => ({ ...f, buffer: f.buffer.slice(0) }));
}

/**
 * The shared loader (`pathogen-lang`) and its Node host (`pathogen-lang/node`):
 * from the .vsix's bundled server/node_modules, or — running from source — the
 * repo's own dist/. An Error says why neither loaded.
 */
function loadPathogen(context: vscode.ExtensionContext): { lib: PathogenLib; node: PathogenNodeLib } | Error {
  const attempts: [string, () => { lib: PathogenLib; node: PathogenNodeLib }][] = [
    [
      'the bundled server/node_modules',
      () => {
        const bundled = nodeModule.createRequire(
          path.join(context.extensionPath, 'server', 'node_modules', '_resolve.js'),
        );
        return { lib: bundled('pathogen-lang'), node: bundled('pathogen-lang/node') };
      },
    ],
    [
      "the repo's dist/",
      () => {
        const dist = path.join(context.extensionPath, '..', '..', 'dist');
        const load = nodeModule.createRequire(path.join(dist, '_resolve.js'));
        return { lib: load(path.join(dist, 'index.cjs')), node: load(path.join(dist, 'node.cjs')) };
      },
    ],
  ];
  const failures: string[] = [];
  for (const [where, attempt] of attempts) {
    try {
      return attempt();
    } catch (err) {
      failures.push(`${where}: ${(err as Error).message}`);
    }
  }
  return new Error(`pathogen-lang could not be loaded (${failures.join('; ')}).`);
}

/**
 * Generate a cryptographic-strength nonce for the webview CSP. Per VS Code
 * webview hardening guidance: a fresh nonce per webview load lets us allow
 * only our own inline glue script while blocking any script that was not
 * generated by us. Uses Node `crypto.randomBytes` for true randomness; a
 * `Math.random`-based generator would be predictable and the nonce label in
 * the CSP would be a lie.
 */
function generateNonce(): string {
  return randomBytes(16).toString('base64').replace(/[+/=]/g, '');
}

/** A webview bundle: the .vsix copy in compiler/, or the repo's dist/ when running from source. */
function findBundle(context: vscode.ExtensionContext, name: string): vscode.Uri | null {
  const bundled = vscode.Uri.joinPath(context.extensionUri, 'compiler', name);
  if (fs.existsSync(bundled.fsPath)) return bundled;
  const dev = vscode.Uri.joinPath(context.extensionUri, '..', '..', 'dist', name);
  if (fs.existsSync(dev.fsPath)) return dev;
  return null;
}
