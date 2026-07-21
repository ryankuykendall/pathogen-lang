// Export Modal - Full-screen overlay: the single export workflow for a
// workspace (SVG / PNG / PDF, optional legend, brand watermark).
// Opens via custom event, not routed. Component-local state (not persisted in store).

import { createSvgSnapshot } from '../utils/svg-snapshot.js';
import {
  PAGE_PRESETS,
  PT_PER_CM,
  PT_PER_IN,
  computePdfLayout,
  convertUnit,
  CROP_MARK_WIDTH_PT,
} from '../utils/pdf-page-layout.js';
import type { PdfLayout, PdfLayoutInput, Unit } from '../utils/pdf-page-layout.js';
import {
  coverManifestEntries,
  coverNotes,
  coverPageSize,
  coverTechnicalLine,
  previewFitRect,
} from '../utils/pdf-cover-sheet.js';
import type { CoverManifestEntry, CoverPageSize } from '../utils/pdf-cover-sheet.js';
import { normalizeSvgPaintColors, resolveCssColorToHex } from '../utils/svg-pdf-colors.js';
import { outlineSvgText } from '../utils/svg-text-outliner.js';
import { CODE_PRINT_COLORS, CODE_PRINT_DEFAULT } from '../utils/code-print-palette.js';
import { layoutCodeLines } from '../utils/legend-code-tokens.js';
import type { CodeToken } from '../utils/legend-code-tokens.js';
import styles from './export-modal.css';
import './shared/pathogen-color-input.js';

// Accent color used for legend border and resize handle (matches app theme)
const ACCENT = '#10b981';
const ACCENT_LIGHT = 'rgba(16, 185, 129, 0.35)';

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Chain-link icons for the aspect-ratio lock (linked shown when locked).
const ASPECT_LOCK_ICONS = `
  <svg class="linked-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
  <svg class="unlinked-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M5.17 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="16" y1="19" x2="16" y2="22"/><line x1="19" y1="16" x2="22" y2="16"/></svg>`;

/** Raster fallback resolution for mask/filter artwork in PDF exports. */
const RASTER_DPI = 300;
const RASTER_MAX_SIDE_PX = 8192;

/** Hard cap for PNG export dimensions (canvas element limit). */
const PNG_MAX_SIDE_PX = 16384;

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

interface ExportSettings {
  format: 'svg' | 'png' | 'pdf';
  /**
   * Embed the legend card (title/creator/date/description/code). Reset to
   * false on every open() — the legend is opt-in per export.
   */
  includeLegend: boolean;
  /** Color the legend's code listing with the print palette. */
  highlightCode: boolean;
  /** PNG output scale relative to the viewBox, or 'custom' (pixel width). */
  pngScale: number | 'custom';
  pngCustomWidth: number;
  /** Omit the workspace background from the PNG. */
  pngTransparent: boolean;
  /** 'match' | 'custom' | a PAGE_PRESETS id */
  sizing: string;
  orientation: 'portrait' | 'landscape';
  /** Match mode: printed artwork size, in `unit`. */
  artW: number;
  artH: number;
  /** Custom mode: page (trim) size, in `unit`. */
  pageW: number;
  pageH: number;
  /** Custom mode: keep page at the artwork's aspect ratio. */
  ratioLocked: boolean;
  /** Single unit for all dimensions (sizes + margins). */
  unit: Unit;
  margin: number;
  /** Bleed + crop marks. */
  printPrep: boolean;
  /**
   * How the artwork is written into the PDF. 'vector' is exact but PDF viewers
   * choke on very complex artwork (hundreds of thousands of path ops render
   * for minutes or blank) — such artwork defaults to 'raster' (print-resolution
   * image; text + legend stay vector either way).
   */
  artworkMode: 'vector' | 'raster';
  /**
   * Per-export coordinate decimals for artwork paths (SVG + PDF); null =
   * match workspace (no post-processing). Reset to null on every open().
   */
  exportPrecision: number | null;
  /**
   * PDF vector-mode decimation: cull segments below a fraction of a printed
   * dot at the chosen print size. Defaults to 'standard' for complex artwork.
   */
  detail: 'full' | 'fine' | 'standard';
  /**
   * Include the page-1 job-ticket cover (fast preview + spec manifest).
   * Defaults ON for complex artwork, where a heavy vector page 2 makes the
   * file look broken in Finder/Preview.
   */
  coverSheet: boolean;
}

/** Artwork above either threshold defaults the PDF export to raster mode. */
const COMPLEXITY_D_LENGTH = 1_500_000;
const COMPLEXITY_NODE_COUNT = 20_000;

interface WorkspaceState {
  width: number;
  height: number;
  background?: string;
  toFixed?: number | null;
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
  /** Explicit line gap for wrapped text (bypasses the legend _scaleFactor). */
  lineGap?: number;
}

interface WrappedTextResult {
  el: SVGTextElement;
  height: number;
}

/** Minimal structural typing for the lazily-imported jsPDF instance. */
interface JsPdfDoc {
  setFillColor: (color: string) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  setLineWidth: (width: number) => void;
  rect: (x: number, y: number, w: number, h: number, style: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addImage: (data: Uint8Array, format: string, x: number, y: number, w: number, h: number) => void;
  addPage: (format: [number, number], orientation: 'portrait' | 'landscape') => void;
  output: (type: 'blob') => Blob;
}

class ExportModal extends HTMLElement {
  static _fontCache: Record<string, string> = {};

  // Zoom/pan state (independent of workspace)
  private _zoom = 1;

  private _panX = 0;

  private _panY = 0;

  private _isPanning = false;

  private _panStartX = 0;

  private _panStartY = 0;

  // Legend drag state
  private _isDragging = false;

  private _dragStartX = 0;

  private _dragStartY = 0;

  private _legendX = 0;

  private _legendY = 0;

  // Legend resize state
  private _isResizing = false;

  private _resizeStartX = 0;

  private _resizeStartWidth = 0;

  private _legendWidth = 560;

  // SVG canvas dimensions (from store)
  private _canvasWidth = 200;

  private _canvasHeight = 200;

  // Scale factor: all legend dimensions are multiplied by this
  private _scaleFactor = 1;

  // Snap-to-grid
  private _snapEnabled = true;

  private _snapSize = 10;

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

  // Memoized highlight tokens for the (readonly) code field — the legend
  // rebuilds on every form keystroke; don't re-parse the source each time.
  private _tokenCache: { source: string; lines: CodeToken[][] } | null = null;

  // Export format + PDF print settings. Sizing/unit/margin choices are sticky
  // for the session; artworkMode, detail, and exportPrecision are re-seeded on
  // every open() (complexity heuristic / match-workspace defaults).
  private _exportSettings: ExportSettings = {
    format: 'svg',
    includeLegend: false,
    highlightCode: true,
    pngScale: 2,
    pngCustomWidth: 1600,
    pngTransparent: false,
    sizing: 'match',
    orientation: 'portrait',
    artW: 24,
    artH: 18,
    pageW: 18,
    pageH: 24,
    ratioLocked: true,
    unit: 'in',
    margin: 0.5,
    printPrep: true,
    artworkMode: 'vector',
    exportPrecision: null,
    detail: 'full',
    coverSheet: false,
  };

  // Export overrides (non-null values override workspace state in preview)
  private _exportOverrides: ExportOverrides = { gridEnabled: null, gridColor: null };

  // Debounce handle for preview rebuilds
  private _rebuildRafId: number | null = null;

  // SVG references
  private _svg: SVGSVGElement | null = null;

  private _svgElement: SVGSVGElement | null = null;

  // Measured legend heights
  private _legendBoxHeight = 0;

  private _legendTotalHeight = 0;

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

    // Snapshot workspace state for override merging. The grid defaults OFF
    // for exports regardless of the workspace setting (an explicit false
    // override, not null/inherit) — a printed piece rarely wants the grid.
    this._workspaceState = { ...storeState };
    this._exportOverrides = { gridEnabled: false, gridColor: null };

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

    // Re-derive ratio-locked dimensions from this workspace's canvas
    const ratio = this._canvasWidth / this._canvasHeight;
    this._exportSettings.artH = round2(this._exportSettings.artW / ratio);
    if (this._exportSettings.ratioLocked) {
      this._exportSettings.pageH = round2(this._exportSettings.pageW / ratio);
    }

    // Very complex artwork defaults to raster — pure-vector PDFs of it are
    // valid but render for minutes (or blank) in Preview/Acrobat. The same
    // heuristic defaults vector-mode Detail decimation to 'standard'.
    const complex = this._isArtworkComplex(svgElement);
    this._exportSettings.artworkMode = complex ? 'raster' : 'vector';
    this._exportSettings.detail = complex ? 'standard' : 'full';
    this._exportSettings.coverSheet = complex;
    this._exportSettings.exportPrecision = null;

    // The legend is opt-in per export; the highlight tokens belong to the
    // previous workspace's source.
    this._exportSettings.includeLegend = false;
    this._tokenCache = null;

    // Reflect the workspace's compile-time precision in the Match option label.
    const matchOption = this.shadowRoot!.querySelector('#export-precision option[value="match"]');
    if (matchOption) {
      const ws = this._workspaceState?.toFixed;
      matchOption.textContent = `Match workspace (${ws != null ? ws : 'off'})`;
    }

    // Build the preview SVG with legend
    this._buildPreviewSvg(svgElement, this._getEffectiveState());
    this._populateForm();
    this._updatePdfUi();
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

    if (this._exportSettings.includeLegend) {
      this._appendLegendPositioned(svg);
    } else {
      svg.appendChild(this._buildWatermarkGroup());
    }

    previewArea.appendChild(svg);
    this._svg = svg;
    this._updateViewBox();
  }

  /** Build the legend and place it bottom-right (default position). */
  _appendLegendPositioned(svg: SVGSVGElement): void {
    const margin = this._s(10);
    this._legendX = 0;
    this._legendY = 0;
    this._legendWidth = this._computeBaseWidth() * this._scaleFactor;
    const legendG = this._buildLegendGroup();

    // Now position at bottom-right using measured height, snapped to grid
    this._legendX = this._snap(this._canvasWidth - this._legendWidth - margin);
    this._legendY = this._snap(this._canvasHeight - this._legendTotalHeight - margin);
    legendG.setAttribute('transform', `translate(${this._legendX}, ${this._legendY})`);
    svg.appendChild(legendG);
  }

  /**
   * Brand watermark for legend-less exports: the same two-tspan pattern as
   * the legend footer, tucked into the artwork's bottom-right corner. Fixed
   * and non-interactive — it IS the export's attribution, shown in the
   * preview so the download never surprises.
   */
  _buildWatermarkGroup(): SVGGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('id', 'pathogen-watermark');

    const inset = this._s(10);
    const brandText = this._createBrandText(
      this._canvasWidth - inset,
      this._canvasHeight - inset,
      this._s(this.BASE_BRAND_FONT_SIZE),
      this._s(this.BASE_SMALL_FONT_SIZE) * 1.2,
      'end',
    );
    g.appendChild(brandText);
    return g;
  }

  /**
   * "Created in pathogen.studio" as one <text> with two tspans (Inter +
   * Baumans). y is the text baseline. Shared by the legend footer and the
   * watermark; the PDF cover sheet keeps its own pt-coordinate copy.
   */
  _createBrandText(
    x: number,
    y: number,
    brandFontSize: number,
    pathogenFontSize: number,
    anchor?: string,
  ): SVGTextElement {
    const ns = 'http://www.w3.org/2000/svg';
    const brandText = document.createElementNS(ns, 'text');
    brandText.setAttribute('x', String(x));
    brandText.setAttribute('y', String(y));
    brandText.setAttribute('dominant-baseline', 'auto');
    brandText.setAttribute('fill', '#94a3b8');
    if (anchor) brandText.setAttribute('text-anchor', anchor);

    const brandSpan1 = document.createElementNS(ns, 'tspan');
    brandSpan1.setAttribute('font-size', String(brandFontSize));
    brandSpan1.setAttribute('font-family', "'Inter', -apple-system, BlinkMacSystemFont, sans-serif");
    brandSpan1.textContent = 'Created in';

    const brandSpan2 = document.createElementNS(ns, 'tspan');
    brandSpan2.setAttribute('font-size', String(pathogenFontSize));
    brandSpan2.setAttribute('font-weight', '400');
    brandSpan2.setAttribute('font-family', "'Baumans', cursive");
    brandSpan2.setAttribute('dx', String(brandFontSize * this.CHAR_WIDTH_FACTOR));
    brandSpan2.textContent = 'pathogen.studio';

    brandText.appendChild(brandSpan1);
    brandText.appendChild(brandSpan2);
    return brandText;
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

    // Branding below box — same pattern as the legend-less watermark
    const brandY = boxHeight + brandGap;
    const pathogenFontSize = smallFontSize * 1.2;
    const brandText = this._createBrandText(pad, brandY + pathogenFontSize, brandFontSize, pathogenFontSize);
    brandText.classList.add('legend-brand');
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
    const lineGap = opts.lineGap ?? fSize + this._s(3);

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

  /**
   * Highlight tokens for the (readonly) source, memoized per source string.
   * Returns null when the library bundle predates highlightPathogenTokens or
   * tokenization throws — the code block falls back to monochrome.
   */
  _tokensFor(source: string): CodeToken[][] | null {
    if (this._tokenCache?.source === source) return this._tokenCache.lines;
    const tokenize = window.PathogenLang?.highlightPathogenTokens;
    if (typeof tokenize !== 'function') return null;
    try {
      const lines = tokenize(source);
      this._tokenCache = { source, lines };
      return lines;
    } catch (err) {
      console.warn('Syntax highlighting unavailable for this export:', err);
      return null;
    }
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

    const highlight = this._exportSettings.highlightCode;
    const lines = layoutCodeLines(code, {
      maxLines,
      charsPerLine,
      tokenLines: highlight ? this._tokensFor(code) : null,
    });

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('font-size', String(fSize));
    text.setAttribute('font-family', "'Inconsolata', 'Consolas', 'Monaco', monospace");
    text.setAttribute('dominant-baseline', 'hanging');
    text.style.whiteSpace = 'pre';
    const baseFill = highlight ? CODE_PRINT_DEFAULT : opts.color;
    if (baseFill) text.setAttribute('fill', baseFill);
    if (opts.cls) text.classList.add(opts.cls);

    // One tspan per token. Only each line's FIRST tspan carries x/dy;
    // followers continue the pen — the layout browsers, svg2pdf, and the
    // text outliner all agree on. Fills are literal attributes (never CSS
    // classes/vars) so they survive serialization, rasterization, and
    // outlining. No italics: the outliner renders upright glyphs.
    lines.forEach((tokens, i) => {
      tokens.forEach((tok, j) => {
        const tspan = document.createElementNS(ns, 'tspan');
        if (j === 0) {
          tspan.setAttribute('x', String(x));
          if (i > 0) tspan.setAttribute('dy', String(lineGap));
        }
        if (highlight && tok.cls && CODE_PRINT_COLORS[tok.cls]) {
          tspan.setAttribute('fill', CODE_PRINT_COLORS[tok.cls]);
        }
        tspan.textContent = tok.text;
        text.appendChild(tspan);
      });
    });

    const totalHeight = lines.length > 0 ? fSize + (lines.length - 1) * lineGap : 0;
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
    if (!this._svg) return;
    this._svg.querySelector('#pathogen-legend')?.remove();
    if (!this._exportSettings.includeLegend) return;

    this._legendWidth = this._computeBaseWidth() * this._scaleFactor;
    const legendG = this._buildLegendGroup();
    this._svg.appendChild(legendG);
  }

  /** Swap between legend (default-positioned) and watermark in the preview. */
  _applyIncludeLegend(): void {
    if (!this._svg) return;
    this._svg.querySelector('#pathogen-legend')?.remove();
    this._svg.querySelector('#pathogen-watermark')?.remove();
    if (this._exportSettings.includeLegend) {
      this._appendLegendPositioned(this._svg);
    } else {
      this._svg.appendChild(this._buildWatermarkGroup());
    }
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
    // Populate advanced export settings. Grid follows the export override
    // (defaults OFF); color still seeds from the workspace.
    if (this._workspaceState) {
      (root.querySelector('#export-grid-enabled') as HTMLInputElement).checked =
        this._exportOverrides.gridEnabled ?? false;
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
    this._zoom = window.PathogenPanZoom.clampZoom(this._zoom * this.ZOOM_STEP, {
      minZoom: this.MIN_ZOOM,
      maxZoom: this.MAX_ZOOM,
    });
    this._adjustPanForZoom(oldZoom, this._zoom);
    this._updateViewBox();
    this._updateZoomDisplay();
  }

  _zoomOut(): void {
    const oldZoom = this._zoom;
    this._zoom = window.PathogenPanZoom.clampZoom(this._zoom / this.ZOOM_STEP, {
      minZoom: this.MIN_ZOOM,
      maxZoom: this.MAX_ZOOM,
    });
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
        url: `https://fonts.googleapis.com/css2?family=Baumans&text=${encodeURIComponent('pathogen.studio')}`,
      },
      {
        // Just the brand line's prefix — the rest of the legend's Inter
        // text keeps the system-sans fallback, as before.
        family: 'Inter',
        url: `https://fonts.googleapis.com/css2?family=Inter&text=${encodeURIComponent('Created in')}`,
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
        if (ExportModal._fontCache[font.family]) {
          fontFaceRules.push(ExportModal._fontCache[font.family]);
          continue;
        }

        // Fetch CSS from Google Fonts
        const cssRes = await fetch(font.url);
        if (!cssRes.ok) throw new Error(`CSS fetch failed: ${cssRes.status}`);
        const css = await cssRes.text();

        // Extract src url and format from @font-face rule
        const srcMatch = /src:\s*url\(([^)]+)\)\s*format\(['"]([^'"]+)['"]\)/.exec(css);
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

        ExportModal._fontCache[font.family] = rule;
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

    try {
      const format = this._exportSettings.format;
      // Surface cheap geometry errors before opening the save dialog.
      if (format === 'pdf') computePdfLayout(this._layoutInput());
      if (format === 'png') this._pngDims();

      const suggestedName = `${this._safeName()}.${format}`;
      // Acquire the save target FIRST, while the click's transient user
      // activation is still valid — the export pipeline (font fetches,
      // rasterization, svg2pdf) can easily outlive Chrome's ~5s activation
      // window, after which showSaveFilePicker throws SecurityError.
      const target = await this._acquireSaveTarget(suggestedName, format);
      if (target === 'cancelled') return;

      downloadBtn.textContent = 'Preparing...';
      const blob =
        format === 'pdf'
          ? await this._downloadPdf(downloadBtn)
          : format === 'png'
            ? await this._downloadPng()
            : await this._downloadSvg();
      await this._writeBlob(blob, suggestedName, target);
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Export failed:', err);
        this._setExportStatus((err as Error).message || 'Export failed', true);
      }
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = originalText;
    }
  }

  /** Clone the preview SVG and strip editor-only chrome for export. */
  _prepareExportClone(): SVGSVGElement {
    const clone = this._svg!.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('viewBox', `0 0 ${this._canvasWidth} ${this._canvasHeight}`);
    clone.querySelectorAll('[data-interactive="true"]').forEach((el) => el.remove());
    return clone;
  }

  _safeName(): string {
    const workspaceName = this._formData.name || 'untitled';
    return workspaceName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
  }

  /**
   * Open the save dialog while the user gesture is still live. Returns the
   * file handle, 'cancelled' (user dismissed — skip the export entirely), or
   * null (API unavailable or refused → anchor-download fallback at write time).
   */
  async _acquireSaveTarget(
    suggestedName: string,
    format: 'svg' | 'png' | 'pdf',
  ): Promise<FileSystemFileHandle | 'cancelled' | null> {
    if (!('showSaveFilePicker' in window)) return null;
    const fileTypes = {
      svg: { description: 'SVG Files', accept: { 'image/svg+xml': ['.svg'] } },
      png: { description: 'PNG Files', accept: { 'image/png': ['.png'] } },
      pdf: { description: 'PDF Files', accept: { 'application/pdf': ['.pdf'] } },
    } as const;
    try {
      return await (
        window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }
      ).showSaveFilePicker({
        suggestedName,
        types: [fileTypes[format]],
      });
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
      console.warn('showSaveFilePicker unavailable, falling back to anchor download:', err);
      return null;
    }
  }

  async _writeBlob(blob: Blob, suggestedName: string, target: FileSystemFileHandle | null): Promise<void> {
    if (target) {
      const writable = await target.createWritable();
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
  }

  /**
   * Apply the export optimization passes (Detail decimation when epsilon is
   * given, then Precision trimming) to artwork paths — everything outside
   * #pathogen-legend. Both passes re-emit absolute commands so rounding never
   * accumulates. A malformed d leaves that path untouched.
   */
  _optimizeArtworkPaths(clone: SVGSVGElement, epsilon: number | null): { removed: number; total: number } | null {
    const precision = this._exportSettings.exportPrecision;
    if (epsilon == null && precision == null) return null;
    const lib = window.PathogenLang;
    let removed = 0;
    let total = 0;
    for (const el of Array.from(clone.querySelectorAll('path[d]'))) {
      // Legend/watermark geometry is never touched, and defs-scoped paths
      // (markers, clip paths, patterns) live in their own local coordinate
      // systems — the artwork-derived epsilon/precision have no meaning there.
      if (el.closest('#pathogen-legend, #pathogen-watermark, defs, marker, clipPath, pattern')) continue;
      try {
        let d = el.getAttribute('d')!;
        let pathRemoved = 0;
        let pathTotal = 0;
        if (epsilon != null) {
          const result = lib.decimatePathData(d, epsilon);
          pathRemoved = result.removed;
          pathTotal = result.removed + result.kept;
          d = result.d;
        }
        if (precision != null) {
          d = lib.trimPathDataPrecision(d, precision);
        }
        el.setAttribute('d', d);
        // Count only after the write succeeded so the reported reduction
        // always matches what's actually in the exported file.
        removed += pathRemoved;
        total += pathTotal;
      } catch (err) {
        console.warn('Path optimization skipped for one path:', err);
      }
    }
    return epsilon != null ? { removed, total } : null;
  }

  async _downloadSvg(): Promise<Blob> {
    const clone = this._prepareExportClone();
    this._optimizeArtworkPaths(clone, null);

    // Embed fonts for self-contained SVG
    await this._embedFonts(clone);

    const serializer = new XMLSerializer();
    const svgString = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(clone)}`;
    return new Blob([svgString], { type: 'image/svg+xml' });
  }

  /** PNG output dimensions from the scale settings. Throws on invalid sizes. */
  _pngDims(): { w: number; h: number } {
    const s = this._exportSettings;
    const w = s.pngScale === 'custom' ? Math.round(s.pngCustomWidth) : Math.round(this._canvasWidth * s.pngScale);
    if (!Number.isFinite(w) || w < 1) {
      throw new Error('Enter a PNG width of at least 1 px.');
    }
    const h = Math.max(1, Math.round(w * (this._canvasHeight / this._canvasWidth)));
    if (Math.max(w, h) > PNG_MAX_SIDE_PX) {
      throw new Error(
        `PNG too large — ${w.toLocaleString()} × ${h.toLocaleString()} px exceeds the ${PNG_MAX_SIDE_PX.toLocaleString()} px per-side limit. Reduce the scale or width.`,
      );
    }
    return { w, h };
  }

  async _downloadPng(): Promise<Blob> {
    this._setExportStatus('');
    const dims = this._pngDims();
    const clone = this._prepareExportClone();
    this._optimizeArtworkPaths(clone, null);

    // Transparent export: drop the workspace background rect entirely so
    // the canvas's own transparency shows through.
    if (this._exportSettings.pngTransparent) {
      clone.querySelector('#preview-bg')?.remove();
    }

    // Fonts must be embedded BEFORE rasterizing — the SVG renders inside an
    // isolated <img> document where external fetches never happen; data-URI
    // @font-face is the only way the legend/watermark text gets real fonts.
    await this._embedFonts(clone);

    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(this._canvasWidth));
    clone.setAttribute('height', String(this._canvasHeight));
    return this._rasterizeSvg(clone, dims.w, dims.h, { type: 'image/png' });
  }

  async _downloadPdf(downloadBtn: HTMLButtonElement): Promise<Blob> {
    this._setExportStatus('');
    // Snapshot all mutable modal state up front — the user can close and
    // reopen the modal for a different workspace while awaits below resolve.
    const layout = computePdfLayout(this._layoutInput());
    const clone = this._prepareExportClone();
    const background = this._getEffectiveState().background;
    const canvasWidth = this._canvasWidth;
    const canvasHeight = this._canvasHeight;
    const wantRaster = this._exportSettings.artworkMode === 'raster';
    const forcedRaster = !!clone.querySelector('mask, filter, [mask], [filter]');
    const detail = this._exportSettings.detail;
    const coverEnabled = this._exportSettings.coverSheet;
    const cover = coverPageSize(this._exportSettings.unit);
    const coverManifestBase = {
      unit: this._exportSettings.unit,
      margin: this._exportSettings.margin,
      printPrep: this._exportSettings.printPrep,
      exportPrecision: this._exportSettings.exportPrecision,
      workspaceToFixed: this._workspaceState?.toFixed,
      date: this._formData.date,
      creator: this._formData.creator,
    };
    const coverTitle = this._formData.name || 'Untitled';
    const coverDescription = this._formData.description;
    const notices: string[] = [];

    // Detail decimation (vector artwork only) + per-export precision trimming.
    // Epsilon = the chosen fraction of one printed dot at 300 DPI, converted
    // from points into SVG user units via the layout's scale.
    let epsilon: number | null = null;
    if (!wantRaster && !forcedRaster && detail !== 'full') {
      const DOT_PT = PT_PER_IN / 300;
      epsilon = ((detail === 'fine' ? 0.5 : 1) * DOT_PT) / layout.scale;
    }
    const reduction = this._optimizeArtworkPaths(clone, epsilon);
    if (reduction && reduction.removed > 0) {
      notices.push(
        `Detail: removed ${reduction.removed.toLocaleString()} of ${reduction.total.toLocaleString()} path segments (below print resolution).`,
      );
    }

    // Outline every piece of text so the PDF carries zero font dependencies.
    const outline = await outlineSvgText(clone);
    notices.push(...outline.warnings);

    // The zero-font-dependency guarantee is the whole point of the PDF export:
    // if any text could not be outlined (font fetch failed), refuse to produce
    // a PDF that would silently depend on fonts the print shop doesn't have.
    if (clone.querySelector('text')) {
      throw new Error(
        'Some text could not be converted to outlines (font download failed), so the PDF was not generated — it would not print with the correct fonts. Check your connection and try again.',
      );
    }

    // Cover preview: captured from a COPY of the fully optimized + outlined
    // clone (artwork + legend), before the raster branch strips the artwork.
    let previewBytes: Uint8Array | null = null;
    if (coverEnabled) {
      const previewSvg = clone.cloneNode(true) as SVGSVGElement;
      previewSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      previewSvg.setAttribute('width', String(canvasWidth));
      previewSvg.setAttribute('height', String(canvasHeight));
      const previewScale = 1200 / Math.max(canvasWidth, canvasHeight);
      const pw = Math.max(1, Math.round(canvasWidth * previewScale));
      const ph = Math.max(1, Math.round(canvasHeight * previewScale));
      previewBytes = await this._rasterizeSvgToJpeg(previewSvg, pw, ph, background, 0.85);
    }

    // Raster the artwork when the user chose it (default for very complex
    // artwork) or when it uses masks/filters, which svg2pdf.js cannot render.
    // Text outlines and the legend stay vector in every case. The raster is
    // handed to jsPDF as raw JPEG bytes and NEVER goes through svg2pdf: its
    // data-URL handling runs a regex over the whole string, which overflows
    // the call stack on print-resolution images.
    let rasterBytes: Uint8Array | null = null;
    if (wantRaster || forcedRaster) {
      rasterBytes = await this._rasterizeArtwork(clone, layout, canvasWidth, canvasHeight, background);
      notices.push(
        forcedRaster && !wantRaster
          ? 'Artwork uses a mask or filter — it was embedded as a 300 DPI raster image; the legend stays vector.'
          : 'Artwork embedded as a print-resolution raster image; the legend stays vector.',
      );
    }

    // Cover sheet SVG — built after optimization so the manifest can report
    // the actual reduction, then outlined under the same zero-font guarantee.
    let coverSvg: SVGSVGElement | null = null;
    let coverPreviewRect: { x: number; y: number; w: number; h: number } | null = null;
    if (coverEnabled) {
      const manifestInput = {
        ...coverManifestBase,
        layout,
        artworkVector: !wantRaster && !forcedRaster,
        detail,
        reduction,
      };
      const built = this._buildCoverSvg({
        page: cover,
        title: coverTitle,
        description: coverDescription,
        creator: coverManifestBase.creator,
        date: coverManifestBase.date,
        entries: coverManifestEntries(manifestInput),
        technicalLine: coverTechnicalLine(manifestInput),
        notes: coverNotes(manifestInput.artworkVector),
        artworkAspect: canvasWidth / canvasHeight,
      });
      coverSvg = built.svg;
      coverPreviewRect = built.previewRect;
      await outlineSvgText(coverSvg);
      if (coverSvg.querySelector('text')) {
        throw new Error(
          'Some text could not be converted to outlines (font download failed), so the PDF was not generated — it would not print with the correct fonts. Check your connection and try again.',
        );
      }
    }

    downloadBtn.textContent = 'Rendering PDF...';

    // Variable specifier + @vite-ignore: the vendor bundle only exists in the
    // build output, so static import analysis must not try to resolve it.
    const vendorPath = '../vendor/pdf-export.js';
    const { jsPDF, svg2pdf } = (await import(/* @vite-ignore */ vendorPath)) as {
      jsPDF: new (opts: object) => JsPdfDoc;
      svg2pdf: (el: SVGElement, doc: JsPdfDoc, opts: object) => Promise<unknown>;
    };

    // jsPDF normalizes `format` to the given orientation (portrait puts the
    // smaller side first) — pass the real orientation so wide pages stay wide.
    // floatPrecision 5 = 0.00001 pt resolution — kills the 17-digit float
    // artifacts svg2pdf otherwise writes verbatim ('smart' would keep full
    // precision for sub-1 values, defeating the point).
    // With the cover enabled, page 1 takes the cover format and the artwork
    // page is added after; each jsPDF page carries its own MediaBox.
    const artworkOrientation: 'landscape' | 'portrait' = layout.pageW >= layout.pageH ? 'landscape' : 'portrait';
    // eslint-disable-next-line new-cap -- jsPDF's exported constructor name
    const doc = new jsPDF({
      orientation: coverEnabled ? 'portrait' : artworkOrientation,
      unit: 'pt',
      format: coverEnabled ? [cover.w, cover.h] : [layout.pageW, layout.pageH],
      compress: true,
      floatPrecision: 5,
    });

    if (coverEnabled && coverSvg && coverPreviewRect) {
      const coverHolder = document.createElement('div');
      coverHolder.style.cssText = 'position:fixed;left:-99999px;top:0;opacity:0;pointer-events:none;';
      coverHolder.appendChild(coverSvg);
      document.body.appendChild(coverHolder);
      try {
        normalizeSvgPaintColors(coverSvg);
        await svg2pdf(coverSvg, doc, { x: 0, y: 0, width: cover.w, height: cover.h });
      } finally {
        coverHolder.remove();
      }
      if (previewBytes) {
        doc.addImage(
          previewBytes,
          'JPEG',
          coverPreviewRect.x + 2,
          coverPreviewRect.y + 2,
          coverPreviewRect.w - 4,
          coverPreviewRect.h - 4,
        );
      }
      doc.addPage([layout.pageW, layout.pageH], artworkOrientation);
      notices.push('Cover sheet added as page 1 — print or send page 2 only.');
    }

    // Background fills to the bleed edge so trimmed posters are edge-to-edge.
    // resolveCssColorToHex handles oklch()/lab()/var-free modern colors too.
    const bgHex = resolveCssColorToHex(background);
    if (bgHex) {
      doc.setFillColor(bgHex);
      doc.rect(layout.bleed.x, layout.bleed.y, layout.bleed.w, layout.bleed.h, 'F');
    }

    // Rasterized artwork goes straight into the page as JPEG bytes; the clone
    // now carries only the legend, which svg2pdf draws as vector on top.
    if (rasterBytes) {
      doc.addImage(rasterBytes, 'JPEG', layout.content.x, layout.content.y, layout.content.w, layout.content.h);
    }

    // svg2pdf reads computed styles; the clone must be attached to a document.
    // Color normalization also runs attached so var(...) paints can resolve.
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;opacity:0;pointer-events:none;';
    holder.appendChild(clone);
    document.body.appendChild(holder);
    try {
      // svg2pdf can't parse oklch()/lab()/color() paints (they'd fall back to
      // black) — rewrite every paint to sRGB hex first.
      normalizeSvgPaintColors(clone);
      await svg2pdf(clone, doc, {
        x: layout.content.x,
        y: layout.content.y,
        width: layout.content.w,
        height: layout.content.h,
      });
    } finally {
      holder.remove();
    }

    if (layout.cropMarks.length > 0) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(CROP_MARK_WIDTH_PT);
      for (const m of layout.cropMarks) {
        doc.line(m.x1, m.y1, m.x2, m.y2);
      }
    }

    if (notices.length > 0) this._setExportStatus(notices.join(' '));

    return doc.output('blob');
  }

  /**
   * Rasterize the artwork (everything except the legend) to print-resolution
   * JPEG bytes and strip it from the clone, leaving only the legend for the
   * vector pass. Returns the image for direct embedding via jsPDF addImage —
   * as raw bytes, never a data URL (multi-MB data-URL strings overflow the
   * regex stack in both svg2pdf's and jsPDF's string-based image paths), and
   * as flattened JPEG rather than PNG (jsPDF's RGBA-PNG path decodes and
   * splits channels in JS, which is prohibitive at print resolution).
   */
  async _rasterizeArtwork(
    clone: SVGSVGElement,
    layout: PdfLayout,
    canvasWidth: number,
    canvasHeight: number,
    background: string | undefined,
  ): Promise<Uint8Array> {
    const ns = 'http://www.w3.org/2000/svg';
    const legend = clone.querySelector('#pathogen-legend');
    const watermark = clone.querySelector('#pathogen-watermark');

    const artOnly = clone.cloneNode(true) as SVGSVGElement;
    artOnly.querySelector('#pathogen-legend')?.remove();
    artOnly.querySelector('#pathogen-watermark')?.remove();
    artOnly.setAttribute('xmlns', ns);
    artOnly.setAttribute('width', String(canvasWidth));
    artOnly.setAttribute('height', String(canvasHeight));

    let pxW = Math.ceil((layout.content.w / PT_PER_IN) * RASTER_DPI);
    let pxH = Math.ceil((layout.content.h / PT_PER_IN) * RASTER_DPI);
    const cap = Math.min(1, RASTER_MAX_SIDE_PX / Math.max(pxW, pxH));
    pxW = Math.max(1, Math.round(pxW * cap));
    pxH = Math.max(1, Math.round(pxH * cap));

    const bytes = await this._rasterizeSvgToJpeg(artOnly, pxW, pxH, background);

    // Only the legend/watermark overlays remain for the vector pass — the
    // brand line stays crisp vector even when the artwork is a raster.
    while (clone.firstChild) clone.removeChild(clone.firstChild);
    if (legend) clone.appendChild(legend);
    if (watermark) clone.appendChild(watermark);

    return bytes;
  }

  /** Serialize an SVG element and rasterize it to an image Blob. */
  async _rasterizeSvg(
    svg: SVGSVGElement,
    pxW: number,
    pxH: number,
    opts: { type: 'image/jpeg' | 'image/png'; quality?: number; background?: string },
  ): Promise<Blob> {
    const svgString = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Artwork rasterization failed'));
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = pxW;
      canvas.height = pxH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not rasterize the artwork — a canvas drawing context was unavailable');
      if (opts.type === 'image/jpeg') {
        // Flatten onto the page background (white paper fallback) — JPEG has
        // no alpha, and the artwork sits on the printed page anyway. PNG
        // keeps the canvas transparent; any background rect is in the SVG.
        ctx.fillStyle = resolveCssColorToHex(opts.background) ?? '#ffffff';
        ctx.fillRect(0, 0, pxW, pxH);
      }
      ctx.drawImage(img, 0, 0, pxW, pxH);

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Artwork rasterization produced no image'))),
          opts.type,
          opts.quality,
        );
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Rasterize to flattened JPEG bytes (PDF pipeline: raw bytes, never data URLs). */
  async _rasterizeSvgToJpeg(
    svg: SVGSVGElement,
    pxW: number,
    pxH: number,
    background: string | undefined,
    quality = 0.95,
  ): Promise<Uint8Array> {
    const blob = await this._rasterizeSvg(svg, pxW, pxH, { type: 'image/jpeg', quality, background });
    return new Uint8Array(await blob.arrayBuffer());
  }

  /**
   * Build the page-1 cover sheet as a detached SVG in pt coordinates
   * (approved layout: title/meta/description, framed preview area, manifest
   * rows, technical line, notes, Baumans footer). The preview JPEG is NOT in
   * the SVG — the caller draws it via doc.addImage into `previewRect`.
   */
  _buildCoverSvg(opts: {
    page: CoverPageSize;
    title: string;
    description: string;
    creator: string;
    date: string;
    entries: CoverManifestEntry[];
    technicalLine: string;
    notes: string[];
    artworkAspect: number;
  }): { svg: SVGSVGElement; previewRect: { x: number; y: number; w: number; h: number } } {
    const ns = 'http://www.w3.org/2000/svg';
    const { page } = opts;
    const M = 54;
    const contentW = page.w - 2 * M;

    // The cover is a FIXED-size page (unlike the auto-sizing legend box), so
    // every text field needs a width bound or long input silently clips at
    // the page edge. Char budgets use the same width heuristic as _wrapText.
    const fitChars = (widthPt: number, fontSize: number): number =>
      Math.max(8, Math.floor(widthPt / (fontSize * this.CHAR_WIDTH_FACTOR)));
    const fitLine = (text: string, maxChars: number): string =>
      text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
    // _wrapText breaks on word boundaries only — hard-split any single token
    // longer than a line (URLs, hyphenated runs) before wrapping.
    const breakLongWords = (text: string, maxChars: number): string =>
      text
        .split(/\s+/)
        .map((w) => (w.length > maxChars ? (w.match(new RegExp(`.{1,${maxChars}}`, 'g')) ?? [w]).join(' ') : w))
        .join(' ');

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('xmlns', ns);
    svg.setAttribute('viewBox', `0 0 ${page.w} ${page.h}`);

    const paper = document.createElementNS(ns, 'rect');
    paper.setAttribute('width', String(page.w));
    paper.setAttribute('height', String(page.h));
    paper.setAttribute('fill', '#ffffff');
    svg.appendChild(paper);

    let y = M;

    // Title (single line, truncated to the actual content width — ~35 chars
    // on Letter, ~33 on A4 at 24pt; a hardcoded count would overflow A4)
    const title = fitLine(opts.title || 'Untitled', fitChars(contentW, 24));
    svg.appendChild(this._createText(title, M, y, { fontSize: 24, fontWeight: '600', color: '#111827' }));
    y += 34;

    // Meta: creator · date (single line, truncated to the content width)
    const meta = [opts.creator.trim(), opts.date.trim()].filter((s) => s.length > 0).join(' · ');
    if (meta) {
      svg.appendChild(
        this._createText(fitLine(meta, fitChars(contentW, 10)), M, y, { fontSize: 10, color: '#64748b' }),
      );
      y += 18;
    }

    // Description (max 3 wrapped lines; overlong tokens hard-broken)
    if (opts.description.trim()) {
      const charsPerLine = fitChars(contentW, 11);
      let lines = this._wrapText(breakLongWords(opts.description.trim(), charsPerLine), charsPerLine);
      if (lines.length > 3) {
        lines = lines.slice(0, 3);
        lines[2] = `${lines[2].replace(/\s*\S*$/, '')}…`;
      }
      for (const line of lines) {
        svg.appendChild(this._createText(line, M, y, { fontSize: 11, color: '#475569' }));
        y += 15;
      }
    }
    y += 14;

    // Divider
    const divider = document.createElementNS(ns, 'line');
    divider.setAttribute('x1', String(M));
    divider.setAttribute('y1', String(y));
    divider.setAttribute('x2', String(M + contentW));
    divider.setAttribute('y2', String(y));
    divider.setAttribute('stroke', '#e2e8f0');
    divider.setAttribute('stroke-width', '1');
    svg.appendChild(divider);
    y += 12;

    // Preview frame — artwork aspect-fitted and centered in a fixed-height box
    const previewBox = { x: M, y, w: contentW, h: 290 };
    const previewRect = previewFitRect(opts.artworkAspect, 1, previewBox);
    const frame = document.createElementNS(ns, 'rect');
    frame.setAttribute('x', String(previewRect.x));
    frame.setAttribute('y', String(previewRect.y));
    frame.setAttribute('width', String(previewRect.w));
    frame.setAttribute('height', String(previewRect.h));
    frame.setAttribute('fill', '#f8fafc');
    frame.setAttribute('stroke', '#e2e8f0');
    frame.setAttribute('stroke-width', '1');
    svg.appendChild(frame);
    y += previewBox.h + 22;

    // Manifest rows (values truncated to the value column's width)
    const valueChars = fitChars(page.w - M - (M + 146), 10.5);
    for (const entry of opts.entries) {
      svg.appendChild(
        this._createText(entry.label.toUpperCase(), M, y, { fontSize: 8.5, fontWeight: '600', color: '#94a3b8' }),
      );
      svg.appendChild(
        this._createText(fitLine(entry.value, valueChars), M + 146, y, { fontSize: 10.5, color: '#111827' }),
      );
      y += 17;
    }
    y += 14;

    // Technical line
    svg.appendChild(
      this._createText(fitLine(opts.technicalLine, fitChars(contentW, 9.5)), M, y, { fontSize: 9.5, color: '#64748b' }),
    );
    y += 18;

    // Notes (bullet + wrapped lines)
    const noteChars = fitChars(contentW - 10, 9.5);
    for (const note of opts.notes) {
      const bullet = document.createElementNS(ns, 'circle');
      bullet.setAttribute('cx', String(M + 2.5));
      bullet.setAttribute('cy', String(y + 4.5));
      bullet.setAttribute('r', '2.5');
      bullet.setAttribute('fill', '#94a3b8');
      svg.appendChild(bullet);
      const lines = this._wrapText(note, noteChars);
      for (const line of lines) {
        svg.appendChild(this._createText(line, M + 10, y, { fontSize: 9.5, color: '#475569' }));
        y += 13;
      }
      y += 8;
    }

    // Footer — same brand pattern as the legend
    const footer = document.createElementNS(ns, 'text');
    footer.setAttribute('x', String(M));
    footer.setAttribute('y', String(page.h - 40));
    footer.setAttribute('dominant-baseline', 'auto');
    footer.setAttribute('fill', '#94a3b8');
    const created = document.createElementNS(ns, 'tspan');
    created.setAttribute('font-size', '8');
    created.setAttribute('font-family', "'Inter', -apple-system, BlinkMacSystemFont, sans-serif");
    created.textContent = 'Created in';
    const brand = document.createElementNS(ns, 'tspan');
    brand.setAttribute('font-size', '12');
    brand.setAttribute('font-weight', '400');
    brand.setAttribute('font-family', "'Baumans', cursive");
    brand.setAttribute('dx', '4');
    brand.textContent = 'pathogen.studio';
    footer.appendChild(created);
    footer.appendChild(brand);
    svg.appendChild(footer);

    return { svg, previewRect };
  }

  // --- PDF settings state + UI sync ---

  get _artworkRatio(): number {
    return this._canvasWidth / this._canvasHeight;
  }

  /** True when the artwork is heavy enough that vector PDF viewers struggle. */
  _isArtworkComplex(svg: SVGSVGElement): boolean {
    const geometry = svg.querySelectorAll('path, circle, ellipse, rect, polygon, polyline, line');
    if (geometry.length > COMPLEXITY_NODE_COUNT) return true;
    let dLength = 0;
    for (const p of Array.from(svg.querySelectorAll('path'))) {
      dLength += p.getAttribute('d')?.length ?? 0;
      if (dLength > COMPLEXITY_D_LENGTH) return true;
    }
    return false;
  }

  _layoutInput(): PdfLayoutInput {
    const s = this._exportSettings;
    const mode = s.sizing === 'match' ? 'match' : s.sizing === 'custom' ? 'custom' : 'preset';
    return {
      mode,
      presetId: mode === 'preset' ? s.sizing : undefined,
      orientation: s.orientation,
      width: mode === 'match' ? s.artW : s.pageW,
      height: mode === 'match' ? s.artH : s.pageH,
      unit: s.unit,
      margin: s.margin,
      printPrep: s.printPrep,
      svgWidth: this._canvasWidth,
      svgHeight: this._canvasHeight,
    };
  }

  _setExportStatus(message: string, isError = false): void {
    const status = this.shadowRoot!.querySelector('.export-status');
    if (status) {
      status.textContent = message;
      status.classList.toggle('error', isError && message.length > 0);
    }
  }

  /** Sync every export control (visibility, values, unit suffixes) from _exportSettings. */
  _updatePdfUi(): void {
    const root = this.shadowRoot!;
    const s = this._exportSettings;

    root.querySelectorAll('.format-toggle button').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.format === s.format);
    });
    (root.querySelector('.pdf-settings') as HTMLElement).hidden = s.format !== 'pdf';
    (root.querySelector('.png-settings') as HTMLElement).hidden = s.format !== 'png';
    const downloadBtn = root.querySelector('.download-btn') as HTMLButtonElement;
    downloadBtn.innerHTML = `Download ${s.format.toUpperCase()} &#x2193;`;

    // Legend on/off: the fields, the switch, and the snap controls (which
    // only matter while a legend can be dragged).
    (root.querySelector('.legend-settings') as HTMLElement).hidden = !s.includeLegend;
    const legendSwitch = root.querySelector('#include-legend') as HTMLButtonElement;
    legendSwitch.classList.toggle('active', s.includeLegend);
    legendSwitch.setAttribute('aria-checked', String(s.includeLegend));
    (root.querySelector('.snap-group') as HTMLElement).hidden = !s.includeLegend;
    (root.querySelector('#legend-highlight') as HTMLInputElement).checked = s.highlightCode;

    // PNG controls
    (root.querySelector('#png-scale') as HTMLSelectElement).value = String(s.pngScale);
    (root.querySelector('#png-width-row') as HTMLElement).hidden = s.pngScale !== 'custom';
    (root.querySelector('#png-width') as HTMLInputElement).value = String(s.pngCustomWidth);
    (root.querySelector('#png-transparent') as HTMLInputElement).checked = s.pngTransparent;
    this._updatePngSummary();

    (root.querySelector('#pdf-page-size') as HTMLSelectElement).value = s.sizing;
    (root.querySelector('#pdf-unit') as HTMLSelectElement).value = s.unit;

    const isPreset = s.sizing !== 'match' && s.sizing !== 'custom';
    (root.querySelector('#pdf-orient-row') as HTMLElement).hidden = !isPreset;
    (root.querySelector('#pdf-artwork-row') as HTMLElement).hidden = s.sizing !== 'match';
    (root.querySelector('#pdf-custom-row') as HTMLElement).hidden = s.sizing !== 'custom';

    root.querySelectorAll('.orient-toggle:not(.artwork-toggle) button').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.orient === s.orientation);
    });
    root.querySelectorAll('.artwork-toggle button').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.artwork === s.artworkMode);
    });
    const vectorMode = s.artworkMode === 'vector';
    (root.querySelector('#pdf-detail-row') as HTMLElement).hidden = !vectorMode;
    (root.querySelector('#pdf-detail-note') as HTMLElement).hidden = !vectorMode;
    (root.querySelector('#pdf-detail') as HTMLSelectElement).value = s.detail;
    (root.querySelector('#pdf-cover-sheet') as HTMLInputElement).checked = s.coverSheet;
    (root.querySelector('#export-precision') as HTMLSelectElement).value =
      s.exportPrecision == null ? 'match' : String(s.exportPrecision);

    (root.querySelector('#pdf-art-w') as HTMLInputElement).value = String(s.artW);
    (root.querySelector('#pdf-art-h') as HTMLInputElement).value = String(s.artH);
    (root.querySelector('#pdf-page-w') as HTMLInputElement).value = String(s.pageW);
    (root.querySelector('#pdf-page-h') as HTMLInputElement).value = String(s.pageH);
    (root.querySelector('#pdf-margin') as HTMLInputElement).value = String(s.margin);
    (root.querySelector('#pdf-custom-lock') as HTMLElement).classList.toggle('locked', s.ratioLocked);

    root.querySelectorAll('.unit-suffix').forEach((el) => {
      el.textContent = s.unit;
    });

    this._updatePdfSummary();
  }

  _updatePngSummary(): void {
    const summary = this.shadowRoot!.querySelector('#png-summary');
    if (!summary) return;
    if (this._exportSettings.format !== 'png') return;
    try {
      const { w, h } = this._pngDims();
      summary.textContent = `Artwork ${this._canvasWidth} × ${this._canvasHeight} units — exports at ${w.toLocaleString()} × ${h.toLocaleString()} px.`;
      summary.classList.remove('error');
    } catch (err: unknown) {
      summary.textContent = (err as Error).message;
      summary.classList.add('error');
    }
  }

  _updatePdfSummary(): void {
    const summary = this.shadowRoot!.querySelector('#pdf-summary');
    if (!summary) return;
    const s = this._exportSettings;
    if (s.format !== 'pdf') return;

    const ptPerUnit = s.unit === 'in' ? PT_PER_IN : PT_PER_CM;
    let text: string;
    try {
      const layout = computePdfLayout(this._layoutInput());
      const contentW = round2(layout.content.w / ptPerUnit);
      const contentH = round2(layout.content.h / ptPerUnit);
      const trimW = round2(layout.trim.w / ptPerUnit);
      const trimH = round2(layout.trim.h / ptPerUnit);
      if (s.sizing === 'match') {
        text = `Artwork ${this._canvasWidth} × ${this._canvasHeight} units prints at ${contentW} × ${contentH} ${s.unit} — page ${trimW} × ${trimH} ${s.unit} with margins.`;
      } else {
        text = `Page ${trimW} × ${trimH} ${s.unit} — artwork scales to ${contentW} × ${contentH} ${s.unit}, centered.`;
      }
      summary.classList.remove('error');
    } catch (err: unknown) {
      text = (err as Error).message;
      summary.classList.add('error');
    }
    summary.textContent = text;
  }

  // --- Event handling ---

  _setupEventListeners(): void {
    const root = this.shadowRoot!;

    // Close button
    root.querySelector('.close-btn')!.addEventListener('click', () => this.close());

    // Cancel button
    root.querySelector('.cancel-btn')!.addEventListener('click', () => this.close());

    // Download
    root.querySelector('.download-btn')!.addEventListener('click', async () => this._download());

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

    // Format + PDF print settings
    this._setupPdfListeners();

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
        this._zoom = window.PathogenPanZoom.clampZoom(this._zoom * (1 + delta), {
          minZoom: this.MIN_ZOOM,
          maxZoom: this.MAX_ZOOM,
        });
        this._adjustPanForZoom(oldZoom, this._zoom);
        this._updateViewBox();
        this._updateZoomDisplay();
      },
      { passive: false },
    );
  }

  _setupPdfListeners(): void {
    const root = this.shadowRoot!;
    const s = this._exportSettings;

    root.querySelectorAll('.format-toggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        s.format = (btn as HTMLElement).dataset.format as 'svg' | 'png' | 'pdf';
        this._setExportStatus('');
        this._updatePdfUi();
      });
    });

    // Include legend: swap the preview overlay and reveal/hide the fields.
    (root.querySelector('#include-legend') as HTMLButtonElement).addEventListener('click', () => {
      s.includeLegend = !s.includeLegend;
      this._applyIncludeLegend();
      this._updatePdfUi();
    });

    (root.querySelector('#legend-highlight') as HTMLInputElement).addEventListener('change', (e: Event) => {
      s.highlightCode = (e.target as HTMLInputElement).checked;
      this._updateLegendFromForm();
    });

    // PNG settings
    (root.querySelector('#png-scale') as HTMLSelectElement).addEventListener('change', (e: Event) => {
      const value = (e.target as HTMLSelectElement).value;
      s.pngScale = value === 'custom' ? 'custom' : Number(value);
      this._updatePdfUi();
    });

    (root.querySelector('#png-width') as HTMLInputElement).addEventListener('input', (e: Event) => {
      const v = parseInt((e.target as HTMLInputElement).value, 10);
      if (Number.isFinite(v) && v > 0) s.pngCustomWidth = v;
      this._updatePngSummary();
    });

    (root.querySelector('#png-transparent') as HTMLInputElement).addEventListener('change', (e: Event) => {
      s.pngTransparent = (e.target as HTMLInputElement).checked;
    });

    (root.querySelector('#pdf-page-size') as HTMLSelectElement).addEventListener('change', (e: Event) => {
      s.sizing = (e.target as HTMLSelectElement).value;
      if (s.sizing === 'custom' && s.ratioLocked) {
        s.pageH = round2(s.pageW / this._artworkRatio);
      }
      this._updatePdfUi();
    });

    (root.querySelector('#pdf-unit') as HTMLSelectElement).addEventListener('change', (e: Event) => {
      const next = (e.target as HTMLSelectElement).value as Unit;
      if (next === s.unit) return;
      s.artW = round2(convertUnit(s.artW, s.unit, next));
      s.artH = round2(convertUnit(s.artH, s.unit, next));
      s.pageW = round2(convertUnit(s.pageW, s.unit, next));
      s.pageH = round2(convertUnit(s.pageH, s.unit, next));
      s.margin = round2(convertUnit(s.margin, s.unit, next));
      s.unit = next;
      this._updatePdfUi();
    });

    root.querySelectorAll('.orient-toggle:not(.artwork-toggle) button').forEach((btn) => {
      btn.addEventListener('click', () => {
        s.orientation = (btn as HTMLElement).dataset.orient as 'portrait' | 'landscape';
        this._updatePdfUi();
      });
    });

    // Match-artwork size: ratio is always locked — editing one dim recomputes the other.
    const artW = root.querySelector('#pdf-art-w') as HTMLInputElement;
    const artH = root.querySelector('#pdf-art-h') as HTMLInputElement;
    artW.addEventListener('input', () => {
      const v = parseFloat(artW.value);
      if (v > 0) {
        s.artW = v;
        s.artH = round2(v / this._artworkRatio);
        artH.value = String(s.artH);
      }
      this._updatePdfSummary();
    });
    artH.addEventListener('input', () => {
      const v = parseFloat(artH.value);
      if (v > 0) {
        s.artH = v;
        s.artW = round2(v * this._artworkRatio);
        artW.value = String(s.artW);
      }
      this._updatePdfSummary();
    });

    // Custom page size: aspect lock is toggleable.
    const pageW = root.querySelector('#pdf-page-w') as HTMLInputElement;
    const pageH = root.querySelector('#pdf-page-h') as HTMLInputElement;
    const customLock = root.querySelector('#pdf-custom-lock') as HTMLButtonElement;
    customLock.addEventListener('click', () => {
      s.ratioLocked = !s.ratioLocked;
      customLock.classList.toggle('locked', s.ratioLocked);
      customLock.setAttribute('aria-checked', String(s.ratioLocked));
      if (s.ratioLocked) {
        s.pageH = round2(s.pageW / this._artworkRatio);
        pageH.value = String(s.pageH);
      }
      this._updatePdfSummary();
    });
    pageW.addEventListener('input', () => {
      const v = parseFloat(pageW.value);
      if (v > 0) {
        s.pageW = v;
        if (s.ratioLocked) {
          s.pageH = round2(v / this._artworkRatio);
          pageH.value = String(s.pageH);
        }
      }
      this._updatePdfSummary();
    });
    pageH.addEventListener('input', () => {
      const v = parseFloat(pageH.value);
      if (v > 0) {
        s.pageH = v;
        if (s.ratioLocked) {
          s.pageW = round2(v * this._artworkRatio);
          pageW.value = String(s.pageW);
        }
      }
      this._updatePdfSummary();
    });

    (root.querySelector('#pdf-margin') as HTMLInputElement).addEventListener('input', (e: Event) => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      // Ignore invalid/partial input, keeping the previous margin (same as the size fields).
      if (Number.isFinite(v) && v >= 0) s.margin = v;
      this._updatePdfSummary();
    });

    (root.querySelector('#pdf-print-prep') as HTMLInputElement).addEventListener('change', (e: Event) => {
      s.printPrep = (e.target as HTMLInputElement).checked;
      this._updatePdfSummary();
    });

    root.querySelectorAll('.artwork-toggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        s.artworkMode = (btn as HTMLElement).dataset.artwork as 'vector' | 'raster';
        this._updatePdfUi();
      });
    });

    (root.querySelector('#export-precision') as HTMLSelectElement).addEventListener('change', (e: Event) => {
      const value = (e.target as HTMLSelectElement).value;
      s.exportPrecision = value === 'match' ? null : parseInt(value, 10);
    });

    (root.querySelector('#pdf-detail') as HTMLSelectElement).addEventListener('change', (e: Event) => {
      s.detail = (e.target as HTMLSelectElement).value as 'full' | 'fine' | 'standard';
    });

    (root.querySelector('#pdf-cover-sheet') as HTMLInputElement).addEventListener('change', (e: Event) => {
      s.coverSheet = (e.target as HTMLInputElement).checked;
    });
  }

  _addDocumentListeners(): void {
    // Re-entrancy guard: open() can fire while the modal is already open
    // (Ctrl+Shift+E pressed twice). Overwriting the handler fields without
    // removing the old listeners would orphan them on `document` forever —
    // and the arrow-key nudge handler is relative, so duplicates compound.
    this._removeDocumentListeners();
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
      if (dir && this._svg && this._exportSettings.includeLegend) {
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

      <div class="content">
        <div class="form-panel">
          <div class="form-header">
            <h2>Export</h2>
            <button class="close-btn" title="Close">&times;</button>
          </div>
          <div class="form-scroll">
          <div class="form-group">
            <label id="format-label">Format</label>
            <div class="format-toggle" role="group" aria-labelledby="format-label">
              <button type="button" class="active" data-format="svg">SVG<span class="fmt-sub">vector file</span></button>
              <button type="button" data-format="png">PNG<span class="fmt-sub">image</span></button>
              <button type="button" data-format="pdf">PDF<span class="fmt-sub">print-ready</span></button>
            </div>
          </div>
          <div class="png-settings" hidden>
            <div class="pdf-row">
              <label for="png-scale">Scale</label>
              <select id="png-scale">
                <option value="1">1&times; &mdash; artwork size</option>
                <option value="2" selected>2&times;</option>
                <option value="4">4&times;</option>
                <option value="custom">Custom width&hellip;</option>
              </select>
            </div>
            <div class="pdf-row" id="png-width-row" hidden>
              <label for="png-width">Width</label>
              <span class="unit-input"><input type="number" id="png-width" min="1" step="1"><span class="px-suffix">px</span></span>
            </div>
            <p class="size-summary" id="png-summary"></p>
            <div class="pdf-row check-row">
              <input type="checkbox" id="png-transparent">
              <label for="png-transparent">Transparent background</label>
            </div>
            <p class="pdf-note">Omits the workspace background color &mdash; for compositing over other designs.</p>
          </div>
          <div class="legend-toggle-row">
            <label for="include-legend">Include legend</label>
            <button type="button" class="switch" id="include-legend" role="switch" aria-checked="false"></button>
          </div>
          <p class="row-note">Adds a title card with your name, notes, and source code. Without it, a small <em>Created in pathogen.studio</em> line marks the corner of the artwork.</p>
          <div class="legend-settings" hidden>
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
          <div class="pdf-row check-row">
            <input type="checkbox" id="legend-highlight" checked>
            <label for="legend-highlight">Syntax highlighting</label>
          </div>
          <p class="row-note">Colors the source listing with Pathogen&rsquo;s print palette &mdash; baked into the file, so it survives PDF outlining and PNG rendering.</p>
          <div class="form-group">
            <label for="legend-code">Source Code</label>
            <textarea id="legend-code" rows="6" class="code-input" readonly></textarea>
          </div>
          </div>
          <div class="pdf-settings" hidden>
            <div class="pdf-row">
              <label for="pdf-page-size">Page size</label>
              <select id="pdf-page-size" class="page-size-select">
                <option value="match">Match artwork &mdash; exact print size</option>
                <optgroup label="US">
                  ${PAGE_PRESETS.filter((p) => p.unit === 'in')
                    .map((p) => `<option value="${p.id}">${p.label}</option>`)
                    .join('')}
                </optgroup>
                <optgroup label="ISO">
                  ${PAGE_PRESETS.filter((p) => p.unit === 'mm')
                    .map((p) => `<option value="${p.id}">${p.label}</option>`)
                    .join('')}
                </optgroup>
                <option value="custom">Custom page&hellip;</option>
              </select>
            </div>
            <div class="pdf-row">
              <label for="pdf-unit">Units</label>
              <select id="pdf-unit" class="unit-select-wide">
                <option value="in">inches</option>
                <option value="cm">centimeters</option>
              </select>
            </div>
            <div class="pdf-row" id="pdf-orient-row" hidden>
              <label id="orient-label">Orientation</label>
              <div class="orient-toggle" role="group" aria-labelledby="orient-label">
                <button type="button" class="active" data-orient="portrait"><span class="page-icon portrait"></span>Portrait</button>
                <button type="button" data-orient="landscape"><span class="page-icon landscape"></span>Landscape</button>
              </div>
            </div>
            <div class="pdf-row size-row" id="pdf-artwork-row">
              <label id="artwork-size-label">Artwork size</label>
              <div class="size-grid">
                <span class="unit-input"><span class="dim-prefix">w</span><input type="number" id="pdf-art-w" min="0" step="0.25" aria-labelledby="artwork-size-label" aria-label="Width"><span class="unit-suffix">in</span></span>
                <button type="button" class="aspect-lock locked" id="pdf-art-lock" disabled title="Aspect ratio locked to the artwork's viewBox">${ASPECT_LOCK_ICONS}</button>
                <span class="unit-input"><span class="dim-prefix">h</span><input type="number" id="pdf-art-h" min="0" step="0.25" aria-labelledby="artwork-size-label" aria-label="Height"><span class="unit-suffix">in</span></span>
              </div>
            </div>
            <div class="pdf-row size-row" id="pdf-custom-row" hidden>
              <label id="custom-size-label">Page size</label>
              <div class="size-grid">
                <span class="unit-input"><span class="dim-prefix">w</span><input type="number" id="pdf-page-w" min="0" step="0.25" aria-labelledby="custom-size-label" aria-label="Width"><span class="unit-suffix">in</span></span>
                <button type="button" class="aspect-lock locked" id="pdf-custom-lock" role="switch" aria-checked="true" title="Keep the artwork's aspect ratio">${ASPECT_LOCK_ICONS}</button>
                <span class="unit-input"><span class="dim-prefix">h</span><input type="number" id="pdf-page-h" min="0" step="0.25" aria-labelledby="custom-size-label" aria-label="Height"><span class="unit-suffix">in</span></span>
              </div>
            </div>
            <div class="pdf-row">
              <label for="pdf-margin">Margins</label>
              <span class="unit-input"><input type="number" id="pdf-margin" min="0" step="0.125"><span class="unit-suffix">in</span></span>
            </div>
            <p class="size-summary" id="pdf-summary"></p>
            <div class="pdf-row check-row">
              <input type="checkbox" id="pdf-print-prep" checked>
              <label for="pdf-print-prep">Bleed + crop marks (0.125&Prime; / 3&nbsp;mm)</label>
            </div>
            <div class="pdf-row">
              <label id="artwork-mode-label">Artwork</label>
              <div class="orient-toggle artwork-toggle" role="group" aria-labelledby="artwork-mode-label">
                <button type="button" data-artwork="vector" title="Exact vector geometry — best for simple artwork">Vector</button>
                <button type="button" data-artwork="raster" title="Print-resolution image — very complex artwork previews and prints reliably">Raster</button>
              </div>
            </div>
            <div class="pdf-row" id="pdf-detail-row">
              <label for="pdf-detail">Detail</label>
              <select id="pdf-detail" class="detail-select">
                <option value="full">Full &mdash; every segment</option>
                <option value="fine">Fine &mdash; below &frac12; printed dot</option>
                <option value="standard">Standard &mdash; below 1 printed dot</option>
              </select>
            </div>
            <p class="row-note" id="pdf-detail-note">Removes segments smaller than a printed dot (300 DPI) at your chosen print size. Complex artwork defaults to Standard.</p>
            <div class="pdf-row check-row">
              <input type="checkbox" id="pdf-cover-sheet">
              <label for="pdf-cover-sheet">Cover sheet &mdash; preview + print specs</label>
            </div>
            <p class="row-note">Adds a letter/A4 job-ticket page with a fast preview &mdash; page 2 is the artwork. Turn off for automated upload portals that require single-page files.</p>
            <p class="pdf-note">Text is converted to vector outlines &mdash; fonts print exactly as shown, at any print shop.</p>
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
              <div class="advanced-row">
                <label for="export-precision">Precision</label>
                <select id="export-precision">
                  <option value="match" selected>Match workspace</option>
                  <option value="0">0 decimals</option>
                  <option value="1">1 decimal</option>
                  <option value="2">2 decimals</option>
                  <option value="3">3 decimals</option>
                  <option value="4">4 decimals</option>
                </select>
              </div>
              <p class="row-note">Trims coordinate decimals in this export only &mdash; smaller files, unchanged appearance. Never adds precision beyond the workspace setting.</p>
            </div>
          </details>
          <p class="export-status"></p>
          </div>
          <div class="form-actions">
            <button class="btn cancel-btn">Cancel</button>
            <button class="btn primary download-btn">Download &#x2193;</button>
          </div>
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

customElements.define('export-modal', ExportModal);

export default ExportModal;
