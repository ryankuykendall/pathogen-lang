// Whether a file says it is a module (docs/modules.md "Exporting"): the one rule for a
// file's kind, everywhere. Apart from the module loader so the small highlight bundle
// (src/highlight.ts) can carry it: it needs only the generated parser, not the AST
// builder. The workspace tree, the snapshots page, the review screen and the public
// page all ask this.

import { parser } from './pathogen.generated';

/**
 * Whether a file says it is a module: a `module;` line at its top level. One placed
 * after other statements still counts here; the compile then reports where it belongs.
 */
export function isModuleSource(source: string): boolean {
  const tree = parser.parse(source);
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name === 'ModuleHeader') return true;
  }
  return false;
}
