// Cmd+click across files (phase 2d, step 7b; docs/workspace-files.md "Errors
// in other files"): a name imported from another file opens that file at its
// declaration; one declared in the file open stays a jump within it. Read
// from the real engine's getDefinition, with the graph the playground builds.

import { describe, expect, it } from 'vitest';

import { otherFileDefinition } from '../playground/utils/definition-target.js';
import { createMemoryProjectHost, getDefinition, resolveModules, StringTextDocument } from '../src';

const FILES = new Map([
  [
    'parts/gears.pathogen',
    'module;\n\nexport fn gear(cx, cy, r) {\n  circle(cx, cy, r);\n}\n\nexport const size = 4;\n',
  ],
]);
const SOURCE =
  'import { gear } from "./parts/gears.pathogen";\nimport * as g from "./parts/gears.pathogen";\n\nlet here = 1;\ngear(here, 2, 3);\ncircle(g.size, 1, 1);\n';

async function definitionAt(line: number, character: number): Promise<ReturnType<typeof getDefinition>> {
  const files = new Map([...FILES, ['main.pathogen', SOURCE]]);
  const host = createMemoryProjectHost(files, { label: 'test' });
  const { graph } = await resolveModules(SOURCE, { host, entry: '/main.pathogen' });
  return getDefinition(new StringTextDocument(SOURCE), { line, character }, { modules: graph });
}

describe('otherFileDefinition: where Cmd+click goes (step 7b)', () => {
  it('an imported fn, at its call or in the import: its file, at the declaration (1-based)', async () => {
    const atCall = otherFileDefinition(await definitionAt(4, 1), 'main.pathogen');
    const inImport = otherFileDefinition(await definitionAt(0, 10), 'main.pathogen');
    expect([atCall, inImport]).toEqual([
      { path: 'parts/gears.pathogen', line: 3, column: 11 },
      { path: 'parts/gears.pathogen', line: 3, column: 11 },
    ]);
  });

  it('a namespace’s member: its declaration; the namespace itself, or the import’s path: the file’s top', async () => {
    expect(otherFileDefinition(await definitionAt(5, 10), 'main.pathogen')).toEqual({
      path: 'parts/gears.pathogen',
      line: 7,
      column: 14,
    });
    expect(otherFileDefinition(await definitionAt(5, 7), 'main.pathogen')).toEqual({
      path: 'parts/gears.pathogen',
      line: 1,
      column: 1,
    });
    expect(otherFileDefinition(await definitionAt(0, 30), 'main.pathogen')).toEqual({
      path: 'parts/gears.pathogen',
      line: 1,
      column: 1,
    });
  });

  it('a name declared in the file open: null (the editor jumps within it)', async () => {
    const local = await definitionAt(4, 6);
    expect(local?.file).toBeUndefined();
    expect(otherFileDefinition(local, 'main.pathogen')).toBeNull();
  });

  it('a definition in the file that is open already, or none: null', () => {
    expect(
      otherFileDefinition({ file: '/main.pathogen', range: { start: { line: 2, character: 0 } } }, 'main.pathogen'),
    ).toBeNull();
    expect(otherFileDefinition(null, 'main.pathogen')).toBeNull();
  });
});
