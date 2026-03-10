// Standalone pannable/zoomable SVG preview with navigator minimap
// Zero store dependencies — all state is instance properties
// Extracted from svg-preview-pane.js for use in blog embeds

export class MiniPreview extends HTMLElement {
  // Canvas dimensions
  private _width: number = 200;
  private _height: number = 200;
  private _background: string = '#ffffff';

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

  // Bound handlers for cleanup
  private _onDocMouseMove: (e: MouseEvent) => void;
  private _onDocMouseUp: () => void;

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
    this.setupEventListeners();
    this.updateSvgStyles();
  }

  disconnectedCallback(): void {
    document.removeEventListener('mousemove', this._onDocMouseMove);
    document.removeEventListener('mouseup', this._onDocMouseUp);
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
  setSvgContent(svgString: string): void {
    const contentGroup = this.shadowRoot!.querySelector('#preview-content');
    if (!contentGroup) return;
    contentGroup.innerHTML = '';

    if (!svgString) return;

    // Parse the SVG string
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const svgRoot = doc.documentElement;

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

    // Import all children (defs, paths, groups, etc.)
    for (const child of Array.from(svgRoot.children)) {
      contentGroup.appendChild(document.importNode(child, true));
    }

    // Also import any inline styles from the SVG root
    const svgStyle = svgRoot.querySelector('style');
    if (svgStyle) {
      const preview = this.shadowRoot!.querySelector('#preview') as SVGSVGElement;
      const existingStyle = preview.querySelector('style[data-svg-style]');
      if (existingStyle) existingStyle.remove();
      const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      styleEl.setAttribute('data-svg-style', '');
      styleEl.textContent = svgStyle.textContent;
      preview.insertBefore(styleEl, preview.firstChild);
    }

    this.updateSvgStyles();
    this.updateNavigatorContent();
  }

  // --- Zoom/Pan ---

  private updateViewBox(): void {
    const preview = this.shadowRoot!.querySelector('#preview') as SVGSVGElement | null;
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
    e.preventDefault();
  }

  private doPan(e: MouseEvent): void {
    if (!this.isPanning) return;

    const ctm = (this.shadowRoot!.querySelector('#preview') as SVGSVGElement)?.getScreenCTM();
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

    // Clone content group elements into navigator
    const contentGroup = this.shadowRoot!.querySelector('#preview-content');
    if (contentGroup) {
      for (const child of Array.from(contentGroup.children)) {
        navGroup.appendChild(child.cloneNode(true));
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
    const preview = this.shadowRoot!.querySelector('#preview') as SVGSVGElement | null;
    const bg = this.shadowRoot!.querySelector('#preview-bg') as SVGRectElement | null;
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
    const container = this.shadowRoot!.querySelector('#preview-container') as HTMLElement;
    const scrollHint = this.shadowRoot!.querySelector('#scroll-hint') as HTMLElement;
    const isMac = navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac');
    (scrollHint.querySelector('span') as HTMLSpanElement).textContent = isMac
      ? '\u2318 + scroll to zoom'
      : 'Ctrl + scroll to zoom';

    container.addEventListener(
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
        } else {
          // Show hint briefly
          scrollHint.classList.add('visible');
          clearTimeout(this._scrollHintTimer);
          this._scrollHintTimer = setTimeout(() => {
            scrollHint.classList.remove('visible');
          }, 800);
        }
      },
      { passive: false },
    );

    // Pan via drag
    container.addEventListener('mousedown', (e: MouseEvent) => this.startPan(e));
    document.addEventListener('mousemove', this._onDocMouseMove);
    document.addEventListener('mouseup', this._onDocMouseUp);

    // Navigator
    const navSvg = this.shadowRoot!.querySelector('#navigator-svg') as SVGSVGElement;
    navSvg.addEventListener('mousedown', (e: MouseEvent) => this.navigatorMouseDown(e));
    navSvg.addEventListener('dblclick', (e: MouseEvent) => this.navigatorDoubleClick(e));
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

        #preview {
          display: block;
          width: 100%;
          height: 100%;
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

        /* Navigator */
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
        }

        #navigator-svg {
          width: 100%;
          height: 100%;
        }

        #navigator-viewport {
          cursor: move;
          fill: var(--accent-subtle, rgba(16, 185, 129, 0.15));
        }

        /* Zoom controls */
        #zoom-controls {
          position: absolute;
          bottom: 0.5rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 0.375rem;
          background: var(--bg-elevated, #ffffff);
          padding: 0.375rem 0.5rem;
          border-radius: var(--radius-md, 8px);
          border: 1px solid var(--border-color, #e2e8f0);
          box-shadow: var(--shadow-md);
          z-index: 10;
        }

        #zoom-controls button {
          width: 28px;
          height: 28px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-sm, 4px);
          background: var(--bg-secondary, #ffffff);
          color: var(--text-primary, #1a1a2e);
          cursor: pointer;
          font-family: inherit;
          font-size: 0.8125rem;
          transition: all var(--transition-base, 0.15s ease);
        }

        #zoom-controls button:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
          border-color: var(--accent-color, #10b981);
          color: var(--accent-color, #10b981);
        }

        #zoom-in,
        #zoom-out {
          font-size: 1.125rem;
          font-weight: 400;
          line-height: 0;
        }

        #zoom-fit {
          font-size: 0.75rem;
          font-weight: 500;
        }

        #zoom-level {
          width: 48px;
          padding: 0.25rem 0.375rem;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-sm, 4px);
          font-size: 0.6875rem;
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-weight: 500;
          text-align: center;
          background: var(--bg-secondary, #ffffff);
          color: var(--text-primary, #1a1a2e);
          transition: all var(--transition-base, 0.15s ease);
        }

        #zoom-level:focus {
          outline: none;
          border-color: var(--accent-color, #10b981);
          box-shadow: 0 0 0 3px var(--focus-ring, rgba(16, 185, 129, 0.4));
        }
      </style>

      <div id="preview-container">
        <svg id="preview" xmlns="http://www.w3.org/2000/svg">
          <rect id="preview-bg" width="100%" height="100%"></rect>
          <g id="preview-content"></g>
        </svg>
        <div id="scroll-hint"><span></span></div>
      </div>

      <div id="zoom-navigator">
        <svg id="navigator-svg">
          <rect id="navigator-bg" width="100%" height="100%"></rect>
          <g id="navigator-paths"></g>
          <rect id="navigator-viewport" fill="none" stroke="var(--accent-color, #10b981)" stroke-width="1" vector-effect="non-scaling-stroke"></rect>
        </svg>
      </div>

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
