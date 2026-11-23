// @vitest-environment jsdom
//
// Phase 2g: Download workspace (docs/workspace-files.md "Downloading a
// workspace"; note 70). The .zip holds one folder named after the workspace,
// with pathogen.json and every file and folder. Unzipped, the CLI compiles
// it and VS Code lists the same programs in the same order; and a download
// comes back in through the import as the same workspace.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isModuleSource } from '../src';
import { findProjectRoot, loadProjectFileSync, readProjectMain } from '../src/node';
import { readProject } from '../packages/vscode-pathogen/src/preview-programs';
import { pickFromZip, planImport } from '../playground/services/project-import.js';
import { downloadFolderName, workspaceZip } from '../playground/services/workspace-download.js';
import { readZip } from '../playground/services/zip.js';

import type { Texts } from '../packages/vscode-pathogen/src/preview-programs';
import type { WorkspaceForDownload } from '../playground/services/workspace-download.js';

type Lib = typeof import('../src');
let lib: Lib;
beforeAll(async () => {
  lib = await import('../src');
  (window as unknown as { PathogenLang: unknown }).PathogenLang = lib;
});

const ROOT = join(__dirname, '..');
const CLI = join(ROOT, 'src', 'cli.ts');
const GEARS = join(ROOT, 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project');
const gears = (path: string): string => readFileSync(join(GEARS, path), 'utf8');
const hasUnzip = ((): boolean => {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** The gears workspace as the playground holds it, with an unsaved edit in try-sizes and an empty folder. */
const workspace = (): WorkspaceForDownload => ({
  name: 'Gear studies',
  texts: new Map([
    ['main.pathogen', gears('main.pathogen')],
    ['demos/train.pathogen', gears('demos/train.pathogen')],
    ['try-sizes.pathogen', `${gears('try-sizes.pathogen')}// edited, not saved yet\n`],
    ['sketch.pathogen', gears('sketch.pathogen')],
    ['parts/gears.pathogen', gears('parts/gears.pathogen')],
  ]),
  folders: ['drafts'],
  entryPoints: ['main.pathogen', 'demos/train.pathogen', 'try-sizes.pathogen', 'sketch.pathogen'],
});

const text = (buffer: ArrayBuffer): string => new TextDecoder().decode(buffer);

describe('the .zip', () => {
  it("is named after the workspace, fitted to the name rules as an upload's names are", () => {
    expect(downloadFolderName('Gear studies')).toBe('Gear-studies');
    expect(downloadFolderName('Über gears!')).toBe('Uber-gears');
    expect(downloadFolderName('  ')).toBe('workspace');
    expect(workspaceZip(workspace()).fileName).toBe('Gear-studies.zip');
  });

  it('holds one folder: pathogen.json, then every folder and file, empty folders kept', async () => {
    const entries = await readZip(workspaceZip(workspace()).bytes);
    expect(entries.map((e) => (e.folder ? `${e.path}/` : e.path))).toEqual([
      'Gear-studies/',
      'Gear-studies/pathogen.json',
      'Gear-studies/demos/',
      'Gear-studies/demos/train.pathogen',
      'Gear-studies/drafts/',
      'Gear-studies/main.pathogen',
      'Gear-studies/parts/',
      'Gear-studies/parts/gears.pathogen',
      'Gear-studies/sketch.pathogen',
      'Gear-studies/try-sizes.pathogen',
    ]);
    const byPath = new Map(entries.map((e) => [e.path, e]));
    // pathogen.json is the workspace's own, from its one writer.
    expect(text(await byPath.get('Gear-studies/pathogen.json')!.read())).toBe(
      lib.workspaceProjectFileText(workspace().entryPoints),
    );
    // Each file as the editor holds it, the unsaved edit included.
    expect(text(await byPath.get('Gear-studies/try-sizes.pathogen')!.read())).toBe(
      `${gears('try-sizes.pathogen')}// edited, not saved yet\n`,
    );
  });

  it('a workspace with no programs writes pathogen.json as {}', async () => {
    const entries = await readZip(
      workspaceZip({ name: 'Parts', texts: new Map([['gears.pathogen', 'module;\n']]), folders: [], entryPoints: [] }).bytes,
    );
    expect(text(await entries.find((e) => e.path === 'Parts/pathogen.json')!.read())).toBe('{}\n');
  });
});

describe('a download comes back in through the import as the same workspace', () => {
  it('the same files, empty folders and program list; the name is the folder name', async () => {
    const { fileName, bytes } = workspaceZip(workspace());
    const pick = await pickFromZip(new File([bytes], fileName));
    if ('ok' in pick) throw new Error(pick.message);
    const plan = await planImport(pick);
    if (!plan.ok) throw new Error(plan.message);
    expect(Object.fromEntries(Object.entries(plan.files).map(([p, f]) => [p, f.text]))).toEqual(
      Object.fromEntries(workspace().texts),
    );
    expect(plan.folders).toEqual(['drafts']);
    expect(plan.entryPoints).toEqual(workspace().entryPoints);
    expect(plan.list).toBe('listed');
    expect(plan.name).toBe('Gear-studies');
    expect(plan.leftOut).toEqual([]);
    expect(plan.renamed).toEqual([]);
  });
});

describe.skipIf(!hasUnzip)('unzipped, the folder is a project folder', () => {
  let dir = '';
  let folder = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pathogen-download-'));
    const { fileName, bytes } = workspaceZip(workspace());
    writeFileSync(join(dir, fileName), bytes);
    execFileSync('unzip', ['-q', fileName], { cwd: dir });
    folder = join(dir, 'Gear-studies');
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('`pathogen-lang Gear-studies` compiles its main, as the project folder it came from compiles', () => {
    const run = (target: string, cwd: string) =>
      spawnSync('npx', ['tsx', CLI, target], { cwd, encoding: 'utf-8', env: { ...process.env, PATHOGEN_OFFLINE: '1' } });
    const downloaded = run('Gear-studies', dir);
    const original = run(GEARS, ROOT);
    expect(downloaded.stderr).toBe('');
    expect(downloaded.status).toBe(0);
    expect(original.status).toBe(0);
    expect(downloaded.stdout).toBe(original.stdout);
    expect(downloaded.stdout).toMatch(/^M /);
  });

  it("VS Code's program list holds the same programs, in the same order", async () => {
    const texts: Texts = {
      open: () => undefined,
      read: (p) => {
        try {
          return readFileSync(p, 'utf8');
        } catch {
          return undefined;
        }
      },
    };
    const libs = { lib: { isModuleSource }, node: { findProjectRoot, loadProjectFileSync, readProjectMain } };
    const project = await readProject(join(folder, 'main.pathogen'), libs, texts);
    expect(project).not.toBeNull();
    expect(project!.listed).toEqual(workspace().entryPoints.map((p) => join(folder, ...p.split('/'))));
    expect(project!.main).toBe(join(folder, 'main.pathogen'));
  });
});
