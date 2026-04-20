/**
 * Re-declarations of compiler output types used by the playground.
 * These mirror the types exported from svg-path-extended (src/index.ts).
 * We declare them here rather than importing from ../../dist/index.d.ts
 * so the playground can type-check independently of a library build.
 */

export interface OKLCH {
  L: number;
  C: number;
  H: number;
  alpha: number;
}

export interface LogPart {
  type: 'string' | 'value';
  label?: string;
  value: string;
}

export interface LogEntry {
  line: number | null;
  parts: LogPart[];
}

export type LayerStyle = Record<string, string>;

export type TextChild =
  | { type: 'run'; text: string }
  | { type: 'tspan'; text: string; dx?: number; dy?: number; rotation?: number; styles?: Record<string, string> };

export interface TextElement {
  x: number;
  y: number;
  rotation?: number;
  children: TextChild[];
  styles?: Record<string, string>;
}

export interface LayerOutput {
  name: string;
  type: 'path' | 'text' | 'fragment' | 'group';
  data: string;
  textElements?: TextElement[];
  fragmentDefs?: string;
  fragmentVisuals?: string;
  children?: LayerOutput[];
  styles: Record<string, string>;
  isDefault: boolean;
  transform?: string;
}

export interface MaskOutput {
  id: string;
  elements: { pathData: string; styles: Record<string, string> }[];
}

export interface ClipPathOutput {
  id: string;
  elements: { pathData: string }[];
}

export interface CSSPropertyDeclaration {
  name: string;
  syntax: string;
  inherits: boolean;
  initialValue: string;
}

export interface PatternOutput {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  elements: { pathData: string; styles: Record<string, string> }[];
  patternUnits?: string;
  patternTransform?: string;
  patternContentUnits?: string;
}

export interface MarkerOutput {
  id: string;
  viewBox: string;
  markerWidth: number;
  markerHeight: number;
  refX: string; // stringified number or keyword
  refY: string;
  markerUnits?: string; // omitted when value matches SVG default
  orient?: string; // stringified degrees or keyword; omitted when matches SVG default
  preserveAspectRatio?: string; // omitted when matches SVG default
  elements: { pathData: string; styles: Record<string, string> }[];
}

export interface GradientStop {
  offset: number;
  color: string;
}

export interface GradientOutput {
  id: string;
  type: 'linear' | 'radial' | 'conic' | 'mesh' | 'freeform' | 'topo';
  attrs: Record<string, string>;
  stops: GradientStop[];
  spreadMethod?: string;
  gradientUnits?: string;
  gradientTransform?: string;
  href?: string;
  colorInterpolation?: string;
  // Conic-specific
  cx?: number;
  cy?: number;
  from?: number;
  to?: number;
  direction?: 'cw' | 'ccw';
  spread?: string;
  innerRadius?: number;
  innerFill?: string;
  stopsWithOklch?: { offset: number; color: string; oklch?: OKLCH }[];
  // Mesh-specific
  meshGrid?: { x: number; y: number; color: string }[][];
  meshWidth?: number;
  meshHeight?: number;
  // Freeform-specific
  freeformPoints?: { x: number; y: number; color: string }[];
  freeformWidth?: number;
  freeformHeight?: number;
  falloff?: number;
  // Topo-specific
  topoContours?: { elevation: number; path: string; color: string; oklch?: OKLCH }[];
  topoWidth?: number;
  topoHeight?: number;
  topoEasing?: string;
  topoMethod?: string;
  topoIterations?: number;
  topoBlend?: number;
  topoBaseColor?: string;
  topoBaseColorOklch?: OKLCH;
}

export interface TextBlockElement {
  x: number;
  y: number;
  rotation?: number;
  styles?: Record<string, string>;
  children: TextChild[];
}

export interface TextBlockValue {
  type: 'TextBlockValue';
  elements: TextBlockElement[];
  styles: Record<string, string>;
}

export interface ProjectedTextValue {
  type: 'ProjectedTextValue';
  elements: TextBlockElement[];
  styles: Record<string, string>;
  origin: { x: number; y: number };
}

export interface CompileResult {
  layers: LayerOutput[];
  masks: MaskOutput[];
  clipPaths: ClipPathOutput[];
  gradients: GradientOutput[];
  patterns: PatternOutput[];
  markers: MarkerOutput[];
  cssProperties: CSSPropertyDeclaration[];
  logs: LogEntry[];
  calledStdlibFunctions: string[];
}

export interface FontData {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  buffer: ArrayBuffer;
  _parsed?: unknown;
}

export interface FontRegistry {
  fonts: Map<string, FontData[]>;
  get(family: string, weight?: number, style?: string): FontData | null;
}

export interface CompileOptions {
  toFixed?: number;
  fonts?: FontRegistry;
}

export interface CompileWithContextOptions {
  trackHistory?: boolean;
  toFixed?: number;
}

export interface EvaluateWithContextResult {
  path: string;
  context: unknown;
  logs: LogEntry[];
  calledStdlibFunctions: string[];
  layers: LayerOutput[];
  masks: MaskOutput[];
  clipPaths: ClipPathOutput[];
  gradients: GradientOutput[];
  patterns: PatternOutput[];
  markers: MarkerOutput[];
  cssProperties: CSSPropertyDeclaration[];
}
