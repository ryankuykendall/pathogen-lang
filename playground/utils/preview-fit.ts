// The preview's fit margin. The pane has no card and no padding, so zoomed-in
// art runs to the pane's edges; at Fit, the drawing keeps some room around it
// instead of touching the edges under the buttons.
//
// The pan/zoom controller fits its canvas exactly, so the preview hands it the
// drawing's canvas padded on every side. The background and grid still cover
// only the drawing's own viewBox. Exports, snapshots and thumbnails set their
// own viewBox and never see the margin, and Copy SVG frames its copy with
// drawingSvgMarkup below.

export interface FitCanvas {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** The margin on each side, as a share of the canvas's longer side. */
export const FIT_MARGIN = 0.06;

export function withFitMargin(canvas: FitCanvas, margin: number = FIT_MARGIN): FitCanvas {
  const pad = Math.max(canvas.width, canvas.height) * margin;
  return {
    originX: canvas.originX - pad,
    originY: canvas.originY - pad,
    width: canvas.width + 2 * pad,
    height: canvas.height + 2 * pad,
  };
}

/**
 * The preview's <svg> as markup, framed on the drawing alone: the program's
 * viewBox, not the fit margin or the current zoom and pan. The live preview
 * is left as it is.
 */
export function drawingSvgMarkup(svg: Element, canvas: FitCanvas): string {
  const copy = svg.cloneNode(true) as Element;
  copy.setAttribute('viewBox', `${canvas.originX} ${canvas.originY} ${canvas.width} ${canvas.height}`);
  return copy.outerHTML;
}
