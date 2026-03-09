// Export Legend Modal - Full-screen overlay for exporting SVG with an embedded legend
// Opens via custom event, not routed. Component-local state (not persisted in store).

import { store } from '../state/store.js';
import { createSvgSnapshot } from '../utils/svg-snapshot.js';

// Accent color used for legend border and resize handle (matches app theme)
const ACCENT = '#10b981';
const ACCENT_LIGHT = 'rgba(16, 185, 129, 0.35)';

const styles = `
  :host {
    display: none;
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 300);
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  }

  :host(.open) {
    display: flex;
    flex-direction: column;
  }

  /* Backdrop */
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: -1;
  }

  /* Top bar */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    background: var(--bg-secondary, #ffffff);
    border-bottom: 1px solid var(--border-color, #e2e8f0);
    flex-shrink: 0;
  }

  .top-bar h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
  }

  .top-bar-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Buttons */
  .btn {
    padding: 0.5rem 1rem;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-secondary, #ffffff);
    color: var(--text-primary, #1a1a2e);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .btn:hover {
    border-color: var(--accent-color, #10b981);
    color: var(--accent-color, #10b981);
    background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
  }

  .btn.primary {
    background: var(--accent-color, #10b981);
    border-color: var(--accent-color, #10b981);
    color: var(--accent-text, #ffffff);
  }

  .btn.primary:hover {
    background: var(--accent-hover, #059669);
    border-color: var(--accent-hover, #059669);
    color: var(--accent-text, #ffffff);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--border-color, #e2e8f0);
    background: var(--bg-secondary, #ffffff);
    color: var(--text-secondary, #64748b);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 1.125rem;
    line-height: 1;
    padding: 0;
  }

  .close-btn:hover {
    border-color: var(--accent-color, #10b981);
    color: var(--accent-color, #10b981);
    background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
  }

  /* Main content area */
  .content {
    display: flex;
    flex: 1;
    min-height: 0;
    background: var(--bg-primary, #f8f9fa);
  }

  /* Form panel */
  .form-panel {
    width: 320px;
    flex-shrink: 0;
    background: var(--bg-secondary, #ffffff);
    border-right: 1px solid var(--border-color, #e2e8f0);
    padding: 1.25rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-group label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .form-group input,
  .form-group textarea {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-md, 8px);
    font-size: 0.875rem;
    font-family: inherit;
    color: var(--text-primary, #1a1a2e);
    background: var(--bg-primary, #f8f9fa);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    resize: none;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--accent-color, #10b981);
    box-shadow: 0 0 0 3px var(--focus-ring, rgba(16, 185, 129, 0.2));
  }

  .form-group input[readonly],
  .form-group textarea[readonly] {
    opacity: 0.7;
    cursor: default;
  }

  .form-group textarea {
    min-height: 60px;
  }

  .form-group .code-input {
    font-family: var(--font-mono, 'Inconsolata', monospace);
    font-size: 0.75rem;
    resize: vertical;
  }

  .form-spacer {
    flex: 1;
  }

  /* Preview panel */
  .preview-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    position: relative;
  }

  .preview-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 2rem;
    cursor: grab;
  }

  .preview-area.panning {
    cursor: grabbing;
  }

  .preview-area svg {
    display: block;
    max-width: 100%;
    max-height: 100%;
    box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.08));
    border-radius: var(--radius-lg, 12px);
  }

  /* Zoom bar */
  .zoom-bar {
    display: flex;
    align-items: center;
    position: relative;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary, #ffffff);
    border-top: 1px solid var(--border-color, #e2e8f0);
    flex-shrink: 0;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  .zoom-bar button:not(.snap-toggle) {
    width: 32px;
    height: 32px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-md, 8px);
    background: var(--bg-secondary, #ffffff);
    color: var(--text-primary, #1a1a2e);
    cursor: pointer;
    font-size: 0.875rem;
    font-family: inherit;
    transition: all 0.15s ease;
  }

  .zoom-bar button:not(.snap-toggle):hover {
    background: var(--hover-bg, rgba(0, 0, 0, 0.04));
    border-color: var(--accent-color, #10b981);
    color: var(--accent-color, #10b981);
  }

  .zoom-bar .zoom-in,
  .zoom-bar .zoom-out {
    font-size: 1.25rem;
    font-weight: 400;
    line-height: 0;
  }

  .zoom-bar .zoom-level {
    width: 56px;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-md, 8px);
    font-size: 0.75rem;
    font-family: var(--font-mono, 'Inconsolata', monospace);
    font-weight: 500;
    text-align: center;
    background: var(--bg-secondary, #ffffff);
    color: var(--text-primary, #1a1a2e);
  }

  .zoom-bar .zoom-level:focus {
    outline: none;
    border-color: var(--accent-color, #10b981);
    box-shadow: 0 0 0 3px var(--focus-ring, rgba(16, 185, 129, 0.4));
  }

  /* Snap controls in zoom bar */
  .snap-group {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-left: auto;
  }

  .snap-toggle {
    position: relative;
    width: 32px;
    height: 18px;
    border-radius: 9px;
    background: var(--border-color, #cbd5e1);
    border: none;
    cursor: pointer;
    padding: 0;
    transition: background 0.15s ease;
    flex-shrink: 0;
  }

  .snap-toggle::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    transition: transform 0.15s ease;
  }

  .snap-toggle.active {
    background: var(--accent-color, #10b981);
  }

  .snap-toggle.active::after {
    transform: translateX(14px);
  }

  .snap-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary, #64748b);
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
  }

  .snap-group .snap-size {
    width: 48px;
    padding: 0.25rem 0.375rem;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-md, 8px);
    font-size: 0.75rem;
    font-family: var(--font-mono, 'Inconsolata', monospace);
    font-weight: 500;
    text-align: center;
    background: var(--bg-secondary, #ffffff);
    color: var(--text-primary, #1a1a2e);
  }

  .snap-group .snap-size:focus {
    outline: none;
    border-color: var(--accent-color, #10b981);
    box-shadow: 0 0 0 3px var(--focus-ring, rgba(16, 185, 129, 0.2));
  }

  .snap-group .snap-size:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* Advanced settings */
  .advanced-settings {
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
  }

  .advanced-settings summary {
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.025em;
    cursor: pointer;
    user-select: none;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .advanced-settings summary::-webkit-details-marker { display: none; }

  .advanced-settings summary::before {
    content: '▶';
    font-size: 0.5rem;
    transition: transform 0.15s ease;
  }

  .advanced-settings[open] summary::before {
    transform: rotate(90deg);
  }

  .advanced-body {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    border-top: 1px solid var(--border-color, #e2e8f0);
  }

  .advanced-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .advanced-row label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary, #64748b);
  }

  .advanced-row input[type="color"] {
    width: 32px;
    height: 28px;
    padding: 2px;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-md, 8px);
    background: var(--bg-primary, #f8f9fa);
    cursor: pointer;
  }

  .advanced-row input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent-color, #10b981);
    cursor: pointer;
  }

  /* Legend cursor feedback */
  .legend-group { cursor: move; }
  .legend-group.dragging { cursor: grabbing; }
  .resize-handle { cursor: nwse-resize; }

  @media (max-width: 700px) {
    .content {
      flex-direction: column;
    }
    .form-panel {
      width: auto;
      max-height: 40vh;
      border-right: none;
      border-bottom: 1px solid var(--border-color, #e2e8f0);
    }
  }
`;

class ExportLegendModal extends HTMLElement {
  static _fontCache = {};

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // Zoom/pan state (independent of workspace)
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;
    this._isPanning = false;
    this._panStartX = 0;
    this._panStartY = 0;

    // Legend drag state
    this._isDragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._legendX = 0;
    this._legendY = 0;

    // Legend resize state
    this._isResizing = false;
    this._resizeStartX = 0;
    this._legendWidth = 560;

    // SVG canvas dimensions (from store)
    this._canvasWidth = 200;
    this._canvasHeight = 200;

    // Scale factor: all legend dimensions are multiplied by this
    this._scaleFactor = 1;

    // Snap-to-grid
    this._snapEnabled = true;
    this._snapSize = 10;

    // Form data
    this._formData = {
      name: '',
      description: '',
      date: '',
      creator: '',
      code: '',
    };

    // Snapshot of workspace state at modal open time
    this._workspaceState = null;

    // Export overrides (non-null values override workspace state in preview)
    this._exportOverrides = { gridEnabled: null, gridColor: null };

    // Debounce handle for preview rebuilds
    this._rebuildRafId = null;

    // Base dimensions (at scale factor 1.0, fits 80 monospace chars)
    // Base width: 80 chars * (11 * 0.6) charWidth + 2 * 16 padding ≈ 560
    this.BASE_WIDTH = 560;
    this.CHAR_WIDTH_FACTOR = 0.6;

    // Base (unscaled) typography & spacing
    this.BASE_PADDING = 16;
    this.BASE_LINE_HEIGHT = 18;
    this.BASE_FONT_SIZE = 13;
    this.BASE_TITLE_FONT_SIZE = 16;
    this.BASE_SMALL_FONT_SIZE = 11;
    this.BASE_BRAND_FONT_SIZE = 9;
    this.BASE_BORDER_RADIUS = 8;
    this.BASE_STROKE_WIDTH = 1;
    this.BASE_HANDLE_SIZE = 14;
    this.BASE_SEPARATOR_GAP = 10;
    this.BASE_BRAND_GAP = 5;

    // Zoom constants
    this.MIN_ZOOM = 0.1;
    this.MAX_ZOOM = 10;
    this.ZOOM_STEP = 1.5;
  }

  connectedCallback() {
    this.render();
    this._setupEventListeners();
  }

  disconnectedCallback() {
    this._removeDocumentListeners();
  }

  // --- Scaled dimension helpers ---

  _s(baseValue) {
    return baseValue * this._scaleFactor;
  }

  _snap(value) {
    if (!this._snapEnabled || this._snapSize <= 0) return value;
    return Math.round(value / this._snapSize) * this._snapSize;
  }

  _updateLegendPosition() {
    const legendG = this._svg?.querySelector('#pathogen-legend');
    if (legendG) {
      legendG.setAttribute('transform', `translate(${this._legendX}, ${this._legendY})`);
    }
  }

  // --- Public API ---

  open(svgElement, storeState) {
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
    // Anchor: at scale=1, BASE_WIDTH (560) is the legend width.
    // We want the legend to be ~25-30% of the shorter canvas side.
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

  close() {
    this.classList.remove('open');
    this._removeDocumentListeners();
  }

  _getEffectiveState() {
    const s = { ...this._workspaceState };
    for (const [key, val] of Object.entries(this._exportOverrides)) {
      if (val !== null) s[key] = val;
    }
    return s;
  }

  _scheduleRebuild() {
    if (this._rebuildRafId) cancelAnimationFrame(this._rebuildRafId);
    this._rebuildRafId = requestAnimationFrame(() => {
      this._rebuildRafId = null;
      this._rebuildPreview();
    });
  }

  _rebuildPreview() {
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
    this._buildPreviewSvg(this._svgElement, this._getEffectiveState());

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

  _buildPreviewSvg(sourceSvg, state) {
    const previewArea = this.shadowRoot.querySelector('.preview-area');
    const oldSvg = previewArea.querySelector('svg');
    if (oldSvg) oldSvg.remove();

    const svg = createSvgSnapshot(sourceSvg || this._svgElement, {
      includeGrid: state.gridEnabled,
      gridColor: state.gridColor,
      background: state.background,
    });

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

  _buildLegendGroup() {
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
    const elements = [];

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
      sep.setAttribute('x1', pad);
      sep.setAttribute('y1', y);
      sep.setAttribute('x2', this._legendWidth - pad);
      sep.setAttribute('y2', y);
      sep.setAttribute('stroke', '#e2e8f0');
      sep.setAttribute('stroke-width', strokeWidth);
      sep.classList.add('legend-separator');
      elements.push(sep);
      y += separatorGap;
    }

    // Code block — each source line gets its own <tspan>
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

    // Background rect with neutral border (persists in downloaded SVG)
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('rx', borderRadius);
    rect.setAttribute('ry', borderRadius);
    rect.setAttribute('width', this._legendWidth);
    rect.setAttribute('height', boxHeight);
    rect.setAttribute('fill', 'white');
    rect.setAttribute('fill-opacity', '0.92');
    rect.setAttribute('stroke', '#e2e8f0');
    rect.setAttribute('stroke-width', strokeWidth);
    rect.classList.add('legend-bg');
    g.appendChild(rect);

    // Accent border overlay (visible in preview, stripped on download)
    const accentRect = document.createElementNS(ns, 'rect');
    accentRect.setAttribute('rx', borderRadius);
    accentRect.setAttribute('ry', borderRadius);
    accentRect.setAttribute('width', this._legendWidth);
    accentRect.setAttribute('height', boxHeight);
    accentRect.setAttribute('fill', 'none');
    accentRect.setAttribute('stroke', ACCENT);
    accentRect.setAttribute('stroke-width', strokeWidth * 1.5);
    accentRect.setAttribute('data-interactive', 'true');
    g.appendChild(accentRect);

    // Append text elements on top of rect
    elements.forEach((el) => g.appendChild(el));

    // Branding below box — single baseline: "Pathogen  built with svg-path-extended"
    const brandY = boxHeight + brandGap;
    const pathogenFontSize = smallFontSize * 1.2;

    const brandText = document.createElementNS(ns, 'text');
    brandText.setAttribute('x', pad);
    // Use alphabetic baseline so both spans share the same bottom baseline
    brandText.setAttribute('y', brandY + pathogenFontSize);
    brandText.setAttribute('dominant-baseline', 'auto');
    brandText.setAttribute('fill', '#94a3b8');
    brandText.classList.add('legend-brand');

    const brandSpan1 = document.createElementNS(ns, 'tspan');
    brandSpan1.setAttribute('font-size', pathogenFontSize);
    brandSpan1.setAttribute('font-weight', '400');
    brandSpan1.setAttribute('font-family', "'Baumans', cursive");
    brandSpan1.textContent = 'Pathogen';

    const brandSpan2 = document.createElementNS(ns, 'tspan');
    brandSpan2.setAttribute('font-size', brandFontSize);
    brandSpan2.setAttribute('font-family', "'Inter', -apple-system, BlinkMacSystemFont, sans-serif");
    // Gap of ~1 em-width at the smaller font size
    brandSpan2.setAttribute('dx', brandFontSize * this.CHAR_WIDTH_FACTOR);
    brandSpan2.textContent = 'built with svg-path-extended';

    brandText.appendChild(brandSpan1);
    brandText.appendChild(brandSpan2);
    g.appendChild(brandText);

    // Resize handle (bottom-right corner) — accent-colored, stripped on export
    const handle = document.createElementNS(ns, 'rect');
    handle.setAttribute('x', this._legendWidth - handleSize);
    handle.setAttribute('y', boxHeight - handleSize);
    handle.setAttribute('width', handleSize);
    handle.setAttribute('height', handleSize);
    handle.setAttribute('fill', ACCENT_LIGHT);
    handle.setAttribute('stroke', ACCENT);
    handle.setAttribute('stroke-width', strokeWidth);
    handle.setAttribute('rx', this._s(2));
    handle.setAttribute('data-interactive', 'true');
    handle.classList.add('resize-handle');
    g.appendChild(handle);

    // Store box height for initial positioning (done in _buildPreviewSvg)
    this._legendBoxHeight = boxHeight;
    this._legendTotalHeight = boxHeight + brandGap + pathogenFontSize + this._s(4);
    g.setAttribute('transform', `translate(${this._legendX}, ${this._legendY})`);

    return g;
  }

  _createText(content, x, y, opts = {}) {
    const ns = 'http://www.w3.org/2000/svg';
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', y);
    text.setAttribute('font-size', opts.fontSize || this._s(this.BASE_FONT_SIZE));
    text.setAttribute('font-family', opts.fontFamily || "'Inter', -apple-system, BlinkMacSystemFont, sans-serif");
    text.setAttribute('dominant-baseline', 'hanging');
    if (opts.fontWeight) text.setAttribute('font-weight', opts.fontWeight);
    if (opts.anchor) text.setAttribute('text-anchor', opts.anchor);
    if (opts.color) text.setAttribute('fill', opts.color);
    if (opts.cls) text.classList.add(opts.cls);
    text.textContent = content;
    return text;
  }

  _createWrappedText(content, x, y, maxWidth, opts = {}) {
    const ns = 'http://www.w3.org/2000/svg';
    const fSize = opts.fontSize || this._s(this.BASE_FONT_SIZE);
    const charWidth = fSize * this.CHAR_WIDTH_FACTOR;
    const charsPerLine = Math.max(10, Math.floor(maxWidth / charWidth));
    const lines = this._wrapText(content, charsPerLine);
    const lineGap = fSize + this._s(3);

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', y);
    text.setAttribute('font-size', fSize);
    text.setAttribute('font-family', opts.fontFamily || "'Inter', -apple-system, BlinkMacSystemFont, sans-serif");
    text.setAttribute('dominant-baseline', 'hanging');
    if (opts.color) text.setAttribute('fill', opts.color);
    if (opts.cls) text.classList.add(opts.cls);

    lines.forEach((line, i) => {
      const tspan = document.createElementNS(ns, 'tspan');
      tspan.setAttribute('x', x);
      if (i > 0) tspan.setAttribute('dy', lineGap);
      tspan.textContent = line;
      text.appendChild(tspan);
    });

    const totalHeight = lines.length > 0 ? fSize + (lines.length - 1) * lineGap : 0;
    return { el: text, height: totalHeight };
  }

  /**
   * Render code as a block of <tspan> elements — one per source line.
   * Lines wider than the inner width are truncated with "...".
   * Total lines capped at 128; ellipsis shown only if truncated.
   */
  _createCodeBlock(code, x, y, maxWidth, opts = {}) {
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
    text.setAttribute('x', x);
    text.setAttribute('y', y);
    text.setAttribute('font-size', fSize);
    text.setAttribute('font-family', "'Inconsolata', 'Consolas', 'Monaco', monospace");
    text.setAttribute('dominant-baseline', 'hanging');
    text.style.whiteSpace = 'pre';
    if (opts.color) text.setAttribute('fill', opts.color);
    if (opts.cls) text.classList.add(opts.cls);

    sourceLines.forEach((line, i) => {
      const tspan = document.createElementNS(ns, 'tspan');
      tspan.setAttribute('x', x);
      if (i > 0) tspan.setAttribute('dy', lineGap);
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
      tspan.setAttribute('x', x);
      tspan.setAttribute('dy', lineGap);
      tspan.textContent = '...';
      text.appendChild(tspan);
      sourceLines.push('...');
    }

    const totalHeight = sourceLines.length > 0 ? fSize + (sourceLines.length - 1) * lineGap : 0;
    return { el: text, height: totalHeight };
  }

  _wrapText(text, charsPerLine) {
    const words = text.split(/\s+/);
    const lines = [];
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

  _computeBaseWidth() {
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

  _updateLegendFromForm() {
    this._legendWidth = this._computeBaseWidth() * this._scaleFactor;

    const oldLegend = this._svg.querySelector('#pathogen-legend');
    if (oldLegend) oldLegend.remove();

    const legendG = this._buildLegendGroup();
    this._svg.appendChild(legendG);
  }

  // --- Populate form ---

  _populateForm() {
    const root = this.shadowRoot;
    root.querySelector('#legend-name').value = this._formData.name;
    root.querySelector('#legend-description').value = this._formData.description;
    root.querySelector('#legend-date').value = this._formData.date;
    root.querySelector('#legend-creator').value = this._formData.creator;
    root.querySelector('#legend-code').value = this._formData.code;
    const snapInput = root.querySelector('#legend-snap');
    const snapToggle = root.querySelector('#snap-toggle');
    if (snapInput) {
      snapInput.value = this._snapSize;
      snapInput.disabled = !this._snapEnabled;
    }
    if (snapToggle) {
      snapToggle.classList.toggle('active', this._snapEnabled);
      snapToggle.setAttribute('aria-checked', this._snapEnabled);
    }
    // Populate advanced export settings from workspace state
    if (this._workspaceState) {
      root.querySelector('#export-grid-enabled').checked = this._workspaceState.gridEnabled;
      root.querySelector('#export-grid-color').value = this._workspaceState.gridColor || '#cccccc';
    }
  }

  // --- Zoom / Pan ---

  _updateViewBox() {
    if (!this._svg) return;
    const vw = this._canvasWidth / this._zoom;
    const vh = this._canvasHeight / this._zoom;
    this._svg.setAttribute('viewBox', `${this._panX} ${this._panY} ${vw} ${vh}`);
  }

  _updateZoomDisplay() {
    const input = this.shadowRoot.querySelector('.zoom-level');
    if (input) input.value = `${Math.round(this._zoom * 100)}%`;
  }

  _zoomIn() {
    const oldZoom = this._zoom;
    this._zoom = Math.min(this.MAX_ZOOM, this._zoom * this.ZOOM_STEP);
    this._adjustPanForZoom(oldZoom, this._zoom);
    this._updateViewBox();
    this._updateZoomDisplay();
  }

  _zoomOut() {
    const oldZoom = this._zoom;
    this._zoom = Math.max(this.MIN_ZOOM, this._zoom / this.ZOOM_STEP);
    this._adjustPanForZoom(oldZoom, this._zoom);
    this._updateViewBox();
    this._updateZoomDisplay();
  }

  _zoomFit() {
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;
    this._updateViewBox();
    this._updateZoomDisplay();
  }

  _adjustPanForZoom(oldZoom, newZoom) {
    const oldVW = this._canvasWidth / oldZoom;
    const oldVH = this._canvasHeight / oldZoom;
    const cx = this._panX + oldVW / 2;
    const cy = this._panY + oldVH / 2;
    const newVW = this._canvasWidth / newZoom;
    const newVH = this._canvasHeight / newZoom;
    this._panX = cx - newVW / 2;
    this._panY = cy - newVH / 2;
  }

  // --- Screen to SVG coordinate conversion ---

  _screenToSvg(clientX, clientY) {
    const pt = this._svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(this._svg.getScreenCTM().inverse());
  }

  // --- Font embedding ---

  async _embedFonts(svgClone) {
    const fonts = [
      {
        family: 'Baumans',
        url: 'https://fonts.googleapis.com/css2?family=Baumans&text=Pathogen',
      },
      {
        family: 'Inconsolata',
        // All printable ASCII for code block coverage
        url: `https://fonts.googleapis.com/css2?family=Inconsolata&text=${encodeURIComponent(
          ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~',
        )}`,
      },
    ];

    const fontFaceRules = [];

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
          binary += String.fromCharCode.apply(null, chunk);
        }
        const b64 = btoa(binary);

        // Determine MIME type
        const mime = fontFormat === 'woff2' ? 'font/woff2' : 'font/ttf';

        // Build @font-face rule with data URI
        const rule = `@font-face {\n  font-family: '${font.family}';\n  src: url(data:${mime};base64,${b64}) format('${fontFormat}');\n}`;

        ExportLegendModal._fontCache[font.family] = rule;
        fontFaceRules.push(rule);
      } catch (err) {
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

  async _download() {
    const downloadBtn = this.shadowRoot.querySelector('.download-btn');
    const originalText = downloadBtn.innerHTML;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Preparing...';

    try {
      const clone = this._svg.cloneNode(true);

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
        const handle = await window.showSaveFilePicker({
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
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Export failed:', err);
      }
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = originalText;
    }
  }

  // --- Event handling ---

  _setupEventListeners() {
    const root = this.shadowRoot;

    // Close button
    root.querySelector('.close-btn').addEventListener('click', () => this.close());

    // Cancel button
    root.querySelector('.cancel-btn').addEventListener('click', () => this.close());

    // Download
    root.querySelector('.download-btn').addEventListener('click', () => this._download());

    // Zoom controls
    root.querySelector('.zoom-in').addEventListener('click', () => this._zoomIn());
    root.querySelector('.zoom-out').addEventListener('click', () => this._zoomOut());
    root.querySelector('.zoom-fit').addEventListener('click', () => this._zoomFit());

    // Zoom level input
    const zoomInput = root.querySelector('.zoom-level');
    zoomInput.addEventListener('change', (e) => {
      const val = parseInt(e.target.value);
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

    // Form inputs → live update legend
    const formInputs = ['#legend-name', '#legend-description', '#legend-date', '#legend-creator'];
    formInputs.forEach((sel) => {
      root.querySelector(sel).addEventListener('input', (e) => {
        const field = sel.replace('#legend-', '');
        this._formData[field] = e.target.value;
        this._updateLegendFromForm();
      });
    });

    // Snap toggle + size input
    const snapToggle = root.querySelector('#snap-toggle');
    const snapInput = root.querySelector('#legend-snap');
    const snapLabel = root.querySelector('#snap-label');

    const updateSnapToggleUI = () => {
      snapToggle.classList.toggle('active', this._snapEnabled);
      snapToggle.setAttribute('aria-checked', this._snapEnabled);
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

    snapInput.addEventListener('input', (e) => {
      this._snapSize = Math.max(1, parseInt(e.target.value) || 1);
    });

    // Advanced export settings
    root.querySelector('#export-grid-enabled').addEventListener('change', (e) => {
      this._exportOverrides.gridEnabled = e.target.checked;
      this._scheduleRebuild();
    });
    root.querySelector('#export-grid-color').addEventListener('input', (e) => {
      this._exportOverrides.gridColor = e.target.value;
      this._scheduleRebuild();
    });

    // Preview area mouse events (pan + legend drag + resize)
    const previewArea = root.querySelector('.preview-area');

    previewArea.addEventListener('mousedown', (e) => {
      if (!this._svg) return;

      const target = e.target;

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
      (e) => {
        if (!this._svg) return;
        e.preventDefault();
        const dampening = 0.002;
        const delta = -e.deltaY * dampening;
        const oldZoom = this._zoom;
        this._zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this._zoom * (1 + delta)));
        this._adjustPanForZoom(oldZoom, this._zoom);
        this._updateViewBox();
        this._updateZoomDisplay();
      },
      { passive: false },
    );
  }

  _addDocumentListeners() {
    this._handleMouseMove = (e) => {
      // Legend resize — derive scale factor from target width
      if (this._isResizing) {
        const dx = e.clientX - this._resizeStartX;
        const rect = this._svg.getBoundingClientRect();
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

    this._handleMouseUp = () => {
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
        const previewArea = this.shadowRoot.querySelector('.preview-area');
        if (previewArea) previewArea.classList.remove('panning');
      }
    };

    this._handleKeydown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
        return;
      }

      // Arrow keys move legend (skip when focus is in a text field)
      const origin = e.composedPath()[0];
      const tag = origin?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const arrowMap = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
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

  _removeDocumentListeners() {
    if (this._handleMouseMove) document.removeEventListener('mousemove', this._handleMouseMove);
    if (this._handleMouseUp) document.removeEventListener('mouseup', this._handleMouseUp);
    if (this._handleKeydown) document.removeEventListener('keydown', this._handleKeydown, true);
  }

  render() {
    this.shadowRoot.innerHTML = `
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
                <input type="color" id="export-grid-color">
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
