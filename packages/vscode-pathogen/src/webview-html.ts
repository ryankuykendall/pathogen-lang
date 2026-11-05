/**
 * The preview webview's page: markup, styles and the inline script that
 * compiles with the bundled library (`window.PathogenLang`) and renders
 * through the shared `buildSvgTree` + `mountInto` adapters.
 *
 * Messages (see preview.ts for the host side):
 *   host → webview  `fonts`   { fonts: [{ id, family, weight, style, kind, buffer }], reply? } — each font
 *                             once; `reply` marks the answer to `needFonts`
 *                   `update`  { seq, uri, source, fontIds, notices, errors, modules? } — `seq` grows with every
 *                             update; `modules` is the files the document imports, `files` as [path, file]
 *                             entries (preview-modules.ts), which compile() takes back as a Map
 *                   `status`  { text } e.g. "Loading fonts…" while a first download runs
 *   webview → host  `ready`        the page loaded (again: a hidden panel reloads)
 *                   `needFonts`    { ids } an update named fonts this page doesn't hold
 *                   `displayFonts` { families } curated families `<text>` names only in a style block
 *
 * No `vscode` import, so a browser harness can load the real page under its
 * real CSP (project-docs/modules/verify/verify-vscode-fonts.mjs).
 */
export function getWebviewContent(compilerUri: string, panZoomUri: string, cspSource: string, nonce: string): string {
  // CSP rationale (see project-docs/security/iframe-sandbox-rationale.md):
  //  - default-src 'none'        — nothing loads unless explicitly allow-listed.
  //  - script-src 'nonce-${nonce}' ${cspSource}
  //                              — only scripts carrying our per-load nonce
  //                                or served from VS Code's controlled origin.
  //  - style-src ${cspSource} 'unsafe-inline'
  //                              — VS Code style sheet + inline styles needed
  //                                for the toolbar/preview chrome and the
  //                                @font-face rules of loaded fonts.
  //  - img-src data: ${cspSource}
  //                              — data: URIs (gpu gradient images) and
  //                                VS Code-controlled images only.
  //  - font-src data: ${cspSource}
  //                              — loaded fonts arrive as bytes from the
  //                                extension host and are inlined as data: URIs.
  //  - connect-src 'none'        — no fetch/xhr from the webview: the extension
  //                                host does all reading and downloading.
  const csp =
    `default-src 'none'; ` +
    `script-src 'nonce-${nonce}' ${cspSource}; ` +
    `style-src ${cspSource} 'unsafe-inline'; ` +
    `img-src data: ${cspSource}; ` +
    `font-src data: ${cspSource}; ` +
    `connect-src 'none';`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* Toolbar */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      background: var(--vscode-titleBar-activeBackground, #333);
      border-bottom: 1px solid var(--vscode-panel-border, #444);
      font-size: 11px;
      flex-shrink: 0;
    }
    .toolbar .status { flex: 1; opacity: 0.7; }
    .toolbar .info { opacity: 0.5; }
    .toolbar button {
      background: transparent;
      border: 1px solid var(--vscode-button-border, #555);
      color: var(--vscode-button-foreground, #ccc);
      padding: 2px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
    }
    .toolbar button:hover {
      background: var(--vscode-button-hoverBackground, #444);
    }
    .toolbar button.active {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border-color: var(--vscode-button-background, #0e639c);
    }

    /* Font-loading warnings (a substituted weight, a font skipped offline) */
    .notices {
      padding: 4px 8px;
      font-size: 11px;
      line-height: 1.5;
      background: var(--vscode-inputValidation-warningBackground, #352a05);
      border-bottom: 1px solid var(--vscode-inputValidation-warningBorder, #b89500);
      color: var(--vscode-foreground, #ccc);
      flex-shrink: 0;
      max-height: 25vh;
      overflow-y: auto;
    }
    .notices[hidden] { display: none; }

    /* Main layout */
    .main {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    /* Preview canvas */
    .preview-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }
    .preview-container.can-pan { cursor: grab; }
    .preview-container.panning { cursor: grabbing; }

    #preview {
      display: block;
      width: 100%;
      height: 100%;
    }

    /* Scroll hint */
    .scroll-hint {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.5);
      z-index: 20;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .scroll-hint.visible { opacity: 1; }
    .scroll-hint span {
      color: #fff;
      font-size: 12px;
      padding: 6px 12px;
      background: rgba(0,0,0,0.7);
      border-radius: 6px;
    }

    /* Navigator minimap */
    .navigator {
      position: absolute;
      top: 8px;
      left: 8px;
      width: 100px;
      height: 100px;
      background: var(--vscode-editor-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #444);
      border-radius: 4px;
      overflow: hidden;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    /* Content SVG and viewport-rect overlay are stacked, not nested, and the
       content layer is GPU-promoted, so moving the viewport rect each pan frame
       doesn't re-rasterize the heavy minimap paths. */
    .navigator svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    #navigator-svg { transform: translateZ(0); backface-visibility: hidden; }
    #navigator-overlay { pointer-events: none; }
    #navigator-viewport {
      fill: rgba(14, 99, 156, 0.15);
      stroke: var(--vscode-focusBorder, #0e639c);
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      cursor: move;
    }

    /* Zoom control is the shared <pathogen-zoom-pill>, registered by the
       already-loaded pan-zoom.global.js bundle. Its theming falls back to
       --vscode-* variables automatically. */

    /* Side panel (layers, vars, palette) */
    .side-panel {
      width: 220px;
      border-left: 1px solid var(--vscode-panel-border, #444);
      overflow-y: auto;
      font-size: 11px;
      display: none;
      flex-shrink: 0;
    }
    .side-panel.visible { display: block; }

    .panel-section {
      border-bottom: 1px solid var(--vscode-panel-border, #444);
    }
    .panel-header {
      padding: 6px 8px;
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground, #888);
      background: var(--vscode-sideBarSectionHeader-background, #2a2a2a);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .panel-header .badge {
      padding: 1px 5px;
      border-radius: 8px;
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #fff);
      font-size: 9px;
    }

    /* Layer rows */
    .layer-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      cursor: default;
    }
    .layer-row:hover {
      background: var(--vscode-list-hoverBackground, #2a2d2e);
    }
    .color-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      border: 1px solid var(--vscode-panel-border, #555);
    }
    .layer-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .type-badge {
      font-size: 9px;
      padding: 0 4px;
      border-radius: 3px;
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #fff);
      flex-shrink: 0;
    }
    .eye-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px;
      color: var(--vscode-foreground, #ccc);
      opacity: 0.5;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      border-radius: 3px;
    }
    .eye-btn:hover { opacity: 1; background: var(--vscode-list-hoverBackground, #2a2d2e); }
    .eye-btn.hidden { opacity: 0.3; color: var(--vscode-disabledForeground, #666); }

    /* CSS Variable rows */
    .var-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
    }
    .var-row:hover {
      background: var(--vscode-list-hoverBackground, #2a2d2e);
    }
    .var-name {
      flex: 1;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 10px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .var-color {
      width: 20px;
      height: 20px;
      padding: 0;
      border: 1px solid var(--vscode-panel-border, #555);
      border-radius: 3px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .var-reset {
      background: none;
      border: none;
      color: var(--vscode-descriptionForeground, #888);
      cursor: pointer;
      font-size: 12px;
      padding: 0 2px;
      display: none;
    }
    .var-reset.active { display: inline; }
    .var-reset:hover { color: var(--vscode-errorForeground, #f48771); }

    /* Color palette */
    .color-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
    }
    .swatch {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      flex-shrink: 0;
      border: 1px solid var(--vscode-panel-border, #555);
    }
    .color-value {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 10px;
      opacity: 0.7;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Error display */
    .error {
      color: var(--vscode-errorForeground, #f48771);
      padding: 16px;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      max-width: 500px;
    }
    .error-title {
      font-weight: 600;
      margin-bottom: 6px;
    }
    .empty-msg {
      padding: 8px;
      opacity: 0.5;
      font-style: italic;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="status" id="status">Loading compiler...</span>
    <span class="info" id="info"></span>
    <button id="recompile-btn" title="Recompile (new random values)">&#x21bb;</button>
    <button id="reset-btn" title="Reset zoom/pan and CSS overrides">Reset</button>
    <button id="toggle-panel" title="Toggle layers/colors panel">Inspector</button>
  </div>
  <div class="notices" id="notices" role="status" hidden></div>

  <div class="main">
    <div class="preview-container" id="preview-container">
      <svg id="preview" xmlns="http://www.w3.org/2000/svg">
        <rect id="preview-bg" width="100%" height="100%" fill="white"></rect>
        <g id="preview-content"></g>
      </svg>

      <div class="scroll-hint" id="scroll-hint"><span></span></div>

      <div class="navigator" id="navigator">
        <svg id="navigator-svg" xmlns="http://www.w3.org/2000/svg">
          <rect id="navigator-bg" width="100%" height="100%" fill="white"></rect>
          <g id="navigator-paths"></g>
        </svg>
        <svg id="navigator-overlay" xmlns="http://www.w3.org/2000/svg">
          <rect id="navigator-viewport"></rect>
        </svg>
      </div>

      <pathogen-zoom-pill id="zoom-pill"></pathogen-zoom-pill>
    </div>

    <div class="side-panel" id="side-panel">
      <div class="panel-section" id="layers-section">
        <div class="panel-header">Layers <span class="badge" id="layers-badge">0</span></div>
        <div id="layers-list"></div>
      </div>
      <div class="panel-section" id="cssvar-section">
        <div class="panel-header">CSS Variables <span class="badge" id="cssvar-badge">0</span></div>
        <div id="cssvar-list"></div>
      </div>
      <div class="panel-section" id="palette-section">
        <div class="panel-header">Colors <span class="badge" id="palette-badge">0</span></div>
        <div id="palette-list"></div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${compilerUri}"></script>
  <script nonce="${nonce}" src="${panZoomUri}"></script>
  <script nonce="${nonce}">
  (function() {
    const vscode = acquireVsCodeApi();
    const preview = document.getElementById('preview');
    const previewContent = document.getElementById('preview-content');
    const previewBg = document.getElementById('preview-bg');
    const container = document.getElementById('preview-container');
    const scrollHint = document.getElementById('scroll-hint');
    const status = document.getElementById('status');
    const info = document.getElementById('info');
    const notices = document.getElementById('notices');
    const navigatorSvg = document.getElementById('navigator-svg');
    const navigatorOverlay = document.getElementById('navigator-overlay');
    const navigatorPaths = document.getElementById('navigator-paths');
    const navigatorViewport = document.getElementById('navigator-viewport');
    const zoomPill = document.getElementById('zoom-pill');
    const sidePanel = document.getElementById('side-panel');

    if (typeof PathogenLang === 'undefined') {
      container.innerHTML = '<div class="error"><div class="error-title">Compiler not loaded</div></div>';
      return;
    }
    if (typeof PathogenPanZoom === 'undefined') {
      container.innerHTML = '<div class="error"><div class="error-title">Pan/zoom controller not loaded</div></div>';
      return;
    }

    status.textContent = 'Ready';

    // --- State ---
    let canvasW = 200, canvasH = 200;
    let zoomLevel = 1, panX = 0, panY = 0;
    let isNavDragging = false, navDragStartX = 0, navDragStartY = 0, navDragPanX = 0, navDragPanY = 0;
    let scrollHintTimer = null;
    let lastResult = null;
    let layerVisibility = {};
    let cssVarOverrides = {};

    // The program being shown, as the last update described it.
    let lastSource = '';
    let lastFontIds = [];
    let lastFontErrors = [];
    let lastUri = null;
    // The files the document imports, as compile() takes them (the update
    // sends them as entries: postMessage can't carry a Map).
    let lastModules = null;
    let lastSeq = -1;

    // --- Fonts ---
    // The extension host loads fonts the way the CLI does and sends each one
    // once; they are kept here by id. Every compile builds a fresh registry
    // from exactly the ids its update names, so a font the program stopped
    // asking for can't reach the geometry. Each font's parsed form is cached
    // on its entry, so rebuilding the registry doesn't parse it again.
    const fontStore = new Map();
    let opentypeReady = null;
    let pendingUpdate = null;
    const displayAsked = new Set();
    const fontFaces = document.createElement('style');
    fontFaces.id = 'pathogen-font-faces';
    document.head.appendChild(fontFaces);

    function addFonts(fonts) {
      for (const f of fonts || []) {
        if (fontStore.has(f.id)) continue;
        const entry = {
          id: f.id, family: f.family, weight: f.weight, style: f.style, kind: f.kind,
          bytes: new Uint8Array(f.buffer),
          data: { family: f.family, weight: f.weight, style: f.style, buffer: f.buffer },
        };
        fontStore.set(f.id, entry);
        // Live <text> renders in the loaded face: an @font-face rule with the
        // font inlined (the CSP allows font-src data:, and nothing else).
        fontFaces.appendChild(document.createTextNode(PathogenLang.fontFaceCss([entry]) + '\\n'));
      }
      if (!opentypeReady && fontStore.size > 0) opentypeReady = PathogenLang.ensureOpentype();
    }

    function registryFor(ids) {
      if (!ids.length) return undefined;
      const registry = PathogenLang.createFontRegistry();
      for (const id of ids) PathogenLang.addFontData(registry, fontStore.get(id).data);
      return registry;
    }

    // Curated families that <text> names only in a style block, with no @font:
    // ask the host for them (local copy first, then Google), as the playground
    // does. Display only — they never enter the registry.
    function requestDisplayFonts(result) {
      const wanted = [];
      const add = (styles) => {
        if (!styles || !styles['font-family']) return;
        const family = String(styles['font-family']).split(',')[0].trim().replace(/^['"]|['"]$/g, '');
        if (!family || PathogenLang.GENERIC_FONT_FAMILIES.has(family)) return;
        if (PathogenLang.curatedVariants(family) === null) return;
        const rawWeight = styles['font-weight'];
        const asked = rawWeight !== undefined && /^\\d+$/.test(String(rawWeight).trim())
          ? parseInt(String(rawWeight).trim(), 10)
          : 400;
        // On the 100–900 grid, so a program can't drive a lookup per odd weight.
        const weight = Math.min(900, Math.max(100, Math.round(asked / 100) * 100));
        const key = family + ':' + weight;
        if (displayAsked.has(key)) return;
        for (const f of fontStore.values()) if (f.family === family && f.weight === weight) return;
        displayAsked.add(key);
        wanted.push({ family: family, weight: weight });
      };
      const walk = (layer) => {
        add(layer.styles);
        for (const te of layer.textElements || []) add(Object.assign({}, layer.styles, te.styles));
        for (const child of layer.children || []) walk(child);
      };
      for (const layer of (result && result.layers) || []) walk(layer);
      if (wanted.length) vscode.postMessage({ type: 'displayFonts', families: wanted });
    }

    function showNotices(lines) {
      notices.innerHTML = '';
      notices.hidden = lines.length === 0;
      for (const line of lines) {
        const row = document.createElement('div');
        row.textContent = line;
        notices.appendChild(row);
      }
    }

    // SVG icons for layer visibility
    const eyeOpenSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeClosedSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

    // --- Zoom/Pan (shared controller) ---
    // The controller owns the viewBox/transform (CSS-transform during the
    // gesture, bake into viewBox on idle) and emits onChange → local state +
    // chrome. The webview SVG is in this document (not a nested iframe), so
    // listeners attach to the preview container.
    const pz = new PathogenPanZoom.PanZoomController({
      svg: preview,
      eventTarget: container,
      mode: 'transform',
      canvas: { originX: 0, originY: 0, width: canvasW, height: canvasH },
      view: { zoom: zoomLevel, panX: panX, panY: panY },
      onChange: (v) => { zoomLevel = v.zoom; panX = v.panX; panY = v.panY; refreshChrome(); },
      // Plain scroll zooms — this is a dedicated preview panel, not a long
      // scrollable page, so no Ctrl/Cmd gate (unlike blog embeds). Zoom
      // range/step come from the bundle's shared DEFAULTS (10%–2000%).
      options: { wheelDampening: 0.002, requireModifierForWheel: false },
    });
    function refreshChrome() {
      zoomPill.zoom = zoomLevel;
      updateNavigatorViewport();
      container.classList.toggle('can-pan', zoomLevel >= 0.5);
    }

    // The pill's buttons/% input call the controller directly.
    zoomPill.controller = pz;
    zoomPill.fadeTarget = container;

    // (No scroll hint: plain scroll zooms directly, so the "Ctrl + scroll"
    // hint that blog embeds use isn't needed here.)

    // Grab cursor while panning; navigator drag (driven on the document so it
    // tracks outside the minimap); end any controller gesture released anywhere.
    container.addEventListener('pointerdown', () => { if (zoomLevel >= 0.5) container.classList.add('panning'); });
    document.addEventListener('mousemove', (e) => {
      if (!isNavDragging) return;
      const pt = navigatorSvg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const ctm = navigatorSvg.getScreenCTM();
      if (!ctm) return;
      const svgPt = pt.matrixTransform(ctm.inverse());
      pz.drive({ panX: navDragPanX + (svgPt.x - navDragStartX), panY: navDragPanY + (svgPt.y - navDragStartY) });
    });
    document.addEventListener('pointerup', () => { pz.endGesture(); container.classList.remove('panning'); });
    document.addEventListener('mouseup', () => { isNavDragging = false; });

    // --- Navigator ---
    function updateNavigatorViewport() {
      const vw = canvasW / zoomLevel, vh = canvasH / zoomLevel;
      navigatorViewport.setAttribute('x', panX);
      navigatorViewport.setAttribute('y', panY);
      navigatorViewport.setAttribute('width', vw);
      navigatorViewport.setAttribute('height', vh);
    }
    function updateNavigatorContent() {
      navigatorPaths.innerHTML = '';
      for (const child of previewContent.children) {
        navigatorPaths.appendChild(child.cloneNode(true));
      }
      const pad = canvasW * 0.05;
      const navVB = (-pad) + ' ' + (-pad) + ' ' + (canvasW + pad * 2) + ' ' + (canvasH + pad * 2);
      navigatorSvg.setAttribute('viewBox', navVB);
      // Overlay shares the content viewBox so the viewport rect aligns.
      if (navigatorOverlay) navigatorOverlay.setAttribute('viewBox', navVB);
      navigatorViewport.setAttribute('fill', 'rgba(14, 99, 156, 0.15)');
      navigatorViewport.setAttribute('stroke', 'var(--vscode-focusBorder, #0e639c)');
      navigatorViewport.setAttribute('stroke-width', '1');
      navigatorViewport.setAttribute('vector-effect', 'non-scaling-stroke');
      updateNavigatorViewport();
    }

    navigatorSvg.addEventListener('mousedown', (e) => {
      const pt = navigatorSvg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const ctm = navigatorSvg.getScreenCTM();
      if (!ctm) return;
      const svgPt = pt.matrixTransform(ctm.inverse());
      const vw = canvasW / zoomLevel, vh = canvasH / zoomLevel;
      // Check if click is inside viewport
      if (svgPt.x >= panX && svgPt.x <= panX + vw && svgPt.y >= panY && svgPt.y <= panY + vh) {
        isNavDragging = true;
        navDragStartX = svgPt.x; navDragStartY = svgPt.y;
        navDragPanX = panX; navDragPanY = panY;
      } else {
        pz.setView({ panX: svgPt.x - vw / 2, panY: svgPt.y - vh / 2 }, { emit: true });
      }
      e.preventDefault();
    });

    // --- Toolbar buttons ---
    document.getElementById('toggle-panel').addEventListener('click', () => {
      sidePanel.classList.toggle('visible');
      document.getElementById('toggle-panel').classList.toggle('active', sidePanel.classList.contains('visible'));
    });

    document.getElementById('recompile-btn').addEventListener('click', () => {
      if (lastUri !== null) compileAndRender(lastSource);
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
      cssVarOverrides = {};
      layerVisibility = {};
      pz.zoomToFit();
      if (lastUri !== null) compileAndRender(lastSource);
    });

    function showError(message) {
      status.textContent = 'Error';
      info.textContent = '';
      previewContent.innerHTML = '';
      const existing = container.querySelector('.error');
      if (existing) existing.remove();
      const errEl = document.createElement('div');
      errEl.className = 'error';
      errEl.style.position = 'absolute';
      errEl.style.top = '16px';
      errEl.style.left = '16px';
      errEl.style.right = '16px';
      errEl.style.zIndex = '30';
      errEl.innerHTML = '<div class="error-title">Compilation Error</div>' + escapeHtml(message);
      container.appendChild(errEl);
    }

    // --- Compile and render ---
    function compileAndRender(source) {
      // A font that couldn't be loaded stops the compile, as in the CLI.
      if (lastFontErrors.length) {
        showError(lastFontErrors.join('\\n'));
        return;
      }
      const start = performance.now();
      try {
        // Apply CSS variable overrides to source
        let modifiedSource = source;
        for (const [varName, value] of Object.entries(cssVarOverrides)) {
          // Replace CSSVar('--name', fallback) with the override value
          const pattern = new RegExp("CSSVar\\\\('" + varName.replace(/[-/\\\\^$*+?.()|[\\\\]{}]/g, '\\\\$&') + "'[^)]*\\\\)", 'g');
          modifiedSource = modifiedSource.replace(pattern, "Color('" + value + "')");
        }

        const fonts = registryFor(lastFontIds);
        const options = {};
        if (fonts) options.fonts = fonts;
        if (lastModules) options.modules = lastModules;
        const result = PathogenLang.compile(modifiedSource, options);
        lastResult = result;

        // Canvas dims come from the COMPILED viewBox (the define ViewBox(...)
        // construct), not a // viewBox comment — modern sources use the
        // construct, and reading a comment left the canvas at the 200x200
        // default so all content rendered off-screen.
        const cvb = (result && result.viewBox) || { originX: 0, originY: 0, width: 200, height: 200 };
        const originX = cvb.originX || 0;
        const originY = cvb.originY || 0;
        canvasW = cvb.width || 200;
        canvasH = cvb.height || 200;
        const vb = originX + ' ' + originY + ' ' + canvasW + ' ' + canvasH;

        // Build the shared render tree and split its children across the two
        // DOM targets: <defs>/<style> go next to previewBg (z-order below
        // everything but not rendered directly); layer elements go into
        // previewContent. Replaces the previous generateSvg() + DOMParser +
        // importNode chain — same DOM shape, one fewer round-trip.
        const tree = PathogenLang.buildSvgTree(result, {
          viewBox: vb,
          width: String(canvasW),
          height: String(canvasH),
        });

        // Clear and clean up previous injections
        previewContent.innerHTML = '';
        preview.querySelectorAll('.injected-defs, .injected-style').forEach(el => el.remove());
        const existingErr = container.querySelector('.error');
        if (existingErr) existingErr.remove();

        const SVG_NS = 'http://www.w3.org/2000/svg';

        for (const child of tree.children) {
          if (!child || typeof child !== 'object' || !('tag' in child)) continue;
          if (child.tag === 'defs') {
            const defsEl = document.createElementNS(SVG_NS, 'defs');
            defsEl.classList.add('injected-defs');
            PathogenLang.mountInto(defsEl, child.children);
            preview.insertBefore(defsEl, previewBg);
          } else if (child.tag === 'style') {
            // The shared renderer emits <style> with a RawText CDATA child.
            // For a webview <style>, we need the raw CSS text (no CDATA
            // wrapper) assigned to textContent.
            const styleEl = document.createElementNS(SVG_NS, 'style');
            styleEl.classList.add('injected-style');
            const rawChild = child.children.find(c => c && typeof c === 'object' && 'raw' in c);
            if (rawChild) {
              const cssText = rawChild.raw.replace(/^<!\\[CDATA\\[\\n/, '').replace(/\\n\\s*\\]\\]>$/, '');
              styleEl.textContent = cssText;
            }
            preview.insertBefore(styleEl, previewBg);
          } else if (child.tag === 'script') {
            // Metadata script — skip in VS Code preview.
            continue;
          } else {
            PathogenLang.mountInto(previewContent, child);
          }
        }

        // Apply layer visibility
        applyLayerVisibility();

        // Canvas dims may have changed — re-apply the viewBox via the controller.
        pz.setCanvas({ originX: originX, originY: originY, width: canvasW, height: canvasH });
        previewBg.setAttribute('x', originX);
        previewBg.setAttribute('y', originY);
        previewBg.setAttribute('width', canvasW);
        previewBg.setAttribute('height', canvasH);

        updateNavigatorContent();
        updateSidePanel(result, source);
        requestDisplayFonts(result);

        const ms = (performance.now() - start).toFixed(0);
        status.textContent = 'Compiled';
        info.textContent = result.layers.length + ' layer' + (result.layers.length !== 1 ? 's' : '') + ' \\u00b7 ' + ms + 'ms';
      } catch (e) {
        showError(e.message || String(e));
      }
    }

    // --- Layer visibility ---
    function applyLayerVisibility() {
      for (const [name, visible] of Object.entries(layerVisibility)) {
        const el = previewContent.querySelector('#' + CSS.escape(name));
        if (el) el.style.display = visible ? '' : 'none';
      }
    }

    // --- Side panel ---
    function updateSidePanel(result, source) {
      // Layers
      const layersList = document.getElementById('layers-list');
      layersList.innerHTML = '';
      let layerCount = 0;
      function addLayerRow(layer, depth) {
        layerCount++;
        const name = layer.name || '(default)';
        const row = document.createElement('div');
        row.className = 'layer-row';
        if (depth > 0) row.style.paddingLeft = (8 + depth * 12) + 'px';

        const dot = document.createElement('span');
        dot.className = 'color-dot';
        const color = layer.styles?.stroke || layer.styles?.fill || '#ccc';
        if (color !== 'none') dot.style.background = color;
        row.appendChild(dot);

        const nameEl = document.createElement('span');
        nameEl.className = 'layer-name';
        nameEl.textContent = name;
        nameEl.title = name;
        row.appendChild(nameEl);

        const badge = document.createElement('span');
        badge.className = 'type-badge';
        badge.textContent = layer.type;
        row.appendChild(badge);

        const eye = document.createElement('button');
        eye.className = 'eye-btn';
        const isVisible = layerVisibility[name] !== false;
        eye.innerHTML = isVisible ? eyeOpenSvg : eyeClosedSvg;
        eye.classList.toggle('hidden', !isVisible);
        eye.title = isVisible ? 'Hide layer' : 'Show layer';
        eye.addEventListener('click', () => {
          layerVisibility[name] = layerVisibility[name] === false ? true : false;
          applyLayerVisibility();
          updateNavigatorContent();
          const nowVisible = layerVisibility[name] !== false;
          eye.innerHTML = nowVisible ? eyeOpenSvg : eyeClosedSvg;
          eye.classList.toggle('hidden', !nowVisible);
          eye.title = nowVisible ? 'Hide layer' : 'Show layer';
        });
        row.appendChild(eye);

        layersList.appendChild(row);

        if (layer.type === 'group' && layer.children) {
          for (const child of layer.children) addLayerRow(child, depth + 1);
        }
      }
      for (const layer of result.layers) addLayerRow(layer, 0);
      document.getElementById('layers-badge').textContent = layerCount;

      // CSS Variables
      const cssvarList = document.getElementById('cssvar-list');
      cssvarList.innerHTML = '';
      // Scan the ORIGINAL source for CSSVar() calls — not the compiled result,
      // because overridden variables get replaced before compilation and would disappear
      const vars = new Map();
      const cssVarSourcePattern = /CSSVar\\(\\s*'(--[\\w-]+)'\\s*(?:,\\s*([^)]+))?\\s*\\)/g;
      let srcMatch;
      while ((srcMatch = cssVarSourcePattern.exec(source)) !== null) {
        if (!vars.has(srcMatch[1])) {
          // Clean up fallback: remove quotes, Color() wrapper, # prefix handling
          let fallback = (srcMatch[2] || '').trim().replace(/^['"]|['"]$/g, '');
          if (fallback.startsWith('Color(')) fallback = fallback.replace(/^Color\\(['"]?|['"]?\\)$/g, '');
          vars.set(srcMatch[1], fallback);
        }
      }
      // Also include @property declarations from compiled result
      if (result.cssProperties) {
        for (const prop of result.cssProperties) {
          if (!vars.has(prop.name)) vars.set(prop.name, prop.initialValue || '');
        }
      }
      document.getElementById('cssvar-badge').textContent = vars.size;

      if (vars.size === 0) {
        cssvarList.innerHTML = '<div class="empty-msg">No CSS variables</div>';
      } else {
        for (const [varName, fallback] of vars) {
          const row = document.createElement('div');
          row.className = 'var-row';

          const nameEl = document.createElement('span');
          nameEl.className = 'var-name';
          nameEl.textContent = varName;
          nameEl.title = 'Default: ' + (fallback || 'none');
          row.appendChild(nameEl);

          const colorInput = document.createElement('input');
          colorInput.type = 'color';
          colorInput.className = 'var-color';
          const currentVal = cssVarOverrides[varName] || fallback;
          colorInput.value = toHex(currentVal) || '#000000';
          colorInput.addEventListener('input', () => {
            cssVarOverrides[varName] = colorInput.value;
            resetBtn.classList.add('active');
            compileAndRender(lastSource);
          });
          row.appendChild(colorInput);

          const resetBtn = document.createElement('button');
          resetBtn.className = 'var-reset' + (cssVarOverrides[varName] ? ' active' : '');
          resetBtn.textContent = '\\u00d7';
          resetBtn.title = 'Reset to default';
          resetBtn.addEventListener('click', () => {
            delete cssVarOverrides[varName];
            resetBtn.classList.remove('active');
            compileAndRender(lastSource);
          });
          row.appendChild(resetBtn);

          cssvarList.appendChild(row);
        }
      }

      // Palette
      const paletteList = document.getElementById('palette-list');
      paletteList.innerHTML = '';
      const allColors = new Set();
      const colorProps = ['stroke', 'fill', 'color', 'stop-color'];
      const skipValues = new Set(['none', 'inherit', 'transparent', 'currentColor']);
      for (const layer of result.layers) {
        for (const prop of colorProps) {
          const val = layer.styles?.[prop];
          if (val && !skipValues.has(val) && !val.startsWith('url(')) {
            allColors.add(val);
          }
        }
      }
      document.getElementById('palette-badge').textContent = allColors.size;

      if (allColors.size === 0) {
        paletteList.innerHTML = '<div class="empty-msg">No colors</div>';
      } else {
        for (const color of allColors) {
          const row = document.createElement('div');
          row.className = 'color-row';

          const swatch = document.createElement('span');
          swatch.className = 'swatch';
          swatch.style.background = color;
          row.appendChild(swatch);

          const val = document.createElement('span');
          val.className = 'color-value';
          val.textContent = color;
          val.title = color;
          row.appendChild(val);

          paletteList.appendChild(row);
        }
      }
    }

    function toHex(color) {
      if (!color) return null;
      if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
      if (/^#[0-9a-fA-F]{3}$/.test(color)) {
        return '#' + color[1]+color[1] + color[2]+color[2] + color[3]+color[3];
      }
      // Try canvas conversion
      try {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = color;
        const result = ctx.fillStyle;
        if (result.startsWith('#')) return result;
      } catch {}
      return null;
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // --- Message handling ---
    function applyUpdate(msg) {
      const missing = (msg.fontIds || []).filter((id) => !fontStore.has(id));
      if (missing.length) {
        // Delivery isn't guaranteed: ask once, and compile when they arrive.
        pendingUpdate = msg;
        vscode.postMessage({ type: 'needFonts', ids: missing });
        return;
      }
      pendingUpdate = null;
      lastSource = msg.source || '';
      lastFontIds = msg.fontIds || [];
      lastFontErrors = msg.errors || [];
      lastModules =
        msg.modules && Array.isArray(msg.modules.files)
          ? { entry: msg.modules.entry, order: msg.modules.order || [], files: new Map(msg.modules.files) }
          : null;
      showNotices(msg.notices || []);
      const ready = lastFontIds.length && opentypeReady ? opentypeReady : Promise.resolve();
      ready.then(
        () => compileAndRender(lastSource),
        (e) => showError('Fonts could not be prepared: ' + (e && e.message ? e.message : String(e))),
      );
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'fonts') {
        addFonts(msg.fonts);
        if (pendingUpdate) {
          const stillMissing = pendingUpdate.fontIds.some((id) => !fontStore.has(id));
          if (!stillMissing) {
            applyUpdate(pendingUpdate);
          } else if (msg.reply) {
            // The host answered the request and the fonts aren't coming.
            pendingUpdate = null;
            showError('Some fonts this program loads did not reach the preview. Close the preview and open it again.');
          }
        }
      } else if (msg.type === 'update') {
        // The host numbers its updates: an older one arriving late never
        // replaces a newer one. (Not the document version — a file closed and
        // reopened starts its versions again at 1.)
        if (typeof msg.seq === 'number') {
          if (msg.seq <= lastSeq) return;
          lastSeq = msg.seq;
        }
        if (msg.uri !== lastUri) displayAsked.clear();
        lastUri = msg.uri;
        applyUpdate(msg);
      } else if (msg.type === 'status' && typeof msg.text === 'string') {
        status.textContent = msg.text;
      }
    });

    vscode.postMessage({ type: 'ready' });
  })();
  </script>
</body>
</html>`;
}
