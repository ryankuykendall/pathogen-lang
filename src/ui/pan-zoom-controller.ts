/**
 * PanZoomController — the single shared pan/zoom implementation for every
 * Pathogen surface that lets a user pan/zoom an SVG (workspace preview, blog
 * mini-workspace, BBWP, VS Code preview webview, and — math-only — the
 * thumbnail/legend modals).
 *
 * Why it exists: the same viewBox-mutation pan/zoom was duplicated across six
 * surfaces, and mutating `viewBox` re-rasterizes the whole SVG every frame —
 * ~300 ms/frame for a 72.5M-char drawing (measured; see
 * project-docs/pan-zoom-performance/). Driving pan/zoom with a CSS `transform`
 * on a composited layer instead is ~25× cheaper for pan and ~12× for zoom
 * (measured by scripts/perf-transform-probe.ts). This class implements that
 * "transform during the gesture, bake into viewBox on idle" behavior once.
 *
 * Two modes:
 *   - 'transform' (viewers): hold viewBox fixed during a gesture and apply a
 *     CSS transform; on idle, bake the transform into the viewBox (one crisp
 *     re-raster) and clear the transform.
 *   - 'viewbox' (modals): apply pan/zoom directly via setAttribute('viewBox')
 *     every change — same math, no transform — for surfaces whose overlays
 *     aren't SVG children and so can't ride a transform.
 *
 * IMPORTANT (CLI safety): this file is bundled into dist/ which the Node CLI
 * imports. It must perform ZERO DOM access at module top-level — touch the DOM
 * only inside the constructor/methods, after a caller passes real elements.
 *
 * Loop-safety invariant: input drives `onChange` (controller → surface), and
 * external writes go through `setView()` which updates the DOM but does NOT
 * re-emit `onChange`. Surfaces must never feed `onChange` back into `setView`.
 */

export interface PanZoomView {
  zoom: number;
  panX: number;
  panY: number;
}

export interface PanZoomCanvas {
  /** viewBox origin from the compiled SVG (`define ViewBox(originX, originY, …)`). */
  originX: number;
  originY: number;
  /** Canvas size in user units. */
  width: number;
  height: number;
}

export interface PanZoomOptions {
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
  /** Wheel delta → zoom factor dampening (zoom *= 1 + (-deltaY * dampening)). */
  wheelDampening?: number;
  /** Require Ctrl/Cmd held for wheel-zoom (blog embeds, to avoid scroll traps). */
  requireModifierForWheel?: boolean;
  /** Pan clamp margin as a fraction of the view size (default 1/3). */
  clampMargin?: number;
  /** Enable pointer/touch dragging + pinch-zoom (default true). */
  enableTouch?: boolean;
  /** ms of input-idle before a transform-mode gesture bakes into the viewBox. */
  bakeDelayMs?: number;
  /** Below this zoom the canvas is recentered instead of clamped (default 0.5). */
  panDisableBelowZoom?: number;
  /**
   * Transform-mode only: when the live transform translates the layer past this
   * fraction of the viewport, bake mid-gesture and re-anchor the session so the
   * layer re-rasterizes around the new position. Bounds the "blank while panning
   * far when zoomed in" reveal to ~this fraction, at the cost of an occasional
   * mid-drag re-raster. Set to 0 to disable (pure transform; blank fills only on
   * idle-bake). Default 0.5.
   */
  rebaselineThreshold?: number;
}

export interface PanZoomConfig {
  /** The <svg> to drive. May live in another document (e.g. a sandboxed iframe). */
  svg: SVGSVGElement;
  /** Where to attach wheel/pointer listeners (usually the iframe document or container). */
  eventTarget: Document | HTMLElement;
  mode?: 'transform' | 'viewbox';
  canvas?: PanZoomCanvas;
  view?: Partial<PanZoomView>;
  /** Emitted on USER INPUT only (never from setView) so surfaces can mirror state. */
  onChange?: (view: PanZoomView) => void;
  /** Notifies when the gesture's transform has been baked into the viewBox. */
  onBake?: (view: PanZoomView) => void;
  options?: PanZoomOptions;
}

const DEFAULTS: Required<PanZoomOptions> = {
  minZoom: 0.25,
  maxZoom: 10,
  zoomStep: 1.5,
  wheelDampening: 0.002,
  requireModifierForWheel: false,
  clampMargin: 1 / 3,
  enableTouch: true,
  bakeDelayMs: 72,
  panDisableBelowZoom: 0.5,
  rebaselineThreshold: 0.5,
};

// ---------------------------------------------------------------------------
// Pure math (exported for unit testing — no DOM).
// ---------------------------------------------------------------------------

/** Clamp a zoom value to [minZoom, maxZoom]. */
export function clampZoom(zoom: number, opts: Pick<PanZoomOptions, 'minZoom' | 'maxZoom'>): number {
  const min = opts.minZoom ?? DEFAULTS.minZoom;
  const max = opts.maxZoom ?? DEFAULTS.maxZoom;
  return Math.max(min, Math.min(zoom, max));
}

/**
 * Clamp pan so the view stays near the canvas. Below `panDisableBelowZoom` the
 * canvas is recentered; otherwise pan is bounded with a margin. Mirrors the
 * long-standing svg-preview-pane semantics so behavior is unchanged.
 */
export function clampPan(view: PanZoomView, canvas: PanZoomCanvas, opts: PanZoomOptions = {}): { panX: number; panY: number } {
  const margin = opts.clampMargin ?? DEFAULTS.clampMargin;
  const disableBelow = opts.panDisableBelowZoom ?? DEFAULTS.panDisableBelowZoom;
  const viewWidth = canvas.width / view.zoom;
  const viewHeight = canvas.height / view.zoom;

  if (view.zoom < disableBelow) {
    return {
      panX: -(viewWidth - canvas.width) / 2,
      panY: -(viewHeight - canvas.height) / 2,
    };
  }
  const marginX = viewWidth * margin;
  const marginY = viewHeight * margin;
  const minPanX = Math.min(0, canvas.width - viewWidth) - marginX;
  const maxPanX = Math.max(0, canvas.width - viewWidth) + marginX;
  const minPanY = Math.min(0, canvas.height - viewHeight) - marginY;
  const maxPanY = Math.max(0, canvas.height - viewHeight) + marginY;
  return {
    panX: Math.max(minPanX, Math.min(view.panX, maxPanX)),
    panY: Math.max(minPanY, Math.min(view.panY, maxPanY)),
  };
}

/** Recompute pan so the view's center stays fixed across a zoom change. */
export function adjustPanForZoom(view: PanZoomView, newZoom: number, canvas: PanZoomCanvas): { panX: number; panY: number } {
  const oldViewWidth = canvas.width / view.zoom;
  const oldViewHeight = canvas.height / view.zoom;
  const centerX = view.panX + oldViewWidth / 2;
  const centerY = view.panY + oldViewHeight / 2;
  const newViewWidth = canvas.width / newZoom;
  const newViewHeight = canvas.height / newZoom;
  return {
    panX: centerX - newViewWidth / 2,
    panY: centerY - newViewHeight / 2,
  };
}

/** Build the SVG `viewBox` attribute string for a view. */
export function viewToViewBox(view: PanZoomView, canvas: PanZoomCanvas): string {
  const viewWidth = canvas.width / view.zoom;
  const viewHeight = canvas.height / view.zoom;
  return `${canvas.originX + view.panX} ${canvas.originY + view.panY} ${viewWidth} ${viewHeight}`;
}

/**
 * The CSS transform (relative to a baked view) that makes the already-rendered
 * baked viewBox appear as `view`, under preserveAspectRatio="xMidYMid meet".
 *
 * Derivation: both viewBoxes share the canvas aspect ratio, so the meet-scale
 * and centering offset are identical for baked and target — they cancel in the
 * scale and contribute only a (1-s) term to the translate. boxW/boxH are the
 * SVG element's rendered pixel size. Returns translate px + scale factor.
 */
export function computeTransform(
  view: PanZoomView,
  baked: PanZoomView,
  canvas: PanZoomCanvas,
  boxW: number,
  boxH: number,
): { tx: number; ty: number; scale: number } {
  const baseScale = Math.min(boxW / canvas.width, boxH / canvas.height); // px per unit at zoom 1
  const offsetX = (boxW - baseScale * canvas.width) / 2; // letterbox centering (constant in zoom)
  const offsetY = (boxH - baseScale * canvas.height) / 2;
  const s = view.zoom / baked.zoom;
  const tx = offsetX * (1 - s) + baseScale * view.zoom * (baked.panX - view.panX);
  const ty = offsetY * (1 - s) + baseScale * view.zoom * (baked.panY - view.panY);
  return { tx, ty, scale: s };
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class PanZoomController {
  private svg: SVGSVGElement;
  private eventTarget: Document | HTMLElement;
  private mode: 'transform' | 'viewbox';
  private opts: Required<PanZoomOptions>;
  private onChange?: (view: PanZoomView) => void;
  private onBake?: (view: PanZoomView) => void;

  private canvas: PanZoomCanvas;
  private view: PanZoomView = { zoom: 1, panX: 0, panY: 0 };
  /** The view currently written to the `viewBox` attribute (what's rasterized). */
  private renderedView: PanZoomView = { zoom: 1, panX: 0, panY: 0 };

  // Transform-session state (the baked reference the live transform is relative to).
  private sessionActive = false;
  private bakedView: PanZoomView = { zoom: 1, panX: 0, panY: 0 };
  private boxW = 1;
  private boxH = 1;

  // Pointer / pinch state.
  private pointers = new Map<number, { x: number; y: number }>();
  private lastPanX = 0;
  private lastPanY = 0;
  private pinchPrevDist = 0;
  private pinchPrevMid = { x: 0, y: 0 };

  private rafId: number | null = null;
  private bakeTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  // Bound handlers (stable refs for removeEventListener).
  private readonly onWheel: (e: WheelEvent) => void;
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;

  constructor(config: PanZoomConfig) {
    this.svg = config.svg;
    this.eventTarget = config.eventTarget;
    this.mode = config.mode ?? 'transform';
    this.onChange = config.onChange;
    this.onBake = config.onBake;
    this.opts = { ...DEFAULTS, ...(config.options ?? {}) };
    this.canvas = config.canvas ?? { originX: 0, originY: 0, width: 200, height: 200 };
    if (config.view) this.view = { ...this.view, ...config.view };

    this.onWheel = (e) => this.handleWheel(e);
    this.onPointerDown = (e) => this.handlePointerDown(e);
    this.onPointerMove = (e) => this.handlePointerMove(e);
    this.onPointerUp = (e) => this.handlePointerUp(e);

    const t = this.eventTarget as unknown as EventTarget;
    t.addEventListener('wheel', this.onWheel as EventListener, { passive: false });
    if (this.opts.enableTouch) {
      // Stop the browser from consuming touch drags/pinches as scroll/zoom.
      this.svg.style.touchAction = 'none';
      t.addEventListener('pointerdown', this.onPointerDown as EventListener);
      t.addEventListener('pointermove', this.onPointerMove as EventListener);
      t.addEventListener('pointerup', this.onPointerUp as EventListener);
      t.addEventListener('pointercancel', this.onPointerUp as EventListener);
    } else {
      // Fall back to mouse events when pointer/touch is disabled.
      t.addEventListener('mousedown', this.onPointerDown as EventListener);
      t.addEventListener('mousemove', this.onPointerMove as EventListener);
      t.addEventListener('mouseup', this.onPointerUp as EventListener);
    }
    this.applyImmediate(); // render initial view (viewBox)
  }

  // --- Public API -----------------------------------------------------------

  getView(): PanZoomView {
    return { ...this.view };
  }

  /** Update the canvas dims (call when the compiled SVG size changes). */
  setCanvas(canvas: PanZoomCanvas): void {
    this.canvas = canvas;
    this.applyImmediate();
  }

  /**
   * Externally drive the view. Applies to the DOM and bakes any in-flight
   * transform first (crisp result).
   *
   * `emit` controls the loop-safety boundary:
   *   - emit:false (default) — silent. Use for url-state restore and any path
   *     fed FROM onChange, so the controller never echoes back into its surface.
   *   - emit:true — also fires onChange. Use for navigator drag / programmatic
   *     pans that the surface should mirror (store, navigator, zoom display).
   */
  setView(view: Partial<PanZoomView>, opts: { clamp?: boolean; emit?: boolean } = {}): void {
    const next: PanZoomView = {
      zoom: clampZoom(view.zoom ?? this.view.zoom, this.opts),
      panX: view.panX ?? this.view.panX,
      panY: view.panY ?? this.view.panY,
    };
    if (opts.clamp !== false) {
      const c = clampPan(next, this.canvas, this.opts);
      next.panX = c.panX;
      next.panY = c.panY;
    }
    this.view = next;
    this.endSessionAndBake();
    this.applyImmediate();
    if (opts.emit) this.emit();
  }

  zoomTo(newZoomRaw: number, opts: { animateCenter?: boolean } = {}): void {
    const newZoom = clampZoom(newZoomRaw, this.opts);
    if (opts.animateCenter !== false) {
      const adj = adjustPanForZoom(this.view, newZoom, this.canvas);
      this.view = { zoom: newZoom, panX: adj.panX, panY: adj.panY };
    } else {
      this.view = { ...this.view, zoom: newZoom };
    }
    const c = clampPan(this.view, this.canvas, this.opts);
    this.view.panX = c.panX;
    this.view.panY = c.panY;
    this.endSessionAndBake();
    this.applyImmediate();
    this.emit();
  }

  /**
   * Continuously drive the view from an external high-frequency source (e.g.
   * dragging the navigator minimap). Unlike setView, this uses the transform
   * session + idle bake (cheap, like pointer input) and emits onChange.
   */
  drive(view: Partial<PanZoomView>): void {
    this.applyView({
      zoom: clampZoom(view.zoom ?? this.view.zoom, this.opts),
      panX: view.panX ?? this.view.panX,
      panY: view.panY ?? this.view.panY,
    });
  }

  zoomIn(): void {
    this.zoomTo(this.view.zoom * this.opts.zoomStep);
  }
  zoomOut(): void {
    this.zoomTo(this.view.zoom / this.opts.zoomStep);
  }
  zoomToFit(): void {
    this.view = { zoom: 1, panX: 0, panY: 0 };
    this.endSessionAndBake();
    this.applyImmediate();
    this.emit();
  }

  /**
   * End any in-progress drag/pinch and bake. Surfaces whose listeners live on a
   * nested document (sandboxed iframe) call this from a parent-document
   * pointerup/mouseup so a release outside the iframe can't leave a gesture stuck.
   */
  endGesture(): void {
    if (this.pointers.size === 0 && !this.sessionActive) return;
    this.pointers.clear();
    this.pinchPrevDist = 0;
    this.endSessionAndBake();
  }

  destroy(): void {
    this.destroyed = true;
    const t = this.eventTarget as unknown as EventTarget;
    t.removeEventListener('wheel', this.onWheel as EventListener);
    t.removeEventListener('pointerdown', this.onPointerDown as EventListener);
    t.removeEventListener('pointermove', this.onPointerMove as EventListener);
    t.removeEventListener('pointerup', this.onPointerUp as EventListener);
    t.removeEventListener('pointercancel', this.onPointerUp as EventListener);
    t.removeEventListener('mousedown', this.onPointerDown as EventListener);
    t.removeEventListener('mousemove', this.onPointerMove as EventListener);
    t.removeEventListener('mouseup', this.onPointerUp as EventListener);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.bakeTimer !== null) clearTimeout(this.bakeTimer);
    this.clearTransform();
  }

  // --- Input handlers -------------------------------------------------------
  //
  // Mouse and touch are unified through Pointer Events. A normalized id (-1 for
  // the mouse-event fallback) keys the active-pointer map: one pointer = pan,
  // two = pinch-zoom. We track pointers only between down and up, so hover
  // pointermove events (mouse) are ignored.

  private static pid(e: PointerEvent | MouseEvent): number {
    return typeof (e as PointerEvent).pointerId === 'number' ? (e as PointerEvent).pointerId : -1;
  }

  private handleWheel(e: WheelEvent): void {
    if (this.opts.requireModifierForWheel && !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const delta = -e.deltaY * this.opts.wheelDampening;
    const newZoom = clampZoom(this.view.zoom * (1 + delta), this.opts);
    const adj = adjustPanForZoom(this.view, newZoom, this.canvas);
    this.applyView({ zoom: newZoom, panX: adj.panX, panY: adj.panY });
  }

  private handlePointerDown(e: PointerEvent | MouseEvent): void {
    e.preventDefault();
    this.pointers.set(PanZoomController.pid(e), { x: e.clientX, y: e.clientY });
    this.lastPanX = e.clientX;
    this.lastPanY = e.clientY;
    this.measureBox(); // one layout read per gesture; drives px↔unit conversion
    if (this.pointers.size === 2) this.startPinch();
  }

  private handlePointerMove(e: PointerEvent | MouseEvent): void {
    const id = PanZoomController.pid(e);
    if (!this.pointers.has(id)) return; // not an active drag pointer (e.g. hover)
    this.pointers.set(id, { x: e.clientX, y: e.clientY });

    if (this.pointers.size >= 2) {
      this.doPinch();
      return;
    }
    // Single-pointer pan (disabled below the pan threshold, where the canvas is centered).
    if (this.view.zoom < this.opts.panDisableBelowZoom) {
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      return;
    }
    const ppu = this.pxPerUnit();
    const dx = (this.lastPanX - e.clientX) / ppu;
    const dy = (this.lastPanY - e.clientY) / ppu;
    this.lastPanX = e.clientX;
    this.lastPanY = e.clientY;
    this.applyView({ ...this.view, panX: this.view.panX + dx, panY: this.view.panY + dy });
  }

  private handlePointerUp(e: PointerEvent | MouseEvent): void {
    this.pointers.delete(PanZoomController.pid(e));
    if (this.pointers.size < 2) this.pinchPrevDist = 0;
    if (this.pointers.size === 1) {
      // One finger lifted from a pinch — re-anchor the remaining pointer.
      const remaining = this.pointers.values().next().value as { x: number; y: number } | undefined;
      if (remaining) {
        this.lastPanX = remaining.x;
        this.lastPanY = remaining.y;
      }
    }
    if (this.pointers.size === 0) this.scheduleBake();
  }

  /** Measure the SVG's rendered box (px). One layout read per gesture. */
  private measureBox(): void {
    const rect = this.svg.getBoundingClientRect();
    this.boxW = rect.width || this.boxW || 1;
    this.boxH = rect.height || this.boxH || 1;
  }

  /**
   * Screen pixels per canvas unit at the CURRENT zoom. Derived from the box
   * size (not getScreenCTM), so it's correct even during a transform session
   * where the viewBox is held fixed and getScreenCTM would report the baked
   * scale. Uniform under preserveAspectRatio="meet".
   */
  private pxPerUnit(): number {
    const baseScale = Math.min(this.boxW / this.canvas.width, this.boxH / this.canvas.height);
    return baseScale * this.view.zoom;
  }

  /**
   * Commit a new view from user input: clamp, start a transform session if
   * needed, schedule the render + idle-bake, and emit onChange. The shared tail
   * of every input handler.
   */
  private applyView(next: PanZoomView): void {
    this.view = next;
    this.clampInPlace();
    this.beginSessionIfNeeded();
    this.scheduleRender();
    this.scheduleBake();
    this.emit();
  }

  // --- Pinch ----------------------------------------------------------------

  private startPinch(): void {
    const pts = [...this.pointers.values()];
    this.pinchPrevDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    this.pinchPrevMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  private doPinch(): void {
    const pts = [...this.pointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    if (this.pinchPrevDist > 0) {
      const factor = dist / this.pinchPrevDist;
      const newZoom = clampZoom(this.view.zoom * factor, this.opts);
      const adj = adjustPanForZoom(this.view, newZoom, this.canvas);
      const ppu = this.pxPerUnit();
      // Pan to keep the pinch midpoint anchored (in canvas units).
      this.applyView({
        zoom: newZoom,
        panX: adj.panX + (this.pinchPrevMid.x - mid.x) / ppu,
        panY: adj.panY + (this.pinchPrevMid.y - mid.y) / ppu,
      });
    }
    this.pinchPrevDist = dist;
    this.pinchPrevMid = mid;
  }

  // --- Rendering ------------------------------------------------------------

  private clampInPlace(): void {
    const c = clampPan(this.view, this.canvas, this.opts);
    this.view.panX = c.panX;
    this.view.panY = c.panY;
  }

  private emit(): void {
    if (this.onChange) this.onChange({ ...this.view });
  }

  private beginSessionIfNeeded(): void {
    if (this.mode !== 'transform') return;
    if (this.sessionActive) return;
    this.sessionActive = true;
    // The baked reference is what the viewBox currently shows — renderedView,
    // NOT the post-input this.view (which already moved this frame).
    this.bakedView = { ...this.renderedView };
    this.measureBox();
    this.svg.style.transformOrigin = '0 0';
    this.svg.style.willChange = 'transform';
  }

  private scheduleRender(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  private render(): void {
    if (this.destroyed) return;
    if (this.mode === 'transform' && this.sessionActive) {
      const { tx, ty, scale } = computeTransform(this.view, this.bakedView, this.canvas, this.boxW, this.boxH);
      // If we've translated the cached layer past its rasterized margin, bake
      // and re-anchor so the new region rasterizes crisply (bounds the blank).
      const thr = this.opts.rebaselineThreshold;
      if (thr > 0 && (Math.abs(tx) > thr * this.boxW || Math.abs(ty) > thr * this.boxH)) {
        this.rebaseline();
        return;
      }
      this.svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    } else {
      this.applyImmediate();
    }
  }

  /**
   * Bake the current view (crisp re-raster) and immediately re-open a transform
   * session anchored at it, so a long drag stays cheap while the visible region
   * keeps re-rasterizing instead of revealing blank. The mid-drag cost is one
   * re-raster per threshold crossing (vs. one per frame for viewBox panning).
   */
  private rebaseline(): void {
    this.endSessionAndBake();
    this.beginSessionIfNeeded();
    this.scheduleBake(); // ensure idle still bakes/cleans up if the drag stops here
  }

  /** Render the current view directly via viewBox (no transform session). */
  private applyImmediate(): void {
    this.svg.setAttribute('viewBox', viewToViewBox(this.view, this.canvas));
    this.renderedView = { ...this.view };
  }

  private scheduleBake(): void {
    if (this.mode !== 'transform') return;
    if (this.bakeTimer !== null) clearTimeout(this.bakeTimer);
    this.bakeTimer = setTimeout(() => {
      this.bakeTimer = null;
      // Don't bake mid-gesture (pointers still down).
      if (this.pointers.size > 0) {
        this.scheduleBake();
        return;
      }
      this.endSessionAndBake();
    }, this.opts.bakeDelayMs);
  }

  /**
   * Bake the live transform into the viewBox and clear the transform in one
   * synchronous step so the swap is atomic (no flash). No-op if not in a
   * transform session.
   */
  private endSessionAndBake(): void {
    if (this.bakeTimer !== null) {
      clearTimeout(this.bakeTimer);
      this.bakeTimer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (!this.sessionActive) return;
    this.sessionActive = false;
    // Atomic swap: set the equivalent viewBox, then clear the transform. Both
    // land in the same style recalc, so the rendered result is identical before
    // and after — the only change is a crisp re-raster.
    this.applyImmediate();
    this.clearTransform();
    if (this.onBake) this.onBake({ ...this.view });
  }

  private clearTransform(): void {
    this.svg.style.transform = '';
    this.svg.style.willChange = '';
  }
}
