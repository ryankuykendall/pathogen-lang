// SVG Preview pane with zoom/pan controls and navigator

import type {
  CompileResult,
  FilterOutput,
  GradientOutput,
  LayerOutput,
  MarkerOutput,
} from '../../src/evaluator/types.js';
import type { VNode } from '../../src/render/index.js';
import { store } from '../state/store.js';
import { decorateConicGradientsWithCanvasFallback } from '../utils/decorate-conic-gradients.js';
import { attachFullscreenBehavior, fullscreenButtonHTML, fullscreenStyles } from '../utils/fullscreen-toggle.js';
import { bootstrapPreviewIframe } from '../utils/preview-iframe.js';

// Runtime access to the render API is via the bundled global (the playground
// loads `dist/index.global.js` rather than importing `src/` directly). Typed
// here so the rest of the file can call `render.buildDefs(...)` etc. without
// per-call globals gymnastics.
declare const window: Window & {
  PathogenLang: {
    buildDefs: typeof import('../../src/render/index.js').buildDefs;
    buildSingleLayer: typeof import('../../src/render/index.js').buildSingleLayer;
    mountInto: typeof import('../../src/render/index.js').mountInto;
  };
};

const LAYERS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;

const DEFAULT_STROKE = '#000000';
const DEFAULT_STROKE_WIDTH = 2;

interface LayerInput {
  name: string;
  type: string;
  data: string;
  styles: Record<string, string>;
  isDefault: boolean;
  transform?: string;
  textElements?: TextElement[];
  fragmentDefs?: string;
  fragmentVisuals?: string;
  children?: LayerInput[];
}

interface TextElement {
  x: number;
  y: number;
  rotation?: number;
  styles?: Record<string, string>;
  children: TextChild[];
}

interface TextChild {
  type: 'run' | 'tspan';
  text: string;
  dx?: number;
  dy?: number;
  rotation?: number;
  styles?: Record<string, string>;
}

interface DefsData {
  masks?: MaskDef[];
  clipPaths?: ClipPathDef[];
  gradients?: GradientDef[];
  patterns?: PatternDef[];
  markers?: MarkerDef[];
  filters?: FilterDef[];
  cssProperties?: CssPropertyDef[];
  gpuGradientUrls?: Map<string, string>;
}

type FilterDef = FilterOutput;

interface MaskDef {
  id: string;
  elements: { pathData: string; styles: Record<string, string> }[];
}

interface ClipPathDef {
  id: string;
  elements: { pathData: string }[];
}

interface GradientDef {
  id: string;
  type: string;
  attrs: Record<string, string>;
  stops: { offset: number; color: string }[];
  stopsWithOklch?: { offset: number; color: string }[];
  spreadMethod?: string;
  gradientUnits?: string;
  gradientTransform?: string;
  colorInterpolation?: string;
  href?: string;
  from?: number;
  to?: number;
  cx?: number;
  cy?: number;
}

interface PatternDef {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  patternUnits?: string;
  patternTransform?: string;
  patternContentUnits?: string;
  elements: { pathData: string; styles: Record<string, string> }[];
}

interface MarkerDef {
  id: string;
  viewBox: string;
  markerWidth: number;
  markerHeight: number;
  refX: string;
  refY: string;
  markerUnits?: string;
  orient?: string;
  preserveAspectRatio?: string;
  elements: { pathData: string; styles: Record<string, string> }[];
}

interface CssPropertyDef {
  name: string;
  syntax: string;
  inherits: boolean;
  initialValue: string;
}

export class SvgPreviewPane extends HTMLElement {
  // Zoom/pan constants
  private readonly MIN_ZOOM = 0.25;
  private readonly MAX_ZOOM = 10;
  private readonly ZOOM_STEP = 1.5;

  // Pan state
  private isPanning: boolean = false;
  private panStartX: number = 0;
  private panStartY: number = 0;

  // Navigator drag state
  private isNavigatorDragging: boolean = false;
  private navDragStartX: number = 0;
  private navDragStartY: number = 0;
  private navDragStartPanX: number = 0;
  private navDragStartPanY: number = 0;

  // Fullscreen toggle
  private _cleanupFullscreen: (() => void) | null = null;

  /**
   * The compiled-SVG render surface lives inside a sandboxed iframe (see
   * `playground/utils/preview-iframe.ts` and
   * `project-docs/security/iframe-sandbox-rationale.md`). Once the iframe's
   * `srcdoc` has parsed, `_iframeDoc` is the document we query against for
   * every `#preview*` element. Until ready, mutations are buffered in
   * `_pendingLayerCall` and replayed when ready.
   */
  private _iframeDoc: Document | null = null;
  private _iframeReady: Promise<Document> | null = null;
  private _pendingLayerCall: { layers: LayerInput[]; defsData: DefsData } | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this._setupIframe();
    this.setupEventListeners();
    this.subscribeToStore();
    this._cleanupFullscreen = attachFullscreenBehavior(this, this.shadowRoot!);
  }

  disconnectedCallback(): void {
    if (this._cleanupFullscreen) this._cleanupFullscreen();
  }

  /**
   * Bootstrap the sandboxed iframe and replay any buffered layer call once
   * the inner document is reachable. Called once from connectedCallback.
   */
  private _setupIframe(): void {
    // Cover the brief srcdoc-parse window with the loading spinner so users
    // never see an empty iframe. `srcdoc` parsing is fast (well under the
    // first compile's 150ms debounce) but a flash is still possible on slow
    // machines; keeping the overlay visible until ready avoids it.
    this.showLoading();
    // Create the iframe programmatically and pre-set srcdoc + sandbox before
    // appending to the DOM. Inserting an iframe via innerHTML and then setting
    // srcdoc after-the-fact triggers an about:blank initial load that emits
    // a one-shot "Blocked script execution" sandbox warning per iframe; the
    // pre-attached path skips it.
    const iframe = document.createElement('iframe');
    iframe.id = 'preview-frame';
    this._iframeReady = bootstrapPreviewIframe(iframe);
    this.previewContainer.appendChild(iframe);
    this._iframeReady.then((doc) => {
      this._iframeDoc = doc;
      this.updateSvgStyles();
      if (this._pendingLayerCall) {
        const pending = this._pendingLayerCall;
        this._pendingLayerCall = null;
        this.setLayersWithTiming(pending.layers, pending.defsData);
      }
      this._setupIframeEventListeners(doc);
      this.hideLoading();
      return doc;
    });
  }

  /**
   * Pan / wheel listeners attach to the iframe document because mouse events
   * inside the iframe do not bubble to the parent. Same-origin sandbox makes
   * this reach legal; the iframe never runs scripts, so we are not bridging
   * across a script boundary.
   */
  private _setupIframeEventListeners(doc: Document): void {
    doc.addEventListener('mousedown', (e: MouseEvent) => this.startPan(e));
    doc.addEventListener('mousemove', (e: MouseEvent) => this.doPan(e));
    doc.addEventListener('mouseup', () => this.endPan());
    doc.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        const dampening = 0.002;
        const delta = -e.deltaY * dampening;

        const oldZoom = store.get('zoomLevel') as number;
        const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, oldZoom * (1 + delta)));

        this.adjustPanForZoom(oldZoom, newZoom);
        store.set('zoomLevel', newZoom);
        this.updateViewBox();
      },
      { passive: false },
    );
  }

  subscribeToStore(): void {
    store.subscribe(
      [
        'width',
        'height',
        'viewBoxOriginX',
        'viewBoxOriginY',
        'background',
        'gridEnabled',
        'gridColor',
        'gridSize',
        'zoomLevel',
        'panX',
        'panY',
        'pathData',
      ],
      () => {
        this.updateSvgStyles();
      },
    );
    store.subscribe('inspectorOpen', () => {
      const btn = this.shadowRoot!.querySelector('#inspector-open-btn') as HTMLElement | null;
      if (btn) btn.style.display = (store.get('inspectorOpen') as boolean) ? 'none' : '';
    });
    store.subscribe('layerVisibility', () => {
      this.applyLayerVisibility();
      this.updateNavigatorContent();
    });
    store.subscribe('defsVisibility', () => {
      this.applyLayerVisibility();
    });
  }

  /**
   * The `<svg id="preview">` lives inside the sandboxed iframe document.
   * Returns null while the iframe is still parsing; callers that need the
   * element synchronously should gate on `_iframeDoc` or buffer.
   */
  get preview(): SVGSVGElement {
    return this._iframeDoc?.getElementById('preview') as SVGSVGElement;
  }

  get previewPath(): SVGPathElement {
    return this._iframeDoc?.getElementById('preview-path') as SVGPathElement;
  }

  /** The shadow-DOM container that hosts the iframe; this is the click/wheel target for panning. */
  get previewContainer(): HTMLElement {
    return this.shadowRoot!.querySelector('#preview-container') as HTMLElement;
  }

  /**
   * Set a CSS custom property on the iframe document so it cascades into the
   * compiled SVG. Used by the inspector panel's cssvar-override flow.
   *
   * Before Phase 3 the SVG was inline in the parent shadow tree, so callers
   * could write `previewPane.shadowRoot.querySelector('#preview').style.setProperty(...)`
   * directly. With the iframe, CSS variables on the parent don't cross the
   * boundary; the override must be written inside the iframe document.
   */
  setCssVar(name: string, value: string): void {
    if (!this._iframeDoc) return;
    this._iframeDoc.documentElement.style.setProperty(name, value);
  }

  removeCssVar(name: string): void {
    if (!this._iframeDoc) return;
    this._iframeDoc.documentElement.style.removeProperty(name);
  }

  set pathData(value: string) {
    store.set('pathData', value || '');
    if (this.previewPath) this.previewPath.setAttribute('d', value || '');
    this.updateNavigatorContent();
  }

  /**
   * Set path data and measure rendering time using forced layout calculation.
   */
  setPathDataWithTiming(value: string): number {
    store.set('pathData', value || '');
    if (!this.previewPath) return 0;

    const start = performance.now();
    this.previewPath.setAttribute('d', value || '');

    // Force synchronous layout calculation
    try {
      this.previewPath.getBBox();
    } catch (e) {
      // getBBox can throw if path is empty or invalid
    }

    const renderTime = performance.now() - start;

    this.updateNavigatorContent();

    return renderTime;
  }

  /**
   * Set layers and measure rendering time.
   * Renders multiple <path> elements for multi-layer output.
   */
  setLayersWithTiming(layers: LayerInput[], defsData: DefsData = {}): number {
    const defaultData = layers[0]?.data || '';
    store.set('pathData', defaultData);

    // Buffer until the sandboxed iframe finishes parsing srcdoc.
    if (!this._iframeDoc) {
      this._pendingLayerCall = { layers, defsData };
      return 0;
    }

    const start = performance.now();

    // Get the layers container
    const layersGroup = this._iframeDoc.getElementById('preview-layers') as unknown as SVGGElement | null;
    if (layersGroup) {
      // Clear existing layer paths
      layersGroup.innerHTML = '';

      // Clean up previous fragment defs and mask/clipPath defs
      const defsEl = this._iframeDoc.querySelector('#preview defs') as SVGDefsElement | null;
      if (defsEl) {
        for (const old of defsEl.querySelectorAll(
          '[data-fragment-layer], [data-mask-def], [data-clippath-def], [data-gradient-def], [data-pattern-def], [data-marker-def]',
        )) {
          old.remove();
        }
      }

      const svgW = (store.get('width') as number) || 200;
      const svgH = (store.get('height') as number) || 200;

      // Build defs via the shared renderer, then run the playground-only
      // Canvas 2D fallback for conic gradients that have no GPU-pre-rendered
      // URL. Masks/clipPaths/patterns/markers/linear+radial gradients pass
      // through unchanged.
      if (defsEl) {
        const defsVNodes = window.PathogenLang.buildDefs(
          {
            masks: defsData.masks ?? [],
            clipPaths: defsData.clipPaths ?? [],
            gradients: (defsData.gradients ?? []) as GradientOutput[],
            patterns: defsData.patterns ?? [],
            markers: (defsData.markers ?? []) as MarkerOutput[],
            filters: (defsData.filters ?? []) as FilterOutput[],
            // Unused by buildDefs but required by the CompileResult shape:
            layers: [],
            cssProperties: [],
            logs: [],
            calledStdlibFunctions: [],
          } as unknown as CompileResult,
          {
            width: svgW,
            height: svgH,
            emitPlaygroundDataAttrs: true,
            useImageGradients: true,
            gpuGradientUrls: defsData.gpuGradientUrls,
          },
        );
        decorateConicGradientsWithCanvasFallback(
          defsVNodes,
          (defsData.gradients ?? []) as GradientOutput[],
          svgW,
          svgH,
        );
        window.PathogenLang.mountInto(defsEl, defsVNodes);
      }

      // Inject @property CSS declarations into the iframe document. The
      // iframe is the structural defense — even if a future CSSVar regression
      // sneaks past `validateCSSIdent`, the resulting `<style>` cannot leak
      // into the parent document.
      const svgEl = this._iframeDoc.getElementById('preview') as unknown as SVGSVGElement;
      const existingCssStyle = svgEl.querySelector('style[data-css-properties]');
      if (existingCssStyle) existingCssStyle.remove();
      if (defsData.cssProperties && defsData.cssProperties.length > 0) {
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const styleEl = this._iframeDoc.createElementNS(SVG_NS, 'style');
        styleEl.setAttribute('data-css-properties', '');
        const rules = defsData.cssProperties
          .map(
            (prop) =>
              `@property ${prop.name} {\n  syntax: "${prop.syntax}";\n  inherits: ${prop.inherits};\n  initial-value: ${prop.initialValue};\n}`,
          )
          .join('\n');
        styleEl.textContent = rules;
        svgEl.insertBefore(styleEl, svgEl.firstChild);
      }

      const SVG_NS = 'http://www.w3.org/2000/svg';
      const layerBuildOptions = {
        emitPlaygroundDataAttrs: true,
        defaultStroke: DEFAULT_STROKE,
        defaultFill: 'none',
        defaultStrokeWidth: String(DEFAULT_STROKE_WIDTH),
      };

      // Render each layer in order. Fragment layers are special-cased because
      // they produce raw SVG strings that must split between <defs> and the
      // layer group; all other layer types flow through the shared renderer.
      for (const layer of layers) {
        if (layer.type === 'fragment') {
          this._insertFragmentLayer(layer, defsEl, layersGroup, SVG_NS);
          continue;
        }
        const vnode: VNode = window.PathogenLang.buildSingleLayer(layer as unknown as LayerOutput, layerBuildOptions);
        window.PathogenLang.mountInto(layersGroup, vnode);
      }

      // Hide the single preview-path when using layers group
      if (this.previewPath) this.previewPath.setAttribute('d', '');
    } else if (this.previewPath) {
      // Fallback: single path
      this.previewPath.setAttribute('d', defaultData);
    }

    // Force synchronous layout calculation
    try {
      const paths = layersGroup?.querySelectorAll('path') || [this.previewPath];
      for (const p of paths) {
        (p as SVGPathElement).getBBox();
      }
    } catch (e) {
      // getBBox can throw if path is empty or invalid
    }

    const renderTime = performance.now() - start;

    this.applyLayerVisibility();
    this.updateNavigatorContent();

    return renderTime;
  }

  /**
   * Handle a fragment layer: parse its raw SVG strings and insert them
   * into the preview. fragmentDefs go into <defs> tagged with
   * `data-fragment-layer`; fragmentVisuals are wrapped in a <g> with
   * `data-layer-name` and appended to the layers group.
   */
  private _insertFragmentLayer(
    layer: LayerInput,
    defsEl: SVGDefsElement | null,
    layersGroup: SVGGElement,
    svgNs: string,
  ): void {
    const targetDoc = this._iframeDoc ?? document;
    if (layer.fragmentDefs && defsEl) {
      const defsDoc = new DOMParser().parseFromString(
        `<svg xmlns="${svgNs}"><defs>${layer.fragmentDefs}</defs></svg>`,
        'image/svg+xml',
      );
      const parsedDefs = defsDoc.querySelector('defs');
      if (parsedDefs) {
        for (const child of Array.from(parsedDefs.children)) {
          const imported = targetDoc.importNode(child, true) as SVGElement;
          imported.setAttribute('data-fragment-layer', layer.name);
          defsEl.appendChild(imported);
        }
      }
    }
    if (layer.fragmentVisuals) {
      const visualDoc = new DOMParser().parseFromString(
        `<svg xmlns="${svgNs}">${layer.fragmentVisuals}</svg>`,
        'image/svg+xml',
      );
      const visualRoot = visualDoc.documentElement;
      const wrapper = targetDoc.createElementNS(svgNs, 'g') as SVGGElement;
      wrapper.setAttribute('data-layer-name', layer.name);
      for (const child of Array.from(visualRoot.children)) {
        wrapper.appendChild(targetDoc.importNode(child, true));
      }
      layersGroup.appendChild(wrapper);
    }
  }

  applyLayerVisibility(): void {
    const layersGroup = this._iframeDoc?.getElementById('preview-layers');
    if (!layersGroup) return;
    const visibility = store.get('layerVisibility') as Record<string, boolean>;

    for (const el of layersGroup.querySelectorAll('[data-layer-name]')) {
      const name = (el as HTMLElement).dataset.layerName;
      if (name && visibility[name] === false) {
        (el as HTMLElement).style.display = 'none';
      } else {
        (el as HTMLElement).style.display = '';
      }
    }

    // Handle mask/clipPath visibility
    const defsVisibility = (store.get('defsVisibility') as Record<string, boolean>) || {};
    for (const el of layersGroup.querySelectorAll('[data-layer-name]')) {
      const htmlEl = el as HTMLElement;
      // Check mask attribute
      const maskAttr = htmlEl.getAttribute('mask') || htmlEl.dataset.origMask;
      if (maskAttr) {
        const match = maskAttr.match(/url\(#(.+?)\)/);
        if (match) {
          const maskId = match[1];
          if (defsVisibility[`mask:${maskId}`] === false) {
            if (htmlEl.getAttribute('mask')) {
              htmlEl.dataset.origMask = htmlEl.getAttribute('mask')!;
              htmlEl.removeAttribute('mask');
            }
          } else if (htmlEl.dataset.origMask) {
            htmlEl.setAttribute('mask', htmlEl.dataset.origMask);
            delete htmlEl.dataset.origMask;
          }
        }
      }
      // Check clip-path attribute
      const clipAttr = htmlEl.getAttribute('clip-path') || htmlEl.dataset.origClipPath;
      if (clipAttr) {
        const match = clipAttr.match(/url\(#(.+?)\)/);
        if (match) {
          const clipId = match[1];
          if (defsVisibility[`clip-path:${clipId}`] === false) {
            if (htmlEl.getAttribute('clip-path')) {
              htmlEl.dataset.origClipPath = htmlEl.getAttribute('clip-path')!;
              htmlEl.removeAttribute('clip-path');
            }
          } else if (htmlEl.dataset.origClipPath) {
            htmlEl.setAttribute('clip-path', htmlEl.dataset.origClipPath);
            delete htmlEl.dataset.origClipPath;
          }
        }
      }
    }
  }

  clear(): void {
    if (this.previewPath) this.previewPath.setAttribute('d', '');
    const layersGroup = this._iframeDoc?.getElementById('preview-layers');
    if (layersGroup) layersGroup.innerHTML = '';
    store.set('pathData', '');
    const navPaths = this.shadowRoot!.querySelector('#navigator-paths');
    if (navPaths) navPaths.innerHTML = '';
    store.update({ zoomLevel: 1, panX: 0, panY: 0 });
    this.updateViewBox();
  }

  showLoading(): void {
    (this.shadowRoot!.querySelector('#loading-overlay') as HTMLElement).style.display = 'flex';
  }

  hideLoading(): void {
    (this.shadowRoot!.querySelector('#loading-overlay') as HTMLElement).style.display = 'none';
  }

  // Zoom/Pan methods
  updateViewBox(): void {
    const width = store.get('width') as number;
    const height = store.get('height') as number;
    const originX = (store.get('viewBoxOriginX') as number) ?? 0;
    const originY = (store.get('viewBoxOriginY') as number) ?? 0;
    const zoomLevel = store.get('zoomLevel') as number;
    let panX = store.get('panX') as number;
    let panY = store.get('panY') as number;

    const viewWidth = width / zoomLevel;
    const viewHeight = height / zoomLevel;

    // Clamp pan values; center canvas when zoomed out below 50%.
    // panX/panY are offsets relative to the source viewBox origin.
    if (zoomLevel < 0.5) {
      panX = -(viewWidth - width) / 2;
      panY = -(viewHeight - height) / 2;
    } else {
      const marginX = viewWidth / 3;
      const marginY = viewHeight / 3;
      const minPanX = Math.min(0, width - viewWidth) - marginX;
      const maxPanX = Math.max(0, width - viewWidth) + marginX;
      const minPanY = Math.min(0, height - viewHeight) - marginY;
      const maxPanY = Math.max(0, height - viewHeight) + marginY;
      panX = Math.max(minPanX, Math.min(panX, maxPanX));
      panY = Math.max(minPanY, Math.min(panY, maxPanY));
    }

    // Update store with clamped values
    store.update({ panX, panY });

    if (this.preview) this.preview.setAttribute('viewBox', `${originX + panX} ${originY + panY} ${viewWidth} ${viewHeight}`);

    // Update zoom level display
    const zoomDisplay = this.shadowRoot!.querySelector('#zoom-level') as HTMLInputElement | null;
    if (zoomDisplay) {
      zoomDisplay.value = `${Math.round(zoomLevel * 100)}%`;
    }

    this.updateNavigatorViewport();
    this.previewContainer.classList.toggle('can-pan', zoomLevel >= 0.5);
    // Mirror cursor state into the iframe document so panning shows the
    // grabbing cursor inside the iframe too.
    if (this._iframeDoc) {
      this._iframeDoc.body.classList.toggle('can-pan', zoomLevel >= 0.5);
    }
  }

  adjustPanForZoom(oldZoom: number, newZoom: number): void {
    const width = store.get('width') as number;
    const height = store.get('height') as number;
    const panX = store.get('panX') as number;
    const panY = store.get('panY') as number;

    const oldViewWidth = width / oldZoom;
    const oldViewHeight = height / oldZoom;
    const centerX = panX + oldViewWidth / 2;
    const centerY = panY + oldViewHeight / 2;

    const newViewWidth = width / newZoom;
    const newViewHeight = height / newZoom;

    store.update({
      panX: centerX - newViewWidth / 2,
      panY: centerY - newViewHeight / 2,
    });
  }

  zoomIn(): void {
    const oldZoom = store.get('zoomLevel') as number;
    const newZoom = Math.min(this.MAX_ZOOM, oldZoom * this.ZOOM_STEP);
    this.adjustPanForZoom(oldZoom, newZoom);
    store.set('zoomLevel', newZoom);
    this.updateViewBox();
  }

  zoomOut(): void {
    const oldZoom = store.get('zoomLevel') as number;
    const newZoom = Math.max(this.MIN_ZOOM, oldZoom / this.ZOOM_STEP);
    this.adjustPanForZoom(oldZoom, newZoom);
    store.set('zoomLevel', newZoom);
    this.updateViewBox();
  }

  zoomFit(): void {
    store.update({ zoomLevel: 1, panX: 0, panY: 0 });
    this.updateViewBox();
  }

  // Pan handling
  startPan(e: MouseEvent): void {
    if ((store.get('zoomLevel') as number) < 0.5) return;
    this.isPanning = true;
    this.panStartX = e.clientX;
    this.panStartY = e.clientY;
    this.previewContainer.classList.add('panning');
    if (this._iframeDoc) this._iframeDoc.body.classList.add('panning');
    e.preventDefault();
  }

  doPan(e: MouseEvent): void {
    if (!this.isPanning) return;
    if (!this.preview) return;

    const ctm = this.preview.getScreenCTM();
    if (!ctm) return;

    const dx = (this.panStartX - e.clientX) / ctm.a;
    const dy = (this.panStartY - e.clientY) / ctm.d;

    store.update({
      panX: (store.get('panX') as number) + dx,
      panY: (store.get('panY') as number) + dy,
    });

    this.panStartX = e.clientX;
    this.panStartY = e.clientY;

    this.updateViewBox();
  }

  endPan(): void {
    this.isPanning = false;
    this.previewContainer.classList.remove('panning');
    if (this._iframeDoc) this._iframeDoc.body.classList.remove('panning');
  }

  // Navigator methods
  updateNavigatorViewport(): void {
    const width = store.get('width') as number;
    const height = store.get('height') as number;
    const zoomLevel = store.get('zoomLevel') as number;
    const panX = store.get('panX') as number;
    const panY = store.get('panY') as number;

    const viewWidth = width / zoomLevel;
    const viewHeight = height / zoomLevel;

    const viewport = this.shadowRoot!.querySelector('#navigator-viewport') as SVGRectElement;
    viewport.setAttribute('x', String(panX));
    viewport.setAttribute('y', String(panY));
    viewport.setAttribute('width', String(viewWidth));
    viewport.setAttribute('height', String(viewHeight));
  }

  updateNavigatorContent(): void {
    const navGroup = this.shadowRoot!.querySelector('#navigator-paths') as SVGGElement;
    const navBg = this.shadowRoot!.querySelector('#navigator-bg') as SVGRectElement;
    const navSvg = this.shadowRoot!.querySelector('#navigator-svg') as SVGSVGElement;
    if (!navGroup || !navBg || !navSvg) return;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    // Clear existing navigator content
    navGroup.innerHTML = '';

    // Build per-layer paths in the navigator. The source content lives in
    // the sandboxed iframe document; same-origin sandbox lets us read it
    // directly. Cloned attributes are written into the navigator SVG which
    // remains in shadow DOM (non-user content).
    const layersGroup = this._iframeDoc?.getElementById('preview-layers');
    const visibleElements = layersGroup
      ? Array.from(layersGroup.querySelectorAll('path, text, g')).filter((el) => {
          let node = el as HTMLElement | null;
          while (node && node !== layersGroup) {
            if (node.style.display === 'none') return false;
            node = node.parentElement;
          }
          return true;
        })
      : [];

    // Only process leaf elements (path/text), skip <g> containers
    const leafElements = visibleElements.filter((el) => el.tagName === 'path' || el.tagName === 'text');

    // Compute minimum stroke-width that remains visible at navigator scale.
    // The navigator is 120×120 CSS px; strokes in SVG-coordinate units get scaled
    // down by Math.min(120/w, 120/h)*0.9, so sub-pixel dots (e.g. particle/attractor
    // artwork) vanish.  Setting a floor of 1/scale keeps them at ~1 CSS px.
    const canvasW = store.get('width') as number;
    const canvasH = store.get('height') as number;
    const navScale = Math.min(120 / canvasW, 120 / canvasH) * 0.9;
    const minNavStroke = 1 / navScale;

    if (leafElements.length > 0) {
      for (const el of leafElements) {
        if (el.tagName === 'path') {
          const navPath = document.createElementNS(SVG_NS, 'path');
          navPath.setAttribute('d', el.getAttribute('d') || '');
          navPath.setAttribute('stroke', el.getAttribute('stroke') || DEFAULT_STROKE);
          navPath.setAttribute(
            'stroke-width',
            String(Math.max(parseFloat(el.getAttribute('stroke-width') || '') || DEFAULT_STROKE_WIDTH, minNavStroke)),
          );
          navPath.setAttribute('fill', el.getAttribute('fill') || 'none');
          // Accumulate transforms from ancestor <g> elements
          const transforms: string[] = [];
          let ancestor = el.parentElement;
          while (ancestor && ancestor !== layersGroup) {
            const t = ancestor.getAttribute('transform');
            if (t) transforms.unshift(t);
            ancestor = ancestor.parentElement;
          }
          const ownTransform = el.getAttribute('transform');
          if (ownTransform) transforms.push(ownTransform);
          if (transforms.length > 0) navPath.setAttribute('transform', transforms.join(' '));

          for (const attr of [
            'stroke-dasharray',
            'stroke-linecap',
            'stroke-linejoin',
            'stroke-opacity',
            'fill-opacity',
            'opacity',
            'fill-rule',
          ]) {
            const val = el.getAttribute(attr);
            if (val) navPath.setAttribute(attr, val);
          }
          navGroup.appendChild(navPath);
        } else if (el.tagName === 'text') {
          // The source <text> lives in the iframe document; importNode brings
          // it into the shadow-DOM document (same-origin sandbox makes this
          // legal). cloneNode + appendChild would also work in most browsers
          // but importNode is the spec-correct cross-document path.
          const navText = document.importNode(el, true) as unknown as SVGTextElement;
          navGroup.appendChild(navText);
        }
      }
    } else {
      // Fallback: single preview-path
      const d = this.previewPath.getAttribute('d') || '';
      if (d) {
        const navPath = document.createElementNS(SVG_NS, 'path');
        navPath.setAttribute('d', d);
        navPath.setAttribute('stroke', DEFAULT_STROKE);
        navPath.setAttribute('stroke-width', String(Math.max(DEFAULT_STROKE_WIDTH, minNavStroke)));
        navPath.setAttribute('fill', 'none');
        navGroup.appendChild(navPath);
      }
    }

    const width = store.get('width') as number;
    const height = store.get('height') as number;

    const navWidth = 120;
    const navHeight = 120;
    const scale = Math.min(navWidth / width, navHeight / height) * 0.9;
    const offsetX = (navWidth - width * scale) / 2;
    const offsetY = (navHeight - height * scale) / 2;

    navSvg.setAttribute(
      'viewBox',
      `${-offsetX / scale} ${-offsetY / scale} ${navWidth / scale} ${navHeight / scale}`,
    );
    navBg.setAttribute('fill', store.get('background') as string);
    navBg.setAttribute('x', '0');
    navBg.setAttribute('y', '0');
    navBg.setAttribute('width', String(width));
    navBg.setAttribute('height', String(height));

    this.updateNavigatorViewport();
  }

  screenToNavigatorSVG(clientX: number, clientY: number): { x: number; y: number } {
    const navSvg = this.shadowRoot!.querySelector('#navigator-svg') as SVGSVGElement;
    const pt = navSvg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPt = pt.matrixTransform(navSvg.getScreenCTM()!.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }

  navigatorMouseDown(e: MouseEvent): void {
    e.preventDefault();
    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);
    const width = store.get('width') as number;
    const height = store.get('height') as number;
    const zoomLevel = store.get('zoomLevel') as number;
    const panX = store.get('panX') as number;
    const panY = store.get('panY') as number;

    const viewWidth = width / zoomLevel;
    const viewHeight = height / zoomLevel;
    const inViewport = svgX >= panX && svgX <= panX + viewWidth && svgY >= panY && svgY <= panY + viewHeight;

    if (inViewport) {
      this.isNavigatorDragging = true;
      this.navDragStartX = svgX;
      this.navDragStartY = svgY;
      this.navDragStartPanX = panX;
      this.navDragStartPanY = panY;
    } else {
      store.update({
        panX: svgX - viewWidth / 2,
        panY: svgY - viewHeight / 2,
      });
      this.updateViewBox();
    }
  }

  navigatorMouseMove(e: MouseEvent): void {
    if (!this.isNavigatorDragging) return;

    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);

    store.update({
      panX: this.navDragStartPanX + (svgX - this.navDragStartX),
      panY: this.navDragStartPanY + (svgY - this.navDragStartY),
    });

    this.updateViewBox();
  }

  navigatorMouseUp(): void {
    this.isNavigatorDragging = false;
  }

  navigatorDoubleClick(e: MouseEvent): void {
    e.preventDefault();
    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);
    const width = store.get('width') as number;
    const height = store.get('height') as number;
    const zoomLevel = store.get('zoomLevel') as number;

    const viewWidth = width / zoomLevel;
    const viewHeight = height / zoomLevel;

    store.update({
      panX: svgX - viewWidth / 2,
      panY: svgY - viewHeight / 2,
    });

    this.updateViewBox();
  }

  updateSvgStyles(): void {
    const state = store.getAll() as Record<string, unknown>;

    // Iframe may not be ready on the first store-subscription tick; bail
    // safely. _setupIframe re-invokes updateSvgStyles once the document is
    // reachable.
    if (!this._iframeDoc) return;

    if (this.preview) {
      this.preview.setAttribute('width', String(state.width));
      this.preview.setAttribute('height', String(state.height));
    }

    this.updateViewBox();

    if (this.previewPath) {
      this.previewPath.setAttribute('stroke', DEFAULT_STROKE);
      this.previewPath.setAttribute('stroke-width', String(DEFAULT_STROKE_WIDTH));
      this.previewPath.setAttribute('fill', 'none');
    }

    // Update layer paths that don't have per-layer styles
    const layersGroup = this._iframeDoc.getElementById('preview-layers');
    if (layersGroup) {
      for (const path of layersGroup.querySelectorAll('path')) {
        if (!(path as unknown as HTMLElement).dataset.hasLayerStroke) {
          path.setAttribute('stroke', DEFAULT_STROKE);
        }
        if (!(path as unknown as HTMLElement).dataset.hasLayerStrokeWidth) {
          path.setAttribute('stroke-width', String(DEFAULT_STROKE_WIDTH));
        }
      }
    }

    const previewBg = this._iframeDoc.getElementById('preview-bg') as unknown as SVGRectElement | null;
    if (previewBg) {
      previewBg.setAttribute('fill', state.background as string);
      previewBg.setAttribute('x', String((state.viewBoxOriginX as number) ?? 0));
      previewBg.setAttribute('y', String((state.viewBoxOriginY as number) ?? 0));
      previewBg.setAttribute('width', String(state.width));
      previewBg.setAttribute('height', String(state.height));
    }

    // Grid (also lives inside the iframe document)
    const gridPattern = this._iframeDoc.getElementById('grid-pattern') as unknown as SVGPatternElement | null;
    const gridPath = this._iframeDoc.getElementById('grid-path') as unknown as SVGPathElement | null;
    const previewGrid = this._iframeDoc.getElementById('preview-grid') as unknown as SVGRectElement | null;

    if (gridPattern && gridPath && previewGrid) {
      gridPattern.setAttribute('width', String(state.gridSize));
      gridPattern.setAttribute('height', String(state.gridSize));
      gridPath.setAttribute('d', `M ${state.gridSize} 0 L 0 0 0 ${state.gridSize}`);
      gridPath.setAttribute('stroke', state.gridColor as string);
      previewGrid.style.display = state.gridEnabled ? 'block' : 'none';
      previewGrid.setAttribute('x', String((state.viewBoxOriginX as number) ?? 0));
      previewGrid.setAttribute('y', String((state.viewBoxOriginY as number) ?? 0));
      previewGrid.setAttribute('width', String(state.width));
      previewGrid.setAttribute('height', String(state.height));
    }

    this.updateNavigatorContent();
  }

  setupEventListeners(): void {
    // Zoom controls
    this.shadowRoot!.querySelector('#zoom-in')!.addEventListener('click', () => this.zoomIn());
    this.shadowRoot!.querySelector('#zoom-out')!.addEventListener('click', () => this.zoomOut());
    this.shadowRoot!.querySelector('#zoom-fit')!.addEventListener('click', () => this.zoomFit());

    // Zoom level input
    const zoomInput = this.shadowRoot!.querySelector('#zoom-level') as HTMLInputElement;
    zoomInput.addEventListener('change', (e: Event) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      if (!isNaN(value) && value >= this.MIN_ZOOM * 100 && value <= this.MAX_ZOOM * 100) {
        const oldZoom = store.get('zoomLevel') as number;
        const newZoom = value / 100;
        this.adjustPanForZoom(oldZoom, newZoom);
        store.set('zoomLevel', newZoom);
        this.updateViewBox();
      } else {
        (e.target as HTMLInputElement).value = `${Math.round((store.get('zoomLevel') as number) * 100)}%`;
      }
    });

    zoomInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const step = e.shiftKey ? 0.25 : 0.05;
        const direction = e.key === 'ArrowUp' ? 1 : -1;

        const oldZoom = store.get('zoomLevel') as number;
        const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, oldZoom + step * direction));
        this.adjustPanForZoom(oldZoom, newZoom);
        store.set('zoomLevel', newZoom);
        this.updateViewBox();
      }
    });

    // Pan and wheel-zoom listeners live on the iframe document (see
    // _setupIframeEventListeners), since mouse events inside the iframe do
    // not bubble to the parent. Document-level listeners are still required
    // to capture mousemove / mouseup that travel outside the iframe (e.g.
    // when the user drags past the iframe boundary).
    document.addEventListener('mousemove', (e: MouseEvent) => this.doPan(e));
    document.addEventListener('mouseup', () => this.endPan());

    // Navigator
    const navSvg = this.shadowRoot!.querySelector('#navigator-svg') as SVGSVGElement;
    navSvg.addEventListener('mousedown', (e: MouseEvent) => this.navigatorMouseDown(e));
    navSvg.addEventListener('dblclick', (e: MouseEvent) => this.navigatorDoubleClick(e));
    document.addEventListener('mousemove', (e: MouseEvent) => this.navigatorMouseMove(e));
    document.addEventListener('mouseup', () => this.navigatorMouseUp());

    // Inspector toggle
    this.shadowRoot!.querySelector('#inspector-open-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggle-inspector', { bubbles: true, composed: true }));
    });
  }

  render(): void {
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          background: var(--bg-primary, #f8f9fa);
          min-width: 0;
          overflow: auto;
          position: relative;
        }

        @media (max-width: 800px) {
          :host {
            min-height: 250px;
            padding: 1rem;
          }
        }

        #preview-container {
          position: relative;
          width: 100%;
          flex: 1;
          min-height: 0;
          border-radius: var(--radius-lg, 12px);
          overflow: hidden;
          box-shadow: var(--shadow-lg);
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

        #preview-container.can-pan {
          cursor: grab;
        }

        #preview-container.panning {
          cursor: grabbing;
        }

        /* Navigator */
        #zoom-navigator {
          position: absolute;
          top: 1rem;
          left: 1rem;
          width: 120px;
          height: 120px;
          background: var(--bg-elevated, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-lg, 12px);
          box-shadow: var(--shadow-lg);
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
          bottom: 1rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--bg-elevated, #ffffff);
          padding: 0.5rem 0.75rem;
          border-radius: var(--radius-lg, 12px);
          border: 1px solid var(--border-color, #e2e8f0);
          box-shadow: var(--shadow-lg);
          z-index: 10;
        }

        #zoom-controls button {
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
          font-family: inherit;
          font-size: 0.875rem;
          transition: all var(--transition-base, 0.15s ease);
        }

        #zoom-controls button:hover {
          background: var(--hover-bg, rgba(0, 0, 0, 0.04));
          border-color: var(--accent-color, #10b981);
          color: var(--accent-color, #10b981);
        }

        #zoom-in,
        #zoom-out {
          font-size: 1.25rem;
          font-weight: 400;
          line-height: 0;
        }

        #zoom-fit {
          font-size: 0.8125rem;
          font-weight: 500;
        }

        #zoom-level {
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
          transition: all var(--transition-base, 0.15s ease);
        }

        #zoom-level:focus {
          outline: none;
          border-color: var(--accent-color, #10b981);
          box-shadow: 0 0 0 3px var(--focus-ring, rgba(16, 185, 129, 0.4));
        }

        #loading-overlay {
          display: none;
          position: absolute;
          inset: 0;
          align-items: center;
          justify-content: center;
          background: var(--bg-primary, #f8f9fa);
          border-radius: var(--radius-lg, 12px);
          z-index: 5;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border-color, #e2e8f0);
          border-top-color: var(--accent-color, #10b981);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        #inspector-open-btn {
          position: absolute;
          top: 1rem;
          right: 1rem;
          width: 32px;
          height: 32px;
          padding: 0;
          display: grid;
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

        #inspector-open-btn:hover {
          border-color: var(--accent-color, #10b981);
          color: var(--accent-color, #10b981);
          background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
        }

        #inspector-open-btn svg {
          width: 16px;
          height: 16px;
        }

        ${fullscreenStyles(120, 1)}
      </style>

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

      <div id="preview-container">
        <!-- The sandboxed iframe is created programmatically in _setupIframe
             so srcdoc is set before insertion (avoids the about:blank phase
             warning). See playground/utils/preview-iframe.ts. -->
        <div id="loading-overlay">
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;
  }
}

customElements.define('svg-preview-pane', SvgPreviewPane);
