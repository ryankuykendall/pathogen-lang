/**
 * Phase 1a step 6d: the files the VS Code preview's document imports
 * (packages/vscode-pathogen/src/preview-modules.ts; docs/modules.md "In each
 * tool"). The extension host reads them with the shared resolver and sends
 * them to the webview as plain data, which the webview hands to compile().
 * Real folders on disk; the library is the sources.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  MODULE_PREVIEW_NOTICE,
  modulesForCompile,
  previewModules,
} from '../packages/vscode-pathogen/src/preview-modules';
import * as lib from '../src';
import * as node from '../src/node';

const TMP = join(__dirname, 'tmp');
let project = '';

const GEARS =
  'module;\n\nexport fn gear(center, radius, teeth) {\n  star(center.x, center.y, radius, radius - 6, teeth);\n}\n';
const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(Point(55, 50), 40, 12);\n';

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  project = mkdtempSync(join(TMP, 'preview-modules-'));
  mkdirSync(join(project, 'parts'));
  writeFileSync(join(project, 'pathogen.json'), '{}\n');
  writeFileSync(join(project, 'parts', 'gears.pathogen'), GEARS);
});

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

const noBuffers = (): undefined => undefined;
const main = () => join(project, 'main.pathogen');

describe('previewModules', () => {
  it('reads the imported files, and sends them as plain data the webview compiles with', async () => {
    const found = await previewModules({ lib, node }, main(), MAIN, noBuffers);
    expect([found.errors, found.notices, found.watched]).toEqual([[], [], [join(project, 'parts', 'gears.pathogen')]]);
    // What postMessage carries: JSON, no Map.
    const sent = JSON.parse(JSON.stringify(found.message));
    const result = lib.compile(MAIN, { modules: modulesForCompile(sent) });
    // The same drawing as one file with gear written in it.
    const oneFile = lib.compile(
      'fn gear(center, radius, teeth) {\n  star(center.x, center.y, radius, radius - 6, teeth);\n}\ngear(Point(55, 50), 40, 12);\n',
    );
    expect(result.layers.map((l) => l.data)).toEqual(oneFile.layers.map((l) => l.data));
  });

  it("an open buffer's unsaved text is what the preview draws", async () => {
    const edited = 'module;\n\nexport fn gear(center, radius, teeth) {\n  circle(center.x, center.y, radius);\n}\n';
    const gearsPath = join(project, 'parts', 'gears.pathogen');
    const found = await previewModules({ lib, node }, main(), MAIN, (path) =>
      path === gearsPath ? edited : undefined,
    );
    const result = lib.compile(MAIN, { modules: modulesForCompile(JSON.parse(JSON.stringify(found.message))) });
    expect(result.layers[0].data).toBe(lib.compile('circle(55, 50, 40);').layers[0].data);
  });

  it("what can't be loaded is an error in the CLI's words, which stops the compile", async () => {
    const found = await previewModules(
      { lib, node },
      main(),
      'import { gear } from "./parts/gera.pathogen";\n',
      noBuffers,
    );
    expect(found.errors).toEqual([
      `main.pathogen:1:22: error: import file "./parts/gera.pathogen" was not found (looked for ${join(project, 'parts', 'gera.pathogen')}).`,
    ]);
  });

  it('an unsaved document: its imports say to save it first', async () => {
    const found = await previewModules({ lib, node }, undefined, MAIN, noBuffers);
    expect(found.errors).toEqual([
      'Untitled:1:22: error: Cannot import "./parts/gears.pathogen" until this file is saved: import paths start at the file\'s folder.',
    ]);
    expect(found.message).toBeUndefined();
  });

  it("a module says why its preview is empty, in the docs' words", async () => {
    const found = await previewModules({ lib, node }, join(project, 'parts', 'gears.pathogen'), GEARS, noBuffers);
    expect(found.notices).toEqual([MODULE_PREVIEW_NOTICE]);
    expect(MODULE_PREVIEW_NOTICE).toBe(
      "This file is a module: a module doesn't draw, so its preview is empty. To see its fns draw, open a program that imports it.",
    );
  });

  it('a program without imports sends no files and reads nothing', async () => {
    const found = await previewModules({ lib, node }, main(), 'M 0 0 L 1 1\n', () => {
      throw new Error('read');
    });
    expect([found.message, found.errors, found.notices, found.watched]).toEqual([undefined, [], [], []]);
  });

  it('files imported through another file are sent and watched too', async () => {
    writeFileSync(
      join(project, 'parts', 'kit.pathogen'),
      'module;\nimport * as gears from "./gears.pathogen";\nexport const gear = gears.gear;\n',
    );
    const source = 'import { gear } from "./parts/kit.pathogen";\ngear(Point(55, 50), 40, 12);\n';
    const found = await previewModules({ lib, node }, main(), source, noBuffers);
    expect(found.message?.order).toEqual(['/parts/gears.pathogen', '/parts/kit.pathogen']);
    expect([...found.watched].sort()).toEqual([
      join(project, 'parts', 'gears.pathogen'),
      join(project, 'parts', 'kit.pathogen'),
    ]);
  });

  it('one import that loads and one that does not: the files and the error both come back', async () => {
    const source = 'import { gear } from "./parts/gears.pathogen";\nimport { cog } from "./parts/cog.pathogen";\n';
    const found = await previewModules({ lib, node }, main(), source, noBuffers);
    expect(found.message?.order).toEqual(['/parts/gears.pathogen']);
    expect(found.errors).toHaveLength(1);
    expect(found.errors[0]).toMatch(
      /^main\.pathogen:2:21: error: import file "\.\/parts\/cog\.pathogen" was not found/,
    );
  });
});
