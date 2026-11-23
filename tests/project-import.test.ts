// @vitest-environment jsdom
//
// Phase 2g: a new workspace from a project folder or a .zip
// (docs/workspace-files.md "A workspace from a project"; notes 68 and 69, the
// stop-or-go rule; note 70). What comes in, the program list, the generated
// pathogen.json, what stops the import, what's left out, names changed to fit
// with their imports and entryPoints following, and numbered clashes.
//
// Every plan the tests make is also checked against the server's own manifest
// rules (checkManifest, what POST /workspace runs), since the server refuses a
// manifest outright rather than dropping a bad entry.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { droppedSentence, pickFromDrop, pickFromFolderInput, pickFromZip, planImport } from '../playground/services/project-import.js';
import { writeZip } from '../playground/services/zip.js';

import type { ImportPlan, ImportRefusal, ProjectPick } from '../playground/services/project-import.js';
import type { DroppedEntry, PickedFile } from '../playground/services/uploads.js';

type Lib = typeof import('../src');
let lib: Lib;
beforeAll(async () => {
  lib = await import('../src');
  (window as unknown as { PathogenLang: unknown }).PathogenLang = lib;
});

const FIXTURES = join(__dirname, 'fixtures', 'zips');
const GEARS = join(__dirname, '..', 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project');
const gears = (path: string): string => readFileSync(join(GEARS, path), 'utf8');
const GEARS_FILES = ['main.pathogen', 'demos/train.pathogen', 'try-sizes.pathogen', 'sketch.pathogen', 'parts/gears.pathogen'];

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const file = (path: string, text: string, size?: number): PickedFile => ({
  path,
  size: size ?? encode(text).length,
  read: async () => encode(text).buffer as ArrayBuffer,
});
const pick = (files: PickedFile[], opts: Partial<ProjectPick> = {}): ProjectPick => ({
  kind: 'folder',
  picked: 'gears',
  files,
  emptyFolders: [],
  truncated: false,
  ...opts,
});
const gearsPick = (extra: PickedFile[] = [], withProjectFile = true): ProjectPick =>
  pick([
    ...(withProjectFile ? [file('pathogen.json', gears('pathogen.json'))] : []),
    ...GEARS_FILES.map((p) => file(p, gears(p))),
    ...extra,
  ]);

function planned(result: ImportPlan | ImportRefusal): ImportPlan {
  if (!result.ok) throw new Error(`expected a plan, got a refusal: ${result.message} ${result.said ?? ''}`);
  return result;
}
function refused(result: ImportPlan | ImportRefusal): ImportRefusal {
  if (result.ok) throw new Error('expected a refusal, got a plan');
  return result;
}

/** What the server would store: checkManifest must accept the plan as it is. */
function serverAccepts(plan: ImportPlan): void {
  const files = Object.fromEntries(
    Object.entries(plan.files).map(([path, { text }]) => [
      path,
      { sha256: createHash('sha256').update(text).digest('hex'), size: encode(text).length },
    ]),
  );
  const checked = lib.checkWorkspaceManifest({ files, folders: plan.folders, entryPoints: plan.entryPoints });
  if (!checked.ok) throw new Error(`the server refuses the plan: ${checked.message}`);
  expect(checked.value.entryPoints).toEqual(plan.entryPoints);
  expect(checked.value.folders).toEqual([...plan.folders].sort());
}

// ---------- the gears project, as a folder and as a .zip ----------

describe('a project folder comes in as it is', () => {
  it('every .pathogen file, the program list from pathogen.json, unlisted programs at the end', async () => {
    const plan = planned(await planImport(gearsPick()));
    expect(plan.title).toBe('gears/');
    expect(plan.name).toBe('gears');
    expect(plan.what).toBe('5 files in 2 folders');
    expect(Object.keys(plan.files).sort()).toEqual([...GEARS_FILES].sort());
    for (const path of GEARS_FILES) expect(plan.files[path].text).toBe(gears(path));
    // pathogen.json lists main, demos/train and try-sizes; sketch isn't listed, so it joins the end.
    expect(plan.entryPoints).toEqual(['main.pathogen', 'demos/train.pathogen', 'try-sizes.pathogen', 'sketch.pathogen']);
    expect(plan.modules).toEqual(['parts/gears.pathogen']);
    expect(plan.list).toBe('listed');
    expect(plan.unlisted).toEqual(['sketch.pathogen']);
    expect(plan.generated).toBeNull();
    expect(plan.folders).toEqual([]);
    expect(plan.leftOut).toEqual([]);
    expect(plan.renamed).toEqual([]);
    expect(plan.dropped).toEqual([]);
    serverAccepts(plan);
  });

  for (const zip of ['zip-r.zip', 'zip64.zip', 'ditto.zip']) {
    it(`${zip}: read from inside its one folder; __MACOSX and dot names left out without a word; empty folders kept`, async () => {
      const bytes = readFileSync(join(FIXTURES, zip));
      const zipPick = await pickFromZip(new File([bytes], 'gears.zip'));
      if ('ok' in zipPick) throw new Error(`expected a pick: ${zipPick.message}`);
      const plan = planned(await planImport(zipPick));
      expect(plan.title).toBe('gears.zip');
      expect(plan.name).toBe('gears');
      expect(plan.what).toBe('5 files in 3 folders');
      expect(Object.keys(plan.files).sort()).toEqual([...GEARS_FILES].sort());
      expect(plan.files['main.pathogen'].text).toBe(gears('main.pathogen'));
      expect(plan.entryPoints).toEqual(['main.pathogen', 'demos/train.pathogen', 'try-sizes.pathogen', 'sketch.pathogen']);
      expect(plan.folders).toEqual(['empty']);
      expect(plan.leftOut).toEqual([{ name: 'README.md', reason: 'workspaces hold .pathogen files for now.' }]);
      serverAccepts(plan);
    });
  }
});

// ---------- without a pathogen.json ----------

describe('without a pathogen.json, the workspace writes one', () => {
  it('main.pathogen is the main, the other programs in order of their paths; the file is shown', async () => {
    const plan = planned(await planImport(gearsPick([], false)));
    expect(plan.list).toBe('none');
    expect(plan.entryPoints).toEqual(['main.pathogen', 'demos/train.pathogen', 'sketch.pathogen', 'try-sizes.pathogen']);
    expect(plan.generated).toBe(lib.workspaceProjectFileText(plan.entryPoints));
    serverAccepts(plan);
  });

  it('without a main.pathogen, the first program in order of their paths is the main', async () => {
    const plan = planned(
      await planImport(pick([file('zeta.pathogen', 'M 0 0;'), file('demos/alpha.pathogen', 'M 0 0;'), file('beta.pathogen', 'M 0 0;')])),
    );
    expect(plan.entryPoints).toEqual(['beta.pathogen', 'demos/alpha.pathogen', 'zeta.pathogen']);
    expect(plan.list).toBe('none');
  });

  it('a project of modules only has no main: its pathogen.json is {}', async () => {
    const plan = planned(await planImport(pick([file('parts/gears.pathogen', 'module;\n')])));
    expect(plan.entryPoints).toEqual([]);
    expect(plan.modules).toEqual(['parts/gears.pathogen']);
    expect(plan.generated).toBe('{}\n');
    serverAccepts(plan);
  });
});

// ---------- a pathogen.json that can't be read stops the import ----------

describe("a pathogen.json that can't be read stops the import", () => {
  const withProjectFile = (text: string, opts: Partial<ProjectPick> = {}): ProjectPick =>
    pick([file('pathogen.json', text), file('main.pathogen', 'M 0 0;')], opts);
  const said = (text: string): string => {
    const parsed = lib.parseProjectFile(text, 'gears');
    if (parsed.ok) throw new Error('expected the CLI to refuse it');
    return parsed.message;
  };

  for (const [what, text] of [
    ['the old main key', '{ "main": "main.pathogen" }\n'],
    ['broken JSON', '{ "entryPoints": [ }'],
    ['something other than an object', '[]'],
    ['an unknown key', '{ "entrypoints": [] }'],
    ['an entryPoints that is not a list', '{ "entryPoints": "main.pathogen" }'],
    ['an entry without .pathogen', '{ "entryPoints": ["main"] }'],
    ['an entry outside the folder', '{ "entryPoints": ["../other/main.pathogen"] }'],
  ]) {
    it(`${what}: nothing is added, and the page says the CLI's message`, async () => {
      const refusal = refused(await planImport(withProjectFile(text)));
      expect(refusal.message).toBe(
        'This project’s pathogen.json can’t be read, so nothing was added. Fix the file, then choose the folder again:',
      );
      expect(refusal.said).toBe(said(text));
      expect(refusal.title).toBe('gears/');
      expect(refusal.what).toBe('1 file');
    });
  }

  it('names the .zip, and says to choose the .zip again', async () => {
    const refusal = refused(await planImport(withProjectFile('{ "main": "main.pathogen" }', { kind: 'zip', picked: 'gears.zip' })));
    expect(refusal.message).toBe(
      'This project’s pathogen.json can’t be read, so nothing was added. Fix the file, then choose the .zip again:',
    );
    const parsed = lib.parseProjectFile('{ "main": "main.pathogen" }', 'gears.zip');
    expect(parsed.ok).toBe(false);
    expect(refusal.said).toBe(!parsed.ok ? parsed.message : '');
    expect(refusal.title).toBe('gears.zip');
  });

  it('one larger than 1 MB, or not text, stops it too', async () => {
    const big = refused(await planImport(pick([file('pathogen.json', '{}', 2 * 1024 * 1024), file('main.pathogen', 'M 0 0;')])));
    expect(big.said).toBe('pathogen.json (gears) is larger than 1 MB.');
    const binary = refused(await planImport(pick([file('pathogen.json', '{\u0000}'), file('main.pathogen', 'M 0 0;')])));
    expect(binary.said).toBe("pathogen.json (gears) isn't text.");
  });
});

// ---------- entries the workspace can't use are dropped ----------

describe("an entryPoints entry the workspace can't use is dropped, and the page says so", () => {
  const project = (list: string[], extra: PickedFile[] = []): ProjectPick =>
    pick([
      file('pathogen.json', JSON.stringify({ entryPoints: list })),
      file('main.pathogen', 'M 0 0;'),
      file('try-sizes.pathogen', 'M 0 0;'),
      file('parts/gears.pathogen', 'module;\nexport const r = 1;\n'),
      ...extra,
    ]);

  it('a missing file, a module and a file left out; the next program is the main', async () => {
    const plan = planned(
      await planImport(
        project(
          ['notes.pathogen', 'parts/gears.pathogen', 'big.pathogen', 'try-sizes.pathogen', 'main.pathogen'],
          [file('big.pathogen', 'M 0 0;', 2 * 1024 * 1024)],
        ),
      ),
    );
    expect(plan.entryPoints).toEqual(['try-sizes.pathogen', 'main.pathogen']);
    expect(plan.list).toBe('listed');
    expect(plan.dropped).toEqual([
      { written: 'notes.pathogen', why: 'missing' },
      { written: 'parts/gears.pathogen', why: 'module' },
      { written: 'big.pathogen', why: 'left-out' },
    ]);
    expect(plan.dropped.map((d) => droppedSentence(d))).toEqual([
      'pathogen.json lists notes.pathogen, which isn’t in the project, so the program list leaves it out.',
      'pathogen.json lists parts/gears.pathogen, which is a module, so the program list leaves it out.',
      'pathogen.json lists big.pathogen, which isn’t added, so the program list leaves it out.',
    ]);
    expect(plan.leftOut).toEqual([{ name: 'big.pathogen', reason: 'larger than 1 MB, the most a .pathogen file can be.' }]);
    serverAccepts(plan);
  });

  it('a path listed twice counts once, written either way', async () => {
    const plan = planned(await planImport(project(['try-sizes.pathogen', './try-sizes.pathogen', 'main.pathogen'])));
    expect(plan.entryPoints).toEqual(['try-sizes.pathogen', 'main.pathogen']);
    expect(plan.dropped).toEqual([]);
    serverAccepts(plan);
  });

  it('an entry differing only in letter case finds its file, as on macOS and Windows', async () => {
    const plan = planned(await planImport(project(['Try-Sizes.pathogen'])));
    expect(plan.entryPoints).toEqual(['try-sizes.pathogen', 'main.pathogen']);
  });

  it('an empty entryPoints counts as none', async () => {
    const plan = planned(await planImport(project([])));
    expect(plan.list).toBe('unusable');
    expect(plan.entryPoints).toEqual(['main.pathogen', 'try-sizes.pathogen']);
    expect(plan.generated).toBeNull();
  });

  it('with no entry left, the main is chosen as without a pathogen.json', async () => {
    const plan = planned(await planImport(project(['notes.pathogen', 'parts/gears.pathogen'])));
    expect(plan.list).toBe('unusable');
    expect(plan.entryPoints).toEqual(['main.pathogen', 'try-sizes.pathogen']);
    expect(plan.dropped.map((d) => d.why)).toEqual(['missing', 'module']);
  });
});

// ---------- what's left out ----------

describe("what's left out is what an upload leaves out", () => {
  it('each file with its reason, in order of their paths; dot names and the .. climb without a word', async () => {
    const plan = planned(
      await planImport(
        gearsPick([
          file('README.md', '# Gears'),
          file('fonts/Inter-Regular.ttf', 'not a font'),
          file('out/main.svg', '<svg/>'),
          file('demos/pathogen.json', '{}'),
          file('huge.pathogen', 'M 0 0;', 1024 * 1024 + 1),
          file('binary.pathogen', 'M 0 0;\u0000'),
          file('.git/config', '[core]'),
          file('.DS_Store', 'x'),
          file('demos/../../evil.pathogen', 'M 0 0;'),
        ]),
      ),
    );
    expect(plan.leftOut).toEqual([
      { name: 'README.md', reason: 'workspaces hold .pathogen files for now.' },
      { name: 'binary.pathogen', reason: "isn't text, so it can't be a .pathogen file." },
      { name: 'demos/pathogen.json', reason: 'inside a folder, it would make that folder a project of its own.' },
      {
        name: 'fonts/Inter-Regular.ttf',
        reason: 'the playground can\'t load font files yet. Use the Google Fonts family instead: @font "Inter" 400;',
      },
      { name: 'huge.pathogen', reason: 'larger than 1 MB, the most a .pathogen file can be.' },
      { name: 'out/main.svg', reason: 'workspaces hold .pathogen files for now; data files come later.' },
    ]);
    expect(Object.keys(plan.files).sort()).toEqual([...GEARS_FILES].sort());
    serverAccepts(plan);
  });

  it('a path the .zip holds twice: the last copy comes in, and the page says so', async () => {
    const plan = planned(
      await planImport(pick([file('main.pathogen', 'M 0 0;'), file('main.pathogen', 'M 5 5;'), file('sketch.pathogen', 'M 1 1;')], { kind: 'zip', picked: 'gears.zip' })),
    );
    expect(plan.files['main.pathogen'].text).toBe('M 5 5;');
    expect(plan.what).toBe('2 files');
    expect(plan.leftOut).toEqual([{ name: 'main.pathogen', reason: 'is in the project twice: the last copy comes in.' }]);
    serverAccepts(plan);
  });

  it('a folder picked with more than 1,000 files says only the first were read', async () => {
    const plan = planned(await planImport({ ...gearsPick(), truncated: true }));
    expect(plan.leftOut[0]).toEqual({ name: 'The folder', reason: 'holds more than 1000 files: only the first were read.' });
  });
});

// ---------- the 20-file limit, and nothing to import ----------

describe('more than 20 .pathogen files adds nothing', () => {
  const many = (n: number): PickedFile[] => Array.from({ length: n }, (_, i) => file(`shapes/s${i}.pathogen`, 'M 0 0;'));

  it('21 refuses the whole import; what is left out does not count', async () => {
    const refusal = refused(await planImport(pick([...many(21), file('README.md', 'x')])));
    expect(refusal.message).toBe(
      'A workspace holds at most 20 files, and this project has 21. Nothing was added. To bring part of it in, import a folder holding fewer files.',
    );
    expect(refusal.what).toBe('21 .pathogen files in 1 folder');
    const plan = planned(await planImport(pick([...many(20), file('README.md', 'x'), file('big.pathogen', 'M', 2 * 1024 * 1024)])));
    expect(Object.keys(plan.files)).toHaveLength(20);
    serverAccepts(plan);
  });

  it('no .pathogen file a workspace can take: nothing to import', async () => {
    const refusal = refused(await planImport(pick([file('README.md', 'x')])));
    expect(refusal.message).toBe('There’s no .pathogen file here that a workspace can take, so nothing was added.');
    expect(refusal.leftOut).toEqual([{ name: 'README.md', reason: 'workspaces hold .pathogen files for now.' }]);
  });
});

// ---------- names changed to fit, and numbered clashes ----------

describe('a name that breaks the name rules is changed, and its imports and entryPoints follow', () => {
  it('a file and a folder renamed; relative and / imports rewritten; entryPoints mapped', async () => {
    const main = [
      'import { gear } from "./my parts/gear wheel.pathogen";',
      'import { r } from "/my parts/über.pathogen";',
      'gear(r);',
      '',
    ].join('\n');
    const plan = planned(
      await planImport(
        pick([
          file('pathogen.json', '{ "entryPoints": ["main program.pathogen"] }'),
          file('main program.pathogen', main),
          file('my parts/gear wheel.pathogen', 'module;\nimport { r } from "./über.pathogen";\nexport fn gear(x) { circle(0, 0, x); }\n'),
          file('my parts/über.pathogen', 'module;\nexport const r = 4;\n'),
        ]),
      ),
    );
    expect(Object.keys(plan.files).sort()).toEqual(['main-program.pathogen', 'my-parts/gear-wheel.pathogen', 'my-parts/uber.pathogen']);
    expect(plan.files['main-program.pathogen'].text).toBe(
      [
        'import { gear } from "./my-parts/gear-wheel.pathogen";',
        'import { r } from "/my-parts/uber.pathogen";',
        'gear(r);',
        '',
      ].join('\n'),
    );
    expect(plan.files['my-parts/gear-wheel.pathogen'].text).toBe(
      'module;\nimport { r } from "./uber.pathogen";\nexport fn gear(x) { circle(0, 0, x); }\n',
    );
    expect(plan.entryPoints).toEqual(['main-program.pathogen']);
    expect(plan.renamed).toEqual([
      { from: 'main program.pathogen', to: 'main-program.pathogen' },
      { from: 'my parts/gear wheel.pathogen', to: 'my-parts/gear-wheel.pathogen' },
      { from: 'my parts/über.pathogen', to: 'my-parts/uber.pathogen' },
    ]);
    serverAccepts(plan);
  });

  it('two names the same once fitted, or differing only in letter case: the second in path order gets a number', async () => {
    const plan = planned(
      await planImport(
        pick([
          file('main.pathogen', 'import { a } from "./gears.pathogen";\nimport { b } from "./Gears.pathogen";\nimport { c } from "./parts/x.pathogen";\nimport { d } from "./Parts/y.pathogen";\n'),
          file('Gears.pathogen', 'module;\nexport const b = 1;\n'),
          file('gears.pathogen', 'module;\nexport const a = 1;\n'),
          file('Parts/y.pathogen', 'module;\nexport const d = 1;\n'),
          file('parts/x.pathogen', 'module;\nexport const c = 1;\n'),
          file('my gear.pathogen', 'M 0 0;'),
          file('my-gear.pathogen', 'M 1 1;'),
        ]),
      ),
    );
    expect(Object.keys(plan.files).sort()).toEqual([
      'Gears.pathogen',
      'Parts/y.pathogen',
      'gears-2.pathogen',
      'main.pathogen',
      'my-gear-2.pathogen',
      'my-gear.pathogen',
      'parts-2/x.pathogen',
    ]);
    // "my gear" sorts before "my-gear" (a space before a dash), so it takes the name and the other is numbered.
    expect(plan.files['my-gear.pathogen'].text).toBe('M 0 0;');
    expect(plan.files['my-gear-2.pathogen'].text).toBe('M 1 1;');
    expect(plan.files['main.pathogen'].text).toBe(
      'import { a } from "./gears-2.pathogen";\nimport { b } from "./Gears.pathogen";\nimport { c } from "./parts-2/x.pathogen";\nimport { d } from "./Parts/y.pathogen";\n',
    );
    expect(plan.renamed).toEqual([
      { from: 'gears.pathogen', to: 'gears-2.pathogen' },
      { from: 'my gear.pathogen', to: 'my-gear.pathogen' },
      { from: 'my-gear.pathogen', to: 'my-gear-2.pathogen' },
      { from: 'parts/x.pathogen', to: 'parts-2/x.pathogen' },
    ]);
    serverAccepts(plan);
  });
});

// ---------- picking: a folder, a drop, a .zip ----------

describe('picking a project', () => {
  const asFile = (path: string, text: string): File => {
    const f = new File([text], path.slice(path.lastIndexOf('/') + 1));
    Object.defineProperty(f, 'webkitRelativePath', { value: path });
    return f;
  };

  it('Choose folder…: the picked folder is the top', () => {
    const result = pickFromFolderInput([asFile('gears/main.pathogen', 'M 0 0;'), asFile('gears/parts/gears.pathogen', 'module;')]);
    if ('ok' in result) throw new Error(result.message);
    expect(result.kind).toBe('folder');
    expect(result.picked).toBe('gears');
    expect(result.files.map((f) => f.path)).toEqual(['main.pathogen', 'parts/gears.pathogen']);
  });

  const dirEntry = (name: string, children: DroppedEntry[]): DroppedEntry => ({
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let done = false;
      return {
        readEntries: (ok) => {
          ok(done ? [] : children);
          done = true;
        },
      };
    },
  });
  const fileEntry = (name: string, text: string): DroppedEntry => ({
    name,
    isFile: true,
    isDirectory: false,
    file: (ok) => ok(new File([text], name)),
  });

  it('a dropped folder: its own name is the top, and its empty folders come too', async () => {
    const result = await pickFromDrop({
      entries: [dirEntry('gears', [fileEntry('main.pathogen', 'M 0 0;'), dirEntry('empty', [])])],
      files: [null],
    });
    if ('ok' in result) throw new Error(result.message);
    expect(result.picked).toBe('gears');
    expect(result.files.map((f) => f.path)).toEqual(['main.pathogen']);
    expect(result.emptyFolders).toEqual(['empty']);
  });

  it('a dropped .zip is read as a .zip', async () => {
    const zip = writeZip([{ path: 'gears/' }, { path: 'gears/main.pathogen', bytes: encode('M 0 0;') }]);
    // The drop's file entry and the File itself, as captureDrop takes them while the drop lasts.
    const result = await pickFromDrop({ entries: [fileEntry('gears.zip', '')], files: [new File([zip], 'gears.zip')] });
    if ('ok' in result) throw new Error(result.message);
    expect(result.kind).toBe('zip');
    expect(result.picked).toBe('gears.zip');
    expect(result.files.map((f) => f.path)).toEqual(['main.pathogen']);
  });

  it('two things dropped, or one file that is not a .zip, is refused', async () => {
    const two = await pickFromDrop({ entries: [dirEntry('a', []), dirEntry('b', [])], files: [null, null] });
    expect('ok' in two && two.message).toBe('Drop one project folder, or one .zip.');
    const one = await pickFromDrop({ entries: [fileEntry('main.pathogen', 'M 0 0;')], files: [null] });
    expect('ok' in one && one.message).toBe('Drop one project folder, or one .zip.');
  });

  it('a .zip with its files at the top stays as it is; one folder beside a stray dot file is unwrapped', async () => {
    const flat = await pickFromZip(new File([writeZip([{ path: 'main.pathogen', bytes: encode('M 0 0;') }, { path: 'demos/' }])], 'flat.zip'));
    if ('ok' in flat) throw new Error(flat.message);
    expect(flat.files.map((f) => f.path)).toEqual(['main.pathogen']);
    expect(flat.emptyFolders).toEqual(['demos']);
    const wrapped = await pickFromZip(
      new File(
        [writeZip([{ path: '.DS_Store', bytes: encode('x') }, { path: 'gears/' }, { path: 'gears/main.pathogen', bytes: encode('M 0 0;') }])],
        'Gears (1).ZIP',
      ),
    );
    if ('ok' in wrapped) throw new Error(wrapped.message);
    expect(wrapped.files.map((f) => f.path)).toEqual(['main.pathogen']);
    expect(wrapped.picked).toBe('Gears (1).ZIP');
    const plan = planned(await planImport(wrapped));
    expect(plan.name).toBe('Gears (1)');
  });

  it("a file that isn't a .zip is refused with the reason", async () => {
    const result = await pickFromZip(new File([encode('not a zip at all, just text')], 'gears.zip'));
    expect('ok' in result && result.message).toBe('This .zip can’t be read, so nothing was added: it isn\'t a .zip file.');
  });
});
