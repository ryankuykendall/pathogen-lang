// Cross-channel parity test.
//
// Enforces that every language-services feature is wired into every channel
// that needs it. The feature catalog at
// src/language-services/feature-catalog.ts is the single source of truth;
// this test asserts three invariants against it:
//
//   1. Exhaustiveness — every get/format/prepare/analyze export from
//      src/language-services/index.ts is classified in LANGUAGE_FEATURES or
//      HELPERS_NOT_FEATURES. A new language-services function that is
//      neither will fail this test until it is classified.
//
//   2. Playground completeness — every feature with playgroundRequired=true
//      and playgroundDeferred!=true is referenced by fn name inside
//      playground/utils/cm-language-services.ts.
//
//   3. VS Code completeness — every feature with a vscodeCapability is
//      declared in packages/pathogen-language-server/src/server.ts's
//      onInitialize return, and every lspTriggerCharacters set matches what
//      server.ts advertises for that provider.
//
// All three assertions are string-based (readFileSync + regex), so the test
// is immune to import-graph issues and runs in the default Vitest suite.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LANGUAGE_FEATURES, HELPERS_NOT_FEATURES } from '../src/language-services/feature-catalog';

const REPO = resolve(__dirname, '..');
const LS_INDEX = resolve(REPO, 'src/language-services/index.ts');
const PLAYGROUND_WIRING = resolve(REPO, 'playground/utils/cm-language-services.ts');
const LSP_SERVER = resolve(REPO, 'packages/pathogen-language-server/src/server.ts');

const readText = (path: string) => readFileSync(path, 'utf8');

/** Extract top-level exported value names from a barrel file. */
function exportedNames(source: string): string[] {
  const names = new Set<string>();

  // `export { a, b, c } from '...'`  and  `export { a, b, c };`
  const braceRe = /export\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = braceRe.exec(source)) !== null) {
    const inside = match[1];
    for (const raw of inside.split(',')) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      // Handle "type Foo" and "Foo as Bar".
      const afterType = trimmed.replace(/^type\s+/, '');
      const alias = afterType.split(/\s+as\s+/).pop()!;
      names.add(alias.trim());
    }
  }

  // `export const X`, `export function X`, `export class X`, `export let X`.
  const declRe = /export\s+(?:const|function|class|let|var|async\s+function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((match = declRe.exec(source)) !== null) {
    names.add(match[1]);
  }

  // `export type X` and `export interface X`.
  const typeRe = /export\s+(?:type|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((match = typeRe.exec(source)) !== null) {
    names.add(match[1]);
  }

  return [...names];
}

describe('cross-channel parity', () => {
  describe('exhaustiveness: every language-services export is classified', () => {
    const source = readText(LS_INDEX);
    const exports = exportedNames(source);

    // Only functions (not types/classes) need catalog entries. We key on the
    // naming convention — if someone introduces a feature helper that does
    // not start with one of these prefixes, they must also add a convention
    // to this file (and document why).
    const FEATURE_PREFIXES = /^(get|format|prepare|analyze)/;
    const catalogedFnNames = new Set(LANGUAGE_FEATURES.map((f) => f.fn));

    const unclassified = exports.filter(
      (name) =>
        FEATURE_PREFIXES.test(name) &&
        !catalogedFnNames.has(name) &&
        !HELPERS_NOT_FEATURES.has(name),
    );

    it('has no unclassified get/format/prepare/analyze exports', () => {
      expect(
        unclassified,
        'New language-services exports must be added to LANGUAGE_FEATURES ' +
          '(as a user-facing feature) or HELPERS_NOT_FEATURES (as an internal helper) ' +
          'in src/language-services/feature-catalog.ts.',
      ).toEqual([]);
    });

    it('cataloged features all exist as exports', () => {
      for (const feat of LANGUAGE_FEATURES) {
        expect(
          exports,
          `feature ${feat.id} declares fn=${feat.fn} but it is not exported from src/language-services/index.ts`,
        ).toContain(feat.fn);
      }
    });
  });

  describe('playground completeness: wired features are referenced in cm-language-services.ts', () => {
    const wiringSource = readText(PLAYGROUND_WIRING);

    const required = LANGUAGE_FEATURES.filter(
      (f) => f.playgroundRequired && !f.playgroundDeferred,
    );

    for (const feat of required) {
      it(`${feat.id} (${feat.fn}) is referenced in cm-language-services.ts`, () => {
        expect(
          wiringSource,
          `Feature ${feat.id} is playgroundRequired:true and not deferred, ` +
            `but its fn name "${feat.fn}" was not found in playground/utils/cm-language-services.ts. ` +
            `Either wire it up, or mark playgroundDeferred:true in the catalog.`,
        ).toContain(feat.fn);
      });
    }

    it('every skipped feature has an explicit playgroundSkipReason', () => {
      const skipped = LANGUAGE_FEATURES.filter((f) => !f.playgroundRequired);
      for (const feat of skipped) {
        expect(
          feat.playgroundSkipReason,
          `Feature ${feat.id} is playgroundRequired:false but has no playgroundSkipReason`,
        ).toBeTruthy();
        expect(feat.playgroundSkipReason!.length).toBeGreaterThan(20);
      }
    });
  });

  describe('vscode completeness: LSP capabilities are declared in server.ts', () => {
    const serverSource = readText(LSP_SERVER);

    // Extract the capability keys from the onInitialize return block by
    // finding the capabilities object literal. We look for keys that end
    // in "Provider" (the LSP convention).
    const capabilitiesRe = /capabilities\s*:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*\};/;
    const capMatch = serverSource.match(capabilitiesRe);
    const capabilitiesBlock = capMatch ? capMatch[1] : serverSource;

    const declaredCapabilities = new Set<string>();
    const capKeyRe = /\b([a-zA-Z]+Provider)\s*:/g;
    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = capKeyRe.exec(capabilitiesBlock)) !== null) {
      declaredCapabilities.add(keyMatch[1]);
    }

    const featuresWithCapabilities = LANGUAGE_FEATURES.filter((f) => f.vscodeCapability);

    for (const feat of featuresWithCapabilities) {
      it(`${feat.id} capability "${feat.vscodeCapability}" is declared in server.ts`, () => {
        expect(
          declaredCapabilities,
          `Feature ${feat.id} declares vscodeCapability="${feat.vscodeCapability}" ` +
            `but server.ts's onInitialize return does not declare it.`,
        ).toContain(feat.vscodeCapability!);
      });
    }

    it('features with LSP trigger characters match server.ts declarations', () => {
      for (const feat of LANGUAGE_FEATURES) {
        if (!feat.lspTriggerCharacters || !feat.vscodeCapability) continue;

        // Find the capability block and extract its triggerCharacters array.
        const capRe = new RegExp(
          `${feat.vscodeCapability}\\s*:\\s*\\{[\\s\\S]*?triggerCharacters\\s*:\\s*\\[([^\\]]+)\\]`,
        );
        const match = serverSource.match(capRe);

        expect(
          match,
          `Feature ${feat.id}: server.ts does not declare triggerCharacters ` +
            `for ${feat.vscodeCapability}, but the catalog says it should have ` +
            `[${feat.lspTriggerCharacters.join(', ')}].`,
        ).not.toBeNull();

        // Extract each quoted string inside the array — splitting by comma
        // would fail when comma itself is a trigger character.
        const declared = [...match![1].matchAll(/['"`]([^'"`]*)['"`]/g)]
          .map((m) => m[1])
          .sort();
        const expected = [...feat.lspTriggerCharacters].sort();

        expect(
          declared,
          `Feature ${feat.id}: trigger characters declared in server.ts ` +
            `don't match the catalog.`,
        ).toEqual(expected);
      }
    });
  });
});
