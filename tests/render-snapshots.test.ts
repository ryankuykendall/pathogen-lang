// Phase 0 safety net for the render pipeline unification refactor.
// Pins the CLI string output of representative Pathogen programs so Phases 2–5
// can be proven byte-identical. If these snapshots diverge during the refactor,
// the serializer is wrong — fix the adapter, do not update the snapshot.
//
// See project-docs/render-pipeline-unification/PLAN.md for the full plan.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { generateSvg } from '../src/svg-generator';

const FIXTURES_DIR = join(__dirname, '..', 'project-docs', 'render-pipeline-unification', 'snapshots');

const fixtures = readdirSync(FIXTURES_DIR)
  .filter((name) => name.endsWith('.pathogen'))
  .sort();

describe('Render pipeline — CLI string output snapshots', () => {
  for (const fixture of fixtures) {
    const name = fixture.replace(/\.pathogen$/, '');

    it(`matches snapshot: ${name}`, async () => {
      const source = readFileSync(join(FIXTURES_DIR, fixture), 'utf-8');
      const result = compile(source);
      const svg = generateSvg(result, {
        viewBox: '0 0 200 200',
        width: '200',
        height: '200',
      });

      await expect(svg).toMatchFileSnapshot(
        join(FIXTURES_DIR, '__snapshots__', `${name}.svg`),
      );
    });
  }
});
