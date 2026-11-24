import * as path from 'path';
import * as fs from 'fs';
import * as nodeModule from 'module';
import * as vscode from 'vscode';
import { IMPORTABLE_FILES_GLOB, isDataFile } from './data-files';
import { openPreview } from './preview';

let client: any;

/** The `pathogen.maxDataSize` setting in megabytes, or null when it isn't a whole number from 1. */
function maxDataSizeSetting(): number | null {
  const megabytes = vscode.workspace.getConfiguration('pathogen').get<number>('maxDataSize');
  return typeof megabytes === 'number' && Number.isInteger(megabytes) && megabytes >= 1 ? megabytes : null;
}

/**
 * The text of open data files, for the server (docs/data-import.md "In each
 * tool": editing a data file "rechecks the open files that import it"). Data
 * files aren't the server's documents, so it gives them no hover or
 * diagnostics of its own: it only reads them, for the files that import
 * them. Sent as they change, a moment after typing stops, and taken back when
 * closed (the file on disk counts again). The setting goes the same way.
 * Notification names match packages/pathogen-language-server/src/server.ts.
 */
function sendDataFiles(context: vscode.ExtensionContext): void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const send = (doc: vscode.TextDocument, open: boolean): void => {
    if (doc.uri.scheme !== 'file' || !isDataFile(doc.uri.fsPath)) return;
    const uri = doc.uri.toString();
    const pending = timers.get(uri);
    if (pending) clearTimeout(pending);
    timers.delete(uri);
    if (!open) {
      client.sendNotification('pathogen/dataFile', { uri, text: null });
      return;
    }
    // A pause after typing, longer for a large file (whose whole text crosses
    // to the server): 150 ms, and 100 ms more for each MB, at most 2 s.
    const pause = Math.min(2000, 150 + Math.floor(doc.getText().length / 10_000));
    timers.set(
      uri,
      setTimeout(() => {
        timers.delete(uri);
        client.sendNotification('pathogen/dataFile', { uri, text: doc.getText() });
      }, pause),
    );
  };
  vscode.workspace.textDocuments.forEach((doc) => send(doc, true));
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => send(doc, true)),
    vscode.workspace.onDidChangeTextDocument((e) => send(e.document, true)),
    vscode.workspace.onDidCloseTextDocument((doc) => send(doc, false)),
  );
}

export function activate(context: vscode.ExtensionContext): void {
  // Register preview command
  const previewCommand = vscode.commands.registerCommand('pathogen.openPreview', () => openPreview(context));
  context.subscriptions.push(previewCommand);
  // Resolve vscode-languageclient from bundled server/node_modules
  // when installed from .vsix (vsce --no-dependencies strips the ext's own node_modules)
  let lc: any;
  let loadError: unknown;
  try {
    lc = require('vscode-languageclient/node');
  } catch (err) {
    // Fallback: resolve from the bundled server/node_modules (build-vscode-extension.ts
    // installs vscode-languageclient there because vsce --no-dependencies strips
    // the extension's own module directory).
    const bundledModules = path.join(context.extensionPath, 'server', 'node_modules');
    try {
      const serverRequire = nodeModule.createRequire(path.join(bundledModules, '_resolve.js'));
      lc = serverRequire('vscode-languageclient/node');
    } catch (fallbackErr) {
      loadError = fallbackErr ?? err;
    }
  }

  if (!lc) {
    const detail = loadError instanceof Error ? loadError.message : String(loadError ?? 'unknown error');
    vscode.window.showErrorMessage(
      `Pathogen: could not load vscode-languageclient, so completions, hover and diagnostics are unavailable. ` +
        `Rebuild the extension with \`npm run build:vscode:install\`. (${detail})`,
    );
    return;
  }

  const { LanguageClient, TransportKind } = lc;

  // Path to the language server module — check bundled location first, then dev
  const bundledServer = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
  const devServer = context.asAbsolutePath(path.join('..', 'pathogen-language-server', 'out', 'server.js'));
  const serverModule = fs.existsSync(bundledServer) ? bundledServer : devServer;

  const serverOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: { module: serverModule, transport: TransportKind.stdio },
  };

  // Files other documents import (modules and data files), and pathogen.json,
  // created, changed or deleted on disk: the server checks the open documents
  // again (docs/modules.md and docs/data-import.md "In each tool"). It watches
  // the workspace folders.
  const fileWatcher = vscode.workspace.createFileSystemWatcher(IMPORTABLE_FILES_GLOB);
  context.subscriptions.push(fileWatcher);

  const clientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'pathogen' },
      // An unsaved file is checked too; its imports say to save it first.
      { scheme: 'untitled', language: 'pathogen' },
    ],
    synchronize: { fileEvents: fileWatcher },
    initializationOptions: { maxDataSize: maxDataSizeSetting() },
  };

  client = new LanguageClient('pathogenLanguageServer', 'Pathogen Language Server', serverOptions, clientOptions);

  // The setting, from before the server is up: a change while it starts is
  // sent once it has, along with the value then.
  let started = false;
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (started && e.affectsConfiguration('pathogen.maxDataSize')) {
        client.sendNotification('pathogen/settings', { maxDataSize: maxDataSizeSetting() });
      }
    }),
  );
  client.start().then(
    () => {
      started = true;
      client.sendNotification('pathogen/settings', { maxDataSize: maxDataSizeSetting() });
      sendDataFiles(context);
    },
    (err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(
        `Pathogen: the language server didn't start, so hover, completion and diagnostics are unavailable. (${detail})`,
      );
    },
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
