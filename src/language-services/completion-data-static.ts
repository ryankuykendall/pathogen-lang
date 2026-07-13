// Static completion data: keywords, style properties, and type member sets.
// Stdlib completions are now generated — see completion-data.generated.ts.
// Shared by VS Code (via LSP) and playground (via direct import).

export interface CompletionEntry {
  label: string;
  kind: 'function' | 'variable' | 'keyword' | 'property' | 'constant' | 'snippet';
  detail: string;
  /** Higher boost = higher in list. */
  boost: number;
  /** Snippet body (VS Code snippet syntax with $1, $2, etc.) */
  insertText?: string;
  isSnippet?: boolean;
}

// --- Keywords ---

export const KEYWORD_COMPLETIONS: CompletionEntry[] = [
  { label: 'let', kind: 'keyword', detail: 'Variable declaration', boost: 10, insertText: 'let ${1:name} = ${0};', isSnippet: true },
  { label: 'for', kind: 'keyword', detail: 'For loop — iterate over a range', boost: 10, insertText: 'for (${1:i} in ${2:0}..${3:10}) {\n\t$0\n}', isSnippet: true },
  { label: 'if', kind: 'keyword', detail: 'If statement — conditional', boost: 10, insertText: 'if (${1:condition}) {\n\t$0\n}', isSnippet: true },
  { label: 'fn', kind: 'keyword', detail: 'Function definition', boost: 10, insertText: 'fn ${1:name}(${2:params}) {\n\t$0\n}', isSnippet: true },
  { label: 'define', kind: 'keyword', detail: 'Define a layer (PathLayer/TextLayer/GroupLayer) or ViewBox', boost: 8 },
  { label: 'ViewBox', kind: 'keyword', detail: 'Define the SVG viewBox: define ViewBox(originX, originY, width, height);', boost: 6 },
  { label: 'layer', kind: 'keyword', detail: 'Layer apply block', boost: 8 },
  { label: 'return', kind: 'keyword', detail: 'Return from function', boost: 6 },
  { label: 'enum', kind: 'keyword', detail: 'Enum definition', boost: 6, insertText: 'enum ${1:Name} {\n\t${0}\n}', isSnippet: true },
  { label: 'text', kind: 'keyword', detail: 'Text element', boost: 6 },
  { label: 'tspan', kind: 'keyword', detail: 'Text span inside text block', boost: 4 },
  { label: 'else', kind: 'keyword', detail: 'Else branch', boost: 4 },
  { label: 'true', kind: 'constant', detail: 'Boolean true', boost: 2 },
  { label: 'false', kind: 'constant', detail: 'Boolean false', boost: 2 },
  { label: 'null', kind: 'constant', detail: 'Null value', boost: 2 },
];

// --- Style properties (for inside ${ } blocks) ---

// Raw entries; the export below adds a `name: $0;` template to each so
// accepting a property name lands the cursor in value position with the
// declaration's `;` already in place. The engine strips the template when a
// `:` already follows the cursor (see completion.ts property-name branch).
const STYLE_PROPERTY_ENTRIES: CompletionEntry[] = [
  { label: 'stroke', kind: 'property', detail: 'Stroke color', boost: 15 },
  { label: 'stroke-width', kind: 'property', detail: 'Stroke width', boost: 14 },
  { label: 'stroke-dasharray', kind: 'property', detail: 'Dash pattern (e.g., 4 2)', boost: 10 },
  { label: 'stroke-linecap', kind: 'property', detail: 'Line cap: butt, round, square', boost: 8 },
  { label: 'stroke-linejoin', kind: 'property', detail: 'Line join: miter, round, bevel', boost: 8 },
  { label: 'stroke-opacity', kind: 'property', detail: 'Stroke opacity (0-1)', boost: 8 },
  { label: 'fill', kind: 'property', detail: 'Fill color', boost: 15 },
  { label: 'fill-opacity', kind: 'property', detail: 'Fill opacity (0-1)', boost: 8 },
  { label: 'fill-rule', kind: 'property', detail: 'Fill rule: nonzero, evenodd', boost: 8 },
  { label: 'opacity', kind: 'property', detail: 'Overall opacity (0-1)', boost: 10 },
  { label: 'font-family', kind: 'property', detail: 'Font family name', boost: 10 },
  { label: 'font-size', kind: 'property', detail: 'Font size', boost: 10 },
  { label: 'font-weight', kind: 'property', detail: 'Font weight (100-900)', boost: 8 },
  { label: 'font-style', kind: 'property', detail: 'Font style: normal, italic', boost: 6 },
  { label: 'text-anchor', kind: 'property', detail: 'Text anchor: start, middle, end', boost: 8 },
  { label: 'text-decoration', kind: 'property', detail: 'Text decoration', boost: 6 },
  { label: 'dominant-baseline', kind: 'property', detail: 'Vertical text alignment', boost: 8 },
  { label: 'letter-spacing', kind: 'property', detail: 'Letter spacing', boost: 6 },
  { label: 'transform', kind: 'property', detail: 'SVG transform', boost: 6 },
  { label: 'translate-x', kind: 'property', detail: 'Convenience: translate X', boost: 6 },
  { label: 'translate-y', kind: 'property', detail: 'Convenience: translate Y', boost: 6 },
  { label: 'rotate', kind: 'property', detail: 'Convenience: rotation angle', boost: 6 },
  { label: 'scale-x', kind: 'property', detail: 'Convenience: scale X', boost: 6 },
  { label: 'scale-y', kind: 'property', detail: 'Convenience: scale Y', boost: 6 },
  { label: 'marker', kind: 'property', detail: 'Marker for all positions (shorthand)', boost: 8 },
  { label: 'marker-start', kind: 'property', detail: 'Marker at path start', boost: 6 },
  { label: 'marker-mid', kind: 'property', detail: 'Marker at path vertices', boost: 6 },
  { label: 'marker-end', kind: 'property', detail: 'Marker at path end', boost: 6 },
];

export const STYLE_PROPERTY_COMPLETIONS: CompletionEntry[] = STYLE_PROPERTY_ENTRIES.map((entry) => ({
  ...entry,
  insertText: `${entry.label}: $0;`,
  isSnippet: true,
}));

// --- Block-start snippets (offered when typing @, & at statement start) ---

export const BLOCK_START_SNIPPETS: CompletionEntry[] = [
  {
    label: '@font',
    kind: 'snippet',
    detail: 'Font directive — load a font with weight',
    boost: 12,
    insertText: '@font "${1:Inconsolata}" ${2:400};',
    isSnippet: true,
  },
  {
    label: '@{',
    kind: 'snippet',
    detail: 'PathBlock — group of path commands',
    boost: 11,
    insertText: '@{\n\t$0\n}',
    isSnippet: true,
  },
  {
    label: '&{',
    kind: 'snippet',
    detail: 'TextBlock — group of text/tspan elements',
    boost: 11,
    insertText: '&{\n\t$0\n}',
    isSnippet: true,
  },
];

// --- Declaration snippets (offered when typing $ at statement start) ---

export const DECLARATION_SNIPPETS: CompletionEntry[] = [
  {
    label: 'let',
    kind: 'snippet',
    detail: 'Variable declaration',
    boost: 12,
    insertText: 'let ${1:name} = $0;',
    isSnippet: true,
  },
  {
    label: 'ViewBox',
    kind: 'snippet',
    detail: 'Define the SVG viewBox (canvas dimensions)',
    boost: 12,
    insertText: 'define ViewBox(${1:0}, ${2:0}, ${3:200}, ${4:200});',
    isSnippet: true,
  },
  {
    label: 'PathLayer',
    kind: 'snippet',
    detail: 'Define a named path layer with styles',
    boost: 11,
    insertText: "define PathLayer('${1:name}') ${\n\t${2:stroke}: $0;\n}",
    isSnippet: true,
  },
  {
    label: 'TextLayer',
    kind: 'snippet',
    detail: 'Define a named text layer with styles',
    boost: 11,
    insertText: "define TextLayer('${1:name}') ${\n\tfont-family: $0;\n}",
    isSnippet: true,
  },
  {
    label: 'NoiseFilter',
    kind: 'snippet',
    detail: 'Grain/paper/speckle/static/grainy-gradient noise filter',
    boost: 10,
    insertText: 'let ${1:noise} = NoiseFilter() {|f|\n\tf.style = NoiseFilterStyle.${2|Grain,Paper,Speckle,Static,Gradient|};$0\n};',
    isSnippet: true,
  },
  {
    label: 'GlowFilter',
    kind: 'snippet',
    detail: 'Outer or inner soft glow',
    boost: 10,
    insertText: 'let ${1:glow} = GlowFilter() {|f|\n\tf.mode = GlowMode.${2|Outer,Inner|};\n\tf.radius = ${3:8};$0\n};',
    isSnippet: true,
  },
  {
    label: 'EmbossFilter',
    kind: 'snippet',
    detail: 'Light-source-based embossed surface',
    boost: 10,
    insertText: 'let ${1:emboss} = EmbossFilter() {|f|\n\tf.angle = ${2:135}deg;\n\tf.depth = ${3:3};$0\n};',
    isSnippet: true,
  },
  {
    label: 'ElevationShadowFilter',
    kind: 'snippet',
    detail: 'Material-style layered depth shadow',
    boost: 10,
    insertText: 'let ${1:shadow} = ElevationShadowFilter() {|f|\n\tf.elevation = ${2:4};$0\n};',
    isSnippet: true,
  },
  {
    label: 'InnerShadowFilter',
    kind: 'snippet',
    detail: 'Inset shadow (capability native CSS drop-shadow() lacks)',
    boost: 10,
    insertText: 'let ${1:inset} = InnerShadowFilter() {|f|\n\tf.offsetY = ${2:3};\n\tf.blur = ${3:4};$0\n};',
    isSnippet: true,
  },
  {
    label: 'PixelateFilter',
    kind: 'snippet',
    detail: 'Mosaic / pixelation filter',
    boost: 10,
    insertText: 'let ${1:pix} = PixelateFilter(${2:10}, ${3:10}, ${4:5});$0',
    isSnippet: true,
  },
  {
    label: 'MotionBlurFilter',
    kind: 'snippet',
    detail: 'Directional (linear) or progressive blur',
    boost: 10,
    insertText:
      'let ${1:blur} = MotionBlurFilter() {|f|\n\tf.type = MotionBlurType.${2|Linear,Progressive|};\n\tf.distance = ${3:20};\n\tf.angle = ${4:0}deg;$0\n};',
    isSnippet: true,
  },
];

// --- Template interpolation snippet (offered inside backtick strings) ---

export const INTERPOLATION_SNIPPET: CompletionEntry = {
  label: '${...}',
  kind: 'snippet',
  detail: 'String interpolation — embed an expression',
  boost: 15,
  insertText: '${${1:expr}}',
  isSnippet: true,
};

// --- Style-block snippet (offered when typing $ in expression position) ---
// Provides a balanced `${  }` literal for `let foo = $` style use.

export const STYLE_BLOCK_SNIPPET: CompletionEntry = {
  label: '${...}',
  kind: 'snippet',
  detail: 'Style block — inline style declarations',
  boost: 14,
  insertText: '${\n\t$0\n}',
  isSnippet: true,
};

// --- Member access completions (now generated — see completion-data.generated.ts) ---

export interface MemberCompletionSet {
  properties: CompletionEntry[];
  methods: CompletionEntry[];
}
