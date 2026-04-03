import { evaluate, evaluateAnnotated, evaluateWithContext, formatAnnotated } from './evaluator';
import { parse, parseWithComments } from './parser';

import type { CompileResult } from './evaluator';

export { parse, parseWithComments } from './parser';
export { evaluate, evaluateAnnotated, evaluateWithContext, formatAnnotated } from './evaluator';
export { stdlib } from './stdlib';
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
  AnnotatedLine,
  AnnotatedOutput,
  ArrayValue,
  BooleanValue,
  ClipPathOutput,
  ClipPathValue,
  ColorValue,
  CommandHistoryEntry,
  CompileResult,
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
export type { FormatOptions } from './evaluator/formatter';

// Language Services — shared intelligence layer for VS Code extension and playground
export { StringTextDocument, DiagnosticSeverity, getDiagnostics, getDocumentSymbols, SymbolKind } from './language-services';
export type { TextDocument, Diagnostic, Position, Range, DocumentSymbol } from './language-services';

/**
 * Options for compile and compileWithContext
 */
export interface CompileOptions {
  /** Fixed decimal precision for number formatting (0-20) */
  toFixed?: number;
  /** Font registry with loaded font data for precise metrics and glyph extraction */
  fonts?: import('./evaluator/types').FontRegistry;
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
 * import { compile } from 'svg-path-extended';
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
  return evaluate(ast, options as { toFixed?: number; fonts?: import('./evaluator/types').FontRegistry });
}

/**
 * Compile extended SVG path syntax to annotated output.
 * Preserves comments, shows loop iterations, and annotates function calls.
 *
 * @param source - The extended SVG path source code
 * @returns Formatted annotated output string
 *
 * @example
 * ```ts
 * import { compileAnnotated } from 'svg-path-extended';
 *
 * const output = compileAnnotated(`
 *   // Draw points
 *   for (i in 0..3) { M i 0 }
 * `);
 * // Returns formatted output with comments and loop annotations
 * ```
 */
export function compileAnnotated(source: string): string {
  const { program, comments } = parseWithComments(source);
  const annotated = evaluateAnnotated(program, comments);
  return formatAnnotated(annotated);
}

/**
 * Options for compileWithContext
 */
export interface CompileWithContextOptions {
  /** Whether to track command history (default: false for performance) */
  trackHistory?: boolean;
  /** Fixed decimal precision for number formatting (0-20) */
  toFixed?: number;
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
 * import { compileWithContext } from 'svg-path-extended';
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
