import { styleTags, tags as t } from '@lezer/highlight';

/// Highlight tags for the inner style-block grammar (style.grammar).
/// Only standard @lezer/highlight tags — the playground uses stock
/// defaultHighlightStyle/oneDark themes, so custom tags would get no color.
// Tag choices are driven by the STOCK themes' palettes (the playground uses
// defaultHighlightStyle light / oneDark dark with no custom HighlightStyle),
// tuned so the three style-block roles contrast with each other AND with
// outer-code variable names (oneDark coral):
//   PropertyName → labelName        = oneDark malibu BLUE  / light #219 blue
//   value Identifier → special(variableName)
//                                   = oneDark whiskey ORANGE / light #256 teal
//   NumberUnit → number             = oneDark chalky YELLOW / light #164 green
// Outer variable names stay coral red — semantically not a propertyName, so
// property names must NOT use t.propertyName (oneDark groups it with name →
// coral, collapsing the distinction; verified empirically 2026-07-25).
export const styleHighlighting = styleTags({
  PropertyName: t.labelName,
  NumberUnit: t.number,
  ColorLiteral: t.color,
  StringLiteral: t.string,
  Template: t.special(t.string),
  Identifier: t.special(t.variableName),
  'Call/Identifier': t.function(t.variableName),
  LineComment: t.lineComment,
  '"(" ")"': t.paren,
  '"," ";" ":"': t.separator,
  '"."': t.derefOperator,
});
