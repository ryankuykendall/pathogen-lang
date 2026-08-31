// SVG Preview pane with zoom/pan controls and navigator

import type {
  CompileResult,
  FilterOutput,
  GradientOutput,
  LayerOutput,
  MarkerOutput,
} from '../../src/evaluator/types.js';
import type { VNode } from '../../src/render/index.js';
// Type-only (erased by the esbuild transpiler). The controller is loaded at
// runtime via the dist/pan-zoom.global.js script (window.PathogenPanZoom).
import type { PanZoomController, PanZoomView } from '../../dist/pan-zoom';
import { store } from '../state/store.js';
import { decorateConicGradientsWithCanvasFallback } from '../utils/decorate-conic-gradients.js';
import { attachFullscreenBehavior, fullscreenButtonHTML, fullscreenStyles } from '../utils/fullscreen-toggle.js';
import { bootstrapPreviewIframe } from '../utils/preview-iframe.js';
import { usesRandomValues } from '../utils/uses-random.js';
import type { FontBinaryEntry } from '../services/font-loader.js';
import { fontBinariesToCss } from '../services/font-loader.js';
import { perfSpan } from '../utils/perf-marks.js';

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

const REFRESH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;

const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

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
  fontBinaries?: FontBinaryEntry[];
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
  // Shared pan/zoom controller (transform-during-gesture → bake-on-idle). Owns
  // the viewBox/transform; this component mirrors its state into the store and
  // keeps the navigator/zoom chrome in sync. Created once the iframe SVG exists.
  private panZoom: PanZoomController | null = null;

  // Guards the store mirror: true while we're writing the controller's view INTO
  // the store (onChange), so the [zoomLevel,panX,panY] subscription doesn't treat
  // our own echo as an external write and feed it back into the controller.
  private _panZoomEcho = false;

  // Timer for the "⌘ + scroll to zoom" hint shown on un-modified wheel.
  private _scrollHintTimer: ReturnType<typeof setTimeout> | undefined;

  // Navigator drag state
  private isNavigatorDragging = false;

  private navDragStartX = 0;

  private navDragStartY = 0;

  private navDragStartPanX = 0;

  private navDragStartPanY = 0;

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
    // The pane can (re)mount after a compile has already populated the store
    // (workspace switches), so the classes can't rely on the subscriptions alone.
    this._applyUsesRandom();
    this._applyInspectorOpen();
  }

  disconnectedCallback(): void {
    if (this._cleanupFullscreen) this._cleanupFullscreen();
    this.panZoom?.destroy();
    this.panZoom = null;
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
   * Create the shared pan/zoom controller once the iframe SVG is reachable. The
   * controller attaches its own wheel/pointer/touch listeners to the iframe
   * document (mouse events inside the iframe do not bubble to the parent; the
   * same-origin sandbox makes this reach legal). We add only the grab-cursor
   * class toggles here.
   */
  private _setupIframeEventListeners(doc: Document): void {
    if (!this.preview) return;
    this.panZoom?.destroy();
    this.panZoom = new window.PathogenPanZoom.PanZoomController({
      svg: this.preview,
      eventTarget: doc,
      mode: 'transform',
      canvas: this._panZoomCanvas(),
      view: {
        zoom: store.get('zoomLevel') as number,
        panX: store.get('panX') as number,
        panY: store.get('panY') as number,
      },
      onChange: (v) => this._onPanZoomChange(v),
      options: {
        // Zoom range/step come from the shared DEFAULTS (10%–2000%).
        wheelDampening: 0.002,
        // Require Ctrl/Cmd for wheel-zoom (consistent with blog/website embeds).
        requireModifierForWheel: true,
      },
    });

    // Hand the shared zoom pill its controller + hover container.
    const pill = this.shadowRoot!.querySelector('pathogen-zoom-pill');
    if (pill) {
      pill.controller = this.panZoom;
      pill.fadeTarget = this.previewContainer;
    }

    // Un-modified wheel: the controller ignores it; show the zoom hint.
    const scrollHint = this.shadowRoot!.querySelector('#scroll-hint');
    if (scrollHint) {
      const span = scrollHint.querySelector('span');
      if (span) {
        const isMac = navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac');
        span.textContent = isMac ? '⌘ + scroll to zoom' : 'Ctrl + scroll to zoom';
      }
      doc.addEventListener(
        'wheel',
        (e: WheelEvent) => {
          if (e.ctrlKey || e.metaKey) return; // controller handles modified wheel
          scrollHint.classList.add('visible');
          clearTimeout(this._scrollHintTimer);
          this._scrollHintTimer = setTimeout(() => scrollHint.classList.remove('visible'), 800);
        },
        { passive: true },
      );
    }

    // Grab-cursor feedback while a gesture is active inside the iframe.
    doc.addEventListener('pointerdown', () => {
      if ((store.get('zoomLevel') as number) >= 0.5) {
        this.previewContainer.classList.add('panning');
        doc.body.classList.add('panning');
      }
    });
    const clearGrab = () => {
      this.previewContainer.classList.remove('panning');
      doc.body.classList.remove('panning');
    };
    doc.addEventListener('pointerup', clearGrab);
    doc.addEventListener('pointercancel', clearGrab);
  }

  /** Current canvas dims from the store (origin + size of the compiled SVG). */
  private _panZoomCanvas(): { originX: number; originY: number; width: number; height: number } {
    return {
      originX: (store.get('viewBoxOriginX') as number) ?? 0,
      originY: (store.get('viewBoxOriginY') as number) ?? 0,
      width: store.get('width') as number,
      height: store.get('height') as number,
    };
  }

  /** Mirror a controller view-change into the store + zoom chrome (echo-guarded). */
  private _onPanZoomChange(v: PanZoomView): void {
    this._panZoomEcho = true;
    store.update({ zoomLevel: v.zoom, panX: v.panX, panY: v.panY });
    this._panZoomEcho = false;
    this._refreshZoomChrome(v.zoom);
  }

  /** Update the zoom % display, navigator viewport rect, and can-pan classes. */
  private _refreshZoomChrome(zoomLevel: number): void {
    const pill = this.shadowRoot!.querySelector('pathogen-zoom-pill');
    if (pill) pill.zoom = zoomLevel;
    this.updateNavigatorViewport();
    this.previewContainer.classList.toggle('can-pan', zoomLevel >= 0.5);
    if (this._iframeDoc) this._iframeDoc.body.classList.toggle('can-pan', zoomLevel >= 0.5);
  }

  subscribeToStore(): void {
    // Content-affecting keys run the full (heavy) updateSvgStyles, which resets
    // path styles, bg, grid and rebuilds the navigator minimap. zoomLevel/panX/
    // panY are deliberately NOT here: pan/zoom is owned by the PanZoomController
    // (cheap transform during gestures), and gets its own external-write-only
    // subscription below. Routing pan/zoom through the heavy path would rebuild
    // the navigator and re-style every path each frame — pure waste.
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
        'pathData',
      ],
      () => {
        this.updateSvgStyles();
      },
    );
    // zoomLevel/panX/panY are owned by the pan/zoom controller. This
    // subscription handles only EXTERNAL writes — applyURLState() (shared-link
    // restore) writes these keys directly. We skip our own echo (onChange
    // mirroring the controller's view into the store) via _panZoomEcho, so the
    // controller is driven only by genuinely-external changes (no feedback loop).
    store.subscribe(['zoomLevel', 'panX', 'panY'], () => {
      if (this._panZoomEcho || !this.panZoom) return;
      this.panZoom.setView(
        {
          zoom: store.get('zoomLevel') as number,
          panX: store.get('panX') as number,
          panY: store.get('panY') as number,
        },
        { emit: false },
      );
      this._refreshZoomChrome(store.get('zoomLevel') as number);
    });
    store.subscribe('inspectorOpen', () => {
      this._applyInspectorOpen();
    });
    // Gates the fullscreen refresh button (:host(.fullscreen.uses-random)).
    store.subscribe('calledStdlibFunctions', () => {
      this._applyUsesRandom();
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

  /**
   * Maintain a `<style id="pathogen-fonts">` element in the iframe's <head>
   * containing @font-face declarations for every font binary the compiler
   * worker resolved. Without this, `<text font-family="…">` inside the
   * iframe falls back to the browser default (Times New Roman) because the
   * iframe CSP forbids loading fonts from the network and the parent
   * document's loaded fonts don't cross the iframe boundary.
   *
   * Called every compile with the current set of binaries; an empty list
   * clears prior rules so removed fonts don't linger.
   */
  private _updateIframeFonts(binaries: FontBinaryEntry[]): void {
    if (!this._iframeDoc) return;
    const head = this._iframeDoc.head;
    if (!head) return;
    let styleEl = this._iframeDoc.getElementById('pathogen-fonts') as HTMLStyleElement | null;
    if (binaries.length === 0) {
      if (styleEl) styleEl.textContent = '';
      return;
    }
    if (!styleEl) {
      styleEl = this._iframeDoc.createElement('style');
      styleEl.id = 'pathogen-fonts';
      head.appendChild(styleEl);
    }
    styleEl.textContent = perfSpan('iframe-fonts-css', () => fontBinariesToCss(binaries));
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
          '[data-fragment-layer], [data-mask-def], [data-clippath-def], [data-gradient-def], [data-pattern-def], [data-marker-def], [data-filter-def]',
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
        perfSpan('defs-build-mount', () => {
          const defsVNodes = window.PathogenLang.buildDefs(
            {
              masks: defsData.masks ?? [],
              clipPaths: defsData.clipPaths ?? [],
              gradients: (defsData.gradients ?? []) as GradientOutput[],
              patterns: defsData.patterns ?? [],
              markers: (defsData.markers ?? []) as MarkerOutput[],
              filters: defsData.filters ?? [],
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
        });
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

      // Inject @font-face declarations as inline data URIs into the iframe's
      // <head>. The iframe CSP is `font-src data:` — external font requests
      // (Google Fonts) are blocked, so the binaries the compiler worker
      // already fetched for `PathBlock.fromGlyph()` are reused here to make
      // `<text font-family="…">` resolve correctly inside the sandbox.
      this._updateIframeFonts(defsData.fontBinaries ?? []);

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
      perfSpan('layer-build-mount', () => {
        for (const layer of layers) {
          if (layer.type === 'fragment') {
            this._insertFragmentLayer(layer, defsEl, layersGroup, SVG_NS);
            continue;
          }
          const vnode: VNode = window.PathogenLang.buildSingleLayer(layer as unknown as LayerOutput, layerBuildOptions);
          window.PathogenLang.mountInto(layersGroup, vnode);
        }
      });

      // Hide the single preview-path when using layers group
      if (this.previewPath) this.previewPath.setAttribute('d', '');
    } else if (this.previewPath) {
      // Fallback: single path
      this.previewPath.setAttribute('d', defaultData);
    }

    // Force synchronous layout calculation
    perfSpan('getbbox-reflow-loop', () => {
      try {
        const paths = layersGroup?.querySelectorAll('path') || [this.previewPath];
        for (const p of paths) {
          p.getBBox();
        }
      } catch (e) {
        // getBBox can throw if path is empty or invalid
      }
    });

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
      // Explicit false only: layers absent from the visibility map are
      // VISIBLE by default (`!visibility[name]` would hide everything on a
      // fresh workspace, where the map is {}).
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
        const match = /url\(#(.+?)\)/.exec(maskAttr);
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
        const match = /url\(#(.+?)\)/.exec(clipAttr);
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
    if (this.panZoom) this.panZoom.zoomToFit();
    else store.update({ zoomLevel: 1, panX: 0, panY: 0 });
  }

  /**
   * Mark the current render as stale (compilation failed, so the pane is
   * still showing the last good result). The artwork stays visible for
   * context but is dimmed with a badge so it can't masquerade as the
   * current program's output — a stale preview with stale injected fonts
   * previously read as "my change worked" when it hadn't compiled at all.
   */
  setStale(stale: boolean): void {
    this.previewContainer?.classList.toggle('stale', stale);
  }

  showLoading(): void {
    (this.shadowRoot!.querySelector('#loading-overlay') as HTMLElement).style.display = 'flex';
  }

  hideLoading(): void {
    (this.shadowRoot!.querySelector('#loading-overlay') as HTMLElement).style.display = 'none';
  }

  // Zoom buttons live in <pathogen-zoom-pill>, which talks to the controller
  // directly. zoomFit survives as public API for clear().
  zoomFit(): void {
    this.panZoom?.zoomToFit();
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

    const navViewBox = `${-offsetX / scale} ${-offsetY / scale} ${navWidth / scale} ${navHeight / scale}`;
    navSvg.setAttribute('viewBox', navViewBox);
    // The overlay (viewport rect) must share the content SVG's viewBox so the
    // rect's canvas-unit coordinates line up with the rendered minimap.
    const navOverlay = this.shadowRoot!.querySelector('#navigator-overlay');
    if (navOverlay) navOverlay.setAttribute('viewBox', navViewBox);
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
      // Click outside the viewport rect → recenter there (discrete jump).
      this.panZoom?.setView({ panX: svgX - viewWidth / 2, panY: svgY - viewHeight / 2 }, { emit: true });
    }
  }

  navigatorMouseMove(e: MouseEvent): void {
    if (!this.isNavigatorDragging) return;

    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);

    // Continuous drag → drive() (transform session + idle bake, like input).
    this.panZoom?.drive({
      panX: this.navDragStartPanX + (svgX - this.navDragStartX),
      panY: this.navDragStartPanY + (svgY - this.navDragStartY),
    });
  }

  navigatorMouseUp(): void {
    this.isNavigatorDragging = false;
    this.panZoom?.endGesture();
  }

  navigatorDoubleClick(e: MouseEvent): void {
    e.preventDefault();
    const { x: svgX, y: svgY } = this.screenToNavigatorSVG(e.clientX, e.clientY);
    const width = store.get('width') as number;
    const height = store.get('height') as number;
    const zoomLevel = store.get('zoomLevel') as number;

    const viewWidth = width / zoomLevel;
    const viewHeight = height / zoomLevel;

    this.panZoom?.setView({ panX: svgX - viewWidth / 2, panY: svgY - viewHeight / 2 }, { emit: true });
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

    // Canvas size/origin may have changed (new compile). Re-apply the viewBox
    // through the controller and refresh the zoom chrome.
    if (this.panZoom) {
      this.panZoom.setCanvas(this._panZoomCanvas());
      this._refreshZoomChrome(store.get('zoomLevel') as number);
    }

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
    // Zoom buttons + editable % input live inside <pathogen-zoom-pill>,
    // which calls the controller directly (wired in _setupIframeEventListeners).

    // Pan/wheel/touch listeners live on the iframe document (the controller
    // attaches them there — mouse events inside the iframe don't bubble to the
    // parent). A parent-document pointerup ends any gesture whose release lands
    // outside the iframe, so a fast drag past the boundary can't get stuck.
    document.addEventListener('pointerup', () => this.panZoom?.endGesture());
    document.addEventListener('mouseup', () => this.panZoom?.endGesture());

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

    // Fullscreen-only chrome: export + refresh. Both dispatch the same events
    // the breadcrumb buttons do; workspace-view's document listeners handle them.
    this.shadowRoot!.querySelector('#export-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('open-export', { bubbles: true, composed: true }));
    });
    this.shadowRoot!.querySelector('#refresh-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('refresh-preview', { bubbles: true, composed: true }));
    });
  }

  private _applyUsesRandom(): void {
    const calledStdlib = (store.get('calledStdlibFunctions') || []) as string[];
    this.classList.toggle('uses-random', usesRandomValues(calledStdlib));
  }

  private _applyInspectorOpen(): void {
    const open = store.get('inspectorOpen') as boolean;
    const btn = this.shadowRoot!.querySelector('#inspector-open-btn') as HTMLElement | null;
    if (btn) btn.style.display = open ? 'none' : '';
    // In fullscreen the inspector becomes a fixed 280px right-edge overlay at
    // z-index 10000 (inspector-panel.css .fullscreen-overlay) which would cover
    // #chrome-right; the .inspector-open class shifts the column clear of it.
    this.classList.toggle('inspector-open', open);
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

        /* Stale state: compilation failed, so the pane still shows the last
           good render. Dim it and show a badge so it can't be mistaken for
           the current program's output. */
        #preview-container.stale #preview-frame {
          opacity: 0.45;
          filter: grayscale(0.35);
          transition: opacity 0.15s ease, filter 0.15s ease;
        }
        #stale-badge {
          display: none;
          position: absolute;
          top: 0.75rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 15;
          pointer-events: none;
          color: var(--text-primary, #1a1a2e);
          background: var(--bg-elevated, rgba(255, 255, 255, 0.92));
          border: 1px solid var(--border-color, #d0d0e0);
          border-radius: var(--radius-md, 8px);
          box-shadow: var(--shadow-sm);
          padding: 0.3rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          white-space: nowrap;
        }
        #preview-container.stale #stale-badge {
          display: block;
        }

        #preview-container.panning {
          cursor: grabbing;
        }

        /* Shown briefly when the user scrolls without the zoom modifier. */
        #scroll-hint {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.4);
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

        /* The content SVG (heavy: holds every path) and the viewport-rect
           overlay are STACKED, not nested. Moving the viewport rect each pan
           frame would otherwise invalidate and re-rasterize the whole content
           SVG (its paths can carry tens of MB of path data). With the rect in a
           separate overlay, panning only repaints the cheap overlay. */
        #navigator-svg,
        #navigator-overlay {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        #navigator-svg {
          /* Promote the heavy content SVG to its own compositor layer so the
             overlay's per-frame rect repaint doesn't re-rasterize these paths.
             Without this, both SVGs share one layer and the split above is moot. */
          transform: translateZ(0);
          backface-visibility: hidden;
        }
        #navigator-overlay {
          pointer-events: none; /* drag detection stays on #navigator-svg below */
        }

        #navigator-viewport {
          cursor: move;
          fill: var(--accent-subtle, rgba(16, 185, 129, 0.15));
        }

        /* Zoom control is the shared <pathogen-zoom-pill> (pan-zoom bundle);
         * it self-positions bottom-center and handles its own hover-fade.
         * Outer author rule beats the pill's :host opacity — always visible
         * in fullscreen, where there's no surrounding UI to defer to. */
        :host(.fullscreen) pathogen-zoom-pill {
          opacity: 1;
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

        /* Top-right chrome column — positions the stack once so buttons can
           show/hide (inspector hides while the inspector is open; export and
           refresh appear only in fullscreen) without leaving gaps. */
        #chrome-right {
          position: absolute;
          top: 1rem;
          right: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          z-index: 10;
          transition: right 0.3s ease;
        }

        /* In fullscreen the open inspector is a fixed 280px right-edge overlay
           at z-index 10000 (inspector-panel.css .fullscreen-overlay), which
           outranks the pane (9999) and would cover the column — shift it clear.
           The transition matches the overlay's 0.3s slide-in. */
        :host(.fullscreen.inspector-open) #chrome-right {
          right: calc(280px + 1rem);
        }

        #inspector-open-btn,
        #export-btn,
        #refresh-btn {
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
          transition: all var(--transition-base, 0.15s ease);
        }

        /* Fallback literals mirror theme.css light values (see zoom-pill.ts:51
           re: the old chrome's stale #10b981 green fallbacks). */
        #inspector-open-btn:hover,
        #export-btn:hover,
        #refresh-btn:hover {
          border-color: var(--accent-color, #c0518e);
          color: var(--accent-color, #c0518e);
          background: var(--accent-subtle, rgba(192, 81, 142, 0.1));
        }

        #inspector-open-btn svg,
        #export-btn svg,
        #refresh-btn svg {
          width: 16px;
          height: 16px;
        }

        /* Export/Refresh exist only in fullscreen — the breadcrumb bar provides
           them in normal mode but sits under the fullscreen pane (z-index 9999).
           Refresh additionally requires a program that calls random/randomRange
           (.uses-random, toggled from the calledStdlibFunctions subscription). */
        #export-btn,
        #refresh-btn {
          display: none;
        }

        :host(.fullscreen) #export-btn {
          display: grid;
        }

        :host(.fullscreen.uses-random) #refresh-btn {
          display: grid;
        }

        ${fullscreenStyles(120, 1)}
      </style>

      <div id="zoom-navigator">
        <svg id="navigator-svg">
          <rect id="navigator-bg" width="100%" height="100%"></rect>
          <g id="navigator-paths"></g>
        </svg>
        <svg id="navigator-overlay">
          <rect id="navigator-viewport" fill="none" stroke="var(--accent-color, #10b981)" stroke-width="1" vector-effect="non-scaling-stroke"></rect>
        </svg>
      </div>

      ${fullscreenButtonHTML()}

      <div id="chrome-right">
        <button id="inspector-open-btn" title="Toggle inspector">${LAYERS_ICON}</button>
        <button id="export-btn" title="Export as SVG, PNG, or PDF">${DOWNLOAD_ICON}</button>
        <button id="refresh-btn" title="Generate new random values">${REFRESH_ICON}</button>
      </div>

      <pathogen-zoom-pill></pathogen-zoom-pill>

      <div id="preview-container">
        <!-- The sandboxed iframe is created programmatically in _setupIframe
             so srcdoc is set before insertion (avoids the about:blank phase
             warning). See playground/utils/preview-iframe.ts. -->
        <div id="scroll-hint"><span></span></div>
        <div id="stale-badge">Stale preview — fix errors to update</div>
        <div id="loading-overlay">
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;
  }
}

customElements.define('svg-preview-pane', SvgPreviewPane);
