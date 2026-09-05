import { evaluate, evaluateWithContext } from './evaluator';
import { parse } from './parser';

import type { CompileResult } from './evaluator';

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
export { createFontRegistry, addFont, getFont as getFontFromRegistry, ensureOpentype } from './evaluator/font-provider';

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
  ClipPathOutput,
  ClipPathValue,
  ColorValue,
  CommandHistoryEntry,
  CommandTraceEntry,
  CompileResult,
  CompileWarning,
  CSSPropertyDeclaration,
  CSSVarValue,
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
  PathRecord,
  PathRecordOutput,
  PathStore,
  PathCommandMeta,
  RecordedCornerOp,
  VertexHandleValue,
  PathContext,
  PathLayerState,
  Point,
  PointValue,
  PolarVectorValue,
  ProjectedPathValue,
  ProjectedTextValue,
  StyleBlockValue,
  SVGFragmentValue,
  TextBlockElement,
  TextBlockValue,
  TextChild,
  TextElement,
  TextLayerState,
  WarningCode,
} from './evaluator';
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
