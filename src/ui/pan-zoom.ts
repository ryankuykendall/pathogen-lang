// Barrel entry for the pan-zoom bundle (dist/pan-zoom.* → window.PathogenPanZoom).
// Re-exports the controller + pure math, and registers <pathogen-zoom-pill>
// as a side effect in browser contexts (no-op under Node — the CLI imports
// this module, so nothing here may require DOM globals eagerly).

import { registerZoomPill } from './zoom-pill';

export * from './pan-zoom-controller';
export { registerZoomPill } from './zoom-pill';
export type { ZoomPillElement, ZoomPillTarget } from './zoom-pill';

registerZoomPill();
