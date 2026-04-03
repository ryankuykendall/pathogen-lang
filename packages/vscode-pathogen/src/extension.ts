import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { openPreview } from './preview';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext): void {
  // Path to the language server module
  const serverModule = context.asAbsolutePath(
    path.join('..', 'pathogen-language-server', 'out', 'server.js'),
  );

  // Server runs in a separate Node process via stdio
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: { module: serverModule, transport: TransportKind.stdio },
  };

  // Register the client for .pathogen files
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'pathogen' }],
  };

  client = new LanguageClient(
    'pathogenLanguageServer',
    'Pathogen Language Server',
    serverOptions,
    clientOptions,
  );

  client.start();

  // Register preview command
  const previewCommand = vscode.commands.registerCommand(
    'pathogen.openPreview',
    () => openPreview(context),
  );
  context.subscriptions.push(previewCommand);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
