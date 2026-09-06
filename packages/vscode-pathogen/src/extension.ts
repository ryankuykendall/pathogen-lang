import * as path from 'path';
import * as fs from 'fs';
import * as nodeModule from 'module';
import * as vscode from 'vscode';
import { openPreview } from './preview';

let client: any;

export function activate(context: vscode.ExtensionContext): void {
  // Register preview command
  const previewCommand = vscode.commands.registerCommand(
    'pathogen.openPreview',
    () => openPreview(context),
  );
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
  const bundledServer = context.asAbsolutePath(
    path.join('server', 'out', 'server.js'),
  );
  const devServer = context.asAbsolutePath(
    path.join('..', 'pathogen-language-server', 'out', 'server.js'),
  );
  const serverModule = fs.existsSync(bundledServer) ? bundledServer : devServer;

  const serverOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: { module: serverModule, transport: TransportKind.stdio },
  };

  const clientOptions = {
    documentSelector: [{ scheme: 'file', language: 'pathogen' }],
  };

  client = new LanguageClient(
    'pathogenLanguageServer',
    'Pathogen Language Server',
    serverOptions,
    clientOptions,
  );

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
