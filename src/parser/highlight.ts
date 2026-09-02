import { styleTags, tags as t } from '@lezer/highlight';

/// Space-separated keyword node names (the `kw<…>` specializations plus the
/// `with`/`as` @extend keywords). Exported so the keyword drift guard can
/// compare it against the grammar.
export const KEYWORD_NODE_NAMES =
  'define default ViewBox calc layer apply text tspan for in if else let enum fn return break continue switch case where with as';

/// Syntax highlighting tags for the Pathogen language grammar.
/// Maps Lezer parse tree node types to CodeMirror highlight tags.
export const pathogenHighlighting = styleTags({
  // Keywords — every kw<> term in pathogen.grammar plus the @extend
  // contextual keywords (with, as). Checked by tests/keyword-registry.test.ts.
  [KEYWORD_NODE_NAMES]: t.keyword,

  // Path-command suffix clauses: corner-op and label kinds read as functions
  'CornerOpCall/Identifier LabelCall/Identifier': t.function(t.variableName),

  // Literals
  Number: t.number,
  String: t.string,
  BooleanLiteral: t.bool,
  NullLiteral: t.null,
  ColorLiteral: t.color,
  CSSColorLiteral: t.color,
  // Template literal: the composite node takes the string style; the
  // lowercase template tokens (templateContent, templateStart, …) are NOT
  // node types (Lezer lowercase rule) — styling them is dead code. Nested
  // interpolation expressions' own token styles override within their ranges.
  TemplateLiteral: t.special(t.string),

  // Path commands
  pathCommandLetter: t.operatorKeyword,

  // Layer types
  LayerType: t.typeName,

  // Identifiers
  Identifier: t.variableName,
  VariableName: t.definition(t.variableName),

  // Operators
  'RangeOp HalfOpenRangeOp': t.operator,
  '"+" "-" "*" "/" "%" "!" "==" "!=" "<=" ">=" "<" ">" "||" "&&" "<<" "=" "?" ":"': t.operator,

  // Special block delimiters
  'styleBlockOpen pathBlockOpen textBlockOpen': t.keyword,

  // Font directive
  fontDirectiveKw: t.keyword,

  // Punctuation
  '"(" ")"': t.paren,
  '"[" "]"': t.squareBracket,
  '"{" "}"': t.brace,
  '"," ";"': t.separator,
  '"."': t.derefOperator,
  '"..."': t.punctuation,

  // Style block content
  StyleContent: t.special(t.string),
  StyleInterp: t.special(t.string),

  // Comments
  Comment: t.lineComment,
  LineComment: t.lineComment,

  // Structural
  'ForLoop ForEachLoop': t.controlKeyword,
  'IfStatement ElseClause': t.controlKeyword,
  'SwitchStatement CaseClause DefaultClause WhereGuard TextSwitchStatement TextCaseClause TextDefaultClause': t.controlKeyword,
  FunctionDefinition: t.function(t.definition(t.variableName)),
  EnumDefinition: t.definition(t.typeName),
});
