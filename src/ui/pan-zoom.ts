// Barrel entry for the pan-zoom bundle (dist/pan-zoom.* → window.PathogenPanZoom).
// Re-exports the controller + pure math, and registers the shared preview
// controls as a side effect in browser contexts: <pathogen-zoom-pill> and
// <program-chip> (no-ops under Node — the CLI imports this module, so nothing
// here may require DOM globals eagerly).

import { registerProgramChip } from './program-chip';
import { registerZoomPill } from './zoom-pill';

export * from './pan-zoom-controller';
export { registerZoomPill } from './zoom-pill';
export type { ZoomPillElement, ZoomPillTarget } from './zoom-pill';
export { DEFAULT_BADGE_TITLE, registerProgramChip } from './program-chip';
export type { ProgramChipElement, ProgramChipItem } from './program-chip';

registerZoomPill();
registerProgramChip();
