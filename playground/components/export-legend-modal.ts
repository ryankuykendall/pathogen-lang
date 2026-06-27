// Export Legend Modal - Full-screen overlay for exporting SVG with an embedded legend
// Opens via custom event, not routed. Component-local state (not persisted in store).

import { store } from '../state/store.js';
import { createSvgSnapshot } from '../utils/svg-snapshot.js';
import styles from './export-legend-modal.css';
import './shared/pathogen-color-input.js';

// Accent color used for legend border and resize handle (matches app theme)
const ACCENT = '#10b981';
const ACCENT_LIGHT = 'rgba(16, 185, 129, 0.35)';

interface LegendFormData {
  name: string;
  description: string;
  date: string;
  creator: string;
  code: string;
}

interface ExportOverrides {
  gridEnabled: boolean | null;
  gridColor: string | null;
}

interface WorkspaceState {
  width: number;
  height: number;
  background?: string;
  gridEnabled?: boolean;
  gridColor?: string;
  gridSize?: number;
  workspaceName?: string;
  workspaceDescription?: string;
  code?: string;
  [key: string]: unknown;
}

interface TextCreateOptions {
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  cls?: string;
  color?: string;
  anchor?: string;
}

interface WrappedTextResult {
  el: SVGTextElement;
  height: number;
}

class ExportLegendModal extends HTMLElement {
  static _fontCache: Record<string, string> = {};

  // Zoom/pan state (independent of workspace)
  private _zoom: number = 1;
  private _panX: number = 0;
  private _panY: number = 0;
  private _isPanning: boolean = false;
  private _panStartX: number = 0;
  private _panStartY: number = 0;

  // Legend drag state
  private _isDragging: boolean = false;
  private _dragStartX: number = 0;
  private _dragStartY: number = 0;
  private _legendX: number = 0;
  private _legendY: number = 0;

  // Legend resize state
  private _isResizing: boolean = false;
  private _resizeStartX: number = 0;
  private _resizeStartWidth: number = 0;
  private _legendWidth: number = 560;

  // SVG canvas dimensions (from store)
  private _canvasWidth: number = 200;
  private _canvasHeight: number = 200;

  // Scale factor: all legend dimensions are multiplied by this
  private _scaleFactor: number = 1;

  // Snap-to-grid
  private _snapEnabled: boolean = true;
  private _snapSize: number = 10;

  // Form data
  private _formData: LegendFormData = {
    name: '',
    description: '',
    date: '',
    creator: '',
    code: '',
  };

  // Snapshot of workspace state at modal open time
  private _workspaceState: WorkspaceState | null = null;

  // Export overrides (non-null values override workspace state in preview)
  private _exportOverrides: ExportOverrides = { gridEnabled: null, gridColor: null };

  // Debounce handle for preview rebuilds
  private _rebuildRafId: number | null = null;

  // SVG references
  private _svg: SVGSVGElement | null = null;
  private _svgElement: SVGSVGElement | null = null;

  // Measured legend heights
  private _legendBoxHeight: number = 0;
  private _legendTotalHeight: number = 0;

  // Base dimensions (at scale factor 1.0, fits 80 monospace chars)
  private readonly BASE_WIDTH = 560;
  private readonly CHAR_WIDTH_FACTOR = 0.6;

  // Base (unscaled) typography & spacing
  private readonly BASE_PADDING = 16;
  private readonly BASE_LINE_HEIGHT = 18;
  private readonly BASE_FONT_SIZE = 13;
  private readonly BASE_TITLE_FONT_SIZE = 16;
  private readonly BASE_SMALL_FONT_SIZE = 11;
  private readonly BASE_BRAND_FONT_SIZE = 9;
  private readonly BASE_BORDER_RADIUS = 8;
  private readonly BASE_STROKE_WIDTH = 1;
  private readonly BASE_HANDLE_SIZE = 14;
  private readonly BASE_SEPARATOR_GAP = 10;
  private readonly BASE_BRAND_GAP = 5;

  // Zoom constants
  private readonly MIN_ZOOM = 0.1;
  private readonly MAX_ZOOM = 10;
  private readonly ZOOM_STEP = 1.5;

  // Document-level event handlers
  private _handleMouseMove: ((e: MouseEvent) => void) | null = null;
  private _handleMouseUp: (() => void) | null = null;
  private _handleKeydown: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this._setupEventListeners();
  }

  disconnectedCallback(): void {
    this._removeDocumentListeners();
  }

  // --- Scaled dimension helpers ---

  _s(baseValue: number): number {
    return baseValue * this._scaleFactor;
  }

  _snap(value: number): number {
    if (!this._snapEnabled || this._snapSize <= 0) return value;
    return Math.round(value / this._snapSize) * this._snapSize;
  }

  _updateLegendPosition(): void {
    const legendG = this._svg?.querySelector('#pathogen-legend');
    if (legendG) {
      legendG.setAttribute('transform', `translate(${this._legendX}, ${this._legendY})`);
    }
  }

  // --- Public API ---

  open(svgElement: SVGSVGElement, storeState: WorkspaceState): void {
    // Store SVG reference for rebuilds
    this._svgElement = svgElement;

    // Snapshot workspace state for override merging
    this._workspaceState = { ...storeState };
    this._exportOverrides = { gridEnabled: null, gridColor: null };

    this._canvasWidth = storeState.width;
    this._canvasHeight = storeState.height;

    // Pre-populate form
    this._formData = {
      name: storeState.workspaceName || '',
      description: storeState.workspaceDescription || '',
      date: new Date().toISOString().slice(0, 10),
      creator: '',
      code: storeState.code || '',
    };

    // Default snap size to match workspace grid
    this._snapSize = storeState.gridSize || 10;

    // Compute scale factor from canvas dimensions
    const shortSide = Math.min(this._canvasWidth, this._canvasHeight);
    this._scaleFactor = Math.max(0.2, Math.min(8, shortSide / 2000));
    this._legendWidth = this._computeBaseWidth() * this._scaleFactor;

    // Reset zoom/pan
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;

    // Build the preview SVG with legend
    this._buildPreviewSvg(svgElement, this._getEffectiveState());
    this._populateForm();
    this._updateZoomDisplay();

    this.classList.add('open');
    this._addDocumentListeners();
  }

  close(): void {
    this.classList.remove('open');
    this._removeDocumentListeners();
  }

  _getEffectiveState(): WorkspaceState {
    const s = { ...this._workspaceState! };
    for (const [key, val] of Object.entries(this._exportOverrides)) {
      if (val !== null) (s as Record<string, unknown>)[key] = val;
    }
    return s;
  }

  _scheduleRebuild(): void {
    if (this._rebuildRafId) cancelAnimationFrame(this._rebuildRafId);
    this._rebuildRafId = requestAnimationFrame(() => {
      this._rebuildRafId = null;
      this._rebuildPreview();
    });
  }

  _rebuildPreview(): void {
    // Save legend position and zoom/pan
    const savedX = this._legendX;
    const savedY = this._legendY;
    const savedZoom = this._zoom;
    const savedPanX = this._panX;
    const savedPanY = this._panY;
    const savedWidth = this._legendWidth;
    const savedScale = this._scaleFactor;

    // Rebuild with effective state
    this._legendWidth = savedWidth;
    this._scaleFactor = savedScale;
    this._buildPreviewSvg(this._svgElement!, this._getEffectiveState());

    // Restore legend position and zoom/pan
    this._legendX = savedX;
    this._legendY = savedY;
    this._zoom = savedZoom;
    this._panX = savedPanX;
    this._panY = savedPanY;
    this._updateLegendPosition();
    this._updateViewBox();
    this._updateZoomDisplay();
  }

  // --- SVG building ---

  _buildPreviewSvg(sourceSvg: SVGSVGElement, state: WorkspaceState): void {
    const previewArea = this.shadowRoot!.querySelector('.preview-area') as HTMLElement;
    const oldSvg = previewArea.querySelector('svg');
    if (oldSvg) oldSvg.remove();

    const svg = createSvgSnapshot(sourceSvg || this._svgElement, {
      includeGrid: state.gridEnabled,
      gridColor: state.gridColor,
      background: state.background,
    }) as SVGSVGElement;

    // Build legend first to measure height, then set initial position
    const margin = this._s(10);
    this._legendX = 0;
    this._legendY = 0;
    const legendG = this._buildLegendGroup();

    // Now position at bottom-right using measured height, snapped to grid
    this._legendX = this._snap(this._canvasWidth - this._legendWidth - margin);
    this._legendY = this._snap(this._canvasHeight - this._legendTotalHeight - margin);
    legendG.setAttribute('transform', `translate(${this._legendX}, ${this._legendY})`);
    svg.appendChild(legendG);

    previewArea.appendChild(svg);
    this._svg = svg;
    this._updateViewBox();
  }

  _buildLegendGroup(): SVGGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('id', 'pathogen-legend');
    g.classList.add('legend-group');

    const pad = this._s(this.BASE_PADDING);
    const innerWidth = this._legendWidth - pad * 2;
    const titleFontSize = this._s(this.BASE_TITLE_FONT_SIZE);
    const fontSize = this._s(this.BASE_FONT_SIZE);
    const smallFontSize = this._s(this.BASE_SMALL_FONT_SIZE);
    const brandFontSize = this._s(this.BASE_BRAND_FONT_SIZE);
    const lineHeight = this._s(this.BASE_LINE_HEIGHT);
    const separatorGap = this._s(this.BASE_SEPARATOR_GAP);
    const brandGap = this._s(this.BASE_BRAND_GAP);
    const borderRadius = this._s(this.BASE_BORDER_RADIUS);
    const strokeWidth = this._s(this.BASE_STROKE_WIDTH);
    const handleSize = this._s(this.BASE_HANDLE_SIZE);

    let y = pad;
    const elements: SVGElement[] = [];

    // Title
    if (this._formData.name) {
      const title = this._createText(this._formData.name, pad, y, {
        fontSize: titleFontSize,
        fontWeight: '600',
        cls: 'legend-title',
      });
      elements.push(title);
      y += titleFontSize + this._s(6);
    }

    // Creator (left) + Date (right) on single line below title
    if (this._formData.creator || this._formData.date) {
      if (this._formData.creator) {
        const creatorEl = this._createText(this._formData.creator, pad, y, {
          fontSize: smallFontSize,
          cls: 'legend-creator',
          color: '#64748b',
        });
        elements.push(creatorEl);
      }
      if (this._formData.date) {
        const dateX = this._formData.creator ? this._legendWidth - pad : pad;
        const dateAnchor = this._formData.creator ? 'end' : undefined;
        const dateEl = this._createText(this._formData.date, dateX, y, {
          fontSize: smallFontSize,
          cls: 'legend-date',
          color: '#64748b',
          anchor: dateAnchor,
        });
        elements.push(dateEl);
      }
      y += lineHeight;
    }

    // Description (word-wrapped)
    if (this._formData.description) {
      const descEl = this._createWrappedText(this._formData.description, pad, y, innerWidth, {
        fontSize,
        cls: 'legend-description',
        color: '#475569',
      });
      elements.push(descEl.el);
      y += descEl.height + this._s(4);
    }

    // Separator line
    if (this._formData.name || this._formData.description || this._formData.creator || this._formData.date) {
      const sep = document.createElementNS(ns, 'line');
      sep.setAttribute('x1', String(pad));
      sep.setAttribute('y1', String(y));
      sep.setAttribute('x2', String(this._legendWidth - pad));
      sep.setAttribute('y2', String(y));
      sep.setAttribute('stroke', '#e2e8f0');
      sep.setAttribute('stroke-width', String(strokeWidth));
      sep.classList.add('legend-separator');
      elements.push(sep);
      y += separatorGap;
    }

    // Code block
    if (this._formData.code) {
      const codeEl = this._createCodeBlock(this._formData.code, pad, y, innerWidth, {
        fontSize: smallFontSize,
        cls: 'legend-code',
        color: '#64748b',
      });
      elements.push(codeEl.el);
      y += codeEl.height + this._s(2);
    }

    const boxHeight = y + pad;

    // Background rect with neutral border
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('rx', String(borderRadius));
    rect.setAttribute('ry', String(borderRadius));
    rect.setAttribute('width', String(this._legendWidth));
    rect.setAttribute('height', String(boxHeight));
    rect.setAttribute('fill', 'white');
    rect.setAttribute('fill-opacity', '0.92');
    rect.setAttribute('stroke', '#e2e8f0');
    rect.setAttribute('stroke-width', String(strokeWidth));
    rect.classList.add('legend-bg');
    g.appendChild(rect);

    // Accent border overlay (visible in preview, stripped on download)
    const accentRect = document.createElementNS(ns, 'rect');
    accentRect.setAttribute('rx', String(borderRadius));
    accentRect.setAttribute('ry', String(borderRadius));
    accentRect.setAttribute('width', String(this._legendWidth));
    accentRect.setAttribute('height', String(boxHeight));
    accentRect.setAttribute('fill', 'none');
    accentRect.setAttribute('stroke', ACCENT);
    accentRect.setAttribute('stroke-width', String(strokeWidth * 1.5));
    accentRect.setAttribute('data-interactive', 'true');
    g.appendChild(accentRect);

    // Append text elements on top of rect
    elements.forEach((el) => g.appendChild(el));

    // Branding below box
    const brandY = boxHeight + brandGap;
    const pathogenFontSize = smallFontSize * 1.2;

    const brandText = document.createElementNS(ns, 'text');
    brandText.setAttribute('x', String(pad));
    brandText.setAttribute('y', String(brandY + pathogenFontSize));
    brandText.setAttribute('dominant-baseline', 'auto');
    brandText.setAttribute('fill', '#94a3b8');
    brandText.classList.add('legend-brand');

    const brandSpan1 = document.createElementNS(ns, 'tspan');
    brandSpan1.setAttribute('font-size', String(pathogenFontSize));
    brandSpan1.setAttribute('font-weight', '400');
    brandSpan1.setAttribute('font-family', "'Baumans', cursive");
    brandSpan1.textContent = 'Pathogen';

    const brandSpan2 = document.createElementNS(ns, 'tspan');
    brandSpan2.setAttribute('font-size', String(brandFontSize));
    brandSpan2.setAttribute('font-family', "'Inter', -apple-system, BlinkMacSystemFont, sans-serif");
    brandSpan2.setAttribute('dx', String(brandFontSize * this.CHAR_WIDTH_FACTOR));
    brandSpan2.textContent = 'built with pathogen-lang';

    brandText.appendChild(brandSpan1);
    brandText.appendChild(brandSpan2);
    g.appendChild(brandText);

    // Resize handle (bottom-right corner)
    const handle = document.createElementNS(ns, 'rect');
    handle.setAttribute('x', String(this._legendWidth - handleSize));
    handle.setAttribute('y', String(boxHeight - handleSize));
    handle.setAttribute('width', String(handleSize));
    handle.setAttribute('height', String(handleSize));
    handle.setAttribute('fill', ACCENT_LIGHT);
    handle.setAttribute('stroke', ACCENT);
    handle.setAttribute('stroke-width', String(strokeWidth));
    handle.setAttribute('rx', String(this._s(2)));
    handle.setAttribute('data-interactive', 'true');
    handle.classList.add('resize-handle');
    g.appendChild(handle);

    // Store box height for initial positioning
    this._legendBoxHeight = boxHeight;
    this._legendTotalHeight = boxHeight + brandGap + pathogenFontSize + this._s(4);
    g.setAttribute('transform', `translate(${this._legendX}, ${this._legendY})`);

    return g;
  }

  _createText(content: string, x: number, y: number, opts: TextCreateOptions = {}): SVGTextElement {
    const ns = 'http://www.w3.org/2000/svg';
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('font-size', String(opts.fontSize || this._s(this.BASE_FONT_SIZE)));
    text.setAttribute('font-family', opts.fontFamily || "'Inter', -apple-system, BlinkMacSystemFont, sans-serif");
    text.setAttribute('dominant-baseline', 'hanging');
    if (opts.fontWeight) text.setAttribute('font-weight', opts.fontWeight);
    if (opts.anchor) text.setAttribute('text-anchor', opts.anchor);
    if (opts.color) text.setAttribute('fill', opts.color);
    if (opts.cls) text.classList.add(opts.cls);
    text.textContent = content;
    return text;
  }

  _createWrappedText(
    content: string,
    x: number,
    y: number,
    maxWidth: number,
    opts: TextCreateOptions = {},
  ): WrappedTextResult {
    const ns = 'http://www.w3.org/2000/svg';
    const fSize = opts.fontSize || this._s(this.BASE_FONT_SIZE);
    const charWidth = fSize * this.CHAR_WIDTH_FACTOR;
    const charsPerLine = Math.max(10, Math.floor(maxWidth / charWidth));
    const lines = this._wrapText(content, charsPerLine);
    const lineGap = fSize + this._s(3);

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('font-size', String(fSize));
    text.setAttribute('font-family', opts.fontFamily || "'Inter', -apple-system, BlinkMacSystemFont, sans-serif");
    text.setAttribute('dominant-baseline', 'hanging');
    if (opts.color) text.setAttribute('fill', opts.color);
    if (opts.cls) text.classList.add(opts.cls);

    lines.forEach((line, i) => {
      const tspan = document.createElementNS(ns, 'tspan');
      tspan.setAttribute('x', String(x));
      if (i > 0) tspan.setAttribute('dy', String(lineGap));
      tspan.textContent = line;
      text.appendChild(tspan);
    });

    const totalHeight = lines.length > 0 ? fSize + (lines.length - 1) * lineGap : 0;
    return { el: text, height: totalHeight };
  }

  _createCodeBlock(
    code: string,
    x: number,
    y: number,
    maxWidth: number,
    opts: TextCreateOptions = {},
  ): WrappedTextResult {
    const ns = 'http://www.w3.org/2000/svg';
    const fSize = opts.fontSize || this._s(this.BASE_SMALL_FONT_SIZE);
    const monoCharWidth = fSize * this.CHAR_WIDTH_FACTOR;
    const charsPerLine = Math.max(10, Math.floor(maxWidth / monoCharWidth));
    const maxLines = 128;
    const lineGap = fSize + this._s(2);

    let sourceLines = code.split('\n');
    let truncated = false;
    if (sourceLines.length > maxLines) {
      sourceLines = sourceLines.slice(0, maxLines);
      truncated = true;
    }

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('font-size', String(fSize));
    text.setAttribute('font-family', "'Inconsolata', 'Consolas', 'Monaco', monospace");
    text.setAttribute('dominant-baseline', 'hanging');
    text.style.whiteSpace = 'pre';
    if (opts.color) text.setAttribute('fill', opts.color);
    if (opts.cls) text.classList.add(opts.cls);

    sourceLines.forEach((line, i) => {
      const tspan = document.createElementNS(ns, 'tspan');
      tspan.setAttribute('x', String(x));
      if (i > 0) tspan.setAttribute('dy', String(lineGap));
      // Truncate long lines
      if (line.length > charsPerLine) {
        tspan.textContent = `${line.slice(0, charsPerLine - 3)}...`;
      } else {
        tspan.textContent = line || ' '; // preserve blank lines with a space
      }
      text.appendChild(tspan);
    });

    if (truncated) {
      const tspan = document.createElementNS(ns, 'tspan');
      tspan.setAttribute('x', String(x));
      tspan.setAttribute('dy', String(lineGap));
      tspan.textContent = '...';
      text.appendChild(tspan);
      sourceLines.push('...');
    }

    const totalHeight = sourceLines.length > 0 ? fSize + (sourceLines.length - 1) * lineGap : 0;
    return { el: text, height: totalHeight };
  }

  _wrapText(text: string, charsPerLine: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      if (!current) {
        current = word;
      } else if (`${current} ${word}`.length <= charsPerLine) {
        current += ` ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  // --- Content-driven width ---

  _computeBaseWidth(): number {
    const titleChars = Math.min((this._formData.name || '').length, 60);
    const titleWidth = titleChars * this.BASE_TITLE_FONT_SIZE * this.CHAR_WIDTH_FACTOR + 2 * this.BASE_PADDING;

    let maxCodeLineLen = 0;
    if (this._formData.code) {
      for (const line of this._formData.code.split('\n')) {
        if (line.length > maxCodeLineLen) maxCodeLineLen = line.length;
      }
    }
    const codeChars = Math.min(maxCodeLineLen, 80);
    const codeWidth = codeChars * this.BASE_SMALL_FONT_SIZE * this.CHAR_WIDTH_FACTOR + 2 * this.BASE_PADDING;

    const MIN_BASE_WIDTH = 200;
    return Math.max(MIN_BASE_WIDTH, titleWidth, codeWidth);
  }

  // --- Legend updates from form ---

  _updateLegendFromForm(): void {
    this._legendWidth = this._computeBaseWidth() * this._scaleFactor;

    const oldLegend = this._svg!.querySelector('#pathogen-legend');
    if (oldLegend) oldLegend.remove();

    const legendG = this._buildLegendGroup();
    this._svg!.appendChild(legendG);
  }

  // --- Populate form ---

  _populateForm(): void {
    const root = this.shadowRoot!;
    (root.querySelector('#legend-name') as HTMLInputElement).value = this._formData.name;
    (root.querySelector('#legend-description') as HTMLTextAreaElement).value = this._formData.description;
    (root.querySelector('#legend-date') as HTMLInputElement).value = this._formData.date;
    (root.querySelector('#legend-creator') as HTMLInputElement).value = this._formData.creator;
    (root.querySelector('#legend-code') as HTMLTextAreaElement).value = this._formData.code;
    const snapInput = root.querySelector('#legend-snap') as HTMLInputElement | null;
    const snapToggle = root.querySelector('#snap-toggle') as HTMLButtonElement | null;
    if (snapInput) {
      snapInput.value = String(this._snapSize);
      snapInput.disabled = !this._snapEnabled;
    }
    if (snapToggle) {
      snapToggle.classList.toggle('active', this._snapEnabled);
      snapToggle.setAttribute('aria-checked', String(this._snapEnabled));
    }
    // Populate advanced export settings from workspace state
    if (this._workspaceState) {
      (root.querySelector('#export-grid-enabled') as HTMLInputElement).checked =
        this._workspaceState.gridEnabled || false;
      (root.querySelector('#export-grid-color') as HTMLElement & { value: string }).value =
        (this._workspaceState.gridColor as string) || '#cccccc';
    }
  }

  // --- Zoom / Pan ---

  /** Canvas dims for the shared pan/zoom math (this modal's viewBox origin is 0,0). */
  _pzCanvas(): { originX: number; originY: number; width: number; height: number } {
    return { originX: 0, originY: 0, width: this._canvasWidth, height: this._canvasHeight };
  }

  _updateViewBox(): void {
    if (!this._svg) return;
    // Shared math (window.PathogenPanZoom); this modal keeps viewBox mutation.
    this._svg.setAttribute(
      'viewBox',
      window.PathogenPanZoom.viewToViewBox({ zoom: this._zoom, panX: this._panX, panY: this._panY }, this._pzCanvas()),
    );
  }

  _updateZoomDisplay(): void {
    const input = this.shadowRoot!.querySelector('.zoom-level') as HTMLInputElement | null;
    if (input) input.value = `${Math.round(this._zoom * 100)}%`;
  }

  _zoomIn(): void {
    const oldZoom = this._zoom;
    this._zoom = window.PathogenPanZoom.clampZoom(this._zoom * this.ZOOM_STEP, { minZoom: this.MIN_ZOOM, maxZoom: this.MAX_ZOOM });
    this._adjustPanForZoom(oldZoom, this._zoom);
    this._updateViewBox();
    this._updateZoomDisplay();
  }

  _zoomOut(): void {
    const oldZoom = this._zoom;
    this._zoom = window.PathogenPanZoom.clampZoom(this._zoom / this.ZOOM_STEP, { minZoom: this.MIN_ZOOM, maxZoom: this.MAX_ZOOM });
    this._adjustPanForZoom(oldZoom, this._zoom);
    this._updateViewBox();
    this._updateZoomDisplay();
  }

  _zoomFit(): void {
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;
    this._updateViewBox();
    this._updateZoomDisplay();
  }

  _adjustPanForZoom(oldZoom: number, newZoom: number): void {
    const adj = window.PathogenPanZoom.adjustPanForZoom(
      { zoom: oldZoom, panX: this._panX, panY: this._panY },
      newZoom,
      this._pzCanvas(),
    );
    this._panX = adj.panX;
    this._panY = adj.panY;
  }

  // --- Screen to SVG coordinate conversion ---

  _screenToSvg(clientX: number, clientY: number): SVGPoint {
    const pt = this._svg!.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(this._svg!.getScreenCTM()!.inverse());
  }

  // --- Font embedding ---

  async _embedFonts(svgClone: SVGSVGElement): Promise<void> {
    const fonts = [
      {
        family: 'Baumans',
        url: 'https://fonts.googleapis.com/css2?family=Baumans&text=Pathogen',
      },
      {
        family: 'Inconsolata',
        url: `https://fonts.googleapis.com/css2?family=Inconsolata&text=${encodeURIComponent(
          ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~',
        )}`,
      },
    ];

    const fontFaceRules: string[] = [];

    for (const font of fonts) {
      try {
        // Check session cache
        if (ExportLegendModal._fontCache[font.family]) {
          fontFaceRules.push(ExportLegendModal._fontCache[font.family]);
          continue;
        }

        // Fetch CSS from Google Fonts
        const cssRes = await fetch(font.url);
        if (!cssRes.ok) throw new Error(`CSS fetch failed: ${cssRes.status}`);
        const css = await cssRes.text();

        // Extract src url and format from @font-face rule
        const srcMatch = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]([^'"]+)['"]\)/);
        if (!srcMatch) throw new Error('Could not parse font CSS');

        const fontUrl = srcMatch[1];
        const fontFormat = srcMatch[2];

        // Fetch font binary
        const fontRes = await fetch(fontUrl);
        if (!fontRes.ok) throw new Error(`Font fetch failed: ${fontRes.status}`);
        const buffer = await fontRes.arrayBuffer();

        // Convert to base64 using chunked approach to avoid call stack limits
        const bytes = new Uint8Array(buffer);
        const chunkSize = 8192;
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
        }
        const b64 = btoa(binary);

        // Determine MIME type
        const mime = fontFormat === 'woff2' ? 'font/woff2' : 'font/ttf';

        // Build @font-face rule with data URI
        const rule = `@font-face {\n  font-family: '${font.family}';\n  src: url(data:${mime};base64,${b64}) format('${fontFormat}');\n}`;

        ExportLegendModal._fontCache[font.family] = rule;
        fontFaceRules.push(rule);
      } catch (err: unknown) {
        console.warn(`Font embedding failed for ${font.family}:`, err);
      }
    }

    if (fontFaceRules.length === 0) return;

    // Inject into <defs> <style>
    const ns = 'http://www.w3.org/2000/svg';
    let defs = svgClone.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(ns, 'defs');
      svgClone.insertBefore(defs, svgClone.firstChild);
    }

    const styleEl = document.createElementNS(ns, 'style');
    styleEl.textContent = fontFaceRules.join('\n');
    defs.appendChild(styleEl);
  }

  // --- Export / Download ---

  async _download(): Promise<void> {
    const downloadBtn = this.shadowRoot!.querySelector('.download-btn') as HTMLButtonElement;
    const originalText = downloadBtn.innerHTML;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Preparing...';

    try {
      const clone = this._svg!.cloneNode(true) as SVGSVGElement;

      // Reset viewBox to full canvas
      clone.setAttribute('viewBox', `0 0 ${this._canvasWidth} ${this._canvasHeight}`);

      // Strip interactive elements (resize handles, accent border overlay)
      clone.querySelectorAll('[data-interactive="true"]').forEach((el) => el.remove());

      // Embed fonts for self-contained SVG
      await this._embedFonts(clone);

      const serializer = new XMLSerializer();
      const svgString = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(clone)}`;
      const blob = new Blob([svgString], { type: 'image/svg+xml' });

      const workspaceName = this._formData.name || 'untitled';
      const safeName = workspaceName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
      const suggestedName = `${safeName}-with-legend.svg`;

      if ('showSaveFilePicker' in window) {
        const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'SVG Files',
              accept: { 'image/svg+xml': ['.svg'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Export failed:', err);
      }
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = originalText;
    }
  }

  // --- Event handling ---

  _setupEventListeners(): void {
    const root = this.shadowRoot!;

    // Close button
    root.querySelector('.close-btn')!.addEventListener('click', () => this.close());

    // Cancel button
    root.querySelector('.cancel-btn')!.addEventListener('click', () => this.close());

    // Download
    root.querySelector('.download-btn')!.addEventListener('click', () => this._download());

    // Zoom controls
    root.querySelector('.zoom-in')!.addEventListener('click', () => this._zoomIn());
    root.querySelector('.zoom-out')!.addEventListener('click', () => this._zoomOut());
    root.querySelector('.zoom-fit')!.addEventListener('click', () => this._zoomFit());

    // Zoom level input
    const zoomInput = root.querySelector('.zoom-level') as HTMLInputElement;
    zoomInput.addEventListener('change', (e: Event) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      if (!isNaN(val) && val >= this.MIN_ZOOM * 100 && val <= this.MAX_ZOOM * 100) {
        const oldZoom = this._zoom;
        this._zoom = val / 100;
        this._adjustPanForZoom(oldZoom, this._zoom);
        this._updateViewBox();
        this._updateZoomDisplay();
      } else {
        this._updateZoomDisplay();
      }
    });

    // Form inputs -> live update legend
    const formInputs = ['#legend-name', '#legend-description', '#legend-date', '#legend-creator'];
    formInputs.forEach((sel) => {
      root.querySelector(sel)!.addEventListener('input', (e: Event) => {
        const field = sel.replace('#legend-', '') as keyof LegendFormData;
        this._formData[field] = (e.target as HTMLInputElement).value;
        this._updateLegendFromForm();
      });
    });

    // Snap toggle + size input
    const snapToggle = root.querySelector('#snap-toggle') as HTMLButtonElement;
    const snapInput = root.querySelector('#legend-snap') as HTMLInputElement;
    const snapLabel = root.querySelector('#snap-label') as HTMLElement;

    const updateSnapToggleUI = (): void => {
      snapToggle.classList.toggle('active', this._snapEnabled);
      snapToggle.setAttribute('aria-checked', String(this._snapEnabled));
      snapInput.disabled = !this._snapEnabled;
    };

    snapToggle.addEventListener('click', () => {
      this._snapEnabled = !this._snapEnabled;
      updateSnapToggleUI();
    });

    snapLabel.addEventListener('click', () => {
      this._snapEnabled = !this._snapEnabled;
      updateSnapToggleUI();
    });

    snapInput.addEventListener('input', (e: Event) => {
      this._snapSize = Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1);
    });

    // Advanced export settings
    (root.querySelector('#export-grid-enabled') as HTMLInputElement).addEventListener('change', (e: Event) => {
      this._exportOverrides.gridEnabled = (e.target as HTMLInputElement).checked;
      this._scheduleRebuild();
    });
    root.querySelector('#export-grid-color')!.addEventListener('color-change', (e: Event) => {
      this._exportOverrides.gridColor = (e as CustomEvent<{ value: string }>).detail.value;
      this._scheduleRebuild();
    });

    // Preview area mouse events (pan + legend drag + resize)
    const previewArea = root.querySelector('.preview-area') as HTMLElement;

    previewArea.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this._svg) return;

      const target = e.target as Element;

      // Resize handle
      if (target.classList.contains('resize-handle')) {
        e.preventDefault();
        e.stopPropagation();
        this._isResizing = true;
        this._resizeStartX = e.clientX;
        this._resizeStartWidth = this._legendWidth;
        return;
      }

      // Legend drag
      if (target.closest('.legend-group')) {
        e.preventDefault();
        e.stopPropagation();
        this._isDragging = true;
        const svgPt = this._screenToSvg(e.clientX, e.clientY);
        this._dragStartX = svgPt.x - this._legendX;
        this._dragStartY = svgPt.y - this._legendY;
        const legendG = this._svg.querySelector('#pathogen-legend');
        if (legendG) legendG.classList.add('dragging');
        return;
      }

      // Pan
      e.preventDefault();
      this._isPanning = true;
      this._panStartX = e.clientX;
      this._panStartY = e.clientY;
      previewArea.classList.add('panning');
    });

    // Wheel zoom
    previewArea.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        if (!this._svg) return;
        e.preventDefault();
        const dampening = 0.002;
        const delta = -e.deltaY * dampening;
        const oldZoom = this._zoom;
        this._zoom = window.PathogenPanZoom.clampZoom(this._zoom * (1 + delta), { minZoom: this.MIN_ZOOM, maxZoom: this.MAX_ZOOM });
        this._adjustPanForZoom(oldZoom, this._zoom);
        this._updateViewBox();
        this._updateZoomDisplay();
      },
      { passive: false },
    );
  }

  _addDocumentListeners(): void {
    this._handleMouseMove = (e: MouseEvent): void => {
      // Legend resize
      if (this._isResizing) {
        const dx = e.clientX - this._resizeStartX;
        const rect = this._svg!.getBoundingClientRect();
        const vw = this._canvasWidth / this._zoom;
        const scale = vw / rect.width;
        const svgDx = dx * scale;
        const baseWidth = this._computeBaseWidth();
        const minWidth = baseWidth * 0.15;
        const newWidth = Math.max(minWidth, this._resizeStartWidth + svgDx);
        this._scaleFactor = newWidth / baseWidth;
        this._updateLegendFromForm();
        return;
      }

      // Legend drag
      if (this._isDragging) {
        const svgPt = this._screenToSvg(e.clientX, e.clientY);
        this._legendX = this._snap(svgPt.x - this._dragStartX);
        this._legendY = this._snap(svgPt.y - this._dragStartY);
        this._updateLegendPosition();
        return;
      }

      // Pan
      if (this._isPanning && this._svg) {
        const rect = this._svg.getBoundingClientRect();
        const vw = this._canvasWidth / this._zoom;
        const vh = this._canvasHeight / this._zoom;
        const scaleX = vw / rect.width;
        const scaleY = vh / rect.height;

        this._panX += (this._panStartX - e.clientX) * scaleX;
        this._panY += (this._panStartY - e.clientY) * scaleY;
        this._panStartX = e.clientX;
        this._panStartY = e.clientY;
        this._updateViewBox();
      }
    };

    this._handleMouseUp = (): void => {
      if (this._isDragging) {
        this._isDragging = false;
        const legendG = this._svg?.querySelector('#pathogen-legend');
        if (legendG) legendG.classList.remove('dragging');
      }
      if (this._isResizing) {
        this._isResizing = false;
      }
      if (this._isPanning) {
        this._isPanning = false;
        const previewArea = this.shadowRoot!.querySelector('.preview-area');
        if (previewArea) previewArea.classList.remove('panning');
      }
    };

    this._handleKeydown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
        return;
      }

      // Arrow keys move legend (skip when focus is in a text field)
      const origin = e.composedPath()[0] as HTMLElement | undefined;
      const tag = origin?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const arrowMap: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      const dir = arrowMap[e.key];
      if (dir && this._svg) {
        e.preventDefault();
        const multiplier = e.shiftKey ? 10 : 1;
        const base = this._snapEnabled && this._snapSize > 0 ? this._snapSize : 1;
        const step = base * multiplier;
        this._legendX += dir[0] * step;
        this._legendY += dir[1] * step;
        this._updateLegendPosition();
      }
    };

    document.addEventListener('mousemove', this._handleMouseMove);
    document.addEventListener('mouseup', this._handleMouseUp);
    document.addEventListener('keydown', this._handleKeydown, true);
  }

  _removeDocumentListeners(): void {
    if (this._handleMouseMove) document.removeEventListener('mousemove', this._handleMouseMove);
    if (this._handleMouseUp) document.removeEventListener('mouseup', this._handleMouseUp);
    if (this._handleKeydown) document.removeEventListener('keydown', this._handleKeydown, true);
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>${styles}</style>

      <div class="backdrop"></div>

      <div class="top-bar">
        <button class="close-btn" title="Close">&times;</button>
        <h2>Export with Legend</h2>
        <div class="top-bar-actions">
          <button class="btn primary download-btn">Download &#x2193;</button>
        </div>
      </div>

      <div class="content">
        <div class="form-panel">
          <div class="form-group">
            <label for="legend-name">Name</label>
            <input type="text" id="legend-name" placeholder="Workspace name">
          </div>
          <div class="form-group">
            <label for="legend-description">Description</label>
            <textarea id="legend-description" rows="3" placeholder="Optional description"></textarea>
          </div>
          <div class="form-group">
            <label for="legend-date">Export Date</label>
            <input type="date" id="legend-date">
          </div>
          <div class="form-group">
            <label for="legend-creator">Creator</label>
            <input type="text" id="legend-creator" placeholder="Your name">
          </div>
          <div class="form-group">
            <label for="legend-code">SVGX Code</label>
            <textarea id="legend-code" rows="6" class="code-input" readonly></textarea>
          </div>
          <details class="advanced-settings">
            <summary>Advanced Export Settings</summary>
            <div class="advanced-body">
              <div class="advanced-row">
                <label for="export-grid-enabled">Show Grid</label>
                <input type="checkbox" id="export-grid-enabled">
              </div>
              <div class="advanced-row">
                <label for="export-grid-color">Grid Color</label>
                <pathogen-color-input id="export-grid-color" compact no-alpha></pathogen-color-input>
              </div>
            </div>
          </details>
          <div class="form-spacer"></div>
          <button class="btn cancel-btn">Cancel</button>
        </div>

        <div class="preview-panel">
          <div class="preview-area"></div>
          <div class="zoom-bar">
            <div class="zoom-controls">
              <button class="zoom-out" title="Zoom out">&#x2212;</button>
              <button class="zoom-fit" title="Fit to view">Fit</button>
              <button class="zoom-in" title="Zoom in">&#x002B;</button>
              <input type="text" class="zoom-level" value="100%" title="Enter zoom percentage">
            </div>
            <div class="snap-group">
              <span class="snap-label" id="snap-label">Snap</span>
              <button class="snap-toggle active" id="snap-toggle" role="switch" aria-checked="true" aria-labelledby="snap-label" title="Toggle snap to grid"></button>
              <input type="number" class="snap-size" id="legend-snap" min="1" step="1" value="10" title="Snap grid size">
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('export-legend-modal', ExportLegendModal);

export default ExportLegendModal;
