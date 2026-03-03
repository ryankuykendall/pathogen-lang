// Workspace View - Code editor, preview, and compilation
// Route: /workspace/:id

import { store } from '../state/store.js';
import { defaultCode, examples } from '../utils/examples.js';
import { loadFromURL, applyURLState } from '../utils/url-state.js';
import { workspaceApi } from '../services/api.js';
import { autosave, SaveStatus } from '../services/autosave.js';
import { getUserId } from '../services/user-id.js';
import { BASE_PATH, parseWorkspaceSlugId, buildWorkspaceSlugId } from '../utils/router.js';
import compilerWorker from '../services/compiler-worker.js';
import thumbnailService from '../services/thumbnail-service.js';
import gpuGradientService from '../gpu/gradient-service.js';

// Import all sub-components
import './playground-main.js';
import './playground-footer.js';
import './code-editor-pane.js';
import './annotated-pane.js';
import './console-pane.js';
import './svg-preview-pane.js';
import './docs-panel.js';
import './shared/error-panel.js';
import './export-legend-modal.js';
import './thumbnail-crop-modal.js';

export class WorkspaceView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._debounceTimer = null;
    this._fileHandle = null;
    this._initialized = false;
    this._routeUnsubscribe = null;
    this._loadingWorkspace = false;
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();

    // Initialize WebGPU gradient service (async, non-blocking)
    gpuGradientService.init();

    // Subscribe to route changes to initialize when becoming active
    this._routeUnsubscribe = store.subscribe(['currentView', 'routeParams'], () => {
      this.handleRouteChange();
    });

    // Check if we should initialize immediately (if already on workspace route)
    this.handleRouteChange();
  }

  disconnectedCallback() {
    if (this._routeUnsubscribe) {
      this._routeUnsubscribe();
    }
    // Flush pending saves before leaving
    autosave.flush();
    // Clean up event listeners
    this.cleanupEventListeners();
    // Terminate compiler worker
    compilerWorker.terminateWorker();
    // Release GPU texture cache
    gpuGradientService.clearCache();
  }

  handleRouteChange() {
    const currentView = store.get('currentView');
    const routeParams = store.get('routeParams') || {};
    const isActive = currentView === 'workspace';

    // Parse workspace ID from slugId (format: slug--id or just id)
    const { id: workspaceId } = parseWorkspaceSlugId(routeParams.slugId);

    if (isActive) {
      // Check if we need to load a different workspace
      if (!this._initialized || this._currentWorkspaceId !== workspaceId) {
        this._currentWorkspaceId = workspaceId;
        this.waitForLibrary();
      }
    } else {
      // Flush pending saves when leaving workspace view
      if (this._initialized) {
        autosave.flush();

        // Generate thumbnail if content changed since last thumbnail
        const workspaceId = this._currentWorkspaceId;
        thumbnailService.generateIfDirty(
          workspaceId,
          () => this.previewPane?.shadowRoot?.querySelector('#preview'),
          store.getAll()
        ).then(result => {
          if (result) {
            document.dispatchEvent(new CustomEvent('thumbnail-updated', {
              bubbles: true,
              composed: true,
              detail: { workspaceId },
            }));
          }
        });
        thumbnailService.stopAutoGeneration();
      }
    }
  }

  get editorPane() {
    return this.shadowRoot.querySelector('code-editor-pane');
  }

  get previewPane() {
    return this.shadowRoot.querySelector('svg-preview-pane');
  }

  get annotatedPane() {
    return this.shadowRoot.querySelector('annotated-pane');
  }

  get consolePane() {
    return this.shadowRoot.querySelector('console-pane');
  }

  get docsPanel() {
    return this.shadowRoot.querySelector('docs-panel');
  }

  get errorPanel() {
    return this.shadowRoot.querySelector('error-panel');
  }

  get exportLegendModal() {
    return this.shadowRoot.querySelector('export-legend-modal');
  }

  get thumbnailCropModal() {
    return this.shadowRoot.querySelector('thumbnail-crop-modal');
  }

  waitForLibrary(maxWait = 5000) {
    const start = Date.now();
    const check = () => {
      if (window.SvgPathExtended) {
        this.initialize();
      } else if (Date.now() - start < maxWait) {
        setTimeout(check, 50);
      } else {
        this.showError('Failed to load svg-path-extended library');
      }
    };
    check();
  }

  async initialize() {
    this._initialized = true;
    this.previewPane.clear();
    this.previewPane.showLoading();
    const routeParams = store.get('routeParams') || {};
    const routeQuery = store.get('routeQuery') || {};
    // Parse workspace ID from slugId (format: slug--id or just id)
    const { id: workspaceId } = parseWorkspaceSlugId(routeParams.slugId);

    // Reset workspace state
    store.update({
      workspaceId: null,
      workspaceName: null,
      workspaceDescription: null,
      workspaceIsPublic: false,
      workspaceOwnerId: null,
      workspaceUpdatedAt: null,
      saveStatus: SaveStatus.IDLE,
      saveError: null,
    });

    // Check for URL state (backward compatibility for shareable links)
    if (routeQuery.state) {
      const urlState = loadFromURL();
      const initialCode = applyURLState(urlState, store) || defaultCode;
      this.editorPane.initialCode = initialCode;
      store.set('code', initialCode);
      // Don't initialize autosave for URL-state workspaces (they're not persisted)
    }
    // Load workspace from API if ID is provided and not 'new'
    else if (workspaceId && workspaceId !== 'new') {
      await this.loadWorkspace(workspaceId);
    }
    // New workspace
    else {
      // Use default code for new workspaces
      const preferences = store.get('preferences');
      this.editorPane.initialCode = defaultCode;
      store.update({
        code: defaultCode,
        currentFileName: null,
      });
      // Apply user preferences to SVG styles
      if (preferences) {
        store.update({
          width: preferences.width,
          height: preferences.height,
          background: preferences.background,
          gridEnabled: preferences.gridEnabled,
          gridColor: preferences.gridColor,
          gridSize: preferences.gridSize,
          toFixed: preferences.toFixed ?? null,
        });
      }
    }

    // Initialize panes based on store state
    if (store.get('annotatedOpen')) {
      this.annotatedPane.open();
    }
    if (store.get('consoleOpen')) {
      this.consolePane.open();
    }

    // Initial compilation
    this.updatePreview();
  }

  updateUrlWithSlug(id, slug) {
    // Only update if slug exists and URL doesn't already have it
    if (!slug) return;

    const routeParams = store.get('routeParams') || {};
    const currentSlugId = routeParams.slugId || '';
    const expectedSlugId = buildWorkspaceSlugId(slug, id);

    if (currentSlugId === expectedSlugId) return;

    // Build new URL with slug--id format
    const newPath = `${BASE_PATH}/workspace/${encodeURIComponent(expectedSlugId)}`;

    // Use replaceState to avoid adding to history
    history.replaceState(null, '', newPath);

    // Update store with new slugId
    store.set('routeParams', { ...routeParams, slugId: expectedSlugId });
  }

  async loadWorkspace(id) {
    if (this._loadingWorkspace) return;
    this._loadingWorkspace = true;

    try {
      const workspace = await workspaceApi.get(id);
      const userId = getUserId();

      // Update store with workspace data
      store.update({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceDescription: workspace.description,
        workspaceIsPublic: workspace.isPublic,
        workspaceOwnerId: workspace.userId,
        workspaceUpdatedAt: workspace.updatedAt,
        code: workspace.code,
        currentFileName: workspace.name,
      });

      // Apply workspace preferences to SVG styles
      if (workspace.preferences) {
        const prefs = workspace.preferences;
        store.update({
          width: prefs.width ?? store.get('width'),
          height: prefs.height ?? store.get('height'),
          background: prefs.background ?? store.get('background'),
          gridEnabled: prefs.gridEnabled ?? store.get('gridEnabled'),
          gridColor: prefs.gridColor ?? store.get('gridColor'),
          gridSize: prefs.gridSize ?? store.get('gridSize'),
          toFixed: prefs.toFixed ?? store.get('toFixed'),
        });
      }

      // Set editor code
      this.editorPane.initialCode = workspace.code;

      // Update URL with slug if not already present
      this.updateUrlWithSlug(workspace.id, workspace.slug);

      // Initialize autosave if user owns this workspace
      if (workspace.userId === userId) {
        autosave.init(workspace.id, workspace.contentHash);

        // Start thumbnail auto-generation tracking
        thumbnailService.startAutoGeneration(workspace.id);
        thumbnailService.setThumbnailContentHash(workspace.thumbnailContentHash || null);

        // Store initial preferences state for change detection
        autosave.setInitialPreferences({
          width: store.get('width'),
          height: store.get('height'),
          background: store.get('background'),
          gridEnabled: store.get('gridEnabled'),
          gridColor: store.get('gridColor'),
          gridSize: store.get('gridSize'),
          toFixed: store.get('toFixed'),
        });
      }
    } catch (err) {
      console.error('Failed to load workspace:', err);
      if (err.status === 404) {
        this.showError('Workspace not found');
      } else if (err.status === 403) {
        this.showError('You do not have access to this workspace');
      } else {
        this.showError('Failed to load workspace: ' + err.message);
      }

      // Fall back to default code
      this.editorPane.initialCode = defaultCode;
      store.set('code', defaultCode);
    } finally {
      this._loadingWorkspace = false;
    }
  }

  setupEventListeners() {
    // Re-apply compilation error when editor finishes loading
    this.shadowRoot.addEventListener('editor-ready', () => {
      const error = store.get('compilationError');
      if (error) {
        this.showError(error);
      }
    });

    // Code changes from editor
    this.shadowRoot.addEventListener('code-change', (e) => {
      this.debouncedUpdate();

      // Get code from event detail (more reliable than store timing)
      const code = e.detail?.code || store.get('code');

      // Trigger autosave
      autosave.onChange(code);

      // Track content change for thumbnail auto-generation
      // Use a simple hash of the code for comparison
      thumbnailService.onContentChanged(this._simpleHash(code));
    });

    // Style changes from footer
    this.shadowRoot.addEventListener('style-change', () => {
      this.previewPane.updateSvgStyles();

      // Save preferences to backend
      const preferences = {
        width: store.get('width'),
        height: store.get('height'),
        background: store.get('background'),
        gridEnabled: store.get('gridEnabled'),
        gridColor: store.get('gridColor'),
        gridSize: store.get('gridSize'),
        toFixed: store.get('toFixed'),
      };
      autosave.onPreferencesChange(preferences);
    });

    // Precision changes from footer (requires recompilation)
    this.shadowRoot.addEventListener('precision-change', () => {
      this.updatePreview();
      this.updateAnnotatedOutput();

      // Save preferences to backend
      const preferences = {
        width: store.get('width'),
        height: store.get('height'),
        background: store.get('background'),
        gridEnabled: store.get('gridEnabled'),
        gridColor: store.get('gridColor'),
        gridSize: store.get('gridSize'),
        toFixed: store.get('toFixed'),
      };
      autosave.onPreferencesChange(preferences);
    });

    // Open docs
    this.shadowRoot.addEventListener('open-docs', () => {
      this.docsPanel.open();
    });

    // Listen for events from app-header and app-breadcrumb (bubble up through DOM)
    // These listeners are on document to catch events from outside shadow DOM
    this._handleExportFile = () => {
      if (store.get('currentView') === 'workspace') {
        this.exportFile();
      }
    };
    document.addEventListener('export-file', this._handleExportFile);

    this._handleCopyCode = () => {
      if (store.get('currentView') === 'workspace') {
        this.copyCode();
      }
    };
    document.addEventListener('copy-code', this._handleCopyCode);

    this._handleCopySvg = () => {
      if (store.get('currentView') === 'workspace') {
        this.copySvg();
      }
    };
    document.addEventListener('copy-svg', this._handleCopySvg);

    this._handleToggleAnnotated = () => {
      if (store.get('currentView') === 'workspace') {
        this.annotatedPane.toggle();
        if (this.annotatedPane.isOpen) {
          this.updateAnnotatedOutput();
        }
      }
    };
    document.addEventListener('toggle-annotated', this._handleToggleAnnotated);

    this._handleToggleConsole = () => {
      if (store.get('currentView') === 'workspace') {
        this.consolePane.toggle();
      }
    };
    document.addEventListener('toggle-console', this._handleToggleConsole);

    // Keyboard shortcuts
    this._handleKeydown = (e) => {
      if (store.get('currentView') !== 'workspace') return;

      if (e.key === 'Escape' && this.docsPanel.classList.contains('open')) {
        this.docsPanel.close();
      }
      // Ctrl/Cmd+S saves immediately
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        autosave.saveNow();
      }
    };
    document.addEventListener('keydown', this._handleKeydown);

    // Export with legend
    this._handleExportLegend = () => {
      if (store.get('currentView') === 'workspace') {
        const svgElement = this.previewPane.shadowRoot?.querySelector('#preview');
        if (svgElement) {
          this.exportLegendModal.open(svgElement, store.getAll());
        }
      }
    };
    document.addEventListener('export-legend', this._handleExportLegend);

    // Refresh preview (for random functions)
    this._handleRefreshPreview = () => {
      if (store.get('currentView') === 'workspace') {
        this.updatePreview();
        this.updateAnnotatedOutput();
      }
    };
    document.addEventListener('refresh-preview', this._handleRefreshPreview);

    // Set thumbnail (crop modal)
    this._handleSetThumbnail = () => {
      if (store.get('currentView') === 'workspace') {
        const svgElement = this.previewPane.shadowRoot?.querySelector('#preview');
        if (svgElement) {
          this.thumbnailCropModal.open(svgElement, store.getAll());
        }
      }
    };
    document.addEventListener('set-thumbnail', this._handleSetThumbnail);

    // Copy debug info
    this._handleCopyDebugInfo = async () => {
      if (store.get('currentView') === 'workspace') {
        try {
          const { buildDebugCapture } = await import('../utils/debug-capture.js');
          const markdown = buildDebugCapture();
          await navigator.clipboard.writeText(markdown);
          // Show feedback on error panel if visible, otherwise on header
          if (this.errorPanel.classList.contains('visible')) {
            this.errorPanel.showFeedback('Copied!');
          }
        } catch (err) {
          console.error('Failed to copy debug info:', err);
        }
      }
    };
    document.addEventListener('copy-debug-info', this._handleCopyDebugInfo);

    // Auto-generate thumbnail (fired by thumbnail service idle timer)
    this._handleThumbnailAutoGenerate = (e) => {
      if (store.get('currentView') !== 'workspace') return;
      const { workspaceId } = e.detail;
      if (workspaceId !== this._currentWorkspaceId) return;

      const svgElement = this.previewPane?.shadowRoot?.querySelector('#preview');
      if (svgElement) {
        thumbnailService.generateIfDirty(workspaceId, () => svgElement, store.getAll());
      }
    };
    document.addEventListener('thumbnail-auto-generate', this._handleThumbnailAutoGenerate);

    // beforeunload: fire-and-forget save + thumbnail generation
    this._handleBeforeUnload = () => {
      if (store.get('currentView') === 'workspace' && this._currentWorkspaceId) {
        autosave.saveNow();
        thumbnailService.generateIfDirty(
          this._currentWorkspaceId,
          () => this.previewPane?.shadowRoot?.querySelector('#preview'),
          store.getAll()
        );
      }
    };
    window.addEventListener('beforeunload', this._handleBeforeUnload);
  }

  cleanupEventListeners() {
    document.removeEventListener('export-file', this._handleExportFile);
    document.removeEventListener('copy-code', this._handleCopyCode);
    document.removeEventListener('copy-svg', this._handleCopySvg);
    document.removeEventListener('toggle-annotated', this._handleToggleAnnotated);
    document.removeEventListener('toggle-console', this._handleToggleConsole);
    document.removeEventListener('keydown', this._handleKeydown);
    document.removeEventListener('export-legend', this._handleExportLegend);
    document.removeEventListener('refresh-preview', this._handleRefreshPreview);
    document.removeEventListener('copy-debug-info', this._handleCopyDebugInfo);
    document.removeEventListener('set-thumbnail', this._handleSetThumbnail);
    document.removeEventListener('thumbnail-auto-generate', this._handleThumbnailAutoGenerate);
    window.removeEventListener('beforeunload', this._handleBeforeUnload);
  }

  copyCode() {
    const code = this.editorPane.code;
    navigator.clipboard.writeText(code).catch(err => {
      console.error('Failed to copy code:', err);
    });
  }

  copySvg() {
    const svgElement = this.previewPane.shadowRoot?.querySelector('#preview');
    if (svgElement) {
      const svgString = svgElement.outerHTML;
      navigator.clipboard.writeText(svgString).catch(err => {
        console.error('Failed to copy SVG:', err);
      });
    }
  }

  debouncedUpdate() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this.updatePreview();
      this.updateAnnotatedOutput();
    }, 150);
  }

  async updatePreview() {
    const code = store.get('code') || this.editorPane.code;

    // Increment compilation ID for staleness detection
    const compilationId = store.get('compilationId') + 1;
    store.update({
      compilationId,
      compilationStatus: 'compiling',
      compilationError: null,
    });

    // Check if this compilation is stale (newer one started)
    const isStale = (id) => store.get('compilationId') !== id;

    const compileStart = performance.now();
    try {
      const toFixed = store.get('toFixed');
      const compileOptions = toFixed != null ? { toFixed } : undefined;
      const result = await compilerWorker.compileWithContext(code, compilationId, isStale, compileOptions);
      const compileTime = performance.now() - compileStart;
      console.log(`Compile time: ${compileTime.toFixed(2)}ms`);

      // Don't update if stale
      if (isStale(compilationId)) return;

      // Pre-render GPU-rendered gradients (conic, freeform, mesh)
      let gpuGradientUrls = new Map();
      if (result.gradients?.some(g => g.type === 'conic' || g.type === 'freeform' || g.type === 'mesh')) {
        const svgW = store.get('width') || 200;
        const svgH = store.get('height') || 200;
        const [conicUrls, freeformUrls, meshUrls] = await Promise.all([
          gpuGradientService.renderConicGradients(result.gradients, svgW, svgH),
          gpuGradientService.renderFreeformGradients(result.gradients, svgW, svgH),
          gpuGradientService.renderMeshGradients(result.gradients, svgW, svgH),
        ]);
        for (const [id, url] of conicUrls) gpuGradientUrls.set(id, url);
        for (const [id, url] of freeformUrls) gpuGradientUrls.set(id, url);
        for (const [id, url] of meshUrls) gpuGradientUrls.set(id, url);
        if (isStale(compilationId)) return; // Re-check after async GPU work
      }

      // Set rendering state before updating the SVG
      store.set('compilationStatus', 'rendering');

      // Use timing method to measure rendering — pass layers if available
      const renderTime = result.layers
        ? this.previewPane.setLayersWithTiming(result.layers, { masks: result.masks || [], clipPaths: result.clipPaths || [], gradients: result.gradients || [], patterns: result.patterns || [], cssProperties: result.cssProperties || [], gpuGradientUrls })
        : this.previewPane.setPathDataWithTiming(result.path);
      console.log(`Render time: ${renderTime.toFixed(2)}ms`);

      this.previewPane.hideLoading();
      this.consolePane.logs = result.logs || [];
      this.hideError();

      // Store layers and defs for layers panel
      const resultLayers = result.layers || [];
      store.set('layers', resultLayers);
      store.set('masks', result.masks || []);
      store.set('clipPaths', result.clipPaths || []);
      store.set('gradients', result.gradients || []);
      store.set('patterns', result.patterns || []);
      store.set('cssProperties', result.cssProperties || []);

      // Clean up stale visibility entries
      const currentVisibility = store.get('layerVisibility');
      const currentLayerNames = new Set(resultLayers.map(l => l.name));
      const cleaned = {};
      for (const [name, visible] of Object.entries(currentVisibility)) {
        if (currentLayerNames.has(name)) {
          cleaned[name] = visible;
        }
      }
      store.set('layerVisibility', cleaned);

      store.update({
        compilationStatus: 'completed',
        compilationError: null,
        calledStdlibFunctions: result.calledStdlibFunctions || [],
      });

      // Auto-hide completion status after a brief moment
      setTimeout(() => {
        if (store.get('compilationStatus') === 'completed') {
          store.set('compilationStatus', 'idle');
        }
      }, 1500);
    } catch (e) {
      // Don't update if stale (unless it's not a stale error)
      if (e.message === 'Stale result') return;
      if (isStale(compilationId)) return;

      this.previewPane.hideLoading();
      this.showError(e.message);
      this.consolePane.logs = [];
      store.set('layers', []);
      store.update({
        compilationStatus: 'error',
        compilationError: e.message,
      });
    }
  }

  async updateAnnotatedOutput() {
    if (!this.annotatedPane.isOpen) return;

    const code = store.get('code') || this.editorPane.code;
    const compilationId = store.get('compilationId');

    // Check if this compilation is stale
    const isStale = (id) => store.get('compilationId') !== id;

    try {
      const annotated = await compilerWorker.compileAnnotated(code, compilationId, isStale);

      // Don't update if stale
      if (isStale(compilationId)) return;

      this.annotatedPane.content = annotated;
      store.set('annotatedOutput', annotated);
    } catch (e) {
      // Don't update if stale
      if (e.message === 'Stale result') return;
      if (isStale(compilationId)) return;

      this.annotatedPane.content = `// Error: ${e.message}`;
    }
  }

  showError(message) {
    this.errorPanel.show(message);
    // Highlight error location in editor for parser errors
    const parseMatch = message.match(/Parse error at line (\d+), column (\d+)/);
    if (parseMatch) {
      this.editorPane.highlightError(parseInt(parseMatch[1], 10), parseInt(parseMatch[2], 10));
      return;
    }
    // Highlight error location for runtime errors (with or without column)
    const runtimeMatch = message.match(/^Line (\d+)(?:, col (\d+))?: /);
    if (runtimeMatch) {
      const line = parseInt(runtimeMatch[1], 10);
      const col = runtimeMatch[2] ? parseInt(runtimeMatch[2], 10) : 1;
      this.editorPane.highlightError(line, col);
    }
  }

  hideError() {
    this.errorPanel.hide();
    this.editorPane.clearError();
  }

  // Export file (renamed from saveFile)
  async exportFile() {
    const code = this.editorPane.code;
    const workspaceName = store.get('workspaceName') || store.get('currentFileName') || 'untitled';
    const suggestedName = workspaceName.endsWith('.svgx') ? workspaceName : `${workspaceName}.svgx`;

    try {
      if ('showSaveFilePicker' in window) {
        const options = {
          suggestedName,
          types: [{
            description: 'SVG Path Extended Files',
            accept: { 'text/plain': ['.svgx'] },
          }],
        };

        const handle = await window.showSaveFilePicker(options);
        const writable = await handle.createWritable();
        await writable.write(code);
        await writable.close();
      } else {
        // Fallback for browsers without File System Access API
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Export failed:', err);
      }
    }
  }

  // Simple string hash for content change tracking (not cryptographic)
  _simpleHash(str) {
    if (!str) return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return hash.toString(36);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          position: relative;
          font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
          background: var(--bg-secondary, #f5f5f5);
          color: var(--text-primary, #1a1a1a);
        }

        /* Hide when not active */
        :host(:not(.active)) {
          display: none;
        }

        playground-main {
          flex: 1;
          min-height: 0;
        }
      </style>

      <playground-main>
        <code-editor-pane></code-editor-pane>
        <annotated-pane></annotated-pane>
        <console-pane></console-pane>
        <svg-preview-pane></svg-preview-pane>
      </playground-main>

      <error-panel></error-panel>

      <docs-panel></docs-panel>

      <export-legend-modal></export-legend-modal>

      <thumbnail-crop-modal></thumbnail-crop-modal>

      <playground-footer></playground-footer>
    `;
  }
}

customElements.define('workspace-view', WorkspaceView);
