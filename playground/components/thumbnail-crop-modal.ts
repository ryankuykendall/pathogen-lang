// Thumbnail Crop Modal - Full-screen overlay for setting workspace thumbnail
// Square crop selection with live preview at multiple sizes

import { thumbnailApi } from '../services/api.js';
import thumbnailService from '../services/thumbnail-service.js';
import { store } from '../state/store.js';
import { createSvgSnapshot } from '../utils/svg-snapshot.js';

const ACCENT = '#10b981';
const ACCENT_LIGHT = 'rgba(16, 185, 129, 0.35)';
const OVERLAY_COLOR = 'rgba(0, 0, 0, 0.5)';
const MIN_CROP_SIZE = 20;

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
    height: 100vh;
    height: 100dvh;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: -1;
  }

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

  .btn:hover:not(:disabled) {
    border-color: var(--accent-color, ${ACCENT});
    color: var(--accent-color, ${ACCENT});
    background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.primary {
    background: var(--accent-color, ${ACCENT});
    border-color: var(--accent-color, ${ACCENT});
    color: var(--accent-text, #ffffff);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--accent-hover, #059669);
    border-color: var(--accent-hover, #059669);
    color: var(--accent-text, #ffffff);
  }

  .btn.danger {
    background: transparent;
    border-color: var(--error-color, #ef4444);
    color: var(--error-color, #ef4444);
  }

  .btn.danger:hover:not(:disabled) {
    background: var(--error-color, #ef4444);
    color: #ffffff;
  }

  .btn[hidden] {
    display: none;
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
    border-color: var(--accent-color, ${ACCENT});
    color: var(--accent-color, ${ACCENT});
    background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
  }

  .content {
    display: flex;
    flex: 1;
    min-height: 0;
    background: var(--bg-primary, #f8f9fa);
  }

  /* Preview strip (left panel) — 256px content + padding */
  .preview-strip {
    width: calc(256px + 1.25rem * 2);
    box-sizing: border-box;
    flex-shrink: 0;
    background: var(--bg-secondary, #ffffff);
    border-right: 1px solid var(--border-color, #e2e8f0);
    padding: 1.25rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .preview-strip h3 {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .preview-size {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .preview-size label {
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--text-tertiary, #94a3b8);
    font-family: var(--font-mono, 'Inconsolata', monospace);
  }

  .preview-size canvas {
    aspect-ratio: 1;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--border-color, #e2e8f0);
    background: #ffffff;
  }

  /* 1024 is the reference size (full width); 512 and 256 scale proportionally */
  #preview-1024 { width: 100%; }
  #preview-512  { width: 50%; }
  #preview-256  { width: 25%; }

  .reset-btn {
    margin-top: auto;
  }

  /* Main preview area */
  .preview-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .preview-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 2rem;
    cursor: grab;
    position: relative;
  }

  .preview-area.panning {
    cursor: grabbing;
  }

  .preview-area svg {
    display: block;
    max-width: 100%;
    max-height: 100%;
    box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.08));
    overflow: visible;
  }

  /* Zoom bar */
  .zoom-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary, #ffffff);
    border-top: 1px solid var(--border-color, #e2e8f0);
    flex-shrink: 0;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .zoom-bar button {
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

  .zoom-bar button:hover {
    background: var(--hover-bg, rgba(0, 0, 0, 0.04));
    border-color: var(--accent-color, ${ACCENT});
    color: var(--accent-color, ${ACCENT});
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
    border-color: var(--accent-color, ${ACCENT});
    box-shadow: 0 0 0 3px var(--focus-ring, rgba(16, 185, 129, 0.4));
  }


  @media (max-width: 700px) {
    .content {
      flex-direction: column;
    }
    .preview-strip {
      width: auto;
      flex-direction: row;
      max-height: 120px;
      border-right: none;
      border-bottom: 1px solid var(--border-color, #e2e8f0);
      overflow-x: auto;
    }
    .preview-size canvas {
      width: 80px;
      height: 80px;
    }
  }
`;

interface StoreState {
  width?: number;
  height?: number;
  background?: string;
  [key: string]: unknown;
}

interface CropRegion {
  x: number;
  y: number;
  size: number;
}

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

class ThumbnailCropModal extends HTMLElement {
  // Zoom/pan state
  private _zoom: number = 1;
  private _panX: number = 0;
  private _panY: number = 0;
  private _isPanning: boolean = false;
  private _panStartX: number = 0;
  private _panStartY: number = 0;

  // Crop state (SVG coordinates)
  private _cropX: number = 0;
  private _cropY: number = 0;
  private _cropSize: number = 100;

  // Drag/resize state
  private _isDragging: boolean = false;
  private _isResizing: boolean = false;
  private _resizeCorner: ResizeCorner | null = null;
  private _dragStartX: number = 0;
  private _dragStartY: number = 0;
  private _dragStartCropX: number = 0;
  private _dragStartCropY: number = 0;
  private _dragStartCropSize: number = 0;

  // Canvas dimensions
  private _canvasWidth: number = 200;
  private _canvasHeight: number = 200;

  // Zoom constants
  private readonly MIN_ZOOM = 0.1;
  private readonly MAX_ZOOM = 10;
  private readonly ZOOM_STEP = 1.5;

  // Live preview update throttle
  private _previewRafId: number | null = null;

  // References
  private _svg: SVGSVGElement | null = null;
  private _svgElement: SVGSVGElement | null = null;
  private _storeState: StoreState | null = null;
  private _saving: boolean = false;

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

  // --- Public API ---

  open(svgElement: SVGSVGElement, storeState: StoreState): void {
    this._svgElement = svgElement;
    this._storeState = { ...storeState };
    this._canvasWidth = storeState.width || 200;
    this._canvasHeight = storeState.height || 200;
    this._saving = false;

    // Default crop: centered square
    this._resetCrop();

    // Reset zoom/pan
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;

    // Build preview SVG
    this._buildPreviewSvg();
    this._updateZoomDisplay();
    this._schedulePreviewUpdate();

    // Update save button state
    this._updateSaveButton(false);
    this._updateClearButton();

    this.classList.add('open');
    this._addDocumentListeners();
  }

  // Show the Clear button only when a manual thumbnail currently exists. The
  // store mirrors workspace.manualThumbnailAt at workspace-load time and after
  // every save/clear so this stays correct without a fresh API round-trip.
  private _updateClearButton(): void {
    const btn = this.shadowRoot!.querySelector('.clear-btn') as HTMLButtonElement | null;
    if (!btn) return;
    const hasManual = Boolean(store.get('workspaceManualThumbnailAt'));
    btn.hidden = !hasManual;
  }

  close(): void {
    this.classList.remove('open');
    this._removeDocumentListeners();
    if (this._previewRafId) {
      cancelAnimationFrame(this._previewRafId);
      this._previewRafId = null;
    }
  }

  // --- Crop management ---

  _resetCrop(): void {
    const cropSize = Math.min(this._canvasWidth, this._canvasHeight);
    this._cropX = (this._canvasWidth - cropSize) / 2;
    this._cropY = (this._canvasHeight - cropSize) / 2;
    this._cropSize = cropSize;
  }

  _constrainCrop(): void {
    // Ensure crop stays within canvas bounds
    this._cropSize = Math.max(MIN_CROP_SIZE, Math.min(this._cropSize, this._canvasWidth, this._canvasHeight));
    this._cropX = Math.max(0, Math.min(this._cropX, this._canvasWidth - this._cropSize));
    this._cropY = Math.max(0, Math.min(this._cropY, this._canvasHeight - this._cropSize));
  }

  // --- SVG building ---

  _buildPreviewSvg(): void {
    const previewArea = this.shadowRoot!.querySelector('.preview-area') as HTMLElement;
    const oldSvg = previewArea.querySelector('svg');
    if (oldSvg) oldSvg.remove();

    const ns = 'http://www.w3.org/2000/svg';
    const svg = createSvgSnapshot(this._svgElement!, {
      background: this._storeState!.background || '#f5f5f5',
    }) as SVGSVGElement;

    // Add crop overlay on top
    const cropGroup = document.createElementNS(ns, 'g');
    cropGroup.setAttribute('id', 'crop-overlay');
    svg.appendChild(cropGroup);
    this._buildCropOverlay(cropGroup);

    previewArea.appendChild(svg);
    this._svg = svg;
    this._updateViewBox();
  }

  _buildCropOverlay(group: SVGGElement): void {
    const ns = 'http://www.w3.org/2000/svg';

    // Clear existing overlay
    while (group.firstChild) group.removeChild(group.firstChild);

    const cx = this._cropX;
    const cy = this._cropY;
    const cs = this._cropSize;

    // Draw 4 dark rects around the crop area
    // Top
    if (cy > 0) {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', '0');
      r.setAttribute('y', '0');
      r.setAttribute('width', String(this._canvasWidth));
      r.setAttribute('height', String(cy));
      r.setAttribute('fill', OVERLAY_COLOR);
      group.appendChild(r);
    }
    // Bottom
    if (cy + cs < this._canvasHeight) {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', '0');
      r.setAttribute('y', String(cy + cs));
      r.setAttribute('width', String(this._canvasWidth));
      r.setAttribute('height', String(this._canvasHeight - cy - cs));
      r.setAttribute('fill', OVERLAY_COLOR);
      group.appendChild(r);
    }
    // Left
    if (cx > 0) {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', '0');
      r.setAttribute('y', String(cy));
      r.setAttribute('width', String(cx));
      r.setAttribute('height', String(cs));
      r.setAttribute('fill', OVERLAY_COLOR);
      group.appendChild(r);
    }
    // Right
    if (cx + cs < this._canvasWidth) {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(cx + cs));
      r.setAttribute('y', String(cy));
      r.setAttribute('width', String(this._canvasWidth - cx - cs));
      r.setAttribute('height', String(cs));
      r.setAttribute('fill', OVERLAY_COLOR);
      group.appendChild(r);
    }

    // Scale factor
    const s = this._svgScale();
    const nss = 'vector-effect';

    // Invisible drag surface for the crop area
    const dragSurface = document.createElementNS(ns, 'rect');
    dragSurface.setAttribute('x', String(cx));
    dragSurface.setAttribute('y', String(cy));
    dragSurface.setAttribute('width', String(cs));
    dragSurface.setAttribute('height', String(cs));
    dragSurface.setAttribute('fill', 'transparent');
    dragSurface.style.cursor = 'move';
    dragSurface.classList.add('crop-area');
    group.appendChild(dragSurface);

    // Accent border
    const accentBorder = document.createElementNS(ns, 'rect');
    accentBorder.setAttribute('x', String(cx));
    accentBorder.setAttribute('y', String(cy));
    accentBorder.setAttribute('width', String(cs));
    accentBorder.setAttribute('height', String(cs));
    accentBorder.setAttribute('fill', 'none');
    accentBorder.setAttribute('stroke', ACCENT);
    accentBorder.setAttribute('stroke-width', '2');
    accentBorder.setAttribute(nss, 'non-scaling-stroke');
    accentBorder.setAttribute('pointer-events', 'none');
    group.appendChild(accentBorder);

    // Marching ants overlay
    const ants = document.createElementNS(ns, 'rect');
    ants.setAttribute('x', String(cx));
    ants.setAttribute('y', String(cy));
    ants.setAttribute('width', String(cs));
    ants.setAttribute('height', String(cs));
    ants.setAttribute('fill', 'none');
    ants.setAttribute('stroke', '#ffffff');
    ants.setAttribute('stroke-width', '1.5');
    ants.setAttribute(nss, 'non-scaling-stroke');
    ants.setAttribute('stroke-dasharray', '8 8');
    ants.setAttribute('pointer-events', 'none');
    const animate = document.createElementNS(ns, 'animate');
    animate.setAttribute('attributeName', 'stroke-dashoffset');
    animate.setAttribute('from', '0');
    animate.setAttribute('to', '-16');
    animate.setAttribute('dur', '0.4s');
    animate.setAttribute('repeatCount', 'indefinite');
    ants.appendChild(animate);
    group.appendChild(ants);

    // Rule-of-thirds guides
    const thirdLineColor = 'rgba(255, 255, 255, 0.3)';
    for (let i = 1; i <= 2; i++) {
      const vLine = document.createElementNS(ns, 'line');
      vLine.setAttribute('x1', String(cx + (cs * i) / 3));
      vLine.setAttribute('y1', String(cy));
      vLine.setAttribute('x2', String(cx + (cs * i) / 3));
      vLine.setAttribute('y2', String(cy + cs));
      vLine.setAttribute('stroke', thirdLineColor);
      vLine.setAttribute('stroke-width', '1');
      vLine.setAttribute(nss, 'non-scaling-stroke');
      vLine.setAttribute('pointer-events', 'none');
      group.appendChild(vLine);

      const hLine = document.createElementNS(ns, 'line');
      hLine.setAttribute('x1', String(cx));
      hLine.setAttribute('y1', String(cy + (cs * i) / 3));
      hLine.setAttribute('x2', String(cx + cs));
      hLine.setAttribute('y2', String(cy + (cs * i) / 3));
      hLine.setAttribute('stroke', thirdLineColor);
      hLine.setAttribute('stroke-width', '1');
      hLine.setAttribute(nss, 'non-scaling-stroke');
      hLine.setAttribute('pointer-events', 'none');
      group.appendChild(hLine);
    }

    // Corner handles
    const handleSize = 10 * s;
    const hitSize = 24 * s;
    const corners: { cls: string; x: number; y: number; cursor: string }[] = [
      { cls: 'crop-handle-nw', x: cx, y: cy, cursor: 'nwse-resize' },
      { cls: 'crop-handle-ne', x: cx + cs, y: cy, cursor: 'nesw-resize' },
      { cls: 'crop-handle-sw', x: cx, y: cy + cs, cursor: 'nesw-resize' },
      { cls: 'crop-handle-se', x: cx + cs, y: cy + cs, cursor: 'nwse-resize' },
    ];

    for (const corner of corners) {
      // Invisible hit area
      const hit = document.createElementNS(ns, 'rect');
      hit.setAttribute('x', String(corner.x - hitSize / 2));
      hit.setAttribute('y', String(corner.y - hitSize / 2));
      hit.setAttribute('width', String(hitSize));
      hit.setAttribute('height', String(hitSize));
      hit.setAttribute('fill', 'transparent');
      hit.style.cursor = corner.cursor;
      hit.classList.add('crop-handle', corner.cls);
      group.appendChild(hit);

      // Visible handle
      const h = document.createElementNS(ns, 'rect');
      h.setAttribute('x', String(corner.x - handleSize / 2));
      h.setAttribute('y', String(corner.y - handleSize / 2));
      h.setAttribute('width', String(handleSize));
      h.setAttribute('height', String(handleSize));
      h.setAttribute('fill', ACCENT_LIGHT);
      h.setAttribute('stroke', ACCENT);
      h.setAttribute('stroke-width', '2');
      h.setAttribute(nss, 'non-scaling-stroke');
      h.setAttribute('rx', String(2 * s));
      h.setAttribute('pointer-events', 'none');
      group.appendChild(h);
    }
  }

  _updateCropOverlay(): void {
    const group = this._svg?.querySelector('#crop-overlay') as SVGGElement | null;
    if (group) this._buildCropOverlay(group);
  }

  // --- Live previews ---

  _schedulePreviewUpdate(): void {
    if (this._previewRafId) return;
    this._previewRafId = requestAnimationFrame(() => {
      this._previewRafId = null;
      this._updatePreviews();
    });
  }

  _updatePreviews(): void {
    const sizes = [
      { size: 1024, canvasId: 'preview-1024' },
      { size: 512, canvasId: 'preview-512' },
      { size: 256, canvasId: 'preview-256' },
    ];

    const tempSvg = createSvgSnapshot(this._svgElement!, {
      width: 1024,
      height: 1024,
      viewBox: `${this._cropX} ${this._cropY} ${this._cropSize} ${this._cropSize}`,
      background: this._storeState!.background || '#f5f5f5',
    }) as SVGSVGElement;

    // Serialize to image
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(tempSvg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      for (const { size, canvasId } of sizes) {
        const canvas = this.shadowRoot!.querySelector(`#${canvasId}`) as HTMLCanvasElement | null;
        if (!canvas) continue;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  _svgScale(): number {
    if (!this._svg) return 1;
    const ctm = this._svg.getScreenCTM();
    if (!ctm) return 1;
    return 1 / ctm.a;
  }

  // --- Zoom / Pan ---

  _updateViewBox(): void {
    if (!this._svg) return;
    const vw = this._canvasWidth / this._zoom;
    const vh = this._canvasHeight / this._zoom;
    this._svg.setAttribute('viewBox', `${this._panX} ${this._panY} ${vw} ${vh}`);
  }

  _updateZoomDisplay(): void {
    const input = this.shadowRoot!.querySelector('.zoom-level') as HTMLInputElement | null;
    if (input) input.value = `${Math.round(this._zoom * 100)}%`;
  }

  _zoomIn(): void {
    const old = this._zoom;
    this._zoom = Math.min(this.MAX_ZOOM, this._zoom * this.ZOOM_STEP);
    this._adjustPanForZoom(old, this._zoom);
    this._updateViewBox();
    this._updateZoomDisplay();
    this._updateCropOverlay();
  }

  _zoomOut(): void {
    const old = this._zoom;
    this._zoom = Math.max(this.MIN_ZOOM, this._zoom / this.ZOOM_STEP);
    this._adjustPanForZoom(old, this._zoom);
    this._updateViewBox();
    this._updateZoomDisplay();
    this._updateCropOverlay();
  }

  _zoomFit(): void {
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;
    this._updateViewBox();
    this._updateZoomDisplay();
    this._updateCropOverlay();
  }

  _adjustPanForZoom(oldZoom: number, newZoom: number): void {
    const oldVW = this._canvasWidth / oldZoom;
    const oldVH = this._canvasHeight / oldZoom;
    const cx = this._panX + oldVW / 2;
    const cy = this._panY + oldVH / 2;
    const newVW = this._canvasWidth / newZoom;
    const newVH = this._canvasHeight / newZoom;
    this._panX = cx - newVW / 2;
    this._panY = cy - newVH / 2;
  }

  _screenToSvg(clientX: number, clientY: number): SVGPoint {
    const pt = this._svg!.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(this._svg!.getScreenCTM()!.inverse());
  }

  // --- Save ---

  async _save(): Promise<void> {
    if (this._saving) return;
    this._saving = true;
    this._updateSaveButton(true);

    try {
      const workspaceId = store.get('workspaceId') as string | undefined;
      if (!workspaceId) throw new Error('No workspace ID');

      const cropRegion: CropRegion = {
        x: this._cropX,
        y: this._cropY,
        size: this._cropSize,
      };

      const result = (await thumbnailService.generateThumbnail(
        workspaceId,
        this._svgElement!,
        this._storeState!,
        cropRegion,
      )) as { manualThumbnailAt?: string | null } | null;

      // Keep the store in sync so the next open() of this modal correctly
      // shows the Clear button.
      store.set('workspaceManualThumbnailAt', result?.manualThumbnailAt ?? new Date().toISOString());

      // Dispatch event for landing-view refresh
      document.dispatchEvent(
        new CustomEvent('thumbnail-updated', {
          bubbles: true,
          composed: true,
          detail: { workspaceId },
        }),
      );

      // Confirmation toast with a preview of the freshly-uploaded thumbnail.
      // Cache-bust so the browser fetches the new R2 object, not any prior 404.
      document.dispatchEvent(
        new CustomEvent('show-toast', {
          bubbles: true,
          composed: true,
          detail: {
            type: 'success',
            title: 'Thumbnail set',
            message: 'It will appear on your workspaces page.',
            image: `${thumbnailApi.url(workspaceId, 256)}?v=${Date.now()}`,
          },
        }),
      );

      this.close();
    } catch (err: unknown) {
      console.error('Thumbnail save failed:', err);
      const message = err instanceof Error ? err.message : 'Please try again.';
      document.dispatchEvent(
        new CustomEvent('show-toast', {
          bubbles: true,
          composed: true,
          detail: {
            type: 'error',
            title: 'Could not set thumbnail',
            message,
          },
        }),
      );
    } finally {
      this._saving = false;
      this._updateSaveButton(false);
    }
  }

  _updateSaveButton(saving: boolean): void {
    const btn = this.shadowRoot!.querySelector('.save-btn') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = saving;
      btn.textContent = saving ? 'Saving...' : 'Save';
    }
  }

  // Remove the manual layer. The server keeps the auto layer (if any) intact;
  // GET falls through to it. If neither layer exists after this, the listing
  // page reverts to the letter avatar.
  async _clear(): Promise<void> {
    if (this._saving) return;
    const workspaceId = store.get('workspaceId') as string | undefined;
    if (!workspaceId) return;

    const btn = this.shadowRoot!.querySelector('.clear-btn') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;

    try {
      const result = (await thumbnailApi.delete(workspaceId, { kind: 'manual' })) as {
        thumbnailAt?: string | null;
        autoThumbnailAt?: string | null;
      };

      store.set('workspaceManualThumbnailAt', null);

      const hasAuto = Boolean(result?.autoThumbnailAt) || Boolean(result?.thumbnailAt);
      document.dispatchEvent(
        new CustomEvent('thumbnail-updated', {
          bubbles: true,
          composed: true,
          detail: { workspaceId },
        }),
      );
      document.dispatchEvent(
        new CustomEvent('show-toast', {
          bubbles: true,
          composed: true,
          detail: {
            type: 'success',
            title: 'Thumbnail cleared',
            message: hasAuto
              ? 'The auto-generated thumbnail will now be shown.'
              : 'Your workspaces page will show the letter avatar until a new thumbnail is set.',
          },
        }),
      );

      this.close();
    } catch (err: unknown) {
      console.error('Thumbnail clear failed:', err);
      const message = err instanceof Error ? err.message : 'Please try again.';
      document.dispatchEvent(
        new CustomEvent('show-toast', {
          bubbles: true,
          composed: true,
          detail: { type: 'error', title: 'Could not clear thumbnail', message },
        }),
      );
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // --- Event handling ---

  _setupEventListeners(): void {
    const root = this.shadowRoot!;

    root.querySelector('.close-btn')!.addEventListener('click', () => this.close());
    root.querySelector('.cancel-btn')!.addEventListener('click', () => this.close());
    root.querySelector('.save-btn')!.addEventListener('click', () => this._save());
    root.querySelector('.clear-btn')!.addEventListener('click', () => this._clear());
    root.querySelector('.reset-btn')!.addEventListener('click', () => {
      this._resetCrop();
      this._updateCropOverlay();
      this._schedulePreviewUpdate();
    });

    // Zoom controls
    root.querySelector('.zoom-in')!.addEventListener('click', () => this._zoomIn());
    root.querySelector('.zoom-out')!.addEventListener('click', () => this._zoomOut());
    root.querySelector('.zoom-fit')!.addEventListener('click', () => this._zoomFit());

    const zoomInput = root.querySelector('.zoom-level') as HTMLInputElement;
    zoomInput.addEventListener('change', (e: Event) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      if (!isNaN(val) && val >= this.MIN_ZOOM * 100 && val <= this.MAX_ZOOM * 100) {
        const old = this._zoom;
        this._zoom = val / 100;
        this._adjustPanForZoom(old, this._zoom);
        this._updateViewBox();
        this._updateZoomDisplay();
        this._updateCropOverlay();
      } else {
        this._updateZoomDisplay();
      }
    });

    // Preview area mouse events
    const previewArea = root.querySelector('.preview-area') as HTMLElement;

    previewArea.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this._svg) return;

      const target = e.target as Element;

      // Corner resize handles
      if (target.classList.contains('crop-handle')) {
        e.preventDefault();
        e.stopPropagation();
        this._isResizing = true;

        if (target.classList.contains('crop-handle-nw')) this._resizeCorner = 'nw';
        else if (target.classList.contains('crop-handle-ne')) this._resizeCorner = 'ne';
        else if (target.classList.contains('crop-handle-sw')) this._resizeCorner = 'sw';
        else this._resizeCorner = 'se';

        const svgPt = this._screenToSvg(e.clientX, e.clientY);
        this._dragStartX = svgPt.x;
        this._dragStartY = svgPt.y;
        this._dragStartCropX = this._cropX;
        this._dragStartCropY = this._cropY;
        this._dragStartCropSize = this._cropSize;
        return;
      }

      // Crop area drag
      if (target.classList.contains('crop-area')) {
        e.preventDefault();
        e.stopPropagation();
        this._isDragging = true;
        const svgPt = this._screenToSvg(e.clientX, e.clientY);
        this._dragStartX = svgPt.x - this._cropX;
        this._dragStartY = svgPt.y - this._cropY;
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
        const old = this._zoom;
        this._zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this._zoom * (1 + delta)));
        this._adjustPanForZoom(old, this._zoom);
        this._updateViewBox();
        this._updateZoomDisplay();
        this._updateCropOverlay();
      },
      { passive: false },
    );
  }

  _addDocumentListeners(): void {
    this._handleMouseMove = (e: MouseEvent): void => {
      if (this._isResizing) {
        const svgPt = this._screenToSvg(e.clientX, e.clientY);
        const dx = svgPt.x - this._dragStartX;
        const dy = svgPt.y - this._dragStartY;

        const origX = this._dragStartCropX;
        const origY = this._dragStartCropY;
        const origSize = this._dragStartCropSize;

        let newX: number;
        let newY: number;
        let newSize: number;

        switch (this._resizeCorner) {
          case 'se': {
            const delta = Math.max(dx, dy);
            newSize = Math.max(MIN_CROP_SIZE, origSize + delta);
            newX = origX;
            newY = origY;
            break;
          }
          case 'nw': {
            const delta = Math.min(dx, dy);
            newSize = Math.max(MIN_CROP_SIZE, origSize - delta);
            newX = origX + origSize - newSize;
            newY = origY + origSize - newSize;
            break;
          }
          case 'ne': {
            const delta = Math.max(dx, -dy);
            newSize = Math.max(MIN_CROP_SIZE, origSize + delta);
            newX = origX;
            newY = origY + origSize - newSize;
            break;
          }
          case 'sw': {
            const delta = Math.max(-dx, dy);
            newSize = Math.max(MIN_CROP_SIZE, origSize + delta);
            newX = origX + origSize - newSize;
            newY = origY;
            break;
          }
          default:
            return;
        }

        this._cropX = newX;
        this._cropY = newY;
        this._cropSize = newSize;
        this._constrainCrop();
        this._updateCropOverlay();
        this._schedulePreviewUpdate();
        return;
      }

      if (this._isDragging) {
        const svgPt = this._screenToSvg(e.clientX, e.clientY);
        this._cropX = svgPt.x - this._dragStartX;
        this._cropY = svgPt.y - this._dragStartY;
        this._constrainCrop();
        this._updateCropOverlay();
        this._schedulePreviewUpdate();
        return;
      }

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
      this._isDragging = false;
      this._isResizing = false;
      this._resizeCorner = null;
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
        <h2>Set Thumbnail</h2>
        <div class="top-bar-actions">
          <button class="btn danger clear-btn" hidden>Clear thumbnail</button>
          <button class="btn cancel-btn">Cancel</button>
          <button class="btn primary save-btn">Save</button>
        </div>
      </div>

      <div class="content">
        <div class="preview-strip">
          <h3>Preview</h3>
          <div class="preview-size">
            <label>1024 &times; 1024</label>
            <canvas id="preview-1024"></canvas>
          </div>
          <div class="preview-size">
            <label>512 &times; 512</label>
            <canvas id="preview-512"></canvas>
          </div>
          <div class="preview-size">
            <label>256 &times; 256</label>
            <canvas id="preview-256"></canvas>
          </div>
          <button class="btn reset-btn">Reset Crop</button>
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
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('thumbnail-crop-modal', ThumbnailCropModal);

export default ThumbnailCropModal;
