/**
 * An error in another file, at its own line, in the language server
 * (packages/pathogen-language-server/src/cross-file-diagnostics.ts;
 * docs/modules.md "In each tool": "if that file is open, the error shows at
 * its own line too"). A document's check sends errors to other files; each
 * file's publish is its own diagnostics plus what was sent to it. The
 * end-to-end run over stdio is project-docs/modules/verify/verify-step6c-lsp.mjs.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CrossFileDiagnostics } from '../packages/pathogen-language-server/src/cross-file-diagnostics';
import { DocumentModules, fileKeyOf } from '../packages/pathogen-language-server/src/modules';

import type { Diagnostic } from 'vscode-languageserver/node';

const error = (line: number, message: string): Diagnostic => ({
  range: { start: { line, character: 2 }, end: { line, character: 20 } },
  severity: 1,
  message,
  source: 'pathogen-evaluator',
});

/** macOS and Windows by default: this file is found under another letter case. */
const caseInsensitiveFs = existsSync(__filename.toUpperCase());

const MAIN = 'file:///p/main.pathogen';
const SCENE = 'file:///p/scene.pathogen';
const GEARS = 'file:///p/parts/gears.pathogen';
const GEARS_KEY = '/p/parts/gears.pathogen';

describe('CrossFileDiagnostics', () => {
  it("a file's publish is its own diagnostics, then what other documents sent it", () => {
    const merged = new CrossFileDiagnostics();
    const own = error(0, 'its own');
    const sent = error(3, 'assertion failed: too few\n  called from main.pathogen line 3');
    expect(merged.checked(GEARS, [own], [])).toEqual(new Set());
    expect(merged.checked(MAIN, [error(2, 'on the call')], [{ to: GEARS_KEY, diagnostic: sent }])).toEqual(
      new Set([GEARS_KEY]),
    );
    expect(merged.for(GEARS, GEARS_KEY)).toEqual([own, sent]);
    // The sender's own publish doesn't include what it sent.
    expect(merged.for(MAIN, '/p/main.pathogen')).toEqual([error(2, 'on the call')]);
  });

  it('a new check of the sender replaces what it sent; fixed, it sends nothing, and the file is published again', () => {
    const merged = new CrossFileDiagnostics();
    merged.checked(MAIN, [], [{ to: GEARS_KEY, diagnostic: error(3, 'first') }]);
    merged.checked(MAIN, [], [{ to: GEARS_KEY, diagnostic: error(3, 'second') }]);
    expect(merged.for(GEARS, GEARS_KEY)).toEqual([error(3, 'second')]);
    expect(merged.checked(MAIN, [], [])).toEqual(new Set([GEARS_KEY]));
    expect(merged.for(GEARS, GEARS_KEY)).toEqual([]);
  });

  it('closing the sender takes back what it sent', () => {
    const merged = new CrossFileDiagnostics();
    merged.checked(MAIN, [], [{ to: GEARS_KEY, diagnostic: error(3, 'from main') }]);
    expect(merged.closed(MAIN)).toEqual(new Set([GEARS_KEY]));
    expect(merged.for(GEARS, GEARS_KEY)).toEqual([]);
    expect(merged.closed(MAIN)).toEqual(new Set());
  });

  it('two documents sending the same error show it once; different trails show both', () => {
    const merged = new CrossFileDiagnostics();
    const fromMain = error(3, 'too few\n  called from main.pathogen line 3');
    merged.checked(MAIN, [], [{ to: GEARS_KEY, diagnostic: fromMain }]);
    merged.checked(SCENE, [], [{ to: GEARS_KEY, diagnostic: { ...fromMain } }]);
    expect(merged.for(GEARS, GEARS_KEY)).toEqual([fromMain]);
    const fromScene = error(3, 'too few\n  called from scene.pathogen line 9');
    merged.checked(SCENE, [], [{ to: GEARS_KEY, diagnostic: fromScene }]);
    expect(merged.for(GEARS, GEARS_KEY)).toEqual([fromMain, fromScene]);
  });

  it("only the file it was sent to gets it, and a document that isn't a saved file gets only its own", () => {
    const merged = new CrossFileDiagnostics();
    merged.checked(MAIN, [], [{ to: GEARS_KEY, diagnostic: error(3, 'for gears') }]);
    expect(merged.for(SCENE, '/p/scene.pathogen')).toEqual([]);
    merged.checked('untitled:Untitled-1', [error(0, 'mine')], []);
    expect(merged.for('untitled:Untitled-1', null)).toEqual([error(0, 'mine')]);
  });
});

describe('DocumentModules.keyFor and fileKeyOf: one spelling for an editor URI and a project path', () => {
  const TMP = join(__dirname, 'tmp');
  let project = '';
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true });
    project = mkdtempSync(join(TMP, 'lsp-cross-file-'));
    mkdirSync(join(project, 'parts'));
    writeFileSync(join(project, 'pathogen.json'), '{}\n');
    writeFileSync(join(project, 'parts', 'gears.pathogen'), 'module;\nexport const size = 1;\n');
  });
  afterAll(() => rmSync(project, { recursive: true, force: true }));

  it("a project path from main's check is the key of the gears tab", async () => {
    const modules = new DocumentModules(() => undefined);
    const main = pathToFileURL(join(project, 'main.pathogen')).href;
    await modules.refresh(main, 'import { size } from "./parts/gears.pathogen";\n');
    const gearsTab = pathToFileURL(join(project, 'parts', 'gears.pathogen')).href;
    expect(modules.keyFor(main, '/parts/gears.pathogen')).toBe(fileKeyOf(gearsTab));
    expect(fileKeyOf('untitled:Untitled-1')).toBeNull();
    // A document never checked has no project folder yet.
    expect(modules.keyFor('file:///elsewhere/x.pathogen', '/parts/gears.pathogen')).toBeNull();
  });

  it('…however the tab spells the path: through a linked folder, or in other letter case', async () => {
    const modules = new DocumentModules(() => undefined);
    const main = pathToFileURL(join(project, 'main.pathogen')).href;
    await modules.refresh(main, 'import { size } from "./parts/gears.pathogen";\n');
    const key = modules.keyFor(main, '/parts/gears.pathogen');
    // And main opened through the linked folder sends to the same file.
    symlinkSync(project, `${project}-linked`);
    try {
      expect(fileKeyOf(pathToFileURL(join(`${project}-linked`, 'parts', 'gears.pathogen')).href)).toBe(key);
      const linkedMain = pathToFileURL(join(`${project}-linked`, 'main.pathogen')).href;
      await modules.refresh(linkedMain, 'import { size } from "./parts/gears.pathogen";\n');
      expect(modules.keyFor(linkedMain, '/parts/gears.pathogen')).toBe(key);
    } finally {
      unlinkSync(`${project}-linked`);
    }
    if (caseInsensitiveFs) {
      expect(fileKeyOf(pathToFileURL(join(project, 'PARTS', 'Gears.pathogen')).href)).toBe(key);
    }
  });
});
