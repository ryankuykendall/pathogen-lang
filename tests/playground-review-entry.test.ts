// @vitest-environment jsdom
//
// The review screen's reading of an entry (2e step 5e; playground/utils/review-entry.ts):
// the main, unreadable files, the compile input, the counts, the card's line, the modal's
// box (mockup v12 R3, R4), the viewer's files and marks (review-viewer-files.ts), and a
// source from the listing or from an answer carrying files (an approval, a workspace).

import { describe, expect, it } from 'vitest';

import {
  changeLines,
  changesSummary,
  reviewCompileInput,
  reviewFileCount,
  reviewMain,
  reviewMarks,
  sourceFromAnswer,
  sourceFromListing,
  unreadableFiles,
  withFilesRead,
} from '../playground/utils/review-entry.ts';
import { reviewViewerFiles } from '../playground/utils/review-viewer-files.ts';

import type { ReviewChanges } from '../playground/utils/review-entry.ts';

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const file = (text: string) => ({ sha256: 'x', size: text.length, text });
const SOURCE = {
  name: 'Gears',
  files: { 'parts/gears.pathogen': file(GEARS), 'main.pathogen': file(MAIN) },
  folders: ['empty'],
  entryPoints: ['gone.pathogen', 'main.pathogen'],
};

const R3: ReviewChanges = {
  files: [
    { path: 'parts/gears.pathogen', mark: 'changed' },
    { path: 'parts/springs.pathogen', mark: 'new' },
    { path: 'try-sizes.pathogen', mark: 'removed' },
  ],
  foldersAdded: [],
  foldersRemoved: [],
  programs: {
    mainBefore: 'main.pathogen',
    mainAfter: 'main.pathogen',
    added: [],
    removed: ['try-sizes.pathogen'],
    orderOnly: false,
  },
  counts: { new: 1, changed: 1, removed: 1 },
};
const R4: ReviewChanges = {
  files: [{ path: 'parts/springs.pathogen', mark: 'moved', from: 'springs.pathogen' }],
  foldersAdded: ['examples'],
  foldersRemoved: [],
  programs: { mainBefore: 'main.pathogen', mainAfter: 'main.pathogen', added: [], removed: [], orderOnly: true },
  counts: { new: 0, changed: 0, removed: 0 },
};

describe('an entry’s source', () => {
  it('the main is the first program it holds; the compile input is the main with every file', () => {
    expect(reviewMain(SOURCE)).toBe('main.pathogen');
    const input = reviewCompileInput(SOURCE)!;
    expect([input.main, input.text, input.workspace.entry, input.workspace.label]).toEqual([
      'main.pathogen',
      MAIN,
      'main.pathogen',
      'Gears',
    ]);
    expect(input.workspace.files).toEqual(
      new Map([
        ['parts/gears.pathogen', GEARS],
        ['main.pathogen', MAIN],
      ]),
    );
    expect(input.workspace.folders).toEqual(['empty']);
  });

  it('a file that couldn’t be read: listed, and nothing to compile', () => {
    const lost = {
      ...SOURCE,
      files: { ...SOURCE.files, 'parts/gears.pathogen': { sha256: 'g', size: 1, unreadable: true as const } },
    };
    expect([unreadableFiles(lost), reviewCompileInput(lost)]).toEqual([['parts/gears.pathogen'], null]);
    expect(reviewCompileInput({ ...SOURCE, entryPoints: [] })).toBeNull();
  });

  it('a deferred data file (phase 3a): never compiled as empty; read by its hash, it compiles with the rest', async () => {
    const GEARS_JSON = '[{ "r": 4 }]';
    const deferred = {
      ...SOURCE,
      files: { ...SOURCE.files, 'data/gears.json': { sha256: 'd1', size: 12, deferred: true as const } },
    };
    // Not read yet: counted with the files nobody has seen, and nothing to compile.
    expect([unreadableFiles(deferred), reviewCompileInput(deferred)]).toEqual([['data/gears.json'], null]);
    const asked: string[] = [];
    const read = await withFilesRead(deferred, async (sha256) => {
      asked.push(sha256);
      return GEARS_JSON;
    });
    expect(asked).toEqual(['d1']);
    expect(read.files['data/gears.json']).toEqual({ sha256: 'd1', size: 12, text: GEARS_JSON });
    expect(reviewCompileInput(read)!.workspace.files.get('data/gears.json')).toBe(GEARS_JSON);
    // A read that fails: marked unreadable, so the screens say so and Approve stays off.
    const failed = await withFilesRead(deferred, async () => {
      throw new Error('File not found');
    });
    expect(failed.files['data/gears.json']).toEqual({ sha256: 'd1', size: 12, unreadable: true });
    expect(reviewCompileInput(failed)).toBeNull();
  });

  it('the viewer’s files: each file’s kind, pathogen.json last, opening on the program compiled, with the marks', () => {
    const engine = {
      isModuleSource: (text: string) => text.startsWith('module;'),
      workspaceProjectFileText: (entryPoints: readonly string[]) => JSON.stringify({ entryPoints }),
    };
    const viewer = reviewViewerFiles(
      { workspaceId: 'w', codeHash: 'h', ...SOURCE, changes: R3, approvedAt: '2026-11-12T10:00:00Z' },
      engine,
    );
    expect(viewer).toEqual({
      files: [
        { path: 'parts/gears.pathogen', text: GEARS, kind: 'library' },
        { path: 'main.pathogen', text: MAIN, kind: 'program' },
        { path: 'pathogen.json', text: JSON.stringify({ entryPoints: SOURCE.entryPoints }), kind: 'project' },
      ],
      folders: ['empty'],
      main: 'gone.pathogen',
      // The first program the entry holds, not the list's first name.
      open: 'main.pathogen',
      marks: reviewMarks(R3),
    });
    expect(reviewViewerFiles({ workspaceId: 'w', codeHash: 'h', ...SOURCE }, engine).marks).toBeNull();
  });

  it('a listing that carries every file’s text is the source; one that doesn’t asks the route', () => {
    const listed = {
      workspaceId: 'w',
      name: 'Rings',
      codeHash: 'h',
      files: { 'main.pathogen': file(MAIN) },
      folders: [],
      entryPoints: ['main.pathogen'],
      code: MAIN,
      changes: R4,
      approvedAt: '2026-11-12T10:00:00Z',
    };
    expect(sourceFromListing(listed)).toEqual(listed);
    const manifestOnly = { ...listed, files: { 'main.pathogen': { sha256: 'x', size: 1 } } };
    const lost = { ...listed, files: { 'main.pathogen': { sha256: 'x', size: 1, unreadable: true } } };
    expect([
      sourceFromListing(manifestOnly),
      sourceFromListing(lost),
      sourceFromListing({ ...listed, files: {} }),
    ]).toEqual([null, null, null]);
  });

  it('an approval’s source: its files, compiled from its main with every file', () => {
    const approval = { files: SOURCE.files, folders: ['empty'], entryPoints: ['main.pathogen'], codeHash: 'h' };
    const source = sourceFromAnswer('w', 'Gears', approval);
    expect(source).toEqual({ workspaceId: 'w', name: 'Gears', codeHash: 'h', ...approval });
    expect(reviewCompileInput(source)?.workspace.files).toEqual(
      new Map([
        ['parts/gears.pathogen', GEARS],
        ['main.pathogen', MAIN],
      ]),
    );
  });

  it('an approval carrying only its one text reads as main.pathogen, its size in bytes', () => {
    const source = sourceFromAnswer('w', 'Old', { code: 'M 1 1' });
    expect([source.files, source.entryPoints, reviewCompileInput(source)?.text]).toEqual([
      { 'main.pathogen': { sha256: '', size: 5, text: 'M 1 1' } },
      ['main.pathogen'],
      'M 1 1',
    ]);
    // "é" is one character, two bytes.
    expect(sourceFromAnswer('w', 'Old', { code: '// é' }).files['main.pathogen'].size).toBe(5);
    expect(reviewCompileInput(sourceFromAnswer('w', 'None', {}))).toBeNull();
  });

  it('counts pathogen.json with several files, as the list does', () => {
    expect([
      reviewFileCount(SOURCE.files),
      reviewFileCount({ 'main.pathogen': {} }),
      reviewFileCount(undefined),
    ]).toEqual([3, 1, 0]);
  });
});

describe('a re-review’s changes', () => {
  it('the card’s line counts new, changed and removed files; none says no file’s text changed', () => {
    expect([changesSummary(R3), changesSummary(R4)]).toEqual(['1 changed, 1 new, 1 removed', 'no file’s text changed']);
  });

  it('the box: a line each, the files it can open (v12 R3)', () => {
    expect(changeLines(R3)).toEqual([
      { mark: 'changed', html: '<code>parts/gears.pathogen</code> changed', file: 'parts/gears.pathogen' },
      { mark: 'new', html: '<code>parts/springs.pathogen</code> is new', file: 'parts/springs.pathogen' },
      { mark: 'removed', html: '<code>try-sizes.pathogen</code> was removed', file: null },
      {
        mark: 'changed',
        html: 'The program list: <code>try-sizes.pathogen</code> left it, so <code>pathogen.json</code> changed',
        file: 'pathogen.json',
      },
    ]);
  });

  it('the box when no file’s text changed: a move, an empty folder, the order (v12 R4)', () => {
    expect(changeLines(R4)).toEqual([
      {
        mark: 'moved',
        html: '<code>springs.pathogen</code> moved to <code>parts/springs.pathogen</code>',
        file: 'parts/springs.pathogen',
      },
      { mark: 'new', html: 'A folder was added: <code>examples/</code>, empty', file: null },
      {
        mark: 'changed',
        html: 'The program list: its order changed, so <code>pathogen.json</code> changed',
        file: 'pathogen.json',
      },
    ]);
  });

  it('a new main says so, and names are escaped', () => {
    const lines = changeLines({
      ...R4,
      files: [{ path: '<b>.pathogen', mark: 'new' }],
      foldersAdded: [],
      programs: {
        mainBefore: 'main.pathogen',
        mainAfter: 'b.pathogen',
        added: ['b.pathogen'],
        removed: [],
        orderOnly: false,
      },
    });
    expect(lines.map((l) => l.html)).toEqual([
      '<code>&lt;b&gt;.pathogen</code> is new',
      'The program list: <code>b.pathogen</code> is the new main (was <code>main.pathogen</code>); <code>b.pathogen</code> joined it, so <code>pathogen.json</code> changed',
    ]);
  });

  it('the viewer’s marks: each file, removed ones apart, pathogen.json with the list, added folders', () => {
    expect(reviewMarks(R3)).toEqual({
      files: {
        'parts/gears.pathogen': { mark: 'changed' },
        'parts/springs.pathogen': { mark: 'new' },
        'pathogen.json': { mark: 'changed' },
      },
      removed: ['try-sizes.pathogen'],
      foldersAdded: [],
    });
    expect(reviewMarks(R4)).toEqual({
      files: {
        'parts/springs.pathogen': { mark: 'moved', from: 'springs.pathogen' },
        'pathogen.json': { mark: 'changed' },
      },
      removed: [],
      foldersAdded: ['examples'],
    });
  });
});
