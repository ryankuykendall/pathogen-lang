// The workspace preview's drawing and the gap the panes leave it (option 1, 2026-11-16;
// project-docs/preview-raster-perf/option-1-build-plan.md). The preview's iframe stays the
// full width of the workspace and never changes size, so opening a pane doesn't redraw the
// drawing. Once a pane stops, the drawing moves to the gap's middle as a picture (a
// transform on the iframe's layer, which the browser composites from pixels it has), and
// then it's redrawn there if that's cheap.

/** A horizontal span in the iframe's coordinates: the gap, or the box the drawing was drawn in. */
export interface PreviewGap {
  left: number;
  width: number;
}

/** How long the panes must have been still before the drawing moves (ms). */
export const SETTLE_MS = 80;

/** How long the drawing's move takes (ms). */
export const MOVE_MS = 250;

/**
 * A drawing whose last redraw kept the page from drawing frames for longer than this is
 * heavy (ms): it keeps the moved picture until it's redrawn anyway, by an edit, a pan or a
 * zoom. A light drawing measures one or two frames; kablammo-investigations, 1.5 to 1.9 s.
 */
export const HEAVY_REDRAW_MS = 100;

export function isHeavyRedraw(redrawMs: number): boolean {
  return redrawMs > HEAVY_REDRAW_MS;
}

/**
 * How many recent redraws decide: a drawing is heavy if any of them was. One measurement
 * can miss a raster, and the mistakes cost differently: a heavy drawing taken for light
 * freezes the page when it's redrawn after a pane moves; a light one taken for heavy only
 * keeps its moved picture until the next edit, pan or zoom.
 */
export const REDRAWS_REMEMBERED = 3;

/** The redraw times kept (the latest last), with a new one. */
export function rememberRedraw(recent: readonly number[], redrawMs: number): number[] {
  return [...recent, redrawMs].slice(-REDRAWS_REMEMBERED);
}

export function isHeavyDrawing(recent: readonly number[]): boolean {
  return recent.some(isHeavyRedraw);
}

/** The iframe's size when the drawing was drawn, or none yet, against its size now. */
export function sameSize(
  drawn: { width: number; height: number } | null,
  now: { width: number; height: number },
): boolean {
  return drawn !== null && drawn.width === now.width && drawn.height === now.height;
}

/** Two spans the same to half a pixel. */
export function sameGap(a: PreviewGap, b: PreviewGap): boolean {
  return Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5;
}

/**
 * The scale a viewBox of this size is drawn at in a box of this size, under
 * preserveAspectRatio's default (xMidYMid meet).
 */
export function meetScale(boxWidth: number, boxHeight: number, viewBox: { width: number; height: number }): number {
  if (viewBox.width <= 0 || viewBox.height <= 0) return 1;
  return Math.min(boxWidth / viewBox.width, boxHeight / viewBox.height);
}

/** The iframe's transform that shows a drawing drawn in `drawn` as if it were fitted to `gap`. */
export interface GapMove {
  /** The transform's origin, x, in the iframe's coordinates: the drawn box's center. */
  originX: number;
  /** The translation, x. */
  dx: number;
  scale: number;
}

/**
 * The move from the box the drawing was drawn in to the gap: its center to the gap's
 * center, and the scale its fit changes by. Both boxes are the iframe's height, so the
 * vertical center stays. With `enlarge` false (a heavy drawing, whose picture stays until
 * the next redraw), the picture never grows past the size it was drawn at.
 */
export function gapMove(
  drawn: PreviewGap,
  gap: PreviewGap,
  height: number,
  viewBox: { width: number; height: number },
  enlarge: boolean,
): GapMove {
  const originX = drawn.left + drawn.width / 2;
  const dx = gap.left + gap.width / 2 - originX;
  const before = meetScale(drawn.width, height, viewBox);
  let scale = before > 0 ? meetScale(gap.width, height, viewBox) / before : 1;
  if (!enlarge) scale = Math.min(scale, 1);
  return { originX, dx, scale };
}
