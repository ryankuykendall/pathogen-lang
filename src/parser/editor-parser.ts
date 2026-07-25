import { parseMixed } from '@lezer/common';

import { parser as lezerParser } from './pathogen.generated';
import { parser as styleParser } from './style.generated';

/**
 * Editor-facing parser: the outer Pathogen parser with the inner style-block
 * grammar mounted over each opaque `StyleContent` token via parseMixed.
 *
 * The COMPILER keeps using the unwrapped `lezerParser` — `buildStyleBlockLiteral`
 * cursor-walks StyleContent and `parseStyleDeclarations` remains the compiler's
 * source of truth for declarations. This wrap exists so CodeMirror consumers
 * (playground editor, read-only detail mounts) get structured highlighting,
 * color chips, and future tree-based tooling inside `${ ... }`.
 *
 * `.configure({ wrap })` shares the LR tables with `lezerParser` — no
 * duplicated parser weight; the inner parse cost is paid only by editors and
 * is incrementally cached by parseMixed.
 */
export const editorParser = lezerParser.configure({
  wrap: parseMixed((node) =>
    node.name === 'StyleContent' ? { parser: styleParser } : null,
  ),
});

/** The standalone inner style-declaration parser (exposed for tests/tools). */
export { styleParser };
