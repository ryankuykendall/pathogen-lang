import * as vscode from 'vscode';

let currentPanel: vscode.WebviewPanel | undefined;
let updateTimeout: ReturnType<typeof setTimeout> | undefined;

/**
 * Open (or focus) the SVG preview panel for the active .pathogen file.
 */
export function openPreview(context: vscode.ExtensionContext): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'pathogen') {
    vscode.window.showWarningMessage('Open a .pathogen file first.');
    return;
  }

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
    sendSource(editor.document);
    return;
  }

  // Resolve the compiler bundle URI for the webview
  const compilerUri = getCompilerUri(context);
  if (!compilerUri) {
    vscode.window.showErrorMessage('Pathogen: Could not find compiler bundle.');
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'pathogenPreview',
    'Pathogen Preview',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'server'),
        vscode.Uri.joinPath(context.extensionUri, 'compiler'),
      ],
    },
  );

  const webviewCompilerUri = currentPanel.webview.asWebviewUri(compilerUri);
  currentPanel.webview.html = getWebviewContent(webviewCompilerUri.toString());

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
    if (updateTimeout) clearTimeout(updateTimeout);
  }, null, context.subscriptions);

  // Send initial source once webview is ready
  currentPanel.webview.onDidReceiveMessage((msg) => {
    if (msg.type === 'ready') {
      const ed = vscode.window.activeTextEditor;
      if (ed && ed.document.languageId === 'pathogen') {
        sendSource(ed.document);
      }
    }
  }, null, context.subscriptions);

  // Watch for text changes with debounce
  const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.languageId === 'pathogen' && currentPanel) {
      if (updateTimeout) clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => sendSource(e.document), 150);
    }
  });
  context.subscriptions.push(changeDisposable);

  // Watch for active editor changes
  const editorDisposable = vscode.window.onDidChangeActiveTextEditor((ed) => {
    if (ed && ed.document.languageId === 'pathogen' && currentPanel) {
      sendSource(ed.document);
    }
  });
  context.subscriptions.push(editorDisposable);
}

function sendSource(document: vscode.TextDocument): void {
  if (!currentPanel) return;
  currentPanel.webview.postMessage({
    type: 'update',
    source: document.getText(),
  });
}

function getCompilerUri(context: vscode.ExtensionContext): vscode.Uri | null {
  const fs = require('fs');
  // Check bundled location first (installed from .vsix)
  const bundled = vscode.Uri.joinPath(context.extensionUri, 'compiler', 'index.global.js');
  if (fs.existsSync(bundled.fsPath)) return bundled;
  // Dev mode: check dist/ relative to workspace root
  const dev = vscode.Uri.joinPath(context.extensionUri, '..', '..', 'dist', 'index.global.js');
  if (fs.existsSync(dev.fsPath)) return dev;
  return null;
}

function getWebviewContent(compilerUri: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      font-family: var(--vscode-font-family, monospace);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: var(--vscode-titleBar-activeBackground, #333);
      border-bottom: 1px solid var(--vscode-panel-border, #444);
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #999);
      flex-shrink: 0;
    }
    .toolbar .status { flex: 1; }
    .toolbar .info { opacity: 0.7; }
    .preview-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
      padding: 16px;
    }
    .preview-container svg {
      max-width: 100%;
      max-height: 100%;
      background: white;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .error {
      color: var(--vscode-errorForeground, #f48771);
      padding: 16px;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
      max-width: 600px;
    }
    .error-title {
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .loading {
      opacity: 0.5;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="status" id="status">Loading compiler...</span>
    <span class="info" id="info"></span>
  </div>
  <div class="preview-container" id="preview">
    <div class="loading">Loading...</div>
  </div>
  <script src="${compilerUri}"></script>
  <script>
    (function() {
      const vscode = acquireVsCodeApi();
      const preview = document.getElementById('preview');
      const status = document.getElementById('status');
      const info = document.getElementById('info');

      // Check compiler loaded
      if (typeof SvgPathExtended === 'undefined') {
        preview.innerHTML = '<div class="error"><div class="error-title">Compiler not loaded</div>The Pathogen compiler bundle could not be loaded.</div>';
        return;
      }

      status.textContent = 'Ready';

      // Parse viewBox from source comments
      function parseViewBox(source) {
        const match = source.match(/\\/\\/\\s*viewBox\\s*=\\s*"([^"]+)"/);
        return match ? match[1] : '0 0 200 200';
      }

      function parseSize(viewBox) {
        const parts = viewBox.split(/\\s+/).map(Number);
        return {
          width: String(parts[2] || 200),
          height: String(parts[3] || 200),
        };
      }

      function compileAndRender(source) {
        const start = performance.now();
        try {
          const viewBox = parseViewBox(source);
          const size = parseSize(viewBox);
          const result = SvgPathExtended.compile(source);
          const svg = SvgPathExtended.generateSvg(result, {
            viewBox,
            width: size.width,
            height: size.height,
          });

          preview.innerHTML = svg;
          const elapsed = (performance.now() - start).toFixed(0);
          status.textContent = 'Compiled';
          info.textContent = result.layers.length + ' layer' + (result.layers.length !== 1 ? 's' : '') + ' · ' + elapsed + 'ms';
        } catch (e) {
          const msg = e.message || String(e);
          preview.innerHTML = '<div class="error"><div class="error-title">Compilation Error</div>' + escapeHtml(msg) + '</div>';
          status.textContent = 'Error';
          info.textContent = '';
        }
      }

      function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      // Listen for source updates from extension
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'update' && msg.source) {
          compileAndRender(msg.source);
        }
      });

      // Signal ready
      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
}
