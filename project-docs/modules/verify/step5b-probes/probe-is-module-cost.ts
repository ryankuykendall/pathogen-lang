// What reading `module;` costs (2d step 5b, after the commit): isModuleSource
// is a full Lezer parse, which 5b first ran on every keystroke. Times it on the
// largest programs in the repo (warm, median of 20).
// Found (2026-11-13): 1 to 2.5 ms per call (a 588-line blog sample: 2.5 ms).
// Run from the repo root: npx tsx project-docs/modules/verify/step5b-probes/probe-is-module-cost.ts
import { readFileSync } from 'node:fs';

import { isModuleSource } from '../../../../src';

const FILES = [
  'website/blog/samples/post16/radial-chart-complete.pathogen',
  'website/blog/samples/post24/variant-a-editorial.pathogen',
  'website/blog/samples/post24/theme-combined.pathogen',
  'project-docs/topological-gradient/topo-showcase-grouped.pathogen',
  'project-docs/path-block-boolean-operations-audit/failure-matrix-iter-3-enc.pathogen',
];

for (const file of FILES) {
  const text = readFileSync(file, 'utf8');
  for (let i = 0; i < 5; i++) isModuleSource(`${text}\n// ${i}`);
  const times: number[] = [];
  for (let i = 0; i < 20; i++) {
    const edited = `${text}\n// edit ${i}`;
    const start = performance.now();
    isModuleSource(edited);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(
    `${file}: ${text.length} chars, ${text.split('\n').length} lines: median ${times[10].toFixed(2)} ms, max ${times[19].toFixed(2)} ms`,
  );
}
