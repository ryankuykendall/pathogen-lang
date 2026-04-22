// Browser-only decorator that fills in missing `href` attributes on the
// `<image>` child of conic-gradient <pattern> VNodes. Used by the preview
// pane before `mountInto`.
//
// The shared renderer emits conic gradients as <pattern><image/></pattern>
// when `useImageGradients` is true, with the <image> href set from the
// GPU-gradient-service cache when available. If no GPU-rendered URL exists,
// this module computes a Canvas 2D fallback using the browser's native
// `createConicGradient` and data-URL-encodes the result.
//
// Lives in `playground/utils/` rather than `src/render/` because Canvas 2D
// and `document.createElement` are browser-only APIs; the shared renderer
// must also work in Node for the CLI.

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
    }
  }
}

function renderConicToDataUrl(grad: GradientOutput, w: number, h: number): string | null {
  try {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const fromAngle = grad.from ?? 0;
    const toAngle = grad.to ?? fromAngle + 2 * Math.PI;
    const cx = (grad.cx ?? 0) * scale;
    const cy = (grad.cy ?? 0) * scale;
    const conic = ctx.createConicGradient(fromAngle, cx, cy);

    const stops = grad.stopsWithOklch || grad.stops;
    const totalAngle = toAngle - fromAngle;
    const fullRevolution = 2 * Math.PI;
    for (const s of stops) {
      const scaledOffset = (s.offset * totalAngle) / fullRevolution;
      if (scaledOffset >= 0 && scaledOffset <= 1) {
        conic.addColorStop(Math.min(1, Math.max(0, scaledOffset)), s.color);
      }
    }
    ctx.fillStyle = conic;
    ctx.fillRect(0, 0, w * scale, h * scale);
    return canvas.toDataURL('image/png');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Conic gradient canvas rendering failed:', e);
    return null;
  }
}
