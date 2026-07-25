import { styleTags, tags as t } from '@lezer/highlight';

/// Highlight tags for the inner style-block grammar (style.grammar).
/// Only standard @lezer/highlight tags — the playground uses stock
/// defaultHighlightStyle/oneDark themes, so custom tags would get no color.
export const styleHighlighting = styleTags({
  // definition(propertyName) rather than bare propertyName — the stock
  // defaultHighlightStyle colors the definition variant, so property names
  // get color in the light theme too (oneDark colors both).
  PropertyName: t.definition(t.propertyName),
  NumberUnit: t.number,
  ColorLiteral: t.color,
  StringLiteral: t.string,
  Template: t.special(t.string),
  Identifier: t.variableName,
  'Call/Identifier': t.function(t.variableName),
  LineComment: t.lineComment,
  '"(" ")"': t.paren,
  '"," ";" ":"': t.separator,
});
