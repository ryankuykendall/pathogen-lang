// Workspace View - Code editor, preview, and compilation
// Route: /workspace/:id

import { store } from '../state/store.js';
import { defaultCode, examples } from '../utils/examples.js';

// Import all sub-components
import './code-editor-pane.js';
import './annotated-pane.js';
import './console-pane.js';
import './docs-panel.js';
import './inspector-panel.js';
import './export-modal.js';
import './playground-footer.js';
import './playground-main.js';
import './svg-preview-pane.js';
import './thumbnail-crop-modal.js';
import './edit-workspace-metadata-modal.js';
import gpuGradientService from '../gpu/gradient-service.js';
import { workspaceApi } from '../services/api.js';
import { autosave, SaveStatus } from '../services/autosave.js';
import compilerWorker from '../services/compiler-worker.js';
import { formatFontSubstitutions } from '../services/font-loader.js';
import thumbnailService from '../services/thumbnail-service.js';
import tabCoordinator from '../services/tab-coordinator.js';
import { getUserId } from '../services/user-id.js';
import { parseWorkspaceSlugId } from '../utils/router.js';
import { applyURLState, loadFromURL } from '../utils/url-state.js';
import { createCompileTicker } from '../utils/compile-ticker.js';
import { collectLayerNames, pruneVisibility } from '../utils/layer-visibility.js';
import { installPerfObservers, perfSpan, perfSpanAsync } from '../utils/perf-marks.js';
import { computeDefaultExportSvgBytes } from '../utils/svg-export-size.js';
import { ensureChromeFontRules, getChromeFontRulesIfReady } from '../utils/export-fonts.js';
import { updateWorkspaceSlugUrl } from '../utils/workspace-slug-url.js';
import './shared/error-panel.js';

export class WorkspaceView extends HTMLElement {
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Once-a-second clock behind the "Compiling... MM:SS" chip. Started at each
  // compile start, stopped when status leaves 'compiling'.
  private _compileTicker = createCompileTicker();

  private _fileHandle: FileSystemFileHandle | null = null;

  private _initialized = false;

  // Monotonic stamp for initialize() calls — see the generation check there.
  private _initGeneration = 0;

  private _routeUnsubscribe: (() => void) | null = null;

  private _loadingWorkspace = false;

  private _currentWorkspaceId: string | null | undefined = undefined;

  // Document-level event handlers (stored for cleanup)
  private _handleCopyCode: (() => void) | null = null;

  private _handleCopySvg: (() => void) | null = null;

  private _handleFormatDocument: (() => void) | null = null;

  private _handleToggleAnnotated: (() => void) | null = null;

  private _handleToggleConsole: (() => void) | null = null;

  private _handleToggleInspector: (() => void) | null = null;

  private _handleKeydown: ((e: KeyboardEvent) => void) | null = null;

  private _handleOpenExport: (() => void) | null = null;

  private _handleRefreshPreview: (() => void) | null = null;

  private _handleSetThumbnail: (() => void) | null = null;

  private _handleRenameWorkspace: (() => void) | null = null;

  private _handleCopyDebugInfo: (() => Promise<void>) | null = null;

  private _handleThumbnailAutoGenerate: ((e: Event) => void) | null = null;

  private _handleBeforeUnload: ((e: BeforeUnloadEvent) => void) | null = null;

  private _handleVisibilityChange: (() => void) | null = null;

  private _handleEditorBlur: (() => void) | null = null;

  private _handleWorkspaceConflict: ((e: Event) => void) | null = null;

  private _handleFullscreenChange: ((e: Event) => void) | null = null;

  private _multiTabUnsubscribe: (() => void) | null = null;
  private _fontWarningsUnsubscribe: (() => void) | null = null;
  private _dismissedFontWarnings = '';

  private _inspectorDataUnsubscribe: (() => void) | null = null;
  private _inspectorOpenUnsubscribe: (() => void) | null = null;

  private _inspectorSyncScheduled = false;

  private _handleLayerVisibilityChange: ((e: Event) => void) | null = null;

  private _handleDefsVisibilityChange: ((e: Event) => void) | null = null;

  private _isPreviewFullscreen = false;

  // Export-size estimate (breadcrumb): pending idle-callback bookkeeping
  private _sizeIdleId: number | null = null;

  private _sizeUsesTimeout = false;

  private _sizeRetryCount = 0;

  private _sizeTriggerUnsubscribe: (() => void) | null = null;

  // False until the current workspace's first successful render. Guards the
  // async continuations (idle callback, font-fetch .then) against computing a
  // size from a half-torn-down preview right after a workspace switch —
  // previewPane.clear() empties the SVG but keeps the element truthy, so the
  // !preview guard alone can't catch it.
  private _sizeArmed = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.setupEventListeners();
    installPerfObservers();

    // Initialize WebGPU gradient service (async, non-blocking)
    gpuGradientService.init();

    // Subscribe to route changes to initialize when becoming active
    this._routeUnsubscribe = store.subscribe(['currentView', 'routeParams'], () => {
      this.handleRouteChange();
    });

    // Check if we should initialize immediately (if already on workspace route)
    this.handleRouteChange();
  }

  disconnectedCallback(): void {
    if (this._routeUnsubscribe) {
      this._routeUnsubscribe();
    }
    // Flush pending saves before leaving
    autosave.flush();
    // Close tab coordinator
    tabCoordinator.close();
    // Clean up event listeners
    this.cleanupEventListeners();
    // Stop the compile clock, then terminate the compiler worker
    this._compileTicker.stop();
    compilerWorker.terminateWorker();
    // Release GPU texture cache
    gpuGradientService.clearCache();
  }

  handleRouteChange(): void {
    const currentView = store.get('currentView') as string;
    const routeParams = (store.get('routeParams') || {}) as Record<string, string>;
    const isActive = currentView === 'workspace';

    // Parse workspace ID from slugId (format: slug--id or just id)
    const { id: workspaceId } = parseWorkspaceSlugId(routeParams.slugId);

    if (isActive) {
      // Check if we need to load a different workspace
      if (!this._initialized || this._currentWorkspaceId !== workspaceId) {
        const isSwitch = this._initialized && this._currentWorkspaceId !== workspaceId;
        // The old workspace's id is overwritten on the next line — capture it
        // for the thumbnail refresh below.
        const previousWorkspaceId = this._currentWorkspaceId;
        this._currentWorkspaceId = workspaceId;
        if (isSwitch) {
          // In-app workspace→workspace switch: persist the previous
          // workspace's pending edits NOW, while autosave is still bound to
          // it. flush() captures the workspace id and pending code
          // synchronously before its first await, so firing-and-forgetting
          // ahead of initialize() is safe — initialize() awaits the flush
          // before touching autosave state. (If the flush's network save
          // fails, the pending edit is dropped — same preexisting behavior
          // as leaving the workspace view.)
          autosave.flush();
          // Refresh the outgoing workspace's thumbnail if its content
          // changed this visit. Must be called synchronously here:
          // generateIfDirty serializes BOTH raster sources (square crop +
          // hero) before its first await, so the capture happens while the
          // preview still shows the old workspace — initialize() empties the
          // singleton preview node in place shortly after.
          this._generateThumbnailFor(previousWorkspaceId);
          // loadWorkspace() only re-arms auto-generation when the incoming
          // workspace is owned — clear the outgoing workspace's idle timer
          // and tracking explicitly so no stale state lingers otherwise.
          thumbnailService.stopAutoGeneration();
        }
        // This element is a reused singleton — clear the previous workspace's
        // font warnings and dismissal memory so a stale banner can't show for
        // (or stay suppressed in) the newly opened workspace.
        this._dismissedFontWarnings = '';
        store.set('fontWarnings', []);
        this.waitForLibrary();
      }
    } else {
      // Flush pending saves when leaving workspace view
      if (this._initialized) {
        // Capture BEFORE flush(): its async teardown clears this state. Only
        // a visit that actually armed autosave needs a forced re-initialize
        // on return (see below) — `?state=` scratch visits and non-owned
        // workspaces never arm it, and re-initializing those on return would
        // discard the user's in-memory edits (the `?state=` branch re-decodes
        // the URL's original code).
        const hadArmedAutosave = autosave.isEnabled && autosave.workspaceId === this._currentWorkspaceId;
        autosave.flush();
        tabCoordinator.close();
        store.set('multiTabWarning', false);
        store.set('fontWarnings', []);

        // Generate thumbnail if content changed since last thumbnail
        this._generateThumbnailFor(this._currentWorkspaceId);
        thumbnailService.stopAutoGeneration();

        // Leaving tears down per-visit services (autosave stopped by the
        // flush, tab coordinator closed, thumbnail auto-gen stopped), so a
        // return — even to the SAME workspace — must run initialize() again
        // to re-arm them. Without this, coming back skipped initialize()
        // via the same-id guard above and autosave stayed disarmed for the
        // rest of the session: every edit after returning was silently
        // never saved. Re-initializing also re-fetches the workspace, so a
        // return picks up changes saved from another tab at a fresh rev.
        if (hadArmedAutosave) {
          this._initialized = false;
        }
      }
    }
  }

  /**
   * Regenerate a workspace's thumbnail if its content changed this visit,
   * and notify listeners (landing-view cards) on success. Owned workspaces
   * only: for non-owned workspaces, `?state=` scratch docs, and the 404
   * fallback the upload would just 403/404 and surface a spurious
   * "Thumbnail not updated" error toast. At every call site the store still
   * holds the target workspace's `workspaceOwnerId` (initialize() resets it
   * later), so the guard reads current state.
   */
  private _generateThumbnailFor(wsId: string | null | undefined): void {
    if (!wsId) return;
    if (store.get('workspaceOwnerId') !== getUserId()) return;
    thumbnailService
      .generateIfDirty(wsId, () => this.previewPane?.preview ?? null, store.getAll())
      .then((result: unknown) => {
        if (result) {
          document.dispatchEvent(
            new CustomEvent('thumbnail-updated', {
              bubbles: true,
              composed: true,
              detail: { workspaceId: wsId },
            }),
          );
        }
      });
  }

  get editorPane(): HTMLElement & {
    code: string;
    initialCode: string;
    highlightError: (line: number, col: number) => void;
    clearError: () => void;
  } {
    return this.shadowRoot!.querySelector('code-editor-pane') as any;
  }

  get previewPane(): HTMLElement & {
    clear: () => void;
    showLoading: () => void;
    hideLoading: () => void;
    setStale: (stale: boolean) => void;
    updateSvgStyles: () => void;
    setLayersWithTiming: (layers: unknown[], options: unknown) => number;
    setPathDataWithTiming: (path: string) => number;
    preview: SVGSVGElement | null;
  } {
    return this.shadowRoot!.querySelector('svg-preview-pane') as any;
  }

  get annotatedPane(): HTMLElement & { open: () => void; toggle: () => void; isOpen: boolean; content: string } {
    return this.shadowRoot!.querySelector('annotated-pane') as any;
  }

  get consolePane(): HTMLElement & { open: () => void; toggle: () => void; logs: unknown[] } {
    return this.shadowRoot!.querySelector('console-pane') as any;
  }

  get docsPanel(): HTMLElement & { open: () => void; close: () => void } {
    return this.shadowRoot!.querySelector('docs-panel') as any;
  }

  get inspectorPanel(): HTMLElement & { setData: (data: Record<string, unknown>) => void; open: boolean } {
    return this.shadowRoot!.querySelector('inspector-panel') as HTMLElement & {
      setData: (data: Record<string, unknown>) => void;
      open: boolean;
    };
  }

  get errorPanel(): HTMLElement & {
    show: (message: string) => void;
    hide: () => void;
    showFeedback: (message: string) => void;
  } {
    return this.shadowRoot!.querySelector('error-panel') as any;
  }

  get exportModal(): HTMLElement & { open: (svgElement: SVGElement, state: unknown) => void } {
    return this.shadowRoot!.querySelector('export-modal') as any;
  }

  get thumbnailCropModal(): HTMLElement & { open: (svgElement: SVGElement, state: unknown) => void } {
    return this.shadowRoot!.querySelector('thumbnail-crop-modal') as any;
  }

  get editMetadataModal(): HTMLElement & { open: (opts: { name: string | null; description: string | null }) => void } {
    return this.shadowRoot!.querySelector('edit-workspace-metadata-modal') as any;
  }

  waitForLibrary(maxWait = 5000): void {
    const start = Date.now();
    const check = (): void => {
      if ((window as any).PathogenLang) {
        this.initialize();
      } else if (Date.now() - start < maxWait) {
        setTimeout(check, 50);
      } else {
        this.showError('Failed to load pathogen-lang library');
      }
    };
    check();
  }

  async initialize(): Promise<void> {
    this._initialized = true;
    // Generation stamp: distinguishes THIS call from any initialize() that
    // starts while we're suspended below — including one for the SAME
    // workspace id (leave/return oscillation), which the route-identity
    // check alone can't tell apart.
    const generation = ++this._initGeneration;
    // Capture the route identity BEFORE any await: if another navigation
    // lands while we wait on the flush below, this call is superseded and
    // must bail rather than resume against the newer route's params.
    const routeParams = (store.get('routeParams') || {}) as Record<string, string>;
    const routeQuery = (store.get('routeQuery') || {}) as Record<string, string>;
    // Parse workspace ID from slugId (format: slug--id or just id)
    const { id: workspaceId } = parseWorkspaceSlugId(routeParams.slugId);

    // Let any in-flight flush of the PREVIOUS workspace finish before its
    // autosave state is torn down (stop() during a flush would drop the
    // pending save), then disarm autosave unconditionally. The stop() is the
    // backstop for every branch below that never calls autosave.init() —
    // `?state=` links, non-owned workspaces, and the 404/defaultCode
    // fallback — so no stale debounce/keepalive save can ever write this
    // route's code into the previous workspace.
    await autosave.awaitPendingFlush();
    autosave.stop();

    // A newer initialize() started while we awaited (rapid switching or a
    // leave/return oscillation): it owns the store from here — resuming
    // would reset it underneath the winner.
    if (generation !== this._initGeneration) {
      return;
    }
    // The user left the workspace view (or the route moved on) while we
    // awaited, and no newer initialize() has run. Mark the view
    // uninitialized so the next return re-runs the full path instead of
    // resuming a half-loaded visit with autosave disarmed.
    if ((store.get('currentView') as string) !== 'workspace' || this._currentWorkspaceId !== workspaceId) {
      this._initialized = false;
      return;
    }

    this.previewPane.clear();
    this.previewPane.showLoading();

    // Reset workspace state
    store.update({
      workspaceId: null,
      workspaceName: null,
      workspaceDescription: null,
      workspaceIsPublic: false,
      workspacePublicationState: 'unpublished',
      workspaceRereviewPending: false,
      workspaceOwnerId: null,
      workspaceUpdatedAt: null,
      workspaceManualThumbnailAt: null,
      saveStatus: SaveStatus.IDLE,
      saveError: null,
      // The size belongs to the previous workspace's compile output
      exportSvgBytes: null,
    });
    // Disarm pending size computes until this workspace's first successful
    // compile — see _sizeArmed.
    this._sizeArmed = false;

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
      const preferences = store.get('preferences') as {
        background: string;
        gridEnabled: boolean;
        gridColor: string;
        gridSize: number;
        toFixed: number | null;
      } | null;
      this.editorPane.initialCode = defaultCode;
      store.update({
        code: defaultCode,
        currentFileName: null,
      });
      // Apply user preferences to SVG styles (width/height now come from compile result)
      if (preferences) {
        (store as any).update({
          background: preferences.background,
          gridEnabled: preferences.gridEnabled,
          gridColor: preferences.gridColor,
          gridSize: preferences.gridSize,
          toFixed: preferences.toFixed ?? null,
        });
      }
    }

    // Initialize panes based on store state
    if (store.get('annotatedOpen') as boolean) {
      this.annotatedPane.open();
    }
    if (store.get('consoleOpen') as boolean) {
      this.consolePane.open();
    }

    // Initial compilation
    this.updatePreview();
  }

  updateUrlWithSlug(id: string, slug: string | null): void {
    updateWorkspaceSlugUrl(id, slug);
  }

  async loadWorkspace(id: string): Promise<void> {
    if (this._loadingWorkspace) return;
    this._loadingWorkspace = true;

    try {
      const workspace = (await workspaceApi.get(id)) as any;
      const userId = getUserId();

      // Update store with workspace data
      store.update({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceDescription: workspace.description,
        workspaceIsPublic: workspace.isPublic,
        workspacePublicationState: workspace.publicationState || 'unpublished',
        workspaceRereviewPending: Boolean(workspace.rereviewPending),
        workspaceOwnerId: workspace.userId,
        workspaceUpdatedAt: workspace.updatedAt,
        workspaceManualThumbnailAt: workspace.manualThumbnailAt ?? null,
        code: workspace.code,
        currentFileName: workspace.name,
      });

      // Apply workspace preferences to SVG styles (width/height come from compile result)
      if (workspace.preferences) {
        const prefs = workspace.preferences;
        store.update({
          background: prefs.background ?? (store.get('background') as string),
          gridEnabled: prefs.gridEnabled ?? (store.get('gridEnabled') as boolean),
          gridColor: prefs.gridColor ?? (store.get('gridColor') as string),
          gridSize: prefs.gridSize ?? (store.get('gridSize') as number),
          toFixed: prefs.toFixed ?? (store.get('toFixed') as number | null),
        });
      }

      // Set editor code
      this.editorPane.initialCode = workspace.code;

      // Update URL with slug if not already present
      this.updateUrlWithSlug(workspace.id, workspace.slug);

      // Initialize autosave if user owns this workspace
      if (workspace.userId === userId) {
        autosave.init(workspace.id, workspace.contentHash, workspace.rev ?? 0);

        // Start thumbnail auto-generation tracking
        thumbnailService.startAutoGeneration(workspace.id);
        thumbnailService.setThumbnailContentHash(workspace.thumbnailContentHash || null);

        // Store initial preferences state for change detection
        autosave.setInitialPreferences({
          background: store.get('background') as string,
          gridEnabled: store.get('gridEnabled') as boolean,
          gridColor: store.get('gridColor') as string,
          gridSize: store.get('gridSize') as number,
          toFixed: store.get('toFixed') as number | null,
        });

        // Detect same workspace open in another tab
        tabCoordinator.open(workspace.id);
      }
    } catch (err: any) {
      console.error('Failed to load workspace:', err);
      if (err.status === 404) {
        this.showError('Workspace not found');
      } else if (err.status === 403) {
        this.showError('You do not have access to this workspace');
      } else {
        this.showError(`Failed to load workspace: ${err.message}`);
      }

      // Fall back to default code
      this.editorPane.initialCode = defaultCode;
      store.set('code', defaultCode);
    } finally {
      this._loadingWorkspace = false;
    }
  }

  setupEventListeners(): void {
    // Dismiss multi-tab warning
    this.shadowRoot!.querySelector('#dismiss-multi-tab')?.addEventListener('click', () => {
      store.set('multiTabWarning', false);
    });

    // Dismiss font-substitution warning — remembered per message set, so the
    // banner stays hidden across keystroke recompiles but re-appears when the
    // substitutions change.
    this.shadowRoot!.querySelector('#dismiss-font-warning')?.addEventListener('click', () => {
      this._dismissedFontWarnings = (store.get('fontWarnings') as string[]).join('\n');
      this._updateFontWarningBanner();
    });

    // Re-apply compilation error when editor finishes loading
    this.shadowRoot!.addEventListener('editor-ready', () => {
      const error = store.get('compilationError') as string | null;
      if (error) {
        this.showError(error);
      }
    });

    // Code changes from editor
    this.shadowRoot!.addEventListener('code-change', (e: Event) => {
      this.debouncedUpdate();

      // Get code from event detail (more reliable than store timing)
      const code = (e as CustomEvent<{ code?: string }>).detail?.code || (store.get('code') as string);

      // Trigger autosave
      autosave.onChange(code);

      // Track content change for thumbnail auto-generation
      // Use a simple hash of the code for comparison
      thumbnailService.onContentChanged(this._simpleHash(code));
    });

    // Style changes from footer
    this.shadowRoot!.addEventListener('style-change', () => {
      this.previewPane.updateSvgStyles();

      // Save preferences to backend (width/height now live in source via define ViewBox)
      const preferences = {
        background: store.get('background') as string,
        gridEnabled: store.get('gridEnabled') as boolean,
        gridColor: store.get('gridColor') as string,
        gridSize: store.get('gridSize') as number,
        toFixed: store.get('toFixed') as number | null,
      };
      autosave.onPreferencesChange(preferences);
    });

    // Precision changes from footer (requires recompilation)
    this.shadowRoot!.addEventListener('precision-change', () => {
      this.updatePreview();
      this.updateAnnotatedOutput();

      // Save preferences to backend (width/height now live in source via define ViewBox)
      const preferences = {
        background: store.get('background') as string,
        gridEnabled: store.get('gridEnabled') as boolean,
        gridColor: store.get('gridColor') as string,
        gridSize: store.get('gridSize') as number,
        toFixed: store.get('toFixed') as number | null,
      };
      autosave.onPreferencesChange(preferences);
    });

    // CSS variable overrides from inspector panel -> apply to SVG preview.
    // Phase 3 moved compiled SVG into a sandboxed iframe; setCssVar / removeCssVar
    // forward the override into the iframe document where the SVG lives.
    this.shadowRoot!.addEventListener('cssvar-override', (e: Event) => {
      const pane = this.previewPane as
        | (HTMLElement & {
            setCssVar?: (n: string, v: string) => void;
            removeCssVar?: (n: string) => void;
          })
        | null;
      if (!pane) return;
      const { varName, value } = (e as CustomEvent<{ varName: string; value: string }>).detail;
      if (value && pane.setCssVar) {
        pane.setCssVar(varName, value);
      } else if (pane.removeCssVar) {
        pane.removeCssVar(varName);
      }
    });

    // Open docs
    this.shadowRoot!.addEventListener('open-docs', () => {
      this.docsPanel.open();
    });

    // Listen for events from app-header and app-breadcrumb (bubble up through DOM)
    // These listeners are on document to catch events from outside shadow DOM
    this._handleFormatDocument = (): void => {
      if (store.get('currentView') !== 'workspace') return;
      const pane = this.editorPane as unknown as { formatDocument?: () => void };
      if (pane && typeof pane.formatDocument === 'function') {
        pane.formatDocument();
      }
    };
    document.addEventListener('format-document', this._handleFormatDocument);

    this._handleCopyCode = (): void => {
      if (store.get('currentView') === 'workspace') {
        this.copyCode();
      }
    };
    document.addEventListener('copy-code', this._handleCopyCode);

    this._handleCopySvg = (): void => {
      if (store.get('currentView') === 'workspace') {
        this.copySvg();
      }
    };
    document.addEventListener('copy-svg', this._handleCopySvg);

    this._handleToggleAnnotated = (): void => {
      if (store.get('currentView') === 'workspace') {
        this.annotatedPane.toggle();
        if (this.annotatedPane.isOpen) {
          this.updateAnnotatedOutput();
        }
      }
    };
    document.addEventListener('toggle-annotated', this._handleToggleAnnotated);

    this._handleToggleConsole = (): void => {
      if (store.get('currentView') === 'workspace') {
        this.consolePane.toggle();
      }
    };
    document.addEventListener('toggle-console', this._handleToggleConsole);

    this._handleToggleInspector = (): void => {
      if ((store.get('currentView') as string) === 'workspace') {
        const isOpen = !(store.get('inspectorOpen') as boolean);
        store.set('inspectorOpen', isOpen);
        this.inspectorPanel.classList.toggle('open', isOpen);
        this.updateInspectorOverlay();
      }
    };
    document.addEventListener('toggle-inspector', this._handleToggleInspector);

    // Fullscreen change — track preview fullscreen state for inspector overlay
    this._handleFullscreenChange = (e: Event): void => {
      const detail = (e as CustomEvent).detail;
      this._isPreviewFullscreen = detail.fullscreen;
      this.updateInspectorOverlay();
    };
    document.addEventListener('fullscreen-change', this._handleFullscreenChange);

    // Keyboard shortcuts (capture phase so ESC can intercept before fullscreen-toggle)
    this._handleKeydown = (e: KeyboardEvent): void => {
      if (store.get('currentView') !== 'workspace') return;

      if (e.key === 'Escape') {
        // Close inspector overlay first when both fullscreen + inspector are active
        if (this._isPreviewFullscreen && (store.get('inspectorOpen') as boolean)) {
          e.stopPropagation();
          store.set('inspectorOpen', false);
          this.inspectorPanel.classList.remove('open');
          this.updateInspectorOverlay();
          return;
        }
        if (this.docsPanel.classList.contains('open')) {
          this.docsPanel.close();
        }
      }
      // Ctrl/Cmd+S saves immediately
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        autosave.saveNow();
      }
      // Ctrl/Cmd+Shift+E opens the export modal
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        this._handleOpenExport?.();
      }
    };
    document.addEventListener('keydown', this._handleKeydown, true);

    // Open the export modal (SVG / PNG / PDF, optional legend)
    this._handleOpenExport = (): void => {
      if (store.get('currentView') === 'workspace') {
        const svgElement = this.previewPane.preview;
        if (svgElement) {
          this.exportModal.open(svgElement, store.getAll());
        }
      }
    };
    document.addEventListener('open-export', this._handleOpenExport);

    // Refresh preview (for random functions)
    this._handleRefreshPreview = (): void => {
      if (store.get('currentView') === 'workspace') {
        this.updatePreview();
        this.updateAnnotatedOutput();
      }
    };
    document.addEventListener('refresh-preview', this._handleRefreshPreview);

    // Set thumbnail (crop modal)
    this._handleSetThumbnail = (): void => {
      if (store.get('currentView') === 'workspace') {
        const svgElement = this.previewPane.preview;
        if (svgElement) {
          this.thumbnailCropModal.open(svgElement, store.getAll());
        }
      }
    };
    document.addEventListener('set-thumbnail', this._handleSetThumbnail);

    // Rename workspace (edit name + description)
    this._handleRenameWorkspace = (): void => {
      if (store.get('currentView') !== 'workspace') return;
      const modal = this.editMetadataModal;
      if (!modal) return;
      modal.open({
        name: store.get('workspaceName') as string | null,
        description: store.get('workspaceDescription') as string | null,
      });
    };
    document.addEventListener('rename-workspace', this._handleRenameWorkspace);

    // Copy debug info
    this._handleCopyDebugInfo = async (): Promise<void> => {
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
    this._handleThumbnailAutoGenerate = (e: Event): void => {
      if (store.get('currentView') !== 'workspace') return;
      const { workspaceId } = (e as CustomEvent<{ workspaceId: string }>).detail;
      if (workspaceId !== this._currentWorkspaceId) return;
      this._generateThumbnailFor(workspaceId);
    };
    document.addEventListener('thumbnail-auto-generate', this._handleThumbnailAutoGenerate);

    // beforeunload: flush the pending save with keepalive so it survives page
    // teardown (a plain fetch issued here is cancelled), and warn the user when
    // there are still-unsaved changes so they can't silently lose work.
    this._handleBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (store.get('currentView') === 'workspace' && this._currentWorkspaceId) {
        const unsaved = autosave.hasUnsavedChanges();
        autosave.saveNow({ keepalive: true });
        this._generateThumbnailFor(this._currentWorkspaceId);
        if (unsaved) {
          // Native "Leave site? Changes you made may not be saved." prompt.
          e.preventDefault();
          e.returnValue = '';
        }
      }
    };
    window.addEventListener('beforeunload', this._handleBeforeUnload);

    // visibilitychange → hidden is the reliable backgrounding/mobile signal
    // (beforeunload is unreliable on mobile). Flush with keepalive so a save is
    // delivered before the OS may discard the tab, shrinking the unsaved window.
    this._handleVisibilityChange = (): void => {
      if (
        document.visibilityState === 'hidden' &&
        store.get('currentView') === 'workspace' &&
        this._currentWorkspaceId
      ) {
        autosave.saveNow({ keepalive: true });
      }
    };
    document.addEventListener('visibilitychange', this._handleVisibilityChange);

    // Flush the pending save when focus leaves the editor. The page is still
    // alive here, so a normal (non-keepalive) save is fine.
    this._handleEditorBlur = (): void => {
      if (store.get('currentView') === 'workspace' && this._currentWorkspaceId) {
        autosave.saveNow();
      }
    };
    this.shadowRoot!.addEventListener('editor-blur', this._handleEditorBlur);

    // Multi-tab conflict warning
    this._handleWorkspaceConflict = (): void => {
      if (store.get('currentView') === 'workspace') {
        store.set('multiTabWarning', true);
        this._updateWarningBanner();
      }
    };
    document.addEventListener('workspace-conflict', this._handleWorkspaceConflict);

    // Subscribe to multiTabWarning changes for banner updates
    this._multiTabUnsubscribe = store.subscribe(['multiTabWarning'], () => {
      this._updateWarningBanner();
    });

    // Subscribe to font-weight substitution warnings
    this._fontWarningsUnsubscribe = store.subscribe(['fontWarnings'], () => {
      this._updateFontWarningBanner();
    });

    // Feed inspector panel data from store. The post-compile store.set
    // cluster in updatePreview() notifies most of these keys back-to-back;
    // coalesce to a single setData per microtask so the inspector re-renders
    // once per compile instead of once per changed key.
    // __PATHOGEN_NO_INSPECTOR__ is the perf-audit kill switch (A/B lever for
    // scripts/perf-typing-audit.ts): perf spans can't see the style/layout
    // cost of a huge inspector DOM, so the honest measurement is long-task
    // deltas with this subscription on vs off.
    if (!(window as unknown as { __PATHOGEN_NO_INSPECTOR__?: boolean }).__PATHOGEN_NO_INSPECTOR__) {
      this._inspectorDataUnsubscribe = store.subscribe(
        ['layers', 'masks', 'clipPaths', 'gradients', 'cssProperties', 'layerVisibility', 'defsVisibility'],
        () => {
          if (this._inspectorSyncScheduled) return;
          this._inspectorSyncScheduled = true;
          queueMicrotask(() => {
            this._inspectorSyncScheduled = false;
            this.inspectorPanel?.setData({
              layers: store.get('layers') as any[],
              masks: store.get('masks') as any[],
              clipPaths: store.get('clipPaths') as any[],
              gradients: store.get('gradients') as any[],
              cssProperties: store.get('cssProperties') as any[],
              layerVisibility: store.get('layerVisibility') as Record<string, boolean>,
              defsVisibility: store.get('defsVisibility') as Record<string, boolean>,
            });
          });
        },
      );

      // Gate the panel's rendering on the open flag: while closed it defers
      // setData (a closed inspector used to pay a full row build per compile
      // for zero visible pixels) and renders the latest data on open.
      this._inspectorOpenUnsubscribe = store.subscribe(['inspectorOpen'], () => {
        const panel = this.inspectorPanel;
        if (panel) panel.open = store.get('inspectorOpen') as boolean;
      });
      this.inspectorPanel.open = store.get('inspectorOpen') as boolean;
    }

    // Non-compile changes that move the exported bytes: background recolors
    // the snapshot's #preview-bg; visibility toggles set inline display:none
    // that the export clone captures. Grid keys are irrelevant (export forces
    // the grid off) and zoom/pan is reset by the snapshot's viewBox override.
    this._sizeTriggerUnsubscribe = store.subscribe(['background', 'layerVisibility', 'defsVisibility'], () => {
      this._scheduleExportSizeUpdate();
    });

    // Layer visibility changes from inspector — write back to store
    this._handleLayerVisibilityChange = (e: Event): void => {
      const { name, visible } = (e as CustomEvent).detail;
      const visibility = { ...(store.get('layerVisibility') as Record<string, boolean>) };
      visibility[name] = visible;
      store.set('layerVisibility', visibility);
    };
    document.addEventListener('layer-visibility-change', this._handleLayerVisibilityChange);

    this._handleDefsVisibilityChange = (e: Event): void => {
      const { key, visible } = (e as CustomEvent).detail;
      const visibility = { ...(store.get('defsVisibility') as Record<string, boolean>) };
      visibility[key] = visible;
      store.set('defsVisibility', visibility);
    };
    document.addEventListener('defs-visibility-change', this._handleDefsVisibilityChange);
  }

  private updateInspectorOverlay(): void {
    this.inspectorPanel.classList.toggle('fullscreen-overlay', this._isPreviewFullscreen);
    // The export modal (z-index --z-modal, 300) must also outrank the
    // fullscreen preview pane (9999) so the pane's export button can open it.
    this.exportModal.classList.toggle('fullscreen-overlay', this._isPreviewFullscreen);
  }

  cleanupEventListeners(): void {
    if (this._handleFormatDocument) document.removeEventListener('format-document', this._handleFormatDocument);
    if (this._handleCopyCode) document.removeEventListener('copy-code', this._handleCopyCode);
    if (this._handleCopySvg) document.removeEventListener('copy-svg', this._handleCopySvg);
    if (this._handleToggleAnnotated) document.removeEventListener('toggle-annotated', this._handleToggleAnnotated);
    if (this._handleToggleConsole) document.removeEventListener('toggle-console', this._handleToggleConsole);
    if (this._handleToggleInspector) document.removeEventListener('toggle-inspector', this._handleToggleInspector);
    if (this._handleFullscreenChange) document.removeEventListener('fullscreen-change', this._handleFullscreenChange);
    if (this._handleKeydown) document.removeEventListener('keydown', this._handleKeydown, true);
    if (this._handleOpenExport) document.removeEventListener('open-export', this._handleOpenExport);
    if (this._handleRefreshPreview) document.removeEventListener('refresh-preview', this._handleRefreshPreview);
    if (this._handleCopyDebugInfo) document.removeEventListener('copy-debug-info', this._handleCopyDebugInfo);
    if (this._handleSetThumbnail) document.removeEventListener('set-thumbnail', this._handleSetThumbnail);
    if (this._handleRenameWorkspace) document.removeEventListener('rename-workspace', this._handleRenameWorkspace);
    if (this._handleThumbnailAutoGenerate)
      document.removeEventListener('thumbnail-auto-generate', this._handleThumbnailAutoGenerate);
    if (this._handleBeforeUnload) window.removeEventListener('beforeunload', this._handleBeforeUnload);
    if (this._handleVisibilityChange) document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    if (this._handleEditorBlur) this.shadowRoot!.removeEventListener('editor-blur', this._handleEditorBlur);
    if (this._handleWorkspaceConflict)
      document.removeEventListener('workspace-conflict', this._handleWorkspaceConflict);
    if (this._handleLayerVisibilityChange)
      document.removeEventListener('layer-visibility-change', this._handleLayerVisibilityChange);
    if (this._handleDefsVisibilityChange)
      document.removeEventListener('defs-visibility-change', this._handleDefsVisibilityChange);
    if (this._multiTabUnsubscribe) this._multiTabUnsubscribe();
    if (this._fontWarningsUnsubscribe) this._fontWarningsUnsubscribe();
    if (this._inspectorDataUnsubscribe) this._inspectorDataUnsubscribe();
    if (this._inspectorOpenUnsubscribe) this._inspectorOpenUnsubscribe();
    if (this._sizeTriggerUnsubscribe) this._sizeTriggerUnsubscribe();
    if (this._sizeIdleId != null) {
      if (this._sizeUsesTimeout) clearTimeout(this._sizeIdleId);
      else cancelIdleCallback(this._sizeIdleId);
      this._sizeIdleId = null;
    }
  }

  // --- Export size estimate (breadcrumb) ---

  /**
   * Schedule a recompute of the default Export → SVG byte size shown in the
   * breadcrumb. Runs at idle so it never lands in the compile/render path;
   * coalesced so back-to-back compiles do a single compute.
   */
  _scheduleExportSizeUpdate(): void {
    if (this._sizeIdleId != null) {
      if (this._sizeUsesTimeout) clearTimeout(this._sizeIdleId);
      else cancelIdleCallback(this._sizeIdleId);
    }
    const run = (): void => {
      this._sizeIdleId = null;
      this._computeExportSize();
    };
    if (typeof requestIdleCallback === 'function') {
      this._sizeUsesTimeout = false;
      this._sizeIdleId = requestIdleCallback(run, { timeout: 2000 });
    } else {
      this._sizeUsesTimeout = true;
      this._sizeIdleId = window.setTimeout(run, 250);
    }
  }

  _computeExportSize(): void {
    if (!this._sizeArmed) return;
    if (store.get('currentView') !== 'workspace') return;
    const preview = this.previewPane?.preview;
    if (!preview) {
      // Iframe still parsing srcdoc — bounded retry; the next compile
      // reschedules anyway.
      if (this._sizeRetryCount++ < 5) this._scheduleExportSizeUpdate();
      return;
    }
    this._sizeRetryCount = 0;

    const rules = getChromeFontRulesIfReady();
    if (rules == null) {
      // Kick off the session's single background fetch of the chrome font
      // rules; recompute with the font bytes included once it settles.
      ensureChromeFontRules().then(() => this._scheduleExportSizeUpdate());
    }

    try {
      const bytes = perfSpan('export-size', () =>
        computeDefaultExportSvgBytes(preview, {
          width: store.get('width') as number,
          height: store.get('height') as number,
          background: store.get('background') as string,
          fontRules: rules ?? [],
        }),
      );
      store.set('exportSvgBytes', bytes);
    } catch (err) {
      console.warn('Export size estimate failed:', err);
    }
  }

  copyCode(): void {
    const code = this.editorPane.code;
    navigator.clipboard.writeText(code).catch((err: Error) => {
      console.error('Failed to copy code:', err);
    });
  }

  copySvg(): void {
    const svgElement = this.previewPane.preview;
    if (svgElement) {
      const svgString = svgElement.outerHTML;
      navigator.clipboard.writeText(svgString).catch((err: Error) => {
        console.error('Failed to copy SVG:', err);
      });
    }
  }

  debouncedUpdate(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);

    // Use a longer debounce when the user is actively typing inside an
    // incomplete expression (member access, function call, style block open)
    // so completion/signature-help popups have time to appear before the
    // error panel covers them. Trigger set matches the LSP server's
    // mid-expression predicate in packages/pathogen-language-server/src/server.ts.
    const code = this.editorPane?.code || '';
    const trimmed = code.trimEnd();
    const lastChar = trimmed.slice(-1);
    const cursorMidExpression = lastChar === '.' || lastChar === '(' || lastChar === ',' || lastChar === '{';
    const delay = cursorMidExpression ? 600 : 150;

    // Hide error panel immediately when user is mid-expression — stale errors
    // are confusing and would cover the completion / signature-help popup.
    if (cursorMidExpression) {
      this.errorPanel.hide();
      this.editorPane.clearError();
    }

    this._debounceTimer = setTimeout(() => {
      this.updatePreview();
      this.updateAnnotatedOutput();
    }, delay);
  }

  async updatePreview(): Promise<void> {
    const code = (store.get('code') as string) || this.editorPane.code;

    // Increment compilation ID for staleness detection
    const compilationId = (store.get('compilationId') as number) + 1;
    store.update({
      compilationId,
      compilationStatus: 'compiling',
      compilationError: null,
      // Reset in the same update as the status change so the breadcrumb's
      // status-triggered re-render paints 00:00, not the previous compile's
      // residue.
      compilationElapsedMs: 0,
    });
    this._compileTicker.start();

    // Check if this compilation is stale (newer one started)
    const isStale = (id: number): boolean => store.get('compilationId') !== id;

    const compileStart = performance.now();
    try {
      const toFixed = store.get('toFixed') as number | null;
      const compileOptions = toFixed != null ? { toFixed } : undefined;
      const result = (await perfSpanAsync('compile-roundtrip', async () =>
        compilerWorker.compileWithContext(code, compilationId, isStale, compileOptions),
      )) as any;
      const compileTime = performance.now() - compileStart;
      console.log(`Compile time: ${compileTime.toFixed(2)}ms`);

      // Don't update if stale
      if (isStale(compilationId)) return;

      // Pull viewBox from the compile result (falls back to 200x200 when the
      // source has no `define ViewBox`).
      const compiledViewBox = (result.viewBox as
        | { originX: number; originY: number; width: number; height: number }
        | undefined) ?? {
        originX: 0,
        originY: 0,
        width: 200,
        height: 200,
      };
      store.update({
        viewBoxOriginX: compiledViewBox.originX,
        viewBoxOriginY: compiledViewBox.originY,
        width: compiledViewBox.width,
        height: compiledViewBox.height,
      });

      // Pre-render GPU-rendered gradients (conic, freeform, mesh)
      const gpuGradientUrls = new Map<string, string>();
      if (
        result.gradients?.some(
          (g: any) => g.type === 'conic' || g.type === 'freeform' || g.type === 'mesh' || g.type === 'topo',
        )
      ) {
        const svgW = compiledViewBox.width;
        const svgH = compiledViewBox.height;
        const [conicUrls, freeformUrls, meshUrls, topoUrls] = await perfSpanAsync('gpu-gradient-prerender', async () =>
          Promise.all([
            gpuGradientService.renderConicGradients(result.gradients, svgW, svgH),
            gpuGradientService.renderFreeformGradients(result.gradients, svgW, svgH),
            gpuGradientService.renderMeshGradients(result.gradients, svgW, svgH),
            gpuGradientService.renderTopoGradients(result.gradients, svgW, svgH),
          ]),
        );
        for (const [id, url] of conicUrls) gpuGradientUrls.set(id, url);
        for (const [id, url] of freeformUrls) gpuGradientUrls.set(id, url);
        for (const [id, url] of meshUrls) gpuGradientUrls.set(id, url);
        for (const [id, url] of topoUrls) gpuGradientUrls.set(id, url);
        if (isStale(compilationId)) return; // Re-check after async GPU work
      }

      // Set rendering state before updating the SVG
      this._compileTicker.stop();
      store.set('compilationStatus', 'rendering');

      // Use timing method to measure rendering — pass layers if available
      const renderTime = result.layers
        ? this.previewPane.setLayersWithTiming(result.layers, {
            masks: result.masks || [],
            clipPaths: result.clipPaths || [],
            gradients: result.gradients || [],
            patterns: result.patterns || [],
            markers: result.markers || [],
            filters: result.filters || [],
            cssProperties: result.cssProperties || [],
            fontBinaries: result.fontBinaries || [],
            gpuGradientUrls,
          })
        : this.previewPane.setPathDataWithTiming(result.path);
      console.log(`Render time: ${renderTime.toFixed(2)}ms`);

      this.previewPane.hideLoading();
      this.previewPane.setStale(false);
      this.consolePane.logs = result.logs || [];
      this.hideError();
      perfSpan('store-updates', () => {
        store.set('fontWarnings', [
          ...formatFontSubstitutions(result.fontSubstitutions || []),
          ...(result.fontNotices || []),
        ]);

        // Store layers and defs for layers panel
        const resultLayers = result.layers || [];
        store.set('layers', resultLayers);
        store.set('masks', result.masks || []);
        store.set('clipPaths', result.clipPaths || []);
        store.set('gradients', result.gradients || []);
        store.set('patterns', result.patterns || []);
        store.set('markers', result.markers || []);
        store.set('filters', result.filters || []);
        store.set('cssProperties', result.cssProperties || []);

        // Clean up stale visibility entries. pruneVisibility returns the
        // same reference when nothing is stale, so the store's identity
        // guard skips the notify (and the inspector's differential cache
        // isn't defeated by a fresh object every compile). Group children
        // count as live names — pruning them reset their eye state.
        const currentVisibility = store.get('layerVisibility') as Record<string, boolean>;
        store.set('layerVisibility', pruneVisibility(currentVisibility, collectLayerNames(resultLayers)));

        store.update({
          compilationStatus: 'completed',
          compilationError: null,
          calledStdlibFunctions: result.calledStdlibFunctions || [],
        });
      });

      // Refresh the breadcrumb's export-size estimate (runs at idle, after
      // the preview iframe has the new content).
      this._sizeArmed = true;
      this._scheduleExportSizeUpdate();

      // Auto-hide completion status after a brief moment
      setTimeout(() => {
        if (store.get('compilationStatus') === 'completed') {
          store.set('compilationStatus', 'idle');
        }
      }, 1500);
    } catch (e: any) {
      // Don't update if stale (unless it's not a stale error)
      if (e.message === 'Stale result') return;
      if (isStale(compilationId)) return;

      // After the stale guards: a superseded compile's failure must not stop
      // the newest compile's clock.
      this._compileTicker.stop();
      this.previewPane.hideLoading();
      // The pane keeps the last good render (and its injected fonts) for
      // context — mark it stale so it can't be mistaken for current output.
      this.previewPane.setStale(true);
      const displayError = this.showError(e.message);
      this.consolePane.logs = [];
      // A failed compile invalidates any weight-substitution warning — don't
      // stack a stale warning banner on top of an unrelated error.
      store.set('fontWarnings', []);
      store.set('layers', []);
      store.update({
        compilationStatus: 'error',
        compilationError: displayError,
      });
    }
  }

  async updateAnnotatedOutput(): Promise<void> {
    if (!this.annotatedPane.isOpen) return;

    const code = (store.get('code') as string) || this.editorPane.code;
    const compilationId = store.get('compilationId') as number;

    // Check if this compilation is stale
    const isStale = (id: number): boolean => store.get('compilationId') !== id;

    try {
      const annotated = await compilerWorker.compileAnnotated(code, compilationId, isStale);

      // Don't update if stale
      if (isStale(compilationId)) return;

      this.annotatedPane.content = annotated as string;
      store.set('annotatedOutput', annotated as string);
    } catch (e: any) {
      // Don't update if stale
      if (e.message === 'Stale result') return;
      if (isStale(compilationId)) return;

      this.annotatedPane.content = `// Error: ${e.message}`;
    }
  }

  showError(message: string): string {
    // Try structured diagnostics via getDiagnostics first
    const { StringTextDocument, getDiagnostics } = window.PathogenLang;
    if (getDiagnostics && StringTextDocument) {
      try {
        const code = this.editorPane.code;
        const diagnostics = perfSpan('get-diagnostics', () => {
          const doc = new StringTextDocument(code);
          return getDiagnostics(doc);
        });
        if (diagnostics.length > 0) {
          // Format message: show each diagnostic on its own line
          const messages = diagnostics.map(
            (d: { range: { start: { line: number; character: number } }; message: string }) => {
              const line = d.range.start.line + 1;
              const col = d.range.start.character + 1;
              return `Line ${line}:${col} — ${d.message}`;
            },
          );
          const displayMessage = messages.join('\n');
          this.errorPanel.show(displayMessage, diagnostics.length);
          // Highlight all diagnostic locations in the editor (0-based → 1-based)
          const errors = diagnostics.map((d: { range: { start: { line: number; character: number } } }) => ({
            line: d.range.start.line + 1,
            column: d.range.start.character + 1,
          }));
          this.editorPane.highlightErrors(errors);
          return displayMessage;
        }
      } catch {
        // Fall through to regex-based parsing
      }
    }

    // Fallback: regex-based error location extraction
    this.errorPanel.show(message);
    const parseMatch = /Parse error at line (\d+), column (\d+)/.exec(message);
    if (parseMatch) {
      this.editorPane.highlightError(parseInt(parseMatch[1], 10), parseInt(parseMatch[2], 10));
      return message;
    }
    const runtimeMatch = /^Line (\d+)(?:, col (\d+))?: /.exec(message);
    if (runtimeMatch) {
      const line = parseInt(runtimeMatch[1], 10);
      const col = runtimeMatch[2] ? parseInt(runtimeMatch[2], 10) : 1;
      this.editorPane.highlightError(line, col);
    }
    return message;
  }

  hideError(): void {
    this.errorPanel.hide();
    this.editorPane.clearError();
  }

  // Simple string hash for content change tracking (not cryptographic)
  _simpleHash(str: string): string {
    if (!str) return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = (hash << 5) - hash + ch;
      hash |= 0;
    }
    return hash.toString(36);
  }

  _updateWarningBanner(): void {
    const banner = this.shadowRoot?.querySelector('#multi-tab-warning');
    if (banner) {
      banner.classList.toggle('visible', store.get('multiTabWarning') as boolean);
    }
  }

  _updateFontWarningBanner(): void {
    const banner = this.shadowRoot?.querySelector('#font-warning');
    const text = this.shadowRoot?.querySelector('#font-warning-text');
    if (!banner || !text) return;
    const joined = (store.get('fontWarnings') as string[]).join('\n');
    // Idempotent under keystroke recompiles — only touch the DOM on change.
    if (text.textContent !== joined) text.textContent = joined;
    banner.classList.toggle('visible', joined !== '' && joined !== this._dismissedFontWarnings);
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
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

        .warning-banner {
          display: none;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: var(--warning-bg, #fef3c7);
          border-bottom: 1px solid var(--warning-border, #f59e0b);
          color: var(--warning-text, #92400e);
          font-size: 12px;
          line-height: 1.4;
        }

        .warning-banner.visible {
          display: flex;
        }

        .warning-banner .banner-text {
          white-space: pre-line;
        }

        .warning-banner .dismiss-btn {
          margin-left: auto;
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: var(--radius-sm, 4px);
          font-size: 11px;
          opacity: 0.7;
        }

        .warning-banner .dismiss-btn:hover {
          opacity: 1;
          background: rgba(0, 0, 0, 0.08);
        }
      </style>

      <div class="warning-banner" id="multi-tab-warning">
        <span>This workspace is open in another tab. Changes may conflict.</span>
        <button class="dismiss-btn" id="dismiss-multi-tab">Dismiss</button>
      </div>

      <div class="warning-banner" id="font-warning">
        <span class="banner-text" id="font-warning-text"></span>
        <button class="dismiss-btn" id="dismiss-font-warning">Dismiss</button>
      </div>

      <playground-main>
        <code-editor-pane></code-editor-pane>
        <annotated-pane></annotated-pane>
        <console-pane></console-pane>
        <svg-preview-pane></svg-preview-pane>
        <inspector-panel></inspector-panel>
      </playground-main>

      <error-panel></error-panel>

      <docs-panel></docs-panel>

      <export-modal></export-modal>

      <thumbnail-crop-modal></thumbnail-crop-modal>

      <edit-workspace-metadata-modal></edit-workspace-metadata-modal>

      <playground-footer></playground-footer>
    `;
  }
}

customElements.define('workspace-view', WorkspaceView);
