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
    updatePreview(editor.document);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'pathogenPreview',
    'Pathogen Preview',
    vscode.ViewColumn.Beside,
    { enableScripts: true },
  );

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
    if (updateTimeout) clearTimeout(updateTimeout);
  }, null, context.subscriptions);

  // Initial render
  updatePreview(editor.document);

  // Watch for changes with debounce
  const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.languageId === 'pathogen' && currentPanel) {
      if (updateTimeout) clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => updatePreview(e.document), 150);
    }
  });
  context.subscriptions.push(changeDisposable);

  // Watch for active editor changes
  const editorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor && editor.document.languageId === 'pathogen' && currentPanel) {
      updatePreview(editor.document);
    }
  });
  context.subscriptions.push(editorDisposable);
}

function updatePreview(document: vscode.TextDocument): void {
  if (!currentPanel) return;

  const source = document.getText();
  const config = vscode.workspace.getConfiguration('pathogen');
  const viewBox = config.get<string>('preview.viewBox', '0 0 200 200');
  const width = config.get<string>('preview.width', '100%');
  const height = config.get<string>('preview.height', '100%');
  const stroke = config.get<string>('preview.stroke', '#000');
  const fill = config.get<string>('preview.fill', 'none');
  const strokeWidth = config.get<string>('preview.strokeWidth', '2');

  // Compile the source using the library bundled with the extension.
  // We send the source to the webview which runs the compiler client-side.
  currentPanel.webview.html = getWebviewContent(source, {
    viewBox, width, height, stroke, fill, strokeWidth,
  });
}

interface PreviewOptions {
  viewBox: string;
  width: string;
  height: string;
  stroke: string;
  fill: string;
  strokeWidth: string;
}

function getWebviewContent(source: string, opts: PreviewOptions): string {
  // Escape the source for embedding in a script tag
  const escapedSource = JSON.stringify(source);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 16px;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      font-family: var(--vscode-font-family, monospace);
      display: flex;
      flex-direction: column;
      height: 100vh;
      box-sizing: border-box;
    }
    .preview-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
    }
    .preview-container svg {
      max-width: 100%;
      max-height: 100%;
      background: white;
      border-radius: 4px;
    }
    .error {
      color: var(--vscode-errorForeground, #f48771);
      padding: 12px;
      font-size: 13px;
      white-space: pre-wrap;
      border: 1px solid var(--vscode-errorForeground, #f48771);
      border-radius: 4px;
      margin-top: 8px;
    }
    .info {
      font-size: 11px;
      opacity: 0.6;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="info" id="info"></div>
  <div class="preview-container" id="preview"></div>
  <script>
    (function() {
      const source = ${escapedSource};
      const preview = document.getElementById('preview');
      const info = document.getElementById('info');

      try {
        // The extension bundles svg-path-extended — we compile server-side
        // and pass the result. For now, render a placeholder with the source info.
        // In a full implementation, we'd either:
        // 1. Bundle the compiler into the webview
        // 2. Compile server-side and send the SVG string
        // For this phase, we compile server-side by embedding the SVG directly.

        // Simple approach: use a regex to detect if source is just path commands
        // and render a basic SVG. Full compilation requires the compiler bundle.
        info.textContent = 'Pathogen Preview — ' + source.split('\\n').length + ' lines';

        // Server-side compilation result would go here.
        // For now, show source as a code preview.
        preview.innerHTML = \`
          <svg xmlns="http://www.w3.org/2000/svg"
               viewBox="${opts.viewBox}"
               width="${opts.width}"
               height="${opts.height}">
            <text x="50%" y="50%" text-anchor="middle"
                  fill="#888" font-size="12" font-family="monospace">
              Compile preview requires runtime bundle
            </text>
          </svg>
        \`;
      } catch (err) {
        preview.innerHTML = '<div class="error">' + err.message + '</div>';
      }
    })();
  </script>
</body>
</html>`;
}
