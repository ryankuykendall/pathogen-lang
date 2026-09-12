// Browser-only decorator that fills in missing `href` attributes on the
// `<image>` child of conic-gradient <pattern> VNodes. Used by the preview
// pane before `mountInto`.
//
// The shared renderer emits conic gradients as <pattern><image/></pattern>
// when `useImageGradients` is true, with the <image> href set from the
// GPU-gradient-service cache when available. If no URL exists (both the GPU
// and Canvas 2D paths in the service failed, or the service was skipped),
// this module renders the service's own Canvas 2D fallback at the same
// clamped size and data-URL-encodes the result, and says so in the console.
//
// Lives in `playground/utils/` rather than `src/render/` because Canvas 2D
// and `document.createElement` are browser-only APIs; the shared renderer
// must also work in Node for the CLI.

import { pushNotice, renderConicCanvas2D } from '../gpu/gradient-service.js';
import { MAX_CANVAS_2D_DIM, rasterSize } from '../gpu/raster-size.js';

import type { GradientOutput } from '../../src/evaluator/types';
import type { VNode } from '../../src/render';

/**
 * Walk the defs VNode list and, for each conic-gradient-backed <pattern>
 * whose <image> child has no `href`, compute a Canvas 2D data URL and set
 * it. Mutates in place.
 */
export function decorateConicGradientsWithCanvasFallback(
  defsNodes: VNode[],
  gradients: GradientOutput[],
  width: number,
  height: number,
): void {
  const conicById = new Map<string, GradientOutput>();
  for (const g of gradients) {
    if (g.type === 'conic') conicById.set(g.id, g);
  }
  if (conicById.size === 0) return;

  for (const node of defsNodes) {
    if (node.tag !== 'pattern') continue;
    const id = node.attrs.id;
    const grad = conicById.get(id);
    if (!grad) continue;

    // The pattern should have one <image> child (playground/useImageGradients mode).
    const image = node.children.find((c) => typeof c === 'object' && 'tag' in c && c.tag === 'image');
    if (!image || typeof image === 'string' || !('tag' in image)) continue;
    if (image.attrs.href) continue; // already set (e.g. GPU pre-rendered)

    const dataUrl = renderConicToDataUrl(grad, width, height);
    if (dataUrl) {
      image.attrs.href = dataUrl;
      pushNotice(
        `Gradient '${grad.id}' (conic) was rendered by the last-resort Canvas 2D path at mount time; innerRadius, innerFill and spread are approximated with 1° wedges.`,
      );
    }
  }
}

function renderConicToDataUrl(grad: GradientOutput, w: number, h: number): string | null {
  try {
    return renderConicCanvas2D(grad, w, h, rasterSize(w, h, 2, MAX_CANVAS_2D_DIM));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Conic gradient canvas rendering failed:', e);
    pushNotice(
      `Gradient '${grad.id}' (conic) could not be rasterized by the last-resort Canvas 2D path (${e instanceof Error ? e.message : String(e)}); fills using it will render empty.`,
    );
    return null;
  }
}
