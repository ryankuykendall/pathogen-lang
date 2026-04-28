// Standalone pannable/zoomable SVG preview with navigator minimap
// Zero store dependencies — all state is instance properties
// Extracted from svg-preview-pane.js for use in blog embeds

import { attachFullscreenBehavior, fullscreenButtonHTML, fullscreenStyles } from '../../utils/fullscreen-toggle.js';
import { bootstrapPreviewIframe } from '../../utils/preview-iframe.js';

const LAYERS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;

export class MiniPreview extends HTMLElement {
  // Canvas dimensions
  private _width: number = 200;
  private _height: number = 200;
  private _background: string = 'transparent';

  // Zoom/pan constants
  private readonly MIN_ZOOM: number = 0.25;
  private readonly MAX_ZOOM: number = 10;
  private readonly ZOOM_STEP: number = 1.5;

  // Zoom/pan state
  private _zoomLevel: number = 1;
  private _panX: number = 0;
  private _panY: number = 0;

  // Pan drag state
  private isPanning: boolean = false;
  private panStartX: number = 0;
  private panStartY: number = 0;

  // Navigator drag state
  private isNavigatorDragging: boolean = false;
  private navDragStartX: number = 0;
  private navDragStartY: number = 0;
  private navDragStartPanX: number = 0;
  private navDragStartPanY: number = 0;

  // Scroll hint timer
  private _scrollHintTimer: ReturnType<typeof setTimeout> | undefined;

  // Fullscreen toggle
  private _cleanupFullscreen: (() => void) | null = null;

  // Bound handlers for cleanup
  private _onDocMouseMove: (e: MouseEvent) => void;
  private _onDocMouseUp: () => void;

  /**
   * Compiled-SVG render surface lives inside a sandboxed iframe — see
   * `playground/utils/preview-iframe.ts` and
   * `project-docs/security/iframe-sandbox-rationale.md`. `_iframeDoc` is the
   * document we query for `#preview*` selectors after `srcdoc` parses;
   * `_pendingSvgString` buffers any `setSvgContent` call that fires before
   * the iframe is ready (rare — srcdoc parsing is fast — but possible).
   */
  private _iframeDoc: Document | null = null;
  private _pendingSvgString: string | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this._onDocMouseMove = (e: MouseEvent): void => {
      this.doPan(e);
      this.navigatorMouseMove(e);
    };
    this._onDocMouseUp = (): void => {
      this.endPan();
      this.navigatorMouseUp();
    };
  }

  connectedCallback(): void {
    this.render();
    this._setupIframe();
    this.setupEventListeners();
    this._cleanupFullscreen = attachFullscreenBehavior(this, this.shadowRoot!);
  }

  disconnectedCallback(): void {
    document.removeEventListener('mousemove', this._onDocMouseMove);
    document.removeEventListener('mouseup', this._onDocMouseUp);
    if (this._cleanupFullscreen) this._cleanupFullscreen();
  }

  private _setupIframe(): void {
    // Pre-set srcdoc + sandbox before appending to the DOM — see
    // playground/utils/preview-iframe.ts for why (avoids Chrome's spurious
    // per-iframe sandbox warning during the about:blank load phase).
    const container = this.shadowRoot!.querySelector('#preview-container');
    if (!container) return;
    const iframe = document.createElement('iframe');
    iframe.id = 'preview-frame';
    const ready = bootstrapPreviewIframe(iframe, 'mini');
    container.insertBefore(iframe, container.firstChild);
    ready.then((doc) => {
      this._iframeDoc = doc;
      this.updateSvgStyles();
      if (this._pendingSvgString !== null) {
        const pending = this._pendingSvgString;
        this._pendingSvgString = null;
        this.setSvgContent(pending);
      }
      // Replay any CSS-var writes that arrived before the iframe was ready.
      for (const [name, value] of this._pendingCssVars) {
        doc.documentElement.style.setProperty(name, value);
      }
      this._pendingCssVars.clear();
      this._setupIframeEventListeners(doc);
    });
  }

  /**
   * Pan and wheel listeners attach to the iframe document because mouse and
   * wheel events fired inside an iframe do not bubble to the parent. Without
   * mousemove / mouseup on the iframe doc, drags initiated inside the iframe
   * never tick (no movement) and never end (panning state stuck on); the
   * parent-document listeners only catch drags that travel out of the iframe.
   * Wheel keeps the Ctrl/Cmd-modified gate so plain scrolling does not trap
   * visitors of long blog pages.
   */
  private _setupIframeEventListeners(doc: Document): void {
    doc.addEventListener('mousedown', (e: MouseEvent) => this.startPan(e));
    doc.addEventListener('mousemove', (e: MouseEvent) => this.doPan(e));
    doc.addEventListener('mouseup', () => this.endPan());
    const scrollHint = this.shadowRoot!.querySelector('#scroll-hint') as HTMLElement | null;
    doc.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const dampening = 0.002;
          const delta = -e.deltaY * dampening;
          const oldZoom = this._zoomLevel;
          const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, oldZoom * (1 + delta)));
          this.adjustPanForZoom(oldZoom, newZoom);
          this._zoomLevel = newZoom;
          this.updateViewBox();
        } else if (scrollHint) {
          scrollHint.classList.add('visible');
          clearTimeout(this._scrollHintTimer);
          this._scrollHintTimer = setTimeout(() => {
            scrollHint.classList.remove('visible');
          }, 800);
        }
      },
      { passive: false },
    );
  }

  // --- Public API ---

  get width(): number {
    return this._width;
  }

  set width(val: number) {
    this._width = val;
    this.updateSvgStyles();
  }

  get height(): number {
    return this._height;
  }

  set height(val: number) {
    this._height = val;
    this.updateSvgStyles();
  }

  get background(): string {
    return this._background;
  }

  set background(val: string) {
    this._background = val;
    this.updateSvgStyles();
  }

  /**
   * Set SVG content from a string. Parses and injects inner elements.
   */
  /**
   * Write a CSS custom property on the iframe document so it cascades into
   * the compiled SVG. Used by `<mini-workspace>` chip controls. Pre-Phase-3
   * the SVG was inline in this component's shadow root, so chip controls
   * could write directly to `mini-preview.style.setProperty(...)`. The
   * iframe boundary breaks that — this method forwards into the right doc.
   */
  setCssVar(name: string, value: string): void {
    if (!this._iframeDoc) {
      this._pendingCssVars.set(name, value);
      return;
    }
    this._iframeDoc.documentElement.style.setProperty(name, value);
  }

  removeCssVar(name: string): void {
    if (!this._iframeDoc) {
      this._pendingCssVars.delete(name);
      return;
    }
    this._iframeDoc.documentElement.style.removeProperty(name);
  }

  /** Pending CSS-var writes buffered while the iframe is still parsing. */
  private _pendingCssVars: Map<string, string> = new Map();

  setSvgContent(svgString: string): void {
    if (!this._iframeDoc) {
      this._pendingSvgString = svgString;
      return;
    }
    const contentGroup = this._iframeDoc.getElementById('preview-content');
    if (!contentGroup) return;
    contentGroup.innerHTML = '';

    if (!svgString) return;

    // Parse the SVG string
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const svgRoot = doc.documentElement;

    // Defense in depth: strip every <script> descendant from the parsed tree
    // before any importNode runs. Compiled SVGs from the CLI emit a metadata
    // `<script type="application/json">` block; old samples may contain
    // others. The sandboxed iframe blocks execution either way, but importing
    // the element triggers the browser's "Blocked script execution" console
    // warning. Removing them here keeps the console clean.
    for (const script of Array.from(svgRoot.querySelectorAll('script'))) {
      script.remove();
    }

    // Extract width/height/viewBox from the SVG if present
    const w = svgRoot.getAttribute('width');
    const h = svgRoot.getAttribute('height');
    if (w) this._width = parseFloat(w);
    if (h) this._height = parseFloat(h);

    const vb = svgRoot.getAttribute('viewBox');
    if (vb && !w && !h) {
      const parts = vb.split(/[\s,]+/).map(Number);
      if (parts.length === 4) {
        this._width = parts[2];
        this._height = parts[3];
      }
    }

    // Import all children (defs, paths, groups, etc.) into the iframe doc.
    // Skip <script> blocks — every CLI-generated SVG bundles a
    // `<script type="application/json" id="pathogen-metadata">` for the
    // inspector that this preview does not surface. The sandboxed iframe
    // would correctly block its execution, but importing it triggers the
    // browser's "Blocked script execution" console warning, which looks
    // like a bug. Filtering at import keeps the console clean and
    // double-locks defense in depth.
    for (const child of Array.from(svgRoot.children)) {
      if (child.tagName.toLowerCase() === 'script') continue;
      contentGroup.appendChild(this._iframeDoc.importNode(child, true));
    }

    // Move any inline <style> into the iframe document. Hosting styles inside
    // the sandboxed iframe is the structural defense — even if a regression
    // lets unsafe CSS reach this point, it cannot leak into the parent.
    const svgStyle = svgRoot.querySelector('style');
    if (svgStyle) {
      const preview = this._iframeDoc.getElementById('preview') as unknown as SVGSVGElement;
      const existingStyle = preview.querySelector('style[data-svg-style]');
      if (existingStyle) existingStyle.remove();
      const styleEl = this._iframeDoc.createElementNS('http://www.w3.org/2000/svg', 'style');
      styleEl.setAttribute('data-svg-style', '');
      styleEl.textContent = svgStyle.textContent;
      preview.insertBefore(styleEl, preview.firstChild);
    }

    this.updateSvgStyles();
    this.updateNavigatorContent();
  }

  // --- Zoom/Pan ---

  private updateViewBox(): void {
    const preview = this._iframeDoc?.getElementById('preview') as unknown as SVGSVGElement | null;
    const container = this.shadowRoot!.querySelector('#preview-container') as HTMLElement | null;
    if (!preview) return;

    const viewWidth = this._width / this._zoomLevel;
    const viewHeight = this._height / this._zoomLevel;

    // Clamp pan values
    if (this._zoomLevel < 0.5) {
      this._panX = -(viewWidth - this._width) / 2;
      this._panY = -(viewHeight - this._height) / 2;
    } else {
      const marginX = viewWidth / 3;
      const marginY = viewHeight / 3;
      const minPanX = Math.min(0, this._width - viewWidth) - marginX;
      const maxPanX = Math.max(0, this._width - viewWidth) + marginX;
      const minPanY = Math.min(0, this._height - viewHeight) - marginY;
      const maxPanY = Math.max(0, this._height - viewHeight) + marginY;
      this._panX = Math.max(minPanX, Math.min(this._panX, maxPanX));
      this._panY = Math.max(minPanY, Math.min(this._panY, maxPanY));
    }

    preview.setAttribute('viewBox', `${this._panX} ${this._panY} ${viewWidth} ${viewHeight}`);

    const zoomDisplay = this.shadowRoot!.querySelector('#zoom-level') as HTMLInputElement | null;
    if (zoomDisplay) {
      zoomDisplay.value = `${Math.round(this._zoomLevel * 100)}%`;
    }

    this.updateNavigatorViewport();
    if (container) container.classList.toggle('can-pan', this._zoomLevel >= 0.5);
    if (this._iframeDoc) this._iframeDoc.body.classList.toggle('can-pan', this._zoomLevel >= 0.5);
  }

  private adjustPanForZoom(oldZoom: number, newZoom: number): void {
    const oldViewWidth = this._width / oldZoom;
    const oldViewHeight = this._height / oldZoom;
    const centerX = this._panX + oldViewWidth / 2;
    const centerY = this._panY + oldViewHeight / 2;

    const newViewWidth = this._width / newZoom;
    const newViewHeight = this._height / newZoom;

    this._panX = centerX - newViewWidth / 2;
    this._panY = centerY - newViewHeight / 2;
  }

  private zoomIn(): void {
    const oldZoom = this._zoomLevel;
    const newZoom = Math.min(this.MAX_ZOOM, oldZoom * this.ZOOM_STEP);
    this.adjustPanForZoom(oldZoom, newZoom);
    this._zoomLevel = newZoom;
    this.updateViewBox();
  }

  private zoomOut(): void {
    const oldZoom = this._zoomLevel;
    const newZoom = Math.max(this.MIN_ZOOM, oldZoom / this.ZOOM_STEP);
    this.adjustPanForZoom(oldZoom, newZoom);
    this._zoomLevel = newZoom;
    this.updateViewBox();
  }

  private zoomFit(): void {
    this._zoomLevel = 1;
    this._panX = 0;
    this._panY = 0;
    this.updateViewBox();
  }

  // --- Pan handling ---

  private startPan(e: MouseEvent): void {
    if (this._zoomLevel < 0.5) return;
    this.isPanning = true;
    this.panStartX = e.clientX;
    this.panStartY = e.clientY;
    this.shadowRoot!.querySelector('#preview-container')?.classList.add('panning');
    if (this._iframeDoc) this._iframeDoc.body.classList.add('panning');
    e.preventDefault();
  }

  private doPan(e: MouseEvent): void {
    if (!this.isPanning) return;

    const preview = this._iframeDoc?.getElementById('preview') as unknown as SVGSVGElement | null;
    const ctm = preview?.getScreenCTM();
    if (!ctm) return;

    const dx = (this.panStartX - e.clientX) / ctm.a;
    const dy = (this.panStartY - e.clientY) / ctm.d;

    this._panX += dx;
    this._panY += dy;
    this.panStartX = e.clientX;
    this.panStartY = e.clientY;

    this.updateViewBox();
  }

  private endPan(): void {
    this.isPanning = false;
    this.shadowRoot!.querySelector('#preview-container')?.classList.remove('panning');
    if (this._iframeDoc) this._iframeDoc.body.classList.remove('panning');
  }

  // --- Navigator ---

  private updateNavigatorViewport(): void {
    const viewport = this.shadowRoot!.querySelector('#navigator-viewport') as SVGRectElement | null;
    if (!viewport) return;

    const viewWidth = this._width / this._zoomLevel;
    const viewHeight = this._height / this._zoomLevel;

    viewport.setAttribute('x', String(this._panX));
    viewport.setAttribute('y', String(this._panY));
    viewport.setAttribute('width', String(viewWidth));
    viewport.setAttribute('height', String(viewHeight));
  }

  private updateNavigatorContent(): void {
    const navGroup = this.shadowRoot!.querySelector('#navigator-paths');
    const navBg = this.shadowRoot!.querySelector('#navigator-bg') as SVGRectElement | null;
    const navSvg = this.shadowRoot!.querySelector('#navigator-svg') as SVGSVGElement | null;
    if (!navGroup || !navBg || !navSvg) return;

    navGroup.innerHTML = '';

    // Clone content group elements into navigator. Source lives in the
    // sandboxed iframe document; importNode is the spec-correct cross-doc
    // path (cloneNode + appendChild also works in practice but importNode
    // is unambiguous about adoption).
    const contentGroup = this._iframeDoc?.getElementById('preview-content');
    if (contentGroup) {
      for (const child of Array.from(contentGroup.children)) {
        navGroup.appendChild(document.importNode(child, true));
      }
    }

    const navWidth = 120;
    const navHeight = 120;
    const scale = Math.min(navWidth / this._width, navHeight / this._height) * 0.9;
    const offsetX = (navWidth - this._width * scale) / 2;
    const offsetY = (navHeight - this._height * scale) / 2;

    navSvg.setAttribute('viewBox', `${-offsetX / scale} ${-offsetY / scale} ${navWidth / scale} ${navHeight / scale}`);
    navBg.setAttribute('fill', this._background);
    navBg.setAttribute('x', '0');
    navBg.setAttribute('y', '0');
    navBg.setAttribute('width', String(this._width));
    navBg.setAttribute('height', String(this._height));

    this.updateNavigatorViewport();
  }

  private screenToNavigatorSVG(clientX: number, clientY: number): { x: number; y: number } {
    const navSvg = this.shadowRoot!.querySelector('#navigator-svg') as SVGSVGElement;
    const pt = navSvg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPt = pt.matrixTransform(navSvg.getScreenCTM()!.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }

  private navigatorMouseDown(e: MouseEvent): void {
    e.preventDefault();
    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);
    const viewWidth = this._width / this._zoomLevel;
    const viewHeight = this._height / this._zoomLevel;
    const inViewport =
      svgX >= this._panX && svgX <= this._panX + viewWidth && svgY >= this._panY && svgY <= this._panY + viewHeight;

    if (inViewport) {
      this.isNavigatorDragging = true;
      this.navDragStartX = svgX;
      this.navDragStartY = svgY;
      this.navDragStartPanX = this._panX;
      this.navDragStartPanY = this._panY;
    } else {
      this._panX = svgX - viewWidth / 2;
      this._panY = svgY - viewHeight / 2;
      this.updateViewBox();
    }
  }

  private navigatorMouseMove(e: MouseEvent): void {
    if (!this.isNavigatorDragging) return;

    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);
    this._panX = this.navDragStartPanX + (svgX - this.navDragStartX);
    this._panY = this.navDragStartPanY + (svgY - this.navDragStartY);
    this.updateViewBox();
  }

  private navigatorMouseUp(): void {
    this.isNavigatorDragging = false;
  }

  private navigatorDoubleClick(e: MouseEvent): void {
    e.preventDefault();
    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);
    const viewWidth = this._width / this._zoomLevel;
    const viewHeight = this._height / this._zoomLevel;

    this._panX = svgX - viewWidth / 2;
    this._panY = svgY - viewHeight / 2;
    this.updateViewBox();
  }

  // --- Styles ---

  private updateSvgStyles(): void {
    if (!this._iframeDoc) return;
    const preview = this._iframeDoc.getElementById('preview') as unknown as SVGSVGElement | null;
    const bg = this._iframeDoc.getElementById('preview-bg') as unknown as SVGRectElement | null;
    if (!preview || !bg) return;

    preview.setAttribute('width', String(this._width));
    preview.setAttribute('height', String(this._height));

    bg.setAttribute('fill', this._background);
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(this._width));
    bg.setAttribute('height', String(this._height));

    this.updateViewBox();
  }

  // --- Events ---

  private setupEventListeners(): void {
    // Zoom controls
    this.shadowRoot!.querySelector('#zoom-in')!.addEventListener('click', () => this.zoomIn());
    this.shadowRoot!.querySelector('#zoom-out')!.addEventListener('click', () => this.zoomOut());
    this.shadowRoot!.querySelector('#zoom-fit')!.addEventListener('click', () => this.zoomFit());

    // Zoom level input
    const zoomInput = this.shadowRoot!.querySelector('#zoom-level') as HTMLInputElement;
    zoomInput.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLInputElement;
      const value = parseInt(target.value);
      if (!isNaN(value) && value >= this.MIN_ZOOM * 100 && value <= this.MAX_ZOOM * 100) {
        const oldZoom = this._zoomLevel;
        const newZoom = value / 100;
        this.adjustPanForZoom(oldZoom, newZoom);
        this._zoomLevel = newZoom;
        this.updateViewBox();
      } else {
        target.value = `${Math.round(this._zoomLevel * 100)}%`;
      }
    });

    zoomInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const step = e.shiftKey ? 0.25 : 0.05;
        const direction = e.key === 'ArrowUp' ? 1 : -1;
        const oldZoom = this._zoomLevel;
        const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, oldZoom + step * direction));
        this.adjustPanForZoom(oldZoom, newZoom);
        this._zoomLevel = newZoom;
        this.updateViewBox();
      }
    });

    // Mouse wheel zoom — requires Ctrl/Cmd to prevent scroll traps in long pages
    // Mouse wheel zoom and pan-mousedown listeners are wired against the
    // iframe document in _setupIframeEventListeners (events inside an iframe
    // do not bubble to the parent). The scroll-hint message text still lives
    // here because it is platform-dependent.
    const scrollHint = this.shadowRoot!.querySelector('#scroll-hint') as HTMLElement;
    const isMac = navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac');
    (scrollHint.querySelector('span') as HTMLSpanElement).textContent = isMac
      ? '\u2318 + scroll to zoom'
      : 'Ctrl + scroll to zoom';

    // Document-level move/up listeners still required so the user can drag
    // past the iframe boundary without losing the pan grab.
    document.addEventListener('mousemove', this._onDocMouseMove);
    document.addEventListener('mouseup', this._onDocMouseUp);

    // Navigator
    const navSvg = this.shadowRoot!.querySelector('#navigator-svg') as SVGSVGElement;
    navSvg.addEventListener('mousedown', (e: MouseEvent) => this.navigatorMouseDown(e));
    navSvg.addEventListener('dblclick', (e: MouseEvent) => this.navigatorDoubleClick(e));

    // Inspector toggle
    this.shadowRoot!.querySelector('#inspector-open-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggle-inspector', { bubbles: true, composed: true }));
    });
  }

  private render(): void {
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 200px;
        }

        #preview-container {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        /* The compiled-SVG render surface lives inside the sandboxed iframe.
           See playground/utils/preview-iframe.ts and
           project-docs/security/iframe-sandbox-rationale.md. */
        #preview-frame {
          display: block;
          width: 100%;
          height: 100%;
          border: 0;
          background: transparent;
        }

        /* Scroll hint overlay */
        #scroll-hint {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.5);
          z-index: 20;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        #scroll-hint.visible {
          opacity: 1;
        }

        #scroll-hint span {
          color: #ffffff;
          font-size: 0.8125rem;
          font-weight: 500;
          padding: 0.5rem 1rem;
          background: rgba(0, 0, 0, 0.7);
          border-radius: var(--radius-md, 8px);
          user-select: none;
        }

        #preview-container.can-pan {
          cursor: grab;
        }

        #preview-container.panning {
          cursor: grabbing;
        }

        /* Navigator — suppressed in embedded mode, shown only in fullscreen.
           (The minimap earns its keep when the user is deeply zoomed in,
           which is a fullscreen-only workflow; it competes with content in
           the constrained embedded size.) */
        #zoom-navigator {
          position: absolute;
          top: 0.5rem;
          left: 0.5rem;
          width: 100px;
          height: 100px;
          background: var(--bg-elevated, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          box-shadow: var(--shadow-md);
          overflow: hidden;
          z-index: 10;
          display: none;
        }
        :host(.fullscreen) #zoom-navigator {
          display: block;
        }

        #navigator-svg {
          width: 100%;
          height: 100%;
        }

        #navigator-viewport {
          cursor: move;
          fill: var(--accent-subtle, rgba(16, 185, 129, 0.15));
        }

        /* Zoom controls — glass pill matching the workspace chrome aesthetic */
        #zoom-controls {
          position: absolute;
          bottom: 0.75rem;
          right: 0.75rem;
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 3px;
          background: color-mix(in srgb, var(--bg-elevated, #ffffff) 82%, transparent);
          backdrop-filter: blur(16px) saturate(140%);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 999px;
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
          z-index: 10;
          opacity: 0.6;
          transition: opacity var(--transition-base, 0.15s ease);
        }

        #preview-container:hover ~ #zoom-controls,
        #zoom-controls:hover,
        :host(.fullscreen) #zoom-controls {
          opacity: 1;
        }

        /* Touch devices have no hover — keep controls fully visible. */
        @media (hover: none) {
          #zoom-controls { opacity: 1; }
        }

        #zoom-controls button {
          width: 26px;
          height: 26px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: var(--text-secondary, #64748b);
          cursor: pointer;
          font-family: inherit;
          font-size: 0.8125rem;
          transition: all var(--transition-base, 0.15s ease);
        }

        #zoom-controls button:hover {
          background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
          color: var(--accent-color, #10b981);
        }

        #zoom-in,
        #zoom-out {
          font-size: 1.125rem;
          font-weight: 400;
          line-height: 0;
        }

        #zoom-fit {
          font-size: 0.6875rem;
          font-weight: 500;
          letter-spacing: 0.04em;
          width: auto !important;
          padding: 0 10px;
        }

        #zoom-level {
          width: 46px;
          padding: 3px 6px;
          border: 0;
          border-left: 1px solid var(--border-color, #e2e8f0);
          border-radius: 0;
          font-size: 0.6875rem;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-weight: 500;
          font-feature-settings: 'tnum';
          text-align: center;
          background: transparent;
          color: var(--text-secondary, #64748b);
          transition: all var(--transition-base, 0.15s ease);
          margin-left: 2px;
        }

        #zoom-level:focus {
          outline: none;
          color: var(--accent-color, #10b981);
        }

        #inspector-open-btn {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          width: 32px;
          height: 32px;
          padding: 0;
          display: none;
          place-items: center;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          background: var(--bg-elevated, #ffffff);
          color: var(--text-secondary, #64748b);
          cursor: pointer;
          box-shadow: var(--shadow-md);
          z-index: 10;
          transition: all var(--transition-base, 0.15s ease);
        }

        :host(.fullscreen) #inspector-open-btn {
          display: grid;
        }

        #inspector-open-btn:hover {
          border-color: var(--accent-color, #10b981);
          color: var(--accent-color, #10b981);
          background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
        }

        #inspector-open-btn svg {
          width: 16px;
          height: 16px;
        }

        ${fullscreenStyles(100, 0.5)}

        /* The workspace chrome surfaces a fullscreen affordance in its glass
           bar. In fullscreen the workspace chrome is covered, so the
           preview's own fullscreen toggle is needed for exit. Hide it in
           embedded mode to keep the preview pane clean. */
        :host(:not(.fullscreen)) #fullscreen-toggle {
          display: none;
        }
      </style>

      <div id="preview-container">
        <!-- The sandboxed iframe is created programmatically in _setupIframe
             so srcdoc is set before insertion (avoids the about:blank phase
             warning). See playground/utils/preview-iframe.ts. -->
        <div id="scroll-hint"><span></span></div>
      </div>

      <div id="zoom-navigator">
        <svg id="navigator-svg">
          <rect id="navigator-bg" width="100%" height="100%"></rect>
          <g id="navigator-paths"></g>
          <rect id="navigator-viewport" fill="none" stroke="var(--accent-color, #10b981)" stroke-width="1" vector-effect="non-scaling-stroke"></rect>
        </svg>
      </div>

      ${fullscreenButtonHTML()}

      <button id="inspector-open-btn" title="Toggle inspector">${LAYERS_ICON}</button>

      <div id="zoom-controls">
        <button id="zoom-out" title="Zoom out">&#x2212;</button>
        <button id="zoom-fit" title="Fit to view">Fit</button>
        <button id="zoom-in" title="Zoom in">&#x002B;</button>
        <input type="text" id="zoom-level" value="100%" title="Enter zoom percentage">
      </div>
    `;
  }
}

customElements.define('mini-preview', MiniPreview);
