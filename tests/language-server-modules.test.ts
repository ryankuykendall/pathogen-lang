/**
 * The language server's imports (packages/pathogen-language-server/src/modules.ts;
 * phase 1a step 6c, docs/modules.md "In each tool"): each open document's
 * files read through the open buffers, the services' options from them
 * without reading anything, which open documents a change affects, and a
 * project path turned back into a URI. Real folders on disk; `pathogen-lang`
 * resolves to the sources (vitest.config.ts).
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DocumentModules } from '../packages/pathogen-language-server/src/modules';
import { getDiagnostics, getHoverInfo, StringTextDocument } from '../src';

const TMP = join(__dirname, 'tmp');
/** macOS and Windows by default: this file is found under another letter case. */
const caseInsensitiveFs = existsSync(__filename.toUpperCase());
let project = '';
const uriOf = (path: string) => pathToFileURL(join(project, ...path.split('/'))).href;

const GEARS =
  'module;\n\nexport fn gear(center, radius, teeth) {\n  star(center.x, center.y, radius, radius - 6, teeth);\n}\n';
const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(Point(55, 50), 40, 12);\n';

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  project = mkdtempSync(join(TMP, 'lsp-modules-'));
  mkdirSync(join(project, 'parts'));
  writeFileSync(join(project, 'pathogen.json'), '{}\n');
  writeFileSync(join(project, 'main.pathogen'), MAIN);
  writeFileSync(join(project, 'parts', 'gears.pathogen'), GEARS);
  writeFileSync(join(project, 'other.pathogen'), 'M 0 0\n');
});

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

/** A DocumentModules over a set of open buffers, by absolute path. */
function serverWith(open: Record<string, string> = {}) {
  return new DocumentModules((absolutePath) => open[absolutePath]);
}

describe('DocumentModules', () => {
  it('reads the files a document imports, and gives the services their options without reading again', async () => {
    const modules = serverWith();
    await modules.refresh(uriOf('main.pathogen'), MAIN);
    const options = modules.optionsFor(uriOf('main.pathogen'));
    expect([...(options.modules?.files.keys() ?? [])]).toEqual(['/parts/gears.pathogen']);
    const hover = getHoverInfo(new StringTextDocument(MAIN), { line: 1, character: 1 }, options);
    expect(hover?.contents).toContain('Defined in parts/gears.pathogen, line 3');
    expect(modules.loadErrors(uriOf('main.pathogen'))).toEqual([]);
  });

  it("an open buffer's unsaved text is what the importing document sees", async () => {
    const edited = 'module;\n\nexport fn gear(size) {\n  circle(0, 0, size);\n}\n';
    const modules = serverWith({ [join(project, 'parts', 'gears.pathogen')]: edited });
    await modules.refresh(uriOf('main.pathogen'), MAIN);
    expect(modules.optionsFor(uriOf('main.pathogen')).modules?.files.get('/parts/gears.pathogen')?.source).toBe(edited);
  });

  it('the open documents a change affects: those that import the file, directly or not', async () => {
    const modules = serverWith();
    await modules.refresh(uriOf('main.pathogen'), MAIN);
    await modules.refresh(uriOf('other.pathogen'), 'M 0 0\n');
    expect(modules.dependents(uriOf('parts/gears.pathogen'))).toEqual([uriOf('main.pathogen')]);
    expect(modules.dependents(uriOf('other.pathogen'))).toEqual([]);
    modules.forget(uriOf('main.pathogen'));
    expect(modules.dependents(uriOf('parts/gears.pathogen'))).toEqual([]);
  });

  it('…matched by the file on disk, however its URI spells the path (a linked folder, letter case)', async () => {
    const modules = serverWith();
    await modules.refresh(uriOf('main.pathogen'), MAIN);
    symlinkSync(join(project, 'parts'), join(project, 'linked'));
    try {
      expect(modules.dependents(uriOf('linked/gears.pathogen'))).toEqual([uriOf('main.pathogen')]);
    } finally {
      unlinkSync(join(project, 'linked'));
    }
    if (caseInsensitiveFs) {
      expect(modules.dependents(uriOf('PARTS/Gears.pathogen'))).toEqual([uriOf('main.pathogen')]);
    }
  });

  it('a URI that names no local file (a host) is not a file: nothing depends on it, nothing throws', () => {
    const modules = serverWith();
    expect(modules.dependents('file://server/share/gears.pathogen')).toEqual([]);
  });

  it("a Location's project path becomes a URI in the document's project folder", async () => {
    const modules = serverWith();
    await modules.refresh(uriOf('main.pathogen'), MAIN);
    expect(modules.uriFor(uriOf('main.pathogen'), '/parts/gears.pathogen')).toBe(uriOf('parts/gears.pathogen'));
  });

  it("the project's modules, for completing paths, once listed", async () => {
    const modules = serverWith();
    await modules.refresh(uriOf('main.pathogen'), MAIN);
    await modules.listed(uriOf('main.pathogen'));
    expect(modules.optionsFor(uriOf('main.pathogen')).projectFiles).toEqual(['/parts/gears.pathogen']);
    // A file created on disk: the list starts over on the next look.
    writeFileSync(join(project, 'parts', 'marks.pathogen'), 'module;\nexport const size = 2;\n');
    modules.filesChanged();
    await modules.listed(uriOf('main.pathogen'));
    expect(modules.optionsFor(uriOf('main.pathogen')).projectFiles).toEqual([
      '/parts/gears.pathogen',
      '/parts/marks.pathogen',
    ]);
  });

  it('an unsaved document: its imports are load errors that say to save it', async () => {
    const modules = serverWith();
    await modules.refresh('untitled:Untitled-1', MAIN);
    const errors = modules.loadErrors('untitled:Untitled-1');
    const diagnostics = getDiagnostics(new StringTextDocument(MAIN), {
      ...modules.optionsFor('untitled:Untitled-1'),
      loadErrors: errors,
    });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Cannot import "./parts/gears.pathogen" until this file is saved: import paths start at the file\'s folder.',
    ]);
    expect(modules.uriFor('untitled:Untitled-1', '/parts/gears.pathogen')).toBeNull();
  });

  it('a document never refreshed has no options, and no errors', () => {
    const modules = serverWith();
    expect([modules.optionsFor(uriOf('main.pathogen')), modules.loadErrors(uriOf('main.pathogen'))]).toEqual([{}, []]);
  });

  it('a slow read finishing after a newer one never replaces it, nor brings back a closed document', async () => {
    // A resolver whose reads finish when the test says, each tagged with its source.
    const finish: (() => void)[] = [];
    const slow: ConstructorParameters<typeof DocumentModules>[1] = async (filePath, source) => {
      await new Promise<void>((done) => finish.push(done));
      const entry = '/main.pathogen';
      return {
        root: project,
        entry,
        graph: { entry, files: new Map(), order: [] },
        errors: [{ message: source, file: entry, line: 1, column: 1, importedFrom: [] }],
      };
    };
    const modules = new DocumentModules(() => undefined, slow);
    const older = modules.refresh(uriOf('main.pathogen'), 'older');
    const newer = modules.refresh(uriOf('main.pathogen'), 'newer');
    finish[1]();
    await newer;
    finish[0]();
    await older;
    expect(modules.loadErrors(uriOf('main.pathogen')).map((e) => e.message)).toEqual(['newer']);

    const inFlight = modules.refresh(uriOf('main.pathogen'), 'after close');
    modules.forget(uriOf('main.pathogen'));
    finish[2]();
    await inFlight;
    expect(modules.optionsFor(uriOf('main.pathogen'))).toEqual({});
  });
});
