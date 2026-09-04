/**
 * The structured, host-independent view of a compile result — what the
 * CLI prints for `--json` and what a tool reads instead of path strings.
 * Pure data: no VNodes, no SVG serialization. Layers keep their `d` (unlike
 * the embedded `<script id="pathogen-metadata">` block, which strips it),
 * and when the result was produced with `trace: true` each path layer also
 * carries `records` (per-fragment source provenance) and `commands` (the
 * executed command history of that layer's context).
 */

import type {
  ClipPathOutput,
  CommandTraceEntry,
  CompileResult,
  CompileWarning,
  CSSPropertyDeclaration,
  FilterOutput,
  GradientOutput,
  LayerOutput,
  LogEntry,
  MarkerOutput,
  MaskOutput,
  PathRecordOutput,
  PatternOutput,
  TextElement,
  ViewBoxValue,
} from '../evaluator/types';

export interface JsonLayer {
  name: string;
  type: LayerOutput['type'];
  isDefault: boolean;
  /** Path data for path layers; concatenated text for text layers; empty otherwise. */
  d: string;
  styles: Record<string, string>;
  transform?: string;
  textElements?: TextElement[];
  records?: PathRecordOutput[];
  commands?: CommandTraceEntry[];
  children?: JsonLayer[];
}

export interface JsonDocument {
  viewBox?: ViewBoxValue;
  layers: JsonLayer[];
  defs: {
    masks: MaskOutput[];
    clipPaths: ClipPathOutput[];
    gradients: GradientOutput[];
    patterns: PatternOutput[];
    markers: MarkerOutput[];
    filters: FilterOutput[];
  };
  cssProperties: CSSPropertyDeclaration[];
  logs: LogEntry[];
  warnings: CompileWarning[];
  calledStdlibFunctions: string[];
  /** Default-layer command history; present only for traced results. */
  commands?: CommandTraceEntry[];
  missingGlyphs?: CompileResult['missingGlyphs'];
}

function toJsonLayer(layer: LayerOutput): JsonLayer {
  return {
    name: layer.name,
    type: layer.type,
    isDefault: layer.isDefault,
    d: layer.data,
    styles: layer.styles,
    ...(layer.transform !== undefined ? { transform: layer.transform } : {}),
    ...(layer.textElements ? { textElements: layer.textElements } : {}),
    ...(layer.records ? { records: layer.records } : {}),
    ...(layer.commands ? { commands: layer.commands } : {}),
    ...(layer.children ? { children: layer.children.map(toJsonLayer) } : {}),
  };
}

/** Build the JSON document for a compile result (see `--json` in docs/cli.md). */
export function toJsonDocument(result: CompileResult): JsonDocument {
  return {
    ...(result.viewBox ? { viewBox: result.viewBox } : {}),
    layers: result.layers.map(toJsonLayer),
    defs: {
      masks: result.masks,
      clipPaths: result.clipPaths,
      gradients: result.gradients,
      patterns: result.patterns,
      markers: result.markers,
      filters: result.filters,
    },
    cssProperties: result.cssProperties,
    logs: result.logs,
    warnings: result.warnings,
    calledStdlibFunctions: result.calledStdlibFunctions,
    ...(result.commands ? { commands: result.commands } : {}),
    ...(result.missingGlyphs ? { missingGlyphs: result.missingGlyphs } : {}),
  };
}
