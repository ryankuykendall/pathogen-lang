// @vitest-environment jsdom
//
// Uploads (phase 2d, step 6a; mockup v6 screen U, docs/workspace-files.md
// "Uploading files"): where each picked file goes, what clashes, what's left
// out and why; reading a file's bytes as a .pathogen text; walking a dropped
// folder; and the change an upload makes (planUpload). The real engine sits
// on window.PathogenLang, as the bundle does in the browser.

import { beforeAll, describe, expect, it } from 'vitest';

import {
  captureDrop,
  fontSuggestion,
  leftOutLines,
  MAX_PICKED,
  pickedFromDrop,
  pickedFromInput,
  sortUpload,
  textOf,
} from '../playground/services/uploads.js';
import { applyChange, planUpload } from '../playground/services/workspace-edits.js';

import type { DroppedEntry, PickedFile } from '../playground/services/uploads.js';
import type { WorkspaceState } from '../playground/services/workspace-edits.js';

beforeAll(async () => {
  (window as unknown as { PathogenLang: unknown }).PathogenLang = await import('../src');
});

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) {\n  circle(0, 0, r);\n}\n';
const LABELS = 'module;\nexport const label = 1;\n';
const PROGRAM = 'circle(10, 10, 4);\n';

const state = (): WorkspaceState => ({
  files: {
    'main.pathogen': MAIN,
    'parts/gears.pathogen': GEARS,
    'parts/labels.pathogen': LABELS,
    'try-sizes.pathogen': PROGRAM,
  },
  folders: ['empty'],
  entryPoints: ['main.pathogen', 'try-sizes.pathogen'],
});

const encode = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;
const picked = (path: string, text = PROGRAM, size?: number): PickedFile => ({
  path,
  size: size ?? new TextEncoder().encode(text).length,
  read: async () => encode(text),
});

describe('sortUpload: where each file goes', () => {
  it('into the folder dropped on; a folder keeps its insides', () => {
    const sorted = sortUpload(state(), 'parts', [picked('springs.pathogen'), picked('shapes/round/dot.pathogen')]);
    expect(sorted.candidates.map((c) => [c.path, c.clashesWith])).toEqual([
      ['parts/springs.pathogen', null],
      ['parts/shapes/round/dot.pathogen', null],
    ]);
    expect(sorted.leftOut).toEqual([]);
  });

  it('a name taken in any letter case clashes with the file already there', () => {
    const sorted = sortUpload(state(), 'parts', [picked('Labels.pathogen'), picked('labels.pathogen')]);
    expect(sorted.candidates.map((c) => [c.path, c.clashesWith])).toEqual([
      ['parts/Labels.pathogen', 'parts/labels.pathogen'],
    ]);
    // Two picked files that differ only in case can't both go in.
    expect(sorted.leftOut).toEqual([
      {
        name: 'labels.pathogen',
        reason: "differs from Labels.pathogen only in letter case, and both can't be in one folder.",
      },
    ]);
  });

  it('a folder whose name differs only in case goes into the one already there', () => {
    const sorted = sortUpload(state(), '', [picked('Parts/springs.pathogen'), picked('EMPTY/a.pathogen')]);
    expect(sorted.candidates.map((c) => c.path)).toEqual(['parts/springs.pathogen', 'empty/a.pathogen']);
  });

  it('leaves out what a workspace can’t hold, each with why (mockup v6 screen U, state 4; screen J, state 5)', () => {
    const sorted = sortUpload(state(), '', [
      picked('springs.pathogen'),
      picked('cities.csv'),
      picked('Raleway-Bold.ttf'),
      picked('notes'),
      picked('pathogen.json'),
      picked('shapes/pathogen.json'),
      picked('my gear.pathogen'),
      picked('big.pathogen', PROGRAM, 1024 * 1024 + 1),
    ]);
    expect(sorted.candidates.map((c) => c.path)).toEqual(['springs.pathogen']);
    expect(sorted.leftOut).toEqual([
      { name: 'cities.csv', reason: 'workspaces hold .pathogen files for now; data files come later.' },
      {
        name: 'Raleway-Bold.ttf',
        reason: 'the playground can\'t load font files yet. Use the Google Fonts family instead: @font "Raleway" 700;',
      },
      { name: 'notes', reason: 'workspaces hold .pathogen files for now.' },
      {
        name: 'pathogen.json',
        reason: 'the playground writes this file itself. To change the main, use Set as main on a program.',
      },
      { name: 'shapes/pathogen.json', reason: 'inside a folder, it would make that folder a project of its own.' },
      {
        name: 'my gear.pathogen',
        reason: 'can use only letters a–z and A–Z, digits, -, _ and ., and must start with a letter or a digit.',
      },
      { name: 'big.pathogen', reason: 'larger than 1 MB, the most a .pathogen file can be.' },
    ]);
  });

  it('files and folders whose names start with a dot are left out without a word', () => {
    const sorted = sortUpload(state(), '', [
      picked('.DS_Store'),
      picked('shapes/.DS_Store'),
      picked('.git/config.pathogen'),
      picked('shapes/star.pathogen'),
    ]);
    expect([sorted.candidates.map((c) => c.path), sorted.leftOut]).toEqual([['shapes/star.pathogen'], []]);
  });

  it('a file can’t go where a folder has its name, nor a folder where a file has its', () => {
    const sorted = sortUpload(state(), '', [
      picked('empty'),
      picked('Empty.pathogen'),
      picked('main.pathogen/x.pathogen'),
    ]);
    expect(sorted.candidates.map((c) => c.path)).toEqual(['Empty.pathogen']);
    expect(sorted.leftOut.map((l) => [l.name, l.reason])).toEqual([
      ['empty', 'workspaces hold .pathogen files for now.'],
      ['main.pathogen/x.pathogen', "main.pathogen is a file, so it can't hold a folder."],
    ]);
  });

  it('within one upload, folders that differ only in case go into one, and a new file’s name can’t also be a folder', () => {
    const sorted = sortUpload(state(), '', [
      picked('Shapes/a.pathogen'),
      picked('shapes/b.pathogen'),
      picked('star.pathogen'),
      picked('star.pathogen/c.pathogen'),
      picked('round/d.pathogen'),
      picked('Round.pathogen'),
    ]);
    expect(sorted.candidates.map((c) => c.path)).toEqual([
      'Shapes/a.pathogen',
      'Shapes/b.pathogen',
      'star.pathogen',
      'round/d.pathogen',
      'Round.pathogen',
    ]);
    expect(sorted.leftOut.map((l) => [l.name, l.reason])).toEqual([
      ['star.pathogen/c.pathogen', "star.pathogen is a file, so it can't hold a folder."],
    ]);
  });

  it('too deep a folder is left out with the workspace’s own message', () => {
    const deep = `${Array.from({ length: 9 }, (_, i) => `f${i}`).join('/')}/x.pathogen`;
    expect(sortUpload(state(), '', [picked(deep)]).leftOut[0].reason).toBe('is more than 8 folders deep.');
  });
});

describe('fontSuggestion', () => {
  it('the Google Fonts line a font file’s name suggests', () => {
    expect(fontSuggestion('Raleway-Bold.ttf')).toBe('@font "Raleway" 700;');
    expect(fontSuggestion('OpenSans-Regular.ttf')).toBe('@font "Open Sans" 400;');
    expect(fontSuggestion('Inter_SemiBoldItalic.woff2')).toBe('@font "Inter" 600;');
    expect(fontSuggestion('Lobster.otf')).toBe('@font "Lobster";');
    // A family with a hyphen in its file name, and a quote that would break the line.
    expect(fontSuggestion('Open-Sans-Bold.ttf')).toBe('@font "Open Sans" 700;');
    expect(fontSuggestion('Fira-Code.woff2')).toBe('@font "Fira Code";');
    expect(fontSuggestion('Odd"Name.ttf')).toBe('@font "Odd Name";');
  });
});

describe('textOf: a file’s bytes as a .pathogen text', () => {
  it('UTF-8 text, a byte-order mark dropped and line ends made \\n, as the editor keeps them', () => {
    const bom = String.fromCharCode(0xfeff);
    expect(textOf(encode(`${bom}circle(1, 1, 1);\r\nM 0 0\rL 1 1\n`))).toEqual({
      text: 'circle(1, 1, 1);\nM 0 0\nL 1 1\n',
    });
  });

  it('bytes that aren’t text are refused', () => {
    expect(textOf(new Uint8Array([0xff, 0xfe, 0x00, 0x41]).buffer)).toEqual({
      problem: "isn't text, so it can't be a .pathogen file.",
    });
    expect(textOf(encode(`M 0 0${String.fromCharCode(0)}`))).toEqual({
      problem: "isn't text, so it can't be a .pathogen file.",
    });
  });
});

describe('picked files', () => {
  it('Upload folder…’s files keep the folder they came in', async () => {
    const plain = new File([PROGRAM], 'star.pathogen');
    const inFolder = new File([PROGRAM], 'dot.pathogen');
    Object.defineProperty(inFolder, 'webkitRelativePath', { value: 'shapes/round/dot.pathogen' });
    const { picked: files, truncated } = pickedFromInput([plain, inFolder]);
    expect(files.map((f) => [f.path, f.size])).toEqual([
      ['star.pathogen', PROGRAM.length],
      ['shapes/round/dot.pathogen', PROGRAM.length],
    ]);
    expect(truncated).toBe(false);
    expect(textOf(await files[1].read())).toEqual({ text: PROGRAM });
  });

  it('a folder picked whole with thousands of files: the first MAX_PICKED, and it says so (dot-folders not counted)', () => {
    const many = Array.from({ length: 5000 }, (_, i) => {
      const file = new File(['x'], `f${i}.js`);
      Object.defineProperty(file, 'webkitRelativePath', { value: `project/node_modules/f${i}.js` });
      return file;
    });
    const hidden = Array.from({ length: 3000 }, (_, i) => {
      const file = new File(['x'], `o${i}`);
      Object.defineProperty(file, 'webkitRelativePath', { value: `project/.git/objects/o${i}` });
      return file;
    });
    const { picked, truncated } = pickedFromInput([...hidden, ...many]);
    expect([picked.length, truncated, picked[0].path]).toEqual([MAX_PICKED, true, 'project/node_modules/f0.js']);
  });

  /** A fake folder entry that hands its children over two at a time, as browsers do in batches. */
  const folderEntry = (name: string, children: DroppedEntry[]): DroppedEntry => ({
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let at = 0;
      return {
        readEntries: (ok) => {
          const batch = children.slice(at, at + 2);
          at += 2;
          setTimeout(() => ok(batch), 0);
        },
      };
    },
  });
  const fileEntry = (name: string, text = PROGRAM): DroppedEntry => ({
    name,
    isFile: true,
    isDirectory: false,
    file: (ok) => ok(new File([text], name)),
  });

  it('a dropped folder is walked, every batch, folders inside it too; dot-folders aren’t', async () => {
    const shapes = folderEntry('shapes', [
      fileEntry('a.pathogen'),
      fileEntry('b.pathogen'),
      fileEntry('c.pathogen'),
      folderEntry('round', [fileEntry('dot.pathogen')]),
      folderEntry('.git', [fileEntry('HEAD')]),
    ]);
    const loose = new File([PROGRAM], 'loose.pathogen');
    const { picked: files, truncated } = await pickedFromDrop({ entries: [shapes, null], files: [null, loose] });
    expect([files.map((f) => f.path), truncated]).toEqual([
      ['shapes/a.pathogen', 'shapes/b.pathogen', 'shapes/c.pathogen', 'shapes/round/dot.pathogen', 'loose.pathogen'],
      false,
    ]);
  });

  it('a drop of more than MAX_PICKED files stops reading, and says so', async () => {
    const many = folderEntry(
      'huge',
      Array.from({ length: MAX_PICKED + 3 }, (_, i) => fileEntry(`f${i}.pathogen`)),
    );
    const { picked: files, truncated } = await pickedFromDrop({ entries: [many], files: [null] });
    expect([files.length, truncated]).toEqual([MAX_PICKED, true]);
  });

  it('captureDrop takes the entries and files while the drop lasts', () => {
    const file = new File([PROGRAM], 'a.pathogen');
    const entry = fileEntry('a.pathogen');
    const data = {
      items: [{ kind: 'file', webkitGetAsEntry: () => entry, getAsFile: () => file }],
      files: [file],
    } as unknown as DataTransfer;
    expect(captureDrop(data)).toEqual({ entries: [entry], files: [file] });
  });
});

describe('leftOutLines', () => {
  it('each name and why, then how many more past the limit', () => {
    const out = Array.from({ length: 8 }, (_, i) => ({ name: `f${i}.csv`, reason: 'no.' }));
    expect(leftOutLines(out, 3)).toEqual(['f0.csv: no.', 'f1.csv: no.', 'f2.csv: no.', '…and 5 more.']);
  });
});

describe('planUpload: the change an upload makes', () => {
  it('adds the files; new programs go at the end of the list in the order they came; one file opens', () => {
    const one = planUpload(
      state(),
      [{ path: 'parts/springs.pathogen', text: PROGRAM, whenTaken: 'keep-both' }],
      'parts',
    );
    expect(one.ok && [one.change.message, one.change.open]).toEqual([
      'Added springs.pathogen to parts/.',
      'parts/springs.pathogen',
    ]);
    const two = planUpload(
      state(),
      [
        { path: 'b.pathogen', text: PROGRAM, whenTaken: 'keep-both' },
        { path: 'lib.pathogen', text: LABELS, whenTaken: 'keep-both' },
        { path: 'a.pathogen', text: PROGRAM, whenTaken: 'keep-both' },
      ],
      '',
    );
    if (!two.ok) throw new Error(two.message);
    const after = applyChange(state(), two.change);
    expect([after.entryPoints, two.change.message, two.change.open]).toEqual([
      ['main.pathogen', 'try-sizes.pathogen', 'b.pathogen', 'a.pathogen'],
      'Added 3 files: b.pathogen, lib.pathogen and a.pathogen.',
      undefined,
    ]);
  });

  it('Keep both numbers the new one, past names taken in this upload too', () => {
    const planned = planUpload(
      state(),
      [
        { path: 'parts/labels.pathogen', text: LABELS, whenTaken: 'keep-both' },
        { path: 'parts/Labels.pathogen', text: LABELS, whenTaken: 'keep-both' },
      ],
      'parts',
    );
    if (!planned.ok) throw new Error(planned.message);
    // Each new file keeps its own letter case: the number is checked against names in any case.
    expect(
      Object.keys(applyChange(state(), planned.change).files).filter((p) => p.toLowerCase().includes('labels')),
    ).toEqual(['parts/labels.pathogen', 'parts/labels-2.pathogen', 'parts/Labels-3.pathogen']);
  });

  it('Replace swaps the text in place, and the Undo puts the old text back', () => {
    const planned = planUpload(
      state(),
      [{ path: 'parts/Labels.pathogen', text: 'module;\n// new\n', whenTaken: 'replace' }],
      'parts',
    );
    if (!planned.ok) throw new Error(planned.message);
    const after = applyChange(state(), planned.change);
    expect([after.files['parts/labels.pathogen'], planned.change.message, planned.change.open]).toEqual([
      'module;\n// new\n',
      'Replaced labels.pathogen.',
      'parts/labels.pathogen',
    ]);
    expect(applyChange(after, planned.undo)).toEqual(state());
  });

  it('a replaced program that’s a module now leaves the list; a replaced module that’s a program joins it; the main stays first', () => {
    const planned = planUpload(
      state(),
      [
        { path: 'try-sizes.pathogen', text: LABELS, whenTaken: 'replace' },
        { path: 'parts/gears.pathogen', text: PROGRAM, whenTaken: 'replace' },
        { path: 'main.pathogen', text: LABELS, whenTaken: 'replace' },
      ],
      '',
    );
    if (!planned.ok) throw new Error(planned.message);
    expect(applyChange(state(), planned.change).entryPoints).toEqual(['main.pathogen', 'parts/gears.pathogen']);
    expect(planned.change.message).toBe('Replaced try-sizes.pathogen, parts/gears.pathogen and main.pathogen.');
  });

  it('the main replaced with a module stays the main (it "can’t draw as the main" until another is chosen)', () => {
    const planned = planUpload(state(), [{ path: 'main.pathogen', text: LABELS, whenTaken: 'replace' }], '');
    if (!planned.ok) throw new Error(planned.message);
    const after = applyChange(state(), planned.change);
    expect([after.entryPoints, after.files['main.pathogen']]).toEqual([
      ['main.pathogen', 'try-sizes.pathogen'],
      LABELS,
    ]);
  });

  it('a file with no clash when sorted, whose name an earlier Keep both took, is numbered too', () => {
    const planned = planUpload(
      state(),
      [
        { path: 'parts/labels.pathogen', text: LABELS, whenTaken: 'keep-both' },
        { path: 'parts/labels-2.pathogen', text: LABELS, whenTaken: 'keep-both' },
      ],
      'parts',
    );
    if (!planned.ok) throw new Error(planned.message);
    expect(planned.change.message).toBe('Added 2 files to parts/: labels-2.pathogen and labels-2-2.pathogen.');
  });

  it('added and replaced, in one message', () => {
    const planned = planUpload(
      state(),
      [
        { path: 'parts/springs.pathogen', text: PROGRAM, whenTaken: 'keep-both' },
        { path: 'parts/labels.pathogen', text: LABELS, whenTaken: 'replace' },
      ],
      'parts',
    );
    expect(planned.ok && planned.change.message).toBe(
      'Added springs.pathogen to parts/, and replaced labels.pathogen.',
    );
  });

  it('a name freed since the prompt is a plain add; one taken since is numbered (Keep both)', () => {
    const now = state();
    delete now.files['parts/labels.pathogen'];
    const freed = planUpload(now, [{ path: 'parts/labels.pathogen', text: LABELS, whenTaken: 'replace' }], 'parts');
    expect(freed.ok && freed.change.message).toBe('Added labels.pathogen to parts/.');
    const taken = planUpload(state(), [{ path: 'try-sizes.pathogen', text: PROGRAM, whenTaken: 'keep-both' }], '');
    expect(taken.ok && taken.change.open).toBe('try-sizes-2.pathogen');
  });

  it('more files than the limit refuses the whole upload, before anything is added', () => {
    const entries = Array.from({ length: 17 }, (_, i) => ({
      path: `f${i}.pathogen`,
      text: PROGRAM,
      whenTaken: 'keep-both' as const,
    }));
    expect(planUpload(state(), entries, '')).toEqual({
      ok: false,
      message: 'A workspace can hold at most 20 files: this one has 4, and the upload would make 21.',
    });
    // Replacing adds nothing: the same count with replaces fits.
    expect(planUpload(state(), entries.slice(0, 16), '').ok).toBe(true);
  });

  it('a workspace with no programs shows the first one uploaded', () => {
    const empty: WorkspaceState = { files: {}, folders: [], entryPoints: [] };
    const planned = planUpload(empty, [{ path: 'star.pathogen', text: PROGRAM, whenTaken: 'keep-both' }], '');
    expect(planned.ok && planned.change.show).toBe('star.pathogen');
  });
});
