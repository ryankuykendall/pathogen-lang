import { styleTags, tags as t } from '@lezer/highlight';

/// Syntax highlighting tags for the Pathogen language grammar.
/// Maps Lezer parse tree node types to CodeMirror highlight tags.
export const pathogenHighlighting = styleTags({
  // Keywords
  'define default calc layer apply text tspan for in if else let enum fn return': t.keyword,

  // Literals
  Number: t.number,
  String: t.string,
  BooleanLiteral: t.bool,
  NullLiteral: t.null,
  ColorLiteral: t.color,
  CSSColorLiteral: t.color,
  templateContent: t.string,

  // Path commands
  pathCommandLetter: t.operatorKeyword,

  // Layer types
  LayerType: t.typeName,

  // Identifiers
  Identifier: t.variableName,
  VariableName: t.definition(t.variableName),

  // Operators
  'RangeOp': t.operator,
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

  // Template literal delimiters
  'templateStart templateEnd': t.string,
  'templateInterpStart templateInterpEnd': t.special(t.brace),

  // Style block content
  StyleContent: t.special(t.string),

  // Comments
  Comment: t.lineComment,
  LineComment: t.lineComment,

  // Structural
  'ForLoop ForEachLoop': t.controlKeyword,
  'IfStatement ElseClause': t.controlKeyword,
  FunctionDefinition: t.function(t.definition(t.variableName)),
  EnumDefinition: t.definition(t.typeName),
});
