/**
 * 2f: the preview's drawing thread, as the extension runs it: the compiled
 * packages/vscode-pathogen/out/programs-thread.js and programs-worker.js,
 * loading the built library (dist/index.cjs, dist/node.cjs) as the extension
 * does when it runs from source. Needs `npm run build` and the extension's
 * build (`npm run build --prefix packages/vscode-pathogen`) first.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FontSession } from '../packages/vscode-pathogen/src/font-session';
import { drawProgram } from '../packages/vscode-pathogen/src/program-drawing';
import * as lib from '../src';
import * as node from '../src/node';

const OUT = join(__dirname, '..', 'packages', 'vscode-pathogen', 'out');
const DIST = join(__dirname, '..', 'dist');
const FIXTURE = join(__dirname, '..', 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project');
const TMP = join(__dirname, 'tmp');
const built = existsSync(join(OUT, 'programs-thread.js')) && existsSync(join(DIST, 'node.cjs'));
let root = '';

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  root = join(mkdtempSync(join(TMP, 'programs-thread-')), 'gears-project');
  cpSync(FIXTURE, root, { recursive: true });
});

afterAll(() => {
  rmSync(join(root, '..'), { recursive: true, force: true });
});

const at = (p: string): string => join(root, ...p.split('/'));

// A tree with no builds (a fresh checkout, a commit tested alone) skips this, saying what it needs.
describe.skipIf(!built)('the drawing thread (compiled: needs `npm run build:vscode`)', () => {
  // Loaded when a test runs, not when the file is collected, so a skip never reads out/.
  const thread = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DrawingThread } = require(
      join(OUT, 'programs-thread.js'),
    ) as typeof import('../packages/vscode-pathogen/src/programs-thread');
    return new DrawingThread(join(OUT, 'programs-worker.js'), {
      lib: join(DIST, 'index.cjs'),
      node: join(DIST, 'node.cjs'),
    });
  };

  it("draws a program as the sources do, with an open tab's text", async () => {
    const t = thread();
    try {
      const edited =
        'module;\nexport const toothDepth = 10;\nexport enum Teeth { Few = 8, Standard = 12, Fine = 20 }\nexport fn gear(center, radius, teeth) {\n  circle(center.x, center.y, radius);\n}\n';
      const open: [string, string][] = [[at('parts/gears.pathogen'), edited]];
      const drawn = await t.draw(at('main.pathogen'), open);
      const expected = await drawProgram({ lib, node }, new FontSession({ lib, node }), at('main.pathogen'), (p) =>
        p === at('parts/gears.pathogen') ? edited : undefined,
      );
      expect(drawn).toEqual(expected);
      expect(drawn.miniature).toMatch(/^data:image\/svg\+xml/);
    } finally {
      t.dispose();
    }
  });

  it('a stopped draw rejects as cancelled, and the next draw gets a fresh thread', async () => {
    const t = thread();
    try {
      const heavy = 'for (i in 0..30000) {\n  M calc(i / 100) 0 L calc(i / 100) 10\n}\n';
      const running = t.draw(at('heavy.pathogen'), [[at('heavy.pathogen'), heavy]]);
      t.cancel();
      await expect(running).rejects.toMatchObject({ name: 'DrawCancelled' });
      const next = await t.draw(at('demos/train.pathogen'), []);
      expect([next.error, next.tooLarge]).toEqual([null, false]);
    } finally {
      t.dispose();
    }
  });

  it("a program's error comes back as its row's words", async () => {
    const t = thread();
    try {
      const drawn = await t.draw(at('sketch.pathogen'), [
        [at('sketch.pathogen'), 'import { nope } from "./parts/gears.pathogen";\nM 0 0\n'],
      ]);
      expect(drawn.error).toBe('Error in sketch.pathogen line 1');
    } finally {
      t.dispose();
    }
  });
});
