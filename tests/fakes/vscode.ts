/**
 * A stand-in for the `vscode` module, for driving the extension's VS Code
 * glue (packages/vscode-pathogen/src/preview.ts) in tests: only what that
 * glue uses, with handles (`fake`) to fire VS Code's events and read what the
 * panel posted. vitest.config.ts aliases `vscode` here; nothing ships it.
 */
import { join, sep } from 'node:path';

type Listener<T> = (e: T) => unknown;

export interface Disposable {
  dispose: () => void;
}

export class Emitter<T> {
  readonly listeners = new Set<Listener<T>>();

  readonly event = (listener: Listener<T>, _thisArg?: unknown, disposables?: Disposable[]): Disposable => {
    this.listeners.add(listener);
    const d = { dispose: () => void this.listeners.delete(listener) };
    disposables?.push(d);
    return d;
  };

  fire(e: T): void {
    for (const listener of [...this.listeners]) listener(e);
  }
}

export const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2 } as const;

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly fsPath: string,
    readonly path: string,
  ) {}

  static file(p: string): Uri {
    return new Uri('file', p, p.split(sep).join('/'));
  }

  static untitled(name: string): Uri {
    return new Uri('untitled', name, name);
  }

  static joinPath(base: Uri, ...parts: string[]): Uri {
    return Uri.file(join(base.fsPath, ...parts));
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export interface FakeDocument {
  uri: Uri;
  languageId: string;
  fileName: string;
  text: string;
  getText: () => string;
}

/** A document: a file (an OS path) or an untitled one (a Uri). */
export function document(file: string | Uri, text: string, languageId = 'pathogen'): FakeDocument {
  const uri = typeof file === 'string' ? Uri.file(file) : file;
  const doc: FakeDocument = { uri, languageId, fileName: uri.fsPath, text, getText: () => doc.text };
  return doc;
}

class FakeWatcher {
  readonly changed = new Emitter<Uri>();

  readonly created = new Emitter<Uri>();

  readonly deleted = new Emitter<Uri>();

  readonly onDidChange = this.changed.event;

  readonly onDidCreate = this.created.event;

  readonly onDidDelete = this.deleted.event;

  disposed = false;

  dispose(): void {
    this.disposed = true;
  }
}

export class FakePanel {
  title: string;

  readonly posted: Record<string, unknown>[] = [];

  readonly received = new Emitter<unknown>();

  readonly disposed = new Emitter<void>();

  readonly webview = {
    html: '',
    cspSource: 'vscode-resource:',
    asWebviewUri: (u: Uri) => u,
    postMessage: async (m: Record<string, unknown>) => {
      this.posted.push(m);
      return true;
    },
    onDidReceiveMessage: this.received.event,
  };

  readonly onDidDispose = this.disposed.event;

  constructor(title: string) {
    this.title = title;
  }

  reveal(): void {}

  dispose(): void {
    this.disposed.fire();
  }

  /** The messages posted of one type. */
  of(type: string): Record<string, unknown>[] {
    return this.posted.filter((m) => m.type === type);
  }
}

export const fake = {
  documents: [] as FakeDocument[],
  activeTextEditor: undefined as { document: FakeDocument; viewColumn?: number } | undefined,
  panels: [] as FakePanel[],
  watchers: [] as FakeWatcher[],
  opened: [] as { uri: Uri; options: unknown }[],
  warnings: [] as string[],
  errors: [] as string[],
  activeChanged: new Emitter<{ document: FakeDocument; viewColumn?: number } | undefined>(),
  textChanged: new Emitter<{ document: FakeDocument }>(),
  renamed: new Emitter<{ files: { oldUri: Uri; newUri: Uri }[] }>(),
  /** Settings by full name (`pathogen.maxDataSize`), as getConfiguration reads them. */
  settings: {} as Record<string, unknown>,
  configChanged: new Emitter<{ affectsConfiguration: (section: string) => boolean }>(),
  reset(): void {
    this.documents = [];
    this.activeTextEditor = undefined;
    this.panels = [];
    this.watchers = [];
    this.opened = [];
    this.warnings = [];
    this.errors = [];
    this.settings = {};
  },
};

export const window = {
  get activeTextEditor() {
    return fake.activeTextEditor;
  },
  showWarningMessage: (m: string) => void fake.warnings.push(m),
  showErrorMessage: (m: string) => void fake.errors.push(m),
  showTextDocument: async (uri: Uri, options: unknown) => {
    fake.opened.push({ uri, options });
  },
  createWebviewPanel: (_type: string, title: string) => {
    const panel = new FakePanel(title);
    fake.panels.push(panel);
    return panel;
  },
  onDidChangeActiveTextEditor: fake.activeChanged.event,
};

export const workspace = {
  get textDocuments() {
    return fake.documents;
  },
  isTrusted: true,
  onDidChangeTextDocument: fake.textChanged.event,
  onDidRenameFiles: fake.renamed.event,
  onDidChangeConfiguration: fake.configChanged.event,
  getConfiguration: (section: string): { get: <T>(key: string) => T | undefined } => ({
    get: <T>(key: string): T | undefined => fake.settings[`${section}.${key}`] as T | undefined,
  }),
  createFileSystemWatcher: () => {
    const w = new FakeWatcher();
    fake.watchers.push(w);
    return w;
  },
};
