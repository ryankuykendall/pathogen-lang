import { evaluate, evaluateWithContext } from './evaluator';
import { parse } from './parser';

import type { CompileResult, StrictOption } from './evaluator';
import type { ModuleGraph } from './host/load-modules';

export { LEGACY_STYLE_OPENER_MESSAGE, lezerParser, parse, parseLezer, parseWithComments } from './parser';
export { editorParser, styleParser } from './parser/editor-parser';
export { resolveFontDirectives } from './parser/font-directives';
export type { ResolvedFontDirective, FontDirectiveError } from './parser/font-directives';
export { highlightPathogenTokens } from './highlight';
export type { HighlightToken } from './highlight';
export { evaluate, evaluateWithContext, BUILTIN_ENUMS } from './evaluator';
export { stdlib } from './stdlib';
export { buildEasingWgsl, EASING_CURVES, EASING_ORDER, EASING_SPECS, easingModeIndex } from './stdlib/easing-curves';
export type { EasingCurveSpec } from './stdlib/easing-curves';
export { generateSvg } from './svg-generator';
// Conic gradient rules shared by every renderer (the playground's Canvas 2D
// fallback draws the same wedges the CLI emits — see src/conic-param.ts).
export { renderConic, renderConicToWedges, sampleConicRamp } from './conic-renderer';
export type { ConicRender, ConicRenderSpec, ConicWedge, ConicStop } from './conic-renderer';
export { conicParamForAngle, innerFillMode, INNER_BLEND_STOPS, resolveConicPlacement, smoothstep01 } from './conic-param';
export type { ConicDirection, ConicPlacement, ConicSpread, ConicViewport } from './conic-param';
export { cssToRGBA, mixRGBA, rgbaToCSS } from './color';
export type { RGBA } from './color';
export type { SvgGeneratorOptions } from './svg-generator';
export {
  buildDefs,
  buildLayers,
  buildSingleLayer,
  buildSvgTree,
  mountInto,
  toJsonDocument,
  toSvgString,
} from './render';
export type { BuildDefsOptions, BuildLayersOptions, BuildTreeOptions, VNode, VNodeChild } from './render';
export {
  addFont,
  addFontData,
  createFontRegistry,
  ensureOpentype,
  getFont as getFontFromRegistry,
} from './evaluator/font-provider';
// Shared loader (docs/projects.md, docs/path-blocks.md § Font Loading by
// Environment). Pure: no Node or DOM APIs — hosts supply I/O; the Node hosts
// are in the `pathogen-lang/node` entry (src/node).
export {
  buildFontRegistry,
  FONT_CACHE_TTL_MS,
  planFontDirectives,
  resolveFonts,
  resolveFontsInFiles,
} from './host/load-fonts';
export type {
  FontDirectivePlan,
  FontLoadMessage,
  FontSourceFile,
  PlannedFontDirective,
  ResolvedFont,
  ResolveFontsOptions,
  ResolveFontsResult,
} from './host/load-fonts';
export type { FontCache, FontHost, HostReadResult, LocalFontMatch, ProjectFileHost } from './host/types';
// An error raised in an imported file: names that file, then each call or import back to the compiled one.
export { ModuleTraceError } from './evaluator/module-runtime';
// Imports (docs/modules.md): read every imported file before the compile, as for fonts.
export {
  formatModuleLoadError,
  importPathMistake,
  planImports,
  resolveModules,
  withOpenDocuments,
} from './host/load-modules';
export type {
  ImportSite,
  ModuleFile,
  ModuleGraph,
  ModuleLoadError,
  PlannedImport,
  ResolveModulesOptions,
  ResolveModulesResult,
} from './host/load-modules';
export {
  classifyFontSource,
  GENERIC_FONT_FAMILIES,
  projectDirname,
  projectPathStem,
  resolveProjectPath,
} from './host/paths';
export { parseProjectFile, PROJECT_FILE_NAME } from './host/project';
export type { ParsedProjectFile, ProjectFile } from './host/project';
export {
  CURATED_GOOGLE_FONTS,
  curatedVariants,
  fontFileKind,
  formatWeightSubstitution,
  lookupGoogleFont,
  nearestWeight,
} from './host/google-fonts';
export type { FontFileKind, HostFetch, HostFetchResponse, WeightSubstitution } from './host/google-fonts';
export { fontFaceCss, toBase64 } from './host/font-face-css';
export type { FontFaceSource } from './host/font-face-css';

export type {
  ArrayLiteral,
  BooleanLiteral,
  Comment,
  EnumDefinition,
  Expression,
  FontDirective,
  ForEachLoop,
  IndexedAssignmentStatement,
  IndexExpression,
  LayerApplyBlock,
  LayerDefinition,
  MethodCallExpression,
  Node,
  NullLiteral,
  ObjectLiteral,
  PathBlockExpression,
  Program,
  SourceLocation,
  Statement,
  StyleBlockLiteral,
  StyleProperty,
  TemplateLiteral,
  TextBlockExpression,
  TextBodyItem,
  TextStatement,
  TspanStatement,
} from './parser/ast';
export type {
  ArrayValue,
  BooleanValue,
  CallValue,
  ClipPathOutput,
  ClipPathValue,
  ColorValue,
  CommandHistoryEntry,
  CommandTraceEntry,
  CommandValue,
  CompileResult,
  CompileWarning,
  CSSPropertyDeclaration,
  CSSVarValue,
  EndpointValue,
  EvaluateWithContextOptions,
  EvaluateWithContextResult,
  FontData,
  FontRegistry,
  FragmentLayerState,
  GradientOutput,
  GradientStop,
  GradientValue,
  GroupLayerState,
  LayerOutput,
  LayerStyle,
  LogEntry,
  LogPart,
  MaskOutput,
  MaskPathEntry,
  MaskValue,
  ObjectValue,
  PathBlockCommand,
  PathBlockValue,
  PathCommandMeta,
  PathContext,
  PathLayerState,
  PathRecord,
  PathRecordOutput,
  PathStore,
  Point,
  PointValue,
  PolarVectorValue,
  ProjectedPathValue,
  ProjectedTextValue,
  QuerySource,
  RecordedCornerOp,
  SegmentValue,
  StrictOption,
  StyleBlockValue,
  SubpathValue,
  SubscriptionValue,
  SVGFragmentValue,
  TextBlockElement,
  TextBlockValue,
  TextChild,
  TextElement,
  TextLayerState,
  WarningCode,
} from './evaluator';
export { WARNING_CODES } from './evaluator/types';
export {
  isBooleanValue,
  isClipPathValue,
  isColorValue,
  isCSSVarValue,
  isGradientValue,
  isMaskValue,
  isObjectValue,
  isPathBlockValue,
  isPointValue,
  isPolarVectorValue,
  isProjectedPathValue,
  isProjectedTextValue,
  isSVGFragmentValue,
  isTextBlockValue,
} from './evaluator';

// Export-time path optimization passes (playground Export with Legend)
export { trimPathDataPrecision } from './evaluator/path-precision';
export { decimatePathData } from './evaluator/path-decimate';
export type { DecimateResult } from './evaluator/path-decimate';

// Warning grouping shared by the playground console, CLI stderr, LSP diagnostics, and debug capture
export {
  groupWarnings,
  groupWarnLogEntries,
  WARNING_GROUP_INSTANCE_LIMIT,
  warningFamily,
} from './evaluator/warning-groups';
export type { LogRow, WarningGroup } from './evaluator/warning-groups';
export { commandsToAbsoluteD, parsePathDataExpanded } from './evaluator/path-data';

// Language Services — shared intelligence layer for VS Code extension and playground
export {
  StringTextDocument,
  DiagnosticSeverity,
  getDiagnostics,
  findLegacyStyleOpeners,
  getDocumentSymbols,
  SymbolKind,
  analyzeScopes,
  getCompletions,
  isStylePropertyNamePosition,
  getStyleValueKeywordRun,
  getHoverInfo,
  getDefinition,
  getReferences,
  getSignatureHelp,
  prepareRename,
  getRenameEdits,
  getSemanticTokens,
  encodeSemanticTokens,
  TOKEN_TYPES,
  TOKEN_MODIFIERS,
  formatDocument,
  getCodeActions,
  getRefactorActions,
  getCodeLenses,
  getInlayHints,
  InlayHintKind,
} from './language-services';
export type {
  TextDocument,
  Diagnostic,
  DiagnosticsOptions,
  Position,
  Range,
  DocumentSymbol,
  ScopeInfo,
  Scope,
  Declaration,
  Reference,
  DeclarationKind,
  CompletionItem,
  HoverInfo,
  Location,
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  TextEdit,
  PrepareRenameResult,
  SemanticToken,
  FormatEdit,
  FormatOptions as DocumentFormatOptions,
  CodeAction,
  CodeLens,
  InlayHint,
} from './language-services';

/**
 * Options for compile and compileWithContext
 */
export interface CompileOptions {
  /** Fixed decimal precision for number formatting (0-20) */
  toFixed?: number;
  /** Font registry with loaded font data for precise metrics and glyph extraction */
  fonts?: import('./evaluator/types').FontRegistry;
  /**
   * Keep provenance in the result: per-fragment `records` and the executed
   * `commands` on every path layer, plus the default layer's `commands` on
   * the result. Off by default so per-keystroke compiles stay small.
   */
  trace?: boolean;
  /**
   * Strict mode: warnings stop compilation as errors, each carrying the
   * warning's position when it has one (`gradient` and `font-glyph` warnings
   * have none). `true` for every warning, or a list of codes (`['non-finite']`)
   * to keep the warnings a program has accepted. Off by default; `false` and
   * `[]` also mean off. See docs/debug.md "Strict mode".
   */
  strict?: StrictOption;
  /**
   * Every file the program imports, read before the compile by
   * `resolveModules` through a host (docs/modules.md). Without it, an
   * `import` is an error saying the program has no project folder.
   */
  modules?: ModuleGraph;
}

/**
 * Compile extended SVG path syntax to structured output with layers.
 *
 * @param source - The extended SVG path source code
 * @param options - Optional compilation options
 * @returns A CompileResult with layers, logs, and called stdlib functions
 *
 * @example
 * ```ts
 * import { compile } from 'pathogen-lang';
 *
 * const result = compile(`
 *   let r = 50;
 *   M 100 100
 *   A r r 0 1 1 calc(100 + r * 2) 100
 * `);
 * // result.layers[0].data => "M 100 100 A 50 50 0 1 1 200 100"
 * ```
 */
export function compile(source: string, options?: CompileOptions): CompileResult {
  const ast = parse(source);
  return evaluate(ast, options);
}

/**
 * Options for compileWithContext
 */
export interface CompileWithContextOptions {
  /** Whether to track command history (default: false for performance) */
  trackHistory?: boolean;
  /** Keep per-fragment records and per-layer command histories in the result (implies trackHistory). */
  trace?: boolean;
  /** Fixed decimal precision for number formatting (0-20) */
  toFixed?: number;
  /** Font registry with loaded font data for precise metrics and glyph extraction */
  fonts?: import('./evaluator/types').FontRegistry;
  /** Strict mode: warnings stop compilation as errors — see CompileOptions.strict. */
  strict?: StrictOption;
  /** Every file the program imports — see CompileOptions.modules. */
  modules?: ModuleGraph;
}

/**
 * Compile extended SVG path syntax with context tracking.
 * Returns path string, layers, final context state, and any log() outputs.
 *
 * The context tracks:
 * - `position`: Current pen position { x, y }
 * - `start`: Subpath start position (set by M, used by Z)
 * - `commands`: History of executed commands with start/end positions (when trackHistory: true)
 *
 * @param source - The extended SVG path source code
 * @param options - Optional settings (trackHistory defaults to false for performance)
 * @returns Object containing path, layers, context, and logs
 *
 * @example
 * ```ts
 * import { compileWithContext } from 'pathogen-lang';
 *
 * const result = compileWithContext(`
 *   M 10 20
 *   L 30 40
 *   log(ctx)
 *   L calc(ctx.position.x + 10) ctx.position.y
 * `);
 *
 * console.log(result.path);     // "M 10 20 L 30 40 L 40 40"
 * console.log(result.context.position);  // { x: 40, y: 40 }
 * console.log(result.logs);     // [JSON of context at log() call]
 * ```
 */
export function compileWithContext(source: string, options: CompileWithContextOptions = {}) {
  const ast = parse(source);
  return evaluateWithContext(ast, options);
}
