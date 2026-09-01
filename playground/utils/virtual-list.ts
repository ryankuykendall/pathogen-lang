// Windowed (virtualized) rendering for fixed-height row lists.
//
// The inspector's layers/palette panels can reach tens of thousands of rows
// on layer-heavy programs; building them all costs seconds of main-thread
// parse/style/layout per compile. A VirtualList renders only the rows that
// intersect the scroller's viewport (plus overscan), positioned inside a
// full-height sizer so the scrollbar geometry is identical to a fully
// rendered list.
//
// The scroll container is pluggable: in the embedded inspector the shared
// `.inspector` shell scrolls all three panels, while standalone panels
// scroll their own list element (the constructor default). Row heights are
// per-row constants supplied by the caller — they must match the rendered
// CSS heights exactly or rows drift out of alignment with the scrollbar.

export interface VirtualRow {
  /** Rendered row height in px — must match the row's CSS height. */
  h: number;
}

export interface WindowSpec {
  /** First rendered row index (inclusive). */
  start: number;
  /** One past the last rendered row index (exclusive). */
  end: number;
  /** Y offset of the rendered slice within the sizer, in px. */
  topPx: number;
  /** Total height of all rows, in px. */
  totalPx: number;
}

/**
 * When the scroller has no measurable height (jsdom, or a display:none /
 * mid-transition panel), window this many px from the top instead of
 * rendering nothing. Keeps zero-layout test environments rendering a
 * deterministic prefix of the list.
 */
export const DEFAULT_VIEWPORT_PX = 600;

/** Prefix-sum offsets: offsets[i] is the top of row i; offsets[n] the total height. */
export function buildOffsets(rows: ArrayLike<VirtualRow>): Float64Array {
  const offsets = new Float64Array(rows.length + 1);
  for (let i = 0; i < rows.length; i++) {
    offsets[i + 1] = offsets[i] + rows[i].h;
  }
  return offsets;
}

/** Smallest index j with offsets[j] > x (j in [0, offsets.length]). */
function firstGreater(offsets: Float64Array, x: number): number {
  let lo = 0;
  let hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] > x) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Compute the row window intersecting the viewport. `listTop` is the sizer's
 * y-offset within the scroller's content (0 when the list scrolls itself).
 */
export function computeWindow(
  offsets: Float64Array,
  scrollTop: number,
  listTop: number,
  viewportH: number,
  overscanPx: number,
): WindowSpec {
  const n = offsets.length - 1;
  const totalPx = n >= 0 ? offsets[n] : 0;
  if (n <= 0) return { start: 0, end: 0, topPx: 0, totalPx };

  const lo = scrollTop - listTop - overscanPx;
  const hi = scrollTop - listTop + viewportH + overscanPx;

  // Row i spans [offsets[i], offsets[i+1]); visible iff bottom > lo and top < hi.
  let start = firstGreater(offsets, lo) - 1;
  if (start < 0) start = 0;
  if (start > n) start = n;
  // Exclusive end: first row whose top >= hi (the ε makes > behave as >=).
  let end = firstGreater(offsets, hi - 1e-9);
  if (end > n) end = n;
  if (end < start) end = start;
  return { start, end, topPx: offsets[start], totalPx };
}

/**
 * Owns the sizer/slice DOM inside a list element and re-renders the visible
 * slice on scroll (rAF-throttled) and on data change. Rows are rendered by
 * the caller's renderSlice as a single HTML string — event delegation and
 * escaping stay the caller's responsibility, exactly as with a full render.
 */
export class VirtualList<T extends VirtualRow> {
  private _list: HTMLElement;

  private _renderSlice: (rows: T[], start: number, end: number) => string;

  private _overscanPx: number;

  private _rows: T[] = [];

  private _offsets: Float64Array = new Float64Array(1);

  private _scroller: HTMLElement | null = null;

  private _onScroll: (() => void) | null = null;

  private _resizeObserver: ResizeObserver | null = null;

  private _rafId = 0;

  private _sizer: HTMLElement | null = null;

  private _slice: HTMLElement | null = null;

  private _start = -1;

  private _end = -1;

  constructor(list: HTMLElement, renderSlice: (rows: T[], start: number, end: number) => string, overscanPx = 400) {
    this._list = list;
    this._renderSlice = renderSlice;
    this._overscanPx = overscanPx;
    this.setScroller(null);
  }

  /** Element whose scroll drives the window. `null` = the list scrolls itself. */
  setScroller(el: HTMLElement | null): void {
    const scroller = el ?? this._list;
    if (scroller === this._scroller) return;
    this._detachScroll();
    this._scroller = scroller;
    this._onScroll = (): void => this._scheduleRefresh();
    scroller.addEventListener('scroll', this._onScroll, { passive: true });
    // A taller viewport must widen the window without waiting for a scroll
    // (window resize, fullscreen entry, mobile-sheet expansion). Refresh
    // synchronously rather than through the rAF throttle: resizes are
    // low-frequency, and the slice render never changes the scroller's own
    // size (the sizer height is fixed by setRows), so there is no
    // observer-loop risk. Guarded — jsdom has no ResizeObserver.
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        if (this._sizer) this.refresh();
      });
      this._resizeObserver.observe(scroller);
    }
    if (this._rows.length) this.refresh();
  }

  /** Replace the row model and re-render the current window. */
  setRows(rows: T[]): void {
    this._rows = rows;
    this._offsets = buildOffsets(rows);
    this._start = -1;
    this._end = -1;
    this._ensureStructure();
    this._sizer!.style.height = `${this._offsets[rows.length]}px`;
    this._renderWindow();
  }

  /**
   * Drop DOM references so the caller can own list.innerHTML (empty states).
   * The next setRows rebuilds the sizer/slice structure.
   */
  reset(): void {
    this._sizer = null;
    this._slice = null;
    this._start = -1;
    this._end = -1;
    this._rows = [];
    this._offsets = new Float64Array(1);
  }

  /** Synchronously recompute the window and re-render if it moved. */
  refresh(): void {
    if (!this._sizer) return;
    this._renderWindow();
  }

  /** Force the next refresh/setRows to re-render even if the window is unchanged. */
  invalidate(): void {
    this._start = -1;
    this._end = -1;
  }

  get windowStart(): number {
    return this._start;
  }

  get windowEnd(): number {
    return this._end;
  }

  destroy(): void {
    this._detachScroll();
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this._rafId) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    this.reset();
  }

  private _detachScroll(): void {
    if (this._onScroll) {
      this._scroller?.removeEventListener('scroll', this._onScroll);
    }
    this._onScroll = null;
  }

  private _scheduleRefresh(): void {
    if (this._rafId) return;
    if (typeof requestAnimationFrame === 'function') {
      this._rafId = requestAnimationFrame(() => {
        this._rafId = 0;
        if (this._sizer) this._renderWindow();
      });
    } else {
      this.refresh();
    }
  }

  private _ensureStructure(): void {
    if (this._sizer?.parentElement === this._list) return;
    this._list.innerHTML =
      '<div class="vl-sizer" style="position: relative; overflow: hidden">' +
      '<div class="vl-slice" style="position: absolute; top: 0; left: 0; right: 0"></div>' +
      '</div>';
    this._sizer = this._list.querySelector('.vl-sizer') as HTMLElement;
    this._slice = this._list.querySelector('.vl-slice') as HTMLElement;
    this._start = -1;
    this._end = -1;
  }

  private _renderWindow(): void {
    const scroller = this._scroller ?? this._list;
    const viewportH = scroller.clientHeight || DEFAULT_VIEWPORT_PX;
    const listTop = this._measureListTop(scroller);
    const win = computeWindow(this._offsets, scroller.scrollTop, listTop, viewportH, this._overscanPx);
    if (win.start === this._start && win.end === this._end) return;
    this._start = win.start;
    this._end = win.end;
    this._slice!.style.transform = `translateY(${win.topPx}px)`;
    this._slice!.innerHTML = this._renderSlice(this._rows, win.start, win.end);
  }

  private _measureListTop(scroller: HTMLElement): number {
    if (scroller === this._list || !this._sizer) return 0;
    // Viewport-relative rect difference + current scroll = the sizer's fixed
    // offset within the scroller's content (the slice is transformed, the
    // sizer is not, so this is stable across window moves).
    const sizerTop = this._sizer.getBoundingClientRect().top;
    const scrollerTop = scroller.getBoundingClientRect().top;
    return sizerTop - scrollerTop + scroller.scrollTop;
  }
}
