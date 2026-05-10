/**
 * API Surface Registry — metadata for completion generation.
 *
 * This file provides description and ranking metadata for runtime API elements
 * that the generation script uses to produce completion-data.generated.ts.
 * The actual enum definitions live in evaluator/index.ts (BUILTIN_ENUMS).
 *
 * When adding a new enum to BUILTIN_ENUMS, add a corresponding entry here.
 * The import-time validation below will warn if any enum is missing metadata.
 */

import { BUILTIN_ENUMS } from './evaluator';

/** Metadata for enum completions — descriptions and ranking */
export const ENUM_METADATA: Record<string, { detail: string; boost: number }> = {
  Easing: { detail: 'Easing function for interpolation', boost: 10 },
  Interpolation: { detail: 'Color interpolation space', boost: 8 },
  SpreadMethod: { detail: 'Gradient spread method', boost: 8 },
  GradientUnits: { detail: 'Gradient coordinate system', boost: 6 },
  Direction: { detail: 'Rotation direction (CW/CCW)', boost: 8 },
  ConicSpread: { detail: 'Conic gradient edge behavior', boost: 6 },
  InnerFill: { detail: 'Conic gradient inner fill mode', boost: 6 },
  TopoMethod: { detail: 'Topological gradient method', boost: 6 },
  BBoxAnchor: { detail: 'Bounding box anchor position', boost: 8 },
  GridPatternType: { detail: 'Grid cell rendering mode', boost: 10 },
  HexagonOrientation: { detail: 'Hexagon grid orientation', boost: 8 },
  VerticalAnchor: { detail: 'Text vertical alignment anchor', boost: 8 },
  MarkerUnits: { detail: 'Marker coordinate system', boost: 6 },
  MarkerOrient: { detail: 'Marker orientation mode', boost: 8 },
  MarkerRefX: { detail: 'Marker refX keyword position', boost: 6 },
  MarkerRefY: { detail: 'Marker refY keyword position', boost: 6 },
  MarkerPreserveAspectRatio: { detail: 'Marker viewBox alignment + meet/slice', boost: 4 },
  NoiseFilterStyle: { detail: 'NoiseFilter primitive-chain preset', boost: 8 },
  BlendMode: { detail: 'CSS blend-mode keyword', boost: 6 },
};

// Re-export for generation script
export { BUILTIN_ENUMS };

// Validate at import time that all enums have metadata
const missing = Object.keys(BUILTIN_ENUMS).filter((k) => !(k in ENUM_METADATA));
if (missing.length > 0) {
  console.warn(`api-surface.ts: Missing ENUM_METADATA for: ${missing.join(', ')}`);
}
