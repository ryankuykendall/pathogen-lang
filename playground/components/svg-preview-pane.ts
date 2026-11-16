// SVG Preview pane with zoom/pan controls. No card and no minimap: the pane
// runs to its edges, and the fullscreen button takes the top-left corner.

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
import {
  MOVE_MS,
  SETTLE_MS,
  gapMove,
  isHeavyDrawing,
  rememberRedraw,
  sameGap,
  sameSize,
} from '../utils/preview-gap.js';
import type { PreviewGap } from '../utils/preview-gap.js';
import { isNarrow, onNarrowChange } from '../utils/narrow.js';
import { withFitMargin } from '../utils/preview-fit.js';
import type { FitCanvas } from '../utils/preview-fit.js';
import { usesRandomValues } from '../utils/uses-random.js';
import { compilationStatusStyles, compilationStatusView } from '../utils/compilation-status.js';
import type { FontBinaryEntry } from '../services/font-loader.js';
import { fontBinariesToCss } from '../services/font-loader.js';
import { perfSpan } from '../utils/perf-marks.js';
import { getUserId } from '../services/user-id.js';
import './shared/snapshot-tray.js';
import type { SnapshotTray } from './shared/snapshot-tray.js';

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

const CAMERA_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`;

const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

/** Frames watched after a redraw for the longest gap between them (see _timeRedraw). */
const REDRAW_FRAMES = 10;

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
  // keeps the zoom chrome in sync. Created once the iframe SVG exists.
  private panZoom: PanZoomController | null = null;

  // Guards the store mirror: true while we're writing the controller's view INTO
  // the store (onChange), so the [zoomLevel,panX,panY] subscription doesn't treat
  // our own echo as an external write and feed it back into the controller.
  private _panZoomEcho = false;

  // Timer for the "⌘ + scroll to zoom" hint shown on un-modified wheel.
  private _scrollHintTimer: ReturnType<typeof setTimeout> | undefined;

  // Fullscreen toggle
  private _cleanupFullscreen: (() => void) | null = null;

  private _storeUnsubscribes: (() => void)[] = [];

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

  // In the workspace (option 1, project-docs/preview-raster-perf/option-1-build-plan.md), the
  // pane is the gap the other panes leave, and its iframe is held at the whole workspace's
  // width, still on screen, so opening or closing a pane never resizes the drawing. The
  // drawing's box (the iframe's body) is the gap; once the panes stop, it moves there.
  private _stageObserver: ResizeObserver | null = null;

  private _narrowUndo: (() => void) | null = null;

  private _settleTimer: ReturnType<typeof setTimeout> | undefined;

  private _moveTimer: ReturnType<typeof setTimeout> | undefined;

  /** The gap the drawing was last drawn in, in the iframe's coordinates; null: the whole iframe. */
  private _drawnGap: PreviewGap | null = null;

  /** The iframe's size when the drawing was last drawn. */
  private _drawnFrame: { width: number; height: number } | null = null;

  /** The drawing shows as a moved picture, to be drawn in the gap at its next redraw. */
  private _picture = false;

  /** How long the page went without a frame after each recent redraw (ms; the latest last). */
  private _recentRedraws: number[] = [];

  private _redrawToken = 0;

  /** Compiles drawn, and what the last timed redraw drew: a hook that redrew nothing isn't timed. */
  private _renders = 0;

  private _timedAs = '';

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
    this._applyCompilationStatus();
    this._applySnapshotChrome();
    // The pane's size and the stage's are watched on every frame of a pane's slide.
    if (typeof ResizeObserver !== 'undefined') {
      this._stageObserver = new ResizeObserver(this._onStageResize);
      this._stageObserver.observe(this.previewContainer);
      if (this.parentElement) this._stageObserver.observe(this.parentElement);
    }
    this._narrowUndo = onNarrowChange(this._onStageResize);
    this.addEventListener('fullscreen-change', this._onFullscreenChange);
  }

  disconnectedCallback(): void {
    if (this._cleanupFullscreen) this._cleanupFullscreen();
    for (const unsubscribe of this._storeUnsubscribes) unsubscribe();
    this._storeUnsubscribes = [];
    this.panZoom?.destroy();
    this.panZoom = null;
    this._stageObserver?.disconnect();
    this._stageObserver = null;
    this._narrowUndo?.();
    this._narrowUndo = null;
    this.removeEventListener('fullscreen-change', this._onFullscreenChange);
    clearTimeout(this._settleTimer);
    clearTimeout(this._moveTimer);
    this._moveTimer = undefined;
  }

  private get _frame(): HTMLIFrameElement | null {
    return this.shadowRoot!.querySelector<HTMLIFrameElement>('#preview-frame');
  }

  /**
   * The box the drawing is held to: the pane's parent when it's marked `data-preview-stage`
   * (playground-main, the workspace's row of panes). None below 800 px, where the panes
   * stack, nor in fullscreen.
   */
  private _stage(): HTMLElement | null {
    const parent = this.parentElement;
    if (!parent?.hasAttribute('data-preview-stage')) return null;
    if (isNarrow() || this.classList.contains('fullscreen')) return null;
    return parent;
  }

  /** The part of the iframe the pane shows, in the iframe's coordinates. Null without a stage. */
  private _gap(): PreviewGap | null {
    const stage = this._stage();
    if (!stage) return null;
    const box = this.previewContainer.getBoundingClientRect();
    return { left: box.left - stage.getBoundingClientRect().left, width: box.width };
  }

  /**
   * Hold the iframe at the stage's width, still on screen, while the pane's edges move:
   * the pane (overflow hidden) shows the gap. Without a stage, it fills the pane again.
   * Runs on every frame of a pane's slide, before paint.
   */
  private _holdFrame(): void {
    const frame = this._frame;
    if (!frame) return;
    const stage = this._stage();
    if (!stage) {
      for (const prop of ['position', 'top', 'left', 'width']) frame.style.removeProperty(prop);
      return;
    }
    const box = this.previewContainer.getBoundingClientRect();
    const held = stage.getBoundingClientRect();
    frame.style.position = 'absolute';
    frame.style.top = '0';
    frame.style.left = `${held.left - box.left}px`;
    frame.style.width = `${held.width}px`;
  }

  private readonly _onStageResize = (): void => {
    this._holdFrame();
    // A move under way was for the gap as it was: its end would draw the drawing in a
    // gap that's still changing. The transform stays; the next placement retargets it.
    clearTimeout(this._moveTimer);
    this._moveTimer = undefined;
    clearTimeout(this._settleTimer);
    this._settleTimer = setTimeout(() => this._placeDrawing(), SETTLE_MS);
  };

  /**
   * Draw in the gap because the drawing is being redrawn anyway (a compile, the store
   * driving the view): not during a pan or zoom gesture, whose box the controller has
   * measured; the gesture's end (onBake) draws it in the gap then.
   */
  private _fitUnlessGesture(): void {
    if (this.panZoom?.isGestureActive()) return;
    this._fitToGap(false);
    this._timeRedraw();
  }

  /** In or out of fullscreen the iframe changes size, so the drawing is redrawn anyway: in its new box at once. */
  private readonly _onFullscreenChange = (e: Event): void => {
    if (e.target !== this) return;
    this._holdFrame();
    this._fitToGap(true);
  };

  /**
   * Once the panes have stopped: move the drawing to the gap's middle as a picture (a
   * transform on the iframe's layer, from the pixels it has), then, for a light drawing,
   * redraw it there. A heavy drawing keeps the picture, never enlarged, until it's redrawn
   * anyway. A first placement, or an iframe of another size (which is redrawn anyway), is
   * drawn in the gap at once.
   */
  private _placeDrawing(): void {
    const frame = this._frame;
    const svg = this.preview;
    if (!frame || !svg) return;
    const gap = this._gap();
    const size = { width: frame.clientWidth, height: frame.clientHeight };
    if (!gap || !this._drawnGap || !sameSize(this._drawnFrame, size)) {
      this._fitToGap(true);
      return;
    }
    const heavy = isHeavyDrawing(this._recentRedraws);
    const viewBox = svg.viewBox?.baseVal;
    const move = gapMove(
      this._drawnGap,
      gap,
      size.height,
      { width: viewBox?.width ?? 0, height: viewBox?.height ?? 0 },
      !heavy,
    );
    const still = Math.abs(move.dx) < 0.5 && Math.abs(move.scale - 1) < 0.001;
    if (still && !this._picture) return;
    frame.style.transformOrigin = `${move.originX}px 50%`;
    frame.style.transition = `transform ${MOVE_MS}ms ease`;
    frame.style.transform = still ? '' : `translateX(${move.dx}px) scale(${move.scale})`;
    this._picture = !still;
    clearTimeout(this._moveTimer);
    this._moveTimer = setTimeout(() => {
      this._moveTimer = undefined;
      frame.style.removeProperty('transition');
      if (this._picture && !heavy) this._fitToGap(true);
    }, MOVE_MS);
  }

  /**
   * Draw the drawing in the gap: the iframe's body takes the gap's span (`svg#preview` fills
   * the body), and any picture transform clears, in one frame. The `svg` element itself gets
   * no style here: export and thumbnails clone it. `timed`: this is the only redraw, so time
   * it; the redraw hooks (a compile, a bake, a zoom step) time their own.
   */
  private _fitToGap(timed: boolean): void {
    clearTimeout(this._moveTimer);
    this._moveTimer = undefined;
    // Held first: a compile can come before the observer's first report.
    this._holdFrame();
    const frame = this._frame;
    const body = this._iframeDoc?.body;
    if (!frame || !body) return;
    const gap = this._gap();
    const size = { width: frame.clientWidth, height: frame.clientHeight };
    const drawn = this._drawnGap;
    const sameBox = gap === null ? drawn === null : drawn !== null && sameGap(gap, drawn);
    const changed = this._picture || !sameBox || !sameSize(this._drawnFrame, size);
    for (const prop of ['transition', 'transform', 'transform-origin']) frame.style.removeProperty(prop);
    this._picture = false;
    if (gap) {
      body.style.position = 'absolute';
      body.style.top = '0';
      body.style.left = `${gap.left}px`;
      body.style.width = `${gap.width}px`;
    } else {
      for (const prop of ['position', 'top', 'left', 'width']) body.style.removeProperty(prop);
    }
    this._drawnGap = gap;
    this._drawnFrame = size;
    if (timed && changed) this._timeRedraw();
  }

  /**
   * How long the page goes without a frame after a redraw: the longest gap between the next
   * few frames. A heavy drawing (thousands of filtered layers) holds frames back while it's
   * rasterized, a frame or two after the change (Chrome starts the next frame before the
   * last one is rasterized). Only a redraw is timed: something the drawing depends on
   * changed (a compile, its viewBox, its box, the iframe's size). Not while the page is
   * hidden, when no frames come.
   */
  private _timeRedraw(): void {
    if (typeof requestAnimationFrame !== 'function' || document.hidden) return;
    const frame = this._frame;
    const drawnAs = [
      this._renders,
      this.preview?.getAttribute('viewBox'),
      JSON.stringify(this._drawnGap),
      frame ? `${frame.clientWidth}x${frame.clientHeight}` : '',
    ].join('|');
    if (drawnAs === this._timedAs) return;
    this._timedAs = drawnAs;
    const token = ++this._redrawToken;
    let last = performance.now();
    let longest = 0;
    let frames = 0;
    const tick = (): void => {
      const at = performance.now();
      longest = Math.max(longest, at - last);
      last = at;
      if (token !== this._redrawToken || document.hidden) return;
      if (++frames < REDRAW_FRAMES) requestAnimationFrame(tick);
      else this._recentRedraws = rememberRedraw(this._recentRedraws, longest);
    };
    requestAnimationFrame(tick);
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
    // A new iframe holds no drawing yet: forget the last one's box, picture and timings.
    this._drawnGap = null;
    this._drawnFrame = null;
    this._picture = false;
    this._timedAs = '';
    this._recentRedraws = [];
    this._redrawToken++;
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
      // A gesture's end redraws the drawing: in the gap, in the same frame.
      onBake: () => {
        this._fitToGap(false);
        this._timeRedraw();
      },
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

  /** The compiled SVG's own origin and size: the program's viewBox. */
  drawingCanvas(): FitCanvas {
    return {
      originX: (store.get('viewBoxOriginX') as number) ?? 0,
      originY: (store.get('viewBoxOriginY') as number) ?? 0,
      width: store.get('width') as number,
      height: store.get('height') as number,
    };
  }

  /**
   * The canvas the controller fits: the drawing's canvas plus the fit margin
   * (utils/preview-fit.ts), so Fit leaves room around the drawing while
   * zoomed-in art runs to the pane's edges.
   */
  private _panZoomCanvas(): FitCanvas {
    return withFitMargin(this.drawingCanvas());
  }

  /** Mirror a controller view-change into the store + zoom chrome (echo-guarded). */
  private _onPanZoomChange(v: PanZoomView): void {
    this._panZoomEcho = true;
    store.update({ zoomLevel: v.zoom, panX: v.panX, panY: v.panY });
    this._panZoomEcho = false;
    this._refreshZoomChrome(v.zoom);
    // A zoom step or Fit redraws the drawing at once: in the gap, in the same frame. During
    // a gesture the drawing moves as a transform, and the gesture's end (onBake) takes over.
    if (this.panZoom && !this.panZoom.isGestureActive()) {
      this._fitToGap(false);
      this._timeRedraw();
    }
  }

  /** Update the zoom % display and the can-pan classes. */
  private _refreshZoomChrome(zoomLevel: number): void {
    const pill = this.shadowRoot!.querySelector('pathogen-zoom-pill');
    if (pill) pill.zoom = zoomLevel;
    this.previewContainer.classList.toggle('can-pan', zoomLevel >= 0.5);
    if (this._iframeDoc) this._iframeDoc.body.classList.toggle('can-pan', zoomLevel >= 0.5);
  }

  subscribeToStore(): void {
    // Every subscription is captured so disconnectedCallback can release it:
    // a detached pane must not keep painting (the compile clock alone notifies
    // once a second for the length of every compile).
    const subscribe: typeof store.subscribe = (keys, callback) => {
      const unsubscribe = store.subscribe(keys, callback);
      this._storeUnsubscribes.push(unsubscribe);
      return unsubscribe;
    };
    // Content-affecting keys run the full (heavy) updateSvgStyles, which resets
    // path styles, bg and grid. zoomLevel/panX/panY are deliberately NOT here:
    // pan/zoom is owned by the PanZoomController (cheap transform during
    // gestures), and gets its own external-write-only subscription below.
    // Routing pan/zoom through the heavy path would re-style every path each
    // frame — pure waste.
    subscribe(
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
    subscribe(['zoomLevel', 'panX', 'panY'], () => {
      if (this._panZoomEcho || !this.panZoom) return;
      this._fitUnlessGesture();
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
    subscribe('inspectorOpen', () => {
      this._applyInspectorOpen();
    });
    // A saved workspace with no program (2d, step 9a): blank, with only the inspector toggle.
    subscribe('noPrograms', () => {
      this.classList.toggle('no-programs', store.get('noPrograms') as boolean);
    });
    this.classList.toggle('no-programs', store.get('noPrograms') as boolean);
    // Gates the fullscreen refresh button (:host(.fullscreen.uses-random)).
    subscribe('calledStdlibFunctions', () => {
      this._applyUsesRandom();
    });
    // Fullscreen snapshot button + tray.
    subscribe(
      [
        'workspaceId',
        'workspaceOwnerId',
        'currentUser',
        'compilationStatus',
        'renderedCode',
        'recentSnapshots',
        'snapshotCount',
      ],
      () => {
        this._applySnapshotChrome();
      },
    );
    // Drives the fullscreen status chip (breadcrumb owns it in normal mode).
    // compilationElapsedMs ticks the "Compiling... MM:SS" clock in place.
    subscribe(['compilationStatus', 'compilationElapsedMs'], () => {
      this._applyCompilationStatus();
    });
    subscribe('layerVisibility', () => {
      this.applyLayerVisibility();
    });
    subscribe('defsVisibility', () => {
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

    return performance.now() - start;
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

    // The drawing is redrawn now anyway: in the gap, in the same frame (the first render
    // too). Not mid-gesture: the gesture's end does it. Timed below, once it's built.
    if (!this.panZoom?.isGestureActive()) this._fitToGap(false);

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
      // The viewBox origin reaches the defs too, so a conic gradient's tile
      // covers `-100 -100 200 200` instead of tiling from (0, 0) (ISSUE-027).
      const originX = (store.get('viewBoxOriginX') as number) || 0;
      const originY = (store.get('viewBoxOriginY') as number) || 0;

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
              originX,
              originY,
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
            { x: originX, y: originY },
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
    // Timed from here: the drawing's raster, not the building of its elements.
    this._renders++;
    this._timeRedraw();

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

    // Below 800 px the program list is a sheet over the whole window (step 9b). The group it sits
    // in is a stacking context at z-index 10, under the editor's panels: raised while it's open.
    const group = this.shadowRoot!.querySelector<HTMLElement>('#bottom-group')!;
    group.addEventListener('program-list-open', () => group.classList.add('list-open'));
    group.addEventListener('program-list-close', () => group.classList.remove('list-open'));

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
    // Snapshot: same event as the breadcrumb's split button; the popover opens
    // to the left of this button.
    const snapshotBtn = this.shadowRoot!.querySelector<HTMLButtonElement>('#snapshot-btn');
    snapshotBtn?.addEventListener('click', () => {
      this.dispatchEvent(
        new CustomEvent('capture-snapshot', {
          bubbles: true,
          composed: true,
          detail: { anchor: snapshotBtn.getBoundingClientRect(), placement: 'left', anchorEl: snapshotBtn },
        }),
      );
    });
    this.shadowRoot!.querySelector('#snapshot-tray')?.addEventListener('snapshot-tray-open-all', () => {
      this.dispatchEvent(new CustomEvent('open-snapshots', { bubbles: true, composed: true }));
    });
    // Cancel beside the fullscreen status chip: same event as the breadcrumb's
    // Cancel; workspace-view's document listener handles it.
    this.shadowRoot!.querySelector('#cancel-compile-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('cancel-compile', { bubbles: true, composed: true }));
    });
  }

  /**
   * Fullscreen snapshot chrome (docs/snapshots.md). Mirrors the breadcrumb's
   * split button rules: shown on the owner's workspaces and scratch buffers,
   * disabled until there's a successful render; the tray lists this visit's
   * captures.
   */
  private _applySnapshotChrome(): void {
    const workspaceId = store.get('workspaceId') as string | null;
    const ownerId = store.get('workspaceOwnerId') as string | null;
    const currentUser = store.get('currentUser') as { id?: string } | null;
    const isOwn = !!workspaceId && !!ownerId && (ownerId === getUserId() || ownerId === currentUser?.id);
    this.classList.toggle('can-snapshot', !workspaceId || isOwn);

    const status = store.get('compilationStatus') as string | null;
    const btn = this.shadowRoot!.querySelector<HTMLButtonElement>('#snapshot-btn');
    if (btn) {
      const busy = status === 'compiling' || status === 'rendering';
      const blocked = busy || status === 'error' || store.get('renderedCode') == null;
      btn.disabled = blocked;
      btn.title = busy
        ? 'Snapshot is available when this render finishes'
        : status === 'error'
          ? 'Fix the error first — a snapshot pairs the image with code that rendered'
          : 'Save this image with the code that drew it';
    }
    const tray = this.shadowRoot!.querySelector('#snapshot-tray') as SnapshotTray | null;
    if (tray) {
      tray.items = (store.get('recentSnapshots') as SnapshotTray['items']) || [];
      tray.total = store.get('snapshotCount') as number | null;
    }
  }

  /** Leave fullscreen if it's on (used before navigating to the snapshots page). */
  exitFullscreen(): void {
    if (!this.classList.contains('fullscreen')) return;
    this.shadowRoot!.querySelector<HTMLButtonElement>('#fullscreen-toggle')?.click();
  }

  private _applyUsesRandom(): void {
    const calledStdlib = (store.get('calledStdlibFunctions') || []) as string[];
    this.classList.toggle('uses-random', usesRandomValues(calledStdlib));
  }

  private _applyCompilationStatus(): void {
    const el = this.shadowRoot!.querySelector('#compilation-status') as HTMLElement | null;
    if (!el) return;
    const status = store.get('compilationStatus') as string | null;
    const { text, className } = compilationStatusView(status, store.get('compilationElapsedMs') as number);
    el.textContent = text;
    el.className = `compilation-status ${className}`;
    // The chip and its Cancel control share one top-center container; the
    // container follows the chip's visibility, the button only shows while
    // the compile is in the worker. Patched in place (this runs on every
    // clock tick) — the pane never re-renders after connectedCallback.
    const chrome = this.shadowRoot!.querySelector('#compilation-chrome') as HTMLElement | null;
    chrome?.classList.toggle('hidden', className === 'hidden');
    const cancelBtn = this.shadowRoot!.querySelector('#cancel-compile-btn') as HTMLButtonElement | null;
    if (cancelBtn) cancelBtn.hidden = status !== 'compiling';
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
          padding: 0;
          background: var(--bg-primary, #f8f9fa);
          min-width: 0;
          overflow: auto;
          position: relative;
        }

        @media (max-width: 800px) {
          :host {
            min-height: 250px;
          }
        }

        /* No card: the preview fills the pane, so zoomed-in art runs to its
           edges. At Fit the drawing keeps a margin (utils/preview-fit.ts). */
        #preview-container {
          position: relative;
          width: 100%;
          flex: 1;
          min-height: 0;
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

        /* Zoom control is the shared <pathogen-zoom-pill> (pan-zoom bundle);
         * it self-positions bottom-center and handles its own hover-fade.
         * Outer author rule beats the pill's :host opacity — always visible
         * in fullscreen, where there's no surrounding UI to defer to. */
        :host(.fullscreen) pathogen-zoom-pill {
          opacity: 1;
        }

        /* The zoom controls and the program chip (2d step 5a; mockup v6
         * screen G), centred together at the bottom. The pill places itself
         * when it's alone; here the group places it. */
        #bottom-group {
          position: absolute;
          bottom: 0.75rem;
          left: 0;
          right: 0;
          z-index: 10;
          box-sizing: border-box;
          padding: 0 0.5rem;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          pointer-events: none;
        }

        #bottom-group pathogen-zoom-pill,
        #bottom-group ::slotted(*) {
          pointer-events: auto;
        }

        /* In a narrow preview the chip gives way (its name shortens), not the pill. */
        #bottom-group ::slotted(*) {
          min-width: 0;
        }

        #bottom-group pathogen-zoom-pill {
          position: static;
          transform: none;
          flex: none;
        }

        /* The program list open as a sheet (step 9b): above the editor, the drawer and their panels. */
        @media (max-width: 800px) {
          #bottom-group.list-open {
            z-index: 200;
          }
        }

        /* A workspace with no program (2d, step 9a; mockup v11, state 6): the
         * preview is blank and keeps only the inspector toggle. The drawing's
         * surface is hidden, not removed, so the iframe and the pan/zoom
         * controller keep their size for the next program. */
        :host(.no-programs) #preview-container {
          visibility: hidden;
        }

        :host(.no-programs) #fullscreen-toggle,
        :host(.no-programs) #bottom-group,
        :host(.no-programs) #export-btn,
        :host(.no-programs) #refresh-btn,
        :host(.no-programs) #snapshot-btn,
        :host(.no-programs) #snapshot-tray,
        :host(.no-programs) #compilation-chrome {
          display: none !important;
        }

        #loading-overlay {
          display: none;
          position: absolute;
          inset: 0;
          align-items: center;
          justify-content: center;
          background: var(--bg-primary, #f8f9fa);
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
        #refresh-btn,
        #snapshot-btn {
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
        }

        /* Opaque hover fill: 0.9 accent tint composited over the solid base.
           The old --accent-subtle wash REPLACED the base at 0.10/0.15 alpha,
           so hovered buttons went ghost-transparent over artwork. Icon flips
           to --accent-contrast for legibility on the fill (light 4.7:1, dark
           8.4:1); see the hover-colors .mw prototype in website/bbwp/.
           Fallback literals mirror theme.css light values. (Older chrome in
           this file still carries a stale #10b981 green fallback — the
           spinner; see zoom-pill.ts:51.) The plain background
           line is the no-color-mix() fallback: without it, dark theme would
           keep the base fill, which equals --accent-contrast — invisible
           icon on hover. */
        #inspector-open-btn:hover,
        #export-btn:hover,
        #refresh-btn:hover,
        #snapshot-btn:hover:not(:disabled) {
          border-color: var(--accent-hover, #b04680);
          color: var(--accent-contrast, #1c1722);
          background: var(--accent-color, #c0518e);
          background: color-mix(in srgb, var(--accent-color, #c0518e) 90%, var(--bg-elevated, #ffffff));
        }

        #inspector-open-btn svg,
        #export-btn svg,
        #refresh-btn svg,
        #snapshot-btn svg {
          width: 16px;
          height: 16px;
        }

        /* Export/Refresh exist only in fullscreen — the breadcrumb bar provides
           them in normal mode but sits under the fullscreen pane (z-index 9999).
           Refresh additionally requires a program that calls random/randomRange
           (.uses-random, toggled from the calledStdlibFunctions subscription). */
        #export-btn,
        #refresh-btn,
        #snapshot-btn {
          display: none;
        }

        :host(.fullscreen) #export-btn {
          display: grid;
        }

        /* Snapshot (docs/snapshots.md): fullscreen only, styled exactly like
           Refresh. .can-snapshot is toggled from the store (own workspace or
           scratch); disabled while there's no successful render to capture. */
        :host(.fullscreen.can-snapshot) #snapshot-btn {
          display: grid;
        }

        #snapshot-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        /* This visit's snapshots, bottom-right, fullscreen only. */
        #snapshot-tray {
          display: none;
          position: absolute;
          right: 1rem;
          bottom: 1rem;
          z-index: 10;
        }

        :host(.fullscreen) #snapshot-tray {
          display: block;
        }

        :host(.fullscreen.uses-random) #refresh-btn {
          display: grid;
        }

        ${fullscreenStyles(0, 1)}
        ${compilationStatusStyles()}

        /* Fullscreen-only status chip + Cancel control, top-center (the
           breadcrumb owns normal mode). Sized/colored by
           compilationStatusStyles(); positioned here. The container follows
           the chip's visibility (class toggled by _applyCompilationStatus). */
        #compilation-chrome {
          display: none;
          position: absolute;
          top: 1rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 15;
          align-items: center;
          gap: 6px;
          pointer-events: none;
          white-space: nowrap;
        }

        :host(.fullscreen) #compilation-chrome:not(.hidden) {
          display: inline-flex;
        }

        #compilation-chrome .cancel-compile-btn {
          pointer-events: auto;
          background: var(--bg-elevated, #fff);
        }

        #compilation-chrome .cancel-compile-btn[hidden] {
          display: none;
        }

        /* When the stale badge occupies top-center (compile errors leave a
           stale preview), drop the chip below it instead of overlapping.
           2rem is a clearance allowance >= the badge's rendered height
           (~1.6rem: 0.75rem text + 0.3rem*2 padding + 1px borders) — revisit
           if #stale-badge's type or padding grows. */
        #preview-container.stale ~ #compilation-chrome {
          top: calc(0.75rem + 2rem + 0.5rem);
        }
      </style>

      ${fullscreenButtonHTML()}

      <div id="chrome-right">
        <button id="inspector-open-btn" title="Toggle inspector">${LAYERS_ICON}</button>
        <button id="export-btn" title="Export as SVG, PNG, or PDF">${DOWNLOAD_ICON}</button>
        <button id="refresh-btn" title="Generate new random values">${REFRESH_ICON}</button>
        <button id="snapshot-btn" title="Save this image with the code that drew it">${CAMERA_ICON}</button>
      </div>

      <snapshot-tray id="snapshot-tray"></snapshot-tray>

      <div id="bottom-group">
        <pathogen-zoom-pill></pathogen-zoom-pill>
        <slot name="program-chip"></slot>
      </div>

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

      <div id="compilation-chrome" class="hidden">
        <span id="compilation-status" class="compilation-status hidden"></span>
        <button id="cancel-compile-btn" class="cancel-compile-btn" aria-label="Cancel compile" title="Stop the running compile" hidden>Cancel</button>
      </div>
    `;
  }
}

customElements.define('svg-preview-pane', SvgPreviewPane);
