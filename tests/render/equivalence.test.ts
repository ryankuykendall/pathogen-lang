// Phase 1 equivalence test: the new shared renderer must produce exactly
// the same output as the pre-refactor CLI string emitter for every fixture.
//
// If this test passes, Phase 2 (swapping `generateSvg` for a thin wrapper
// over the shared module) is safe to execute — no snapshots will move.
// If this test fails, the serializer or a builder has a byte-level
// divergence; fix it here before proceeding to Phase 2.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src';
import { buildSvgTree, toSvgString } from '../../src/render';
import { generateSvg } from '../../src/svg-generator';

const FIXTURES_DIR = join(
  __dirname,
  '..',
  '..',
  'project-docs',
  'render-pipeline-unification',
  'snapshots',
);

const fixtures = readdirSync(FIXTURES_DIR)
  .filter((name) => name.endsWith('.pathogen'))
  .sort();

const options = {
  viewBox: '0 0 200 200',
  width: '200',
  height: '200',
};

describe('src/render/ ↔ src/svg-generator.ts equivalence', () => {
  for (const fixture of fixtures) {
    const name = fixture.replace(/\.pathogen$/, '');

    it(`byte-identical output: ${name}`, () => {
      const source = readFileSync(join(FIXTURES_DIR, fixture), 'utf-8');
      const result = compile(source);

      const legacy = generateSvg(result, options);
      const shared = toSvgString(buildSvgTree(result, options));

      expect(shared).toBe(legacy);
    });
  }
});
