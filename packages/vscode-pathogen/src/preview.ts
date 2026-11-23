import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as nodeModule from 'node:module';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { FontSession } from './font-session';
import { ProgramDrawings } from './preview-drawings';
import { previewModules, samePathKey } from './preview-modules';
import { chipAlert, ProgramChoices, programRows, projectPath, readProject } from './preview-programs';
import { DrawingThread } from './programs-thread';
import { getWebviewContent } from './webview-html';

import type { DocumentFonts, FontPayload, PathogenLib, PathogenNodeLib } from './font-session';
import type { PreviewLib, PreviewModules, PreviewNodeLib } from './preview-modules';
import type { Project, ProgramsLibs, Shown, Texts } from './preview-programs';
import type { WorkerLibraryPaths } from './programs-worker';

// Headless webview tests load the page directly (project-docs/modules/verify/).
export { getWebviewContent } from './webview-html';

let current: PreviewPanel | undefined;

/**
 * Open (or focus) the SVG preview panel from the active .pathogen file's tab
 * (its preview button, or the command). In a project with a main, that
 * chooses what's shown (docs/projects.md "The preview in VS Code").
 */
export function openPreview(context: vscode.ExtensionContext): void {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.languageId !== 'pathogen') {
    vscode.window.showWarningMessage('Open a .pathogen file first.');
    return;
  }
  if (current) {
    current.reveal();
    current.pressed(editor.document, editor.viewColumn);
    return;
  }
  const compilerUri = findBundle(context, 'index.global.js');
  if (!compilerUri) {
    vscode.window.showErrorMessage('Pathogen: Could not find compiler bundle.');
    return;
  }
  current = new PreviewPanel(context, compilerUri, editor.document, editor.viewColumn);
}

/**
 * One preview panel, and every listener it registers, so closing the panel
 * removes them all. Fonts are loaded here, in the extension host, by the same
 * loader and Node host as the CLI; the webview gets each font's bytes once.
 *
 * What it shows (2f; docs/projects.md "The preview in VS Code"): in a project
 * with a main, the program chosen in that project, the main at first, while
 * you move between the project's files (ProgramChoices), with the program list
 * behind the chip; anywhere else, the file you're editing. The other
 * programs in the list are drawn small on a thread of their own
 * (ProgramDrawings, DrawingThread).
 */
class PreviewPanel {
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly fonts: FontSession | null;
  private readonly fontsUnavailable: string | null;
  /** The libraries for reading imports; null when they couldn't be loaded (fontsUnavailable says why). */
  private readonly imports: { lib: PreviewLib; node: PreviewNodeLib } | null;
  /** The libraries for projects and their mains; null when they couldn't be loaded. */
  private readonly programLibs: ProgramsLibs | null;
  private readonly texts: Texts;
  private readonly choices: ProgramChoices | null;
  private readonly drawings: ProgramDrawings | null;
  private readonly thread: DrawingThread | null;
  /** The files the program on show imports (real paths): a change to one draws it again. */
  private watched = new Set<string>();
  /** An import couldn't be loaded: any .pathogen tab may be the fix (a file it couldn't find), so any edit redraws. */
  private importFailed = false;
  /** The .pathogen file last active in an editor. */
  private active: vscode.TextDocument;
  /** The column of the editor it was in, where Open in the editor opens a file. */
  private editorColumn: vscode.ViewColumn | undefined;
  /** The project with a main the active file belongs to, or null. */
  private project: Project | null = null;
  private shown: Shown = { kind: 'file' };
  /** What `shown` is, as a string: a change of it draws the preview again. */
  private shownKey = '';
  /** The program list as last sent: its project paths' OS paths, for what the page asks. */
  private listed = new Map<string, string>();
  private listedFiles: string[] = [];
  /** `listedFiles` as path keys, and the main that can't be shown, to tell when the programs to draw change. */
  private listedKeys = '';
  /** The programs to draw small: the list's, but a main that can't be shown. */
  private drawable: string[] = [];
  private listSignature = '';
  private listOpen = false;
  /** The page has loaded: an update now reaches it. */
  private ready = false;
  /** What's shown has been worked out once: before that, the page is sent nothing. */
  private decided = false;
  private refreshing: Promise<void> = Promise.resolve();
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private pendingRedraw = false;
  /** The newest push's number: the webview orders updates by it, and only its result is sent. */
  private latest = 0;
  private disposed = false;

  constructor(
    context: vscode.ExtensionContext,
    compilerUri: vscode.Uri,
    document: vscode.TextDocument,
    column: vscode.ViewColumn | undefined,
  ) {
    this.active = document;
    this.editorColumn = column;
    this.texts = {
      open: openBufferText,
      read: (file) => {
        const open = openBufferText(file);
        if (open !== undefined) return open;
        try {
          return fs.readFileSync(file, 'utf8');
        } catch {
          return undefined;
        }
      },
    };
    const libs = loadPathogen(context);
    if (libs instanceof Error) {
      this.fonts = null;
      this.imports = null;
      this.programLibs = null;
      this.choices = null;
      this.drawings = null;
      this.thread = null;
      this.fontsUnavailable = `Fonts and imported files can't be loaded in this preview: ${libs.message} Rebuild the extension with \`npm run build:vscode:install\`.`;
    } else {
      this.imports = libs as unknown as { lib: PreviewLib; node: PreviewNodeLib };
      this.programLibs = libs as unknown as ProgramsLibs;
      this.fonts = new FontSession({
        ...libs,
        // The extension doesn't run in Restricted Mode (package.json declares
        // untrustedWorkspaces unsupported); this guards the switch anyway.
        offline: () => (vscode.workspace.isTrusted ? null : 'VS Code Restricted Mode'),
      });
      this.fontsUnavailable = null;
      this.choices = new ProgramChoices(this.programLibs.lib.isModuleSource, this.texts);
      this.thread = new DrawingThread(path.join(__dirname, 'programs-worker.js'), libs.paths);
      const thread = this.thread;
      this.drawings = new ProgramDrawings({
        draw: (program, open) => thread.draw(program, open),
        cancel: () => thread.cancel(),
        openTexts: () =>
          vscode.workspace.textDocuments
            .filter((doc) => doc.uri.scheme === 'file' && doc.languageId === 'pathogen')
            .map((doc): [string, string] => [doc.uri.fsPath, doc.getText()]),
        programs: () => this.drawable,
        shown: () => (this.shown.kind === 'program' ? this.shown.path : null),
        listOpen: () => this.listOpen,
        changed: () => this.postPrograms(),
      });
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
        const doc = e.document;
        if (doc.languageId !== 'pathogen') return;
        if (doc.uri.scheme === 'file') this.drawings?.touched(doc.uri.fsPath);
        // The program on show, or a file it imports (its unsaved text counts):
        // draw it again. An edit elsewhere may still change the list (a
        // program that became a module), so the list is read again either way.
        const watched = doc.uri.scheme === 'file' && this.watched.has(samePathKey(doc.uri.fsPath));
        this.scheduleRefresh(this.isShown(doc) || watched || this.importFailed);
      },
      null,
      this.disposables,
    );
    // A .pathogen file changed, created or deleted on disk (in the workspace
    // folders): it may be one the program imports, one it couldn't find, the
    // program shown, or one in the list. A pathogen.json too: it may name
    // another main, and a broken one stops a program that uses import or
    // @font (docs/projects.md "In each tool"). Read from disk, so only a
    // saved change counts.
    const onDisk = vscode.workspace.createFileSystemWatcher('**/{*.pathogen,pathogen.json}');
    const fromDisk = (changed: vscode.Uri) => {
      const isProjectFile = changed.path.endsWith('/pathogen.json');
      this.drawings?.touched(isProjectFile ? null : changed.fsPath);
      const shownFile = this.shownFile();
      const isShown = shownFile !== undefined && samePathKey(changed.fsPath) === samePathKey(shownFile);
      const uses = isProjectFile ? /\bimport\b|@font\b/ : /\bimport\b/;
      this.scheduleRefresh(isProjectFile || isShown || this.watched.size > 0 || uses.test(this.shownSource()));
    };
    onDisk.onDidChange(fromDisk, null, this.disposables);
    onDisk.onDidCreate(fromDisk, null, this.disposables);
    onDisk.onDidDelete(fromDisk, null, this.disposables);
    this.disposables.push(onDisk);
    // Renamed or moved in VS Code: the program chosen follows it. (Outside
    // VS Code, the watcher sees a delete, and the preview goes back to the main.)
    vscode.workspace.onDidRenameFiles(
      (e) => {
        for (const { oldUri, newUri } of e.files) {
          if (oldUri.scheme !== 'file' || newUri.scheme !== 'file') continue;
          this.choices?.renamed(oldUri.fsPath, newUri.fsPath);
          this.drawings?.touched(oldUri.fsPath);
          this.drawings?.touched(newUri.fsPath);
        }
        this.scheduleRefresh(true);
      },
      null,
      this.disposables,
    );
    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        if (editor?.document.languageId !== 'pathogen') return;
        this.active = editor.document;
        this.editorColumn = editor.viewColumn;
        this.refresh({});
      },
      null,
      this.disposables,
    );
    this.refresh({ pressed: document });
  }

  reveal(): void {
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  /** The preview button (or the command) from `document`'s tab: in a project with a main, it chooses a program. */
  pressed(document: vscode.TextDocument, column: vscode.ViewColumn | undefined): void {
    this.active = document;
    this.editorColumn = column;
    this.refresh({ pressed: document });
  }

  /** Read the project and draw again, once a burst of edits settles. */
  private scheduleRefresh(redraw: boolean): void {
    this.pendingRedraw ||= redraw;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      const redrawNow = this.pendingRedraw;
      this.pendingRedraw = false;
      this.refresh({ redraw: redrawNow });
    }, 150);
  }

  /**
   * Work out what's shown, one refresh at a time (each reads the project,
   * which may have changed). `pressed`: the document whose tab's preview
   * button (or the command) asked, which chooses a program in its project.
   */
  private refresh(options: { pressed?: vscode.TextDocument; redraw?: boolean }): void {
    this.refreshing = this.refreshing
      .then(() => this.decide(options))
      .catch((err: unknown) => console.warn('[pathogen] preview refresh failed:', err));
  }

  /** A document's project with a main, or null (none, an untitled document, or the library not loaded). */
  private async projectOf(doc: vscode.TextDocument): Promise<Project | null> {
    if (doc.uri.scheme !== 'file' || !this.programLibs) return null;
    try {
      return await readProject(doc.uri.fsPath, this.programLibs, this.texts);
    } catch (err) {
      console.warn('[pathogen] project not read:', err);
      return null;
    }
  }

  private async decide({
    pressed,
    redraw = false,
  }: {
    pressed?: vscode.TextDocument;
    redraw?: boolean;
  }): Promise<void> {
    if (this.disposed) return;
    const active = this.active;
    const fileOf = (doc: vscode.TextDocument) => (doc.uri.scheme === 'file' ? doc.uri.fsPath : null);
    const project = await this.projectOf(active);
    // Pressed on a tab you've left since: its choice still counts, in its own project.
    if (pressed !== undefined && pressed !== active) {
      this.choices?.show(fileOf(pressed), pressed.getText(), await this.projectOf(pressed), true);
    }
    if (this.disposed) return;
    const shown = this.choices?.show(fileOf(active), active.getText(), project, pressed === active) ?? {
      kind: 'file',
    };
    const key =
      shown.kind === 'file'
        ? `file:${active.uri.toString()}`
        : shown.kind === 'program'
          ? `program:${samePathKey(shown.path)}`
          : `problem:${shown.project.key}:${shown.message}`;
    const changed = key !== this.shownKey;
    this.project = project;
    this.shown = shown;
    this.shownKey = key;
    this.decided = true;
    this.panel.title = this.title();
    if (changed || redraw || pressed !== undefined) this.push();
    this.postPrograms();
  }

  /** The panel's title names what it shows: "Preview poster.pathogen". */
  private title(): string {
    const shown = this.shown;
    if (shown.kind === 'program') return `Preview ${path.basename(shown.path)}`;
    if (shown.kind === 'problem')
      return shown.project.main ? `Preview ${path.basename(shown.project.main)}` : 'Pathogen Preview';
    const name = this.active.uri.scheme === 'file' ? path.basename(this.active.uri.fsPath) : this.active.fileName;
    return `Preview ${path.basename(name)}`;
  }

  /** Whether `doc` is the file on show. */
  private isShown(doc: vscode.TextDocument): boolean {
    if (this.shown.kind === 'file') return doc.uri.toString() === this.active.uri.toString();
    if (this.shown.kind === 'program')
      return doc.uri.scheme === 'file' && samePathKey(doc.uri.fsPath) === samePathKey(this.shown.path);
    return false;
  }

  /** The OS path of the file on show; undefined for an unsaved document or a main that can't be shown. */
  private shownFile(): string | undefined {
    if (this.shown.kind === 'program') return this.shown.path;
    if (this.shown.kind === 'file' && this.active.uri.scheme === 'file') return this.active.uri.fsPath;
    return undefined;
  }

  /** The text on show: an open tab's (unsaved edits count), else the disk's. */
  private shownSource(): string {
    if (this.shown.kind === 'file') return this.active.getText();
    if (this.shown.kind === 'program') return this.texts.read(this.shown.path) ?? '';
    return '';
  }

  private onMessage(msg: unknown): void {
    if (!msg || typeof msg !== 'object') return;
    const { type } = msg as { type?: unknown };
    if (type === 'ready') {
      // A hidden panel reloads its page and loses its fonts and its list: send them again.
      this.ready = true;
      this.fonts?.forgetDelivered();
      this.listSignature = '';
      // Before the first refresh has worked out what's shown, there's nothing
      // to send yet: that refresh sends it, so the page never draws the wrong file first.
      if (this.decided) {
        this.push();
        this.postPrograms();
      }
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
    } else if (type === 'showProgram' || type === 'openFile') {
      // Only a program of the list the page was last sent.
      const asked = (msg as { path?: unknown }).path;
      const file = typeof asked === 'string' ? this.listed.get(asked) : undefined;
      if (file === undefined || this.project === null) return;
      if (type === 'showProgram') {
        this.choices?.choose(this.project, file);
        this.refresh({});
      } else {
        // Its tab, without changing what's shown (switching tabs never does).
        vscode.window
          .showTextDocument(vscode.Uri.file(file), {
            viewColumn: this.editorColumn ?? vscode.ViewColumn.One,
            preview: false,
          })
          .then(undefined, (err: unknown) =>
            vscode.window.showErrorMessage(`Pathogen: Could not open ${asked}: ${String(err)}`),
          );
      }
    } else if (type === 'programList') {
      this.listOpen = (msg as { open?: unknown }).open === true;
      if (this.listOpen) this.drawings?.listOpened();
    }
  }

  /**
   * The program list for the chip: none outside a project with a main (the
   * chip hides), else its rows. Sent only when it changed.
   */
  private postPrograms(): void {
    if (this.disposed) return;
    const project = this.project;
    let message: unknown;
    if (project === null || this.choices === null) {
      this.listed = new Map();
      // Out of the project: its draws stop, and its rows are forgotten.
      if (this.listedFiles.length > 0) {
        this.listedFiles = [];
        this.listedKeys = '';
        this.drawable = [];
        this.drawings?.listChanged();
      }
      message = { type: 'programs', items: [], shown: null, editing: null, alert: null };
    } else {
      const active = this.active;
      const editingFile = active.uri.scheme === 'file' ? active.uri.fsPath : null;
      const isModule = this.programLibs?.lib.isModuleSource(active.getText()) ?? false;
      const shownFile = this.shown.kind === 'program' ? this.shown.path : null;
      const { items, files } = programRows(project, shownFile, editingFile, isModule ? null : editingFile, (f) =>
        this.drawings?.row(f),
      );
      this.listed = new Map(items.map((item, i) => [item.path, files[i]]));
      this.listedFiles = files;
      const keys = files.map(samePathKey);
      const unshowable = project.mainProblem && project.main ? samePathKey(project.main) : '';
      const signature = [...keys, unshowable].join('\n');
      if (signature !== this.listedKeys) {
        this.listedKeys = signature;
        this.drawable = files.filter((_, i) => keys[i] !== unshowable);
        this.drawings?.listChanged();
      }
      // The main that can't be shown is the one on show: its row has the check.
      const onShow = shownFile ?? (this.shown.kind === 'problem' ? project.main : null);
      const shownPath = onShow === null ? null : projectPath(project.root, onShow);
      const editing = editingFile === null ? null : projectPath(project.root, editingFile);
      message = { type: 'programs', items, shown: shownPath, editing, alert: chipAlert(items, shownPath) };
    }
    const signature = JSON.stringify(message);
    if (signature === this.listSignature) return;
    this.listSignature = signature;
    this.post(message).catch(() => undefined);
  }

  /**
   * Send what's shown to the webview: its fonts first (only new ones), then
   * the update, numbered so the page never applies an older update over a
   * newer one. Pushes don't wait for each other — a slow download for one
   * file never holds up another — and a push that finishes after a newer one
   * has started is dropped. (Identical font loads share one run in FontSession.)
   */
  private push(): void {
    const seq = ++this.latest;
    const shown = this.shown;
    let target: { uri: string; filePath?: string; source: string; problem?: string };
    if (shown.kind === 'file') {
      const doc = this.active;
      target = {
        uri: doc.uri.toString(),
        filePath: doc.uri.scheme === 'file' ? doc.uri.fsPath : undefined,
        source: doc.getText(),
      };
    } else if (shown.kind === 'program') {
      const source = this.texts.read(shown.path);
      target =
        source === undefined
          ? { uri: vscode.Uri.file(shown.path).toString(), source: '', problem: `${shown.path} could not be read.` }
          : { uri: vscode.Uri.file(shown.path).toString(), filePath: shown.path, source };
    } else {
      target = { uri: `problem:${shown.project.key}`, source: '', problem: shown.message };
    }
    this.send(target, seq).then(
      () => {
        // The preview has its program: the others may be drawn now.
        if (this.ready && seq === this.latest) this.drawings?.start();
      },
      (err: unknown) => console.warn('[pathogen] preview update failed:', err),
    );
  }

  private async send(
    target: { uri: string; filePath?: string; source: string; problem?: string },
    seq: number,
  ): Promise<void> {
    if (target.problem !== undefined) {
      // The main can't be shown: the CLI's message, where a compile error shows.
      this.watched = new Set();
      this.importFailed = false;
      await this.post({
        type: 'update',
        seq,
        uri: target.uri,
        source: '',
        fontIds: [],
        notices: [],
        errors: [target.problem],
      });
      return;
    }
    const { source, filePath } = target;
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
      uri: target.uri,
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
    try {
      const fresh = (await this.fonts?.loadDisplayFonts(wanted, this.shownFile())) ?? [];
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
    this.drawings?.dispose();
    this.thread?.dispose();
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
 * repo's own dist/. `paths` are the files loaded, for the preview's drawing
 * thread to load the same ones. An Error says why neither loaded.
 */
function loadPathogen(
  context: vscode.ExtensionContext,
): { lib: PathogenLib; node: PathogenNodeLib; paths: WorkerLibraryPaths } | Error {
  const attempts: [string, () => WorkerLibraryPaths][] = [
    [
      'the bundled server/node_modules',
      () => {
        const bundled = nodeModule.createRequire(
          path.join(context.extensionPath, 'server', 'node_modules', '_resolve.js'),
        );
        return { lib: bundled.resolve('pathogen-lang'), node: bundled.resolve('pathogen-lang/node') };
      },
    ],
    [
      "the repo's dist/",
      () => {
        const dist = path.join(context.extensionPath, '..', '..', 'dist');
        const load = nodeModule.createRequire(path.join(dist, '_resolve.js'));
        return { lib: load.resolve(path.join(dist, 'index.cjs')), node: load.resolve(path.join(dist, 'node.cjs')) };
      },
    ],
  ];
  const failures: string[] = [];
  const load = nodeModule.createRequire(__filename);
  for (const [where, attempt] of attempts) {
    try {
      const paths = attempt();
      return { lib: load(paths.lib), node: load(paths.node), paths };
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
