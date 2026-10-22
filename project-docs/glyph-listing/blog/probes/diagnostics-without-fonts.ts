// Does getDiagnostics() (no fonts registered) report Font.* calls as errors?
// Compare with PathBlock.fromGlyph, which has the same dependency on @font.
//   npx tsx project-docs/glyph-listing/blog/probes/diagnostics-without-fonts.ts
import { getDiagnostics } from '../../../../src/language-services/diagnostics';
import { StringTextDocument } from '../../../../src/language-services/document';

const programs: Record<string, string> = {
  fromGlyph: '@font "Raleway" 700;\nlet styles = #{ font-family: Raleway; font-weight: 700; };\nlet glyphs = PathBlock.fromGlyph("A", styles);\n',
  fontInfo: '@font "Raleway" 700;\nlet styles = #{ font-family: Raleway; font-weight: 700; };\nlet info = Font.info(styles);\n',
  fontGlyphs: '@font "Raleway" 700;\nlet styles = #{ font-family: Raleway; font-weight: 700; };\nlet digits = Font.glyphs(styles, "digit");\n',
};

for (const [name, source] of Object.entries(programs)) {
  const diagnostics = getDiagnostics(new StringTextDocument(source));
  console.log(name, JSON.stringify(diagnostics.map((d) => ({ severity: d.severity, line: d.range.start.line + 1, message: d.message }))));
}
