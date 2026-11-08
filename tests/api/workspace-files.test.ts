// The rules a workspace's files follow (website/api/workspace-files.ts;
// project-docs/modules/48-storage-design-v2.md, 50-storage-decisions-and-plan.md).

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { hashContent } from '../../website/api/utils';
import {
  checkManifest,
  contentHashOf,
  entryForText,
  fileKind,
  isJustMain,
  LIMITS,
  nameProblem,
  pathProblem,
  readStoredFiles,
  sha256Hex,
} from '../../website/api/workspace-files';

import type { WorkspaceManifest } from '../../website/api/workspace-files';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const file = (sha256 = SHA_A, size = 10) => ({ sha256, size });

describe('names', () => {
  it.each(['main.pathogen', 'gear-train_2.pathogen', 'Parts', '2d', 'a.b.c'])('allows %s', (name) => {
    expect(nameProblem(name)).toBeNull();
  });

  it.each([
    ['', "A name can't be empty."],
    [
      'my gear.pathogen',
      '"my gear.pathogen" can use only letters a–z and A–Z, digits, -, _ and ., and must start with a letter or a digit.',
    ],
    [
      '.hidden',
      '".hidden" can use only letters a–z and A–Z, digits, -, _ and ., and must start with a letter or a digit.',
    ],
    ['-dash', '"-dash" can use only letters a–z and A–Z, digits, -, _ and ., and must start with a letter or a digit.'],
    [
      'café.pathogen',
      '"café.pathogen" can use only letters a–z and A–Z, digits, -, _ and ., and must start with a letter or a digit.',
    ],
    ['CON.pathogen', '"CON.pathogen" is a name Windows reserves for itself.'],
    ['lpt3', '"lpt3" is a name Windows reserves for itself.'],
    ['Pathogen.JSON', '"Pathogen.JSON" is reserved: the playground writes the workspace\'s pathogen.json itself.'],
  ])('refuses %j', (name, message) => {
    expect(nameProblem(name)).toBe(message);
  });

  it('a name is at most 100 characters', () => {
    expect(nameProblem('x'.repeat(100))).toBeNull();
    expect(nameProblem('x'.repeat(101))).toBe(`"${'x'.repeat(101)}" is longer than 100 characters.`);
  });

  it('console is not CON', () => {
    expect(nameProblem('console.pathogen')).toBeNull();
  });
});

describe('paths', () => {
  it('files are .pathogen only, for now', () => {
    expect(pathProblem('parts/gears.pathogen', 'file')).toBeNull();
    expect(pathProblem('data/cities.csv', 'file')).toBe(
      '"data/cities.csv": a workspace holds .pathogen files for now.',
    );
    expect(pathProblem('README', 'file')).toBe('"README": a workspace holds .pathogen files for now.');
  });

  it('every segment follows the name rules, and none may be empty', () => {
    expect(pathProblem('parts/pathogen.json/a.pathogen', 'file')).toBe(
      '"pathogen.json" is reserved: the playground writes the workspace\'s pathogen.json itself.',
    );
    expect(pathProblem('parts//a.pathogen', 'file')).toBe("A name can't be empty.");
    expect(pathProblem('/a.pathogen', 'file')).toBe("A name can't be empty.");
  });

  it('folders nest 8 deep at most', () => {
    const eight = Array.from({ length: 8 }, (_, i) => `f${i}`).join('/');
    expect(pathProblem(`${eight}/a.pathogen`, 'file')).toBeNull();
    expect(pathProblem(eight, 'folder')).toBeNull();
    expect(pathProblem(`${eight}/f8/a.pathogen`, 'file')).toBe(`"${eight}/f8/a.pathogen" is more than 8 folders deep.`);
    expect(pathProblem(`${eight}/f8`, 'folder')).toBe(`"${eight}/f8" is more than 8 folders deep.`);
  });

  it('a path is at most 255 characters', () => {
    const long = `${'a'.repeat(100)}/${'b'.repeat(100)}/${'c'.repeat(45)}.pathogen`;
    expect(long.length).toBe(256);
    expect(pathProblem(long, 'file')).toBe(`"${long}" is longer than 255 characters.`);
  });

  it('kinds come from the extension', () => {
    expect([
      fileKind('a.pathogen'),
      fileKind('a.CSV'),
      fileKind('f/a.woff2'),
      fileKind('a.exe'),
      fileKind('pathogen'),
    ]).toEqual(['pathogen', 'data', 'font', null, null]);
  });
});

describe('checkManifest', () => {
  const ok = (input: unknown) => {
    const checked = checkManifest(input);
    if (!checked.ok) throw new Error(checked.message);
    return checked.value;
  };
  const message = (input: unknown) => {
    const checked = checkManifest(input);
    return checked.ok ? null : checked.message;
  };

  it('normalizes: files sorted, folders sorted and kept only when nothing is under them', () => {
    expect(
      ok({
        files: { 'main.pathogen': file(), 'parts/gears.pathogen': file(SHA_B) },
        folders: ['examples', 'parts', 'empty/deeper', 'empty', 'examples'],
        entryPoints: ['main.pathogen'],
      }),
    ).toEqual({
      files: { 'main.pathogen': file(), 'parts/gears.pathogen': file(SHA_B) },
      folders: ['empty/deeper', 'examples'],
      entryPoints: ['main.pathogen'],
    });
  });

  it('keeps the entry points in their order', () => {
    expect(
      ok({ files: { 'a.pathogen': file(), 'b.pathogen': file() }, entryPoints: ['b.pathogen', 'a.pathogen'] })
        .entryPoints,
    ).toEqual(['b.pathogen', 'a.pathogen']);
  });

  it.each([
    [
      { files: { 'a.pathogen': file() }, entryPoints: ['b.pathogen'] },
      '"entryPoints" lists "b.pathogen", which isn\'t a file in this workspace.',
    ],
    [
      { files: { 'a.pathogen': file() }, entryPoints: ['a.pathogen', 'a.pathogen'] },
      '"entryPoints" lists "a.pathogen" twice.',
    ],
    [{ files: { 'a.pathogen': file() }, entryPoints: 'a.pathogen' }, '"entryPoints" must be a list of file paths.'],
    [{ files: [] }, 'A workspace needs a "files" object.'],
    [{ files: { 'a.pathogen': { sha256: 'xyz', size: 1 } } }, '"a.pathogen" needs a sha256: 64 lowercase hex digits.'],
    [{ files: { 'a.pathogen': { sha256: SHA_A, size: -1 } } }, '"a.pathogen" needs a size in bytes.'],
    [
      { files: { 'a.pathogen': file() }, folders: ['bad name'] },
      '"bad name" can use only letters a–z and A–Z, digits, -, _ and ., and must start with a letter or a digit.',
    ],
  ])('refuses %j', (input, expected) => {
    expect(message(input)).toBe(expected);
  });

  it('names that differ only in letter case are refused, for files and for folders', () => {
    expect(message({ files: { 'Gears.pathogen': file(), 'gears.pathogen': file() } })).toBe(
      '"Gears.pathogen" and "gears.pathogen" differ only in letter case, so they would be one file on macOS and Windows.',
    );
    expect(message({ files: { 'Parts/a.pathogen': file(), 'parts/b.pathogen': file() } })).toBe(
      '"Parts" and "parts" differ only in letter case, so they would be one folder on macOS and Windows.',
    );
    expect(message({ files: { 'a.pathogen': file() }, folders: ['Shapes', 'shapes/round'] })).toBe(
      '"Shapes" and "shapes" differ only in letter case, so they would be one folder on macOS and Windows.',
    );
  });

  it("a file and a folder can't share a path", () => {
    expect(message({ files: { 'x.pathogen': file(), 'x.pathogen/y.pathogen': file() } })).toBe(
      '"x.pathogen" is both a file and a folder.',
    );
    expect(message({ files: { 'x.pathogen': file() }, folders: ['X.pathogen'] })).toBe(
      '"x.pathogen" is both a file and a folder.',
    );
  });

  it('at most 500 files', () => {
    const files = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`f${i}.pathogen`, file()]));
    expect(message({ files })).toBe('A workspace can hold at most 500 files; this one has 501.');
  });

  it('a .pathogen file is at most 1 MB, and the whole workspace at most 50 MB', () => {
    expect(message({ files: { 'a.pathogen': file(SHA_A, LIMITS.fileBytes.pathogen) } })).toBeNull();
    expect(message({ files: { 'a.pathogen': file(SHA_A, LIMITS.fileBytes.pathogen + 1) } })).toBe(
      '"a.pathogen" is larger than 1 MB, the most a file of its kind can be.',
    );
    const files = Object.fromEntries(
      Array.from({ length: 51 }, (_, i) => [`f${i}.pathogen`, file(SHA_A, 1024 * 1024)]),
    );
    expect(message({ files })).toBe('A workspace can hold at most 50 MB; this one holds 51 MB.');
  });
});

describe('the content hash', () => {
  const manifest = (over: Partial<WorkspaceManifest> = {}): WorkspaceManifest => ({
    files: { 'main.pathogen': file(), 'parts/gears.pathogen': file(SHA_B) },
    folders: ['examples'],
    entryPoints: ['main.pathogen'],
    ...over,
  });

  it('is hashContent of the canonical form: files by path, the entry points, the sorted folders', async () => {
    const canonical = JSON.stringify([
      [
        ['main.pathogen', SHA_A],
        ['parts/gears.pathogen', SHA_B],
      ],
      ['main.pathogen'],
      ['examples'],
    ]);
    expect(await contentHashOf(manifest())).toBe(await hashContent(canonical));
  });

  it('ignores the order files and folders are listed in, but not the order of the entry points', async () => {
    const base = await contentHashOf(
      manifest({ files: { 'parts/gears.pathogen': file(SHA_B), 'main.pathogen': file() } }),
    );
    expect(base).toBe(await contentHashOf(manifest()));
    expect(await contentHashOf(manifest({ folders: ['b', 'a'] }))).toBe(
      await contentHashOf(manifest({ folders: ['a', 'b'] })),
    );
    const two = { files: { 'a.pathogen': file(), 'b.pathogen': file() }, folders: [] };
    expect(await contentHashOf({ ...two, entryPoints: ['a.pathogen', 'b.pathogen'] })).not.toBe(
      await contentHashOf({ ...two, entryPoints: ['b.pathogen', 'a.pathogen'] }),
    );
  });

  it("changes with a file's content, a rename, or an empty folder; not with a size alone", async () => {
    const base = await contentHashOf(manifest());
    expect(
      await contentHashOf(manifest({ files: { 'main.pathogen': file(SHA_B), 'parts/gears.pathogen': file(SHA_B) } })),
    ).not.toBe(base);
    expect(
      await contentHashOf(manifest({ files: { 'main.pathogen': file(), 'parts/cog.pathogen': file(SHA_B) } })),
    ).not.toBe(base);
    expect(await contentHashOf(manifest({ folders: ['examples', 'more'] }))).not.toBe(base);
    expect(
      await contentHashOf(
        manifest({ files: { 'main.pathogen': file(SHA_A, 99), 'parts/gears.pathogen': file(SHA_B) } }),
      ),
    ).toBe(base);
  });

  it('sha256Hex is the full SHA-256 of the UTF-8 bytes', async () => {
    const text = 'gear(Point(55, 50), 40, 12); // é';
    expect(await sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    expect(await entryForText(text)).toEqual({ sha256: await sha256Hex(text), size: Buffer.byteLength(text, 'utf8') });
  });
});

describe('records from before phase 2', () => {
  it("a record with code and no files reads as just main.pathogen, with today's hash and its text", async () => {
    const code = 'circle(100, 100, 50);\n';
    const read = await readStoredFiles({ code }, 'old-hash');
    expect(read.manifest).toEqual({
      files: { 'main.pathogen': await entryForText(code) },
      folders: [],
      entryPoints: ['main.pathogen'],
    });
    expect(read.hash).toBe(await contentHashOf(read.manifest));
    expect(read.legacyText).toBe(code);
    expect(isJustMain(read.manifest)).toBe(true);
  });

  it('an approved, unedited workspace and its approval, both from before, still match', async () => {
    const code = 'M 0 0 L 10 10\n';
    const workspace = await readStoredFiles({ code }, await hashContent(code));
    const approval = await readStoredFiles({ code }, await hashContent(code));
    expect(workspace.hash).toBe(approval.hash);
    expect(workspace.hash).not.toBe(await hashContent(code));
  });

  it('the same workspace, read before and after the migration, has one hash', async () => {
    const code = 'M 0 0\n';
    const before = await readStoredFiles({ code }, await hashContent(code));
    const after = await readStoredFiles({ ...before.manifest }, before.hash);
    expect(after).toEqual({ ...before, legacyText: null });
  });

  it("a record in today's shape keeps its stored hash", async () => {
    const files = { 'main.pathogen': file() };
    expect(await readStoredFiles({ files, entryPoints: ['main.pathogen'] }, 'stored')).toEqual({
      manifest: { files, folders: [], entryPoints: ['main.pathogen'] },
      hash: 'stored',
      legacyText: null,
    });
  });

  it('isJustMain is false with a second file, an empty folder or another main', () => {
    const one = { 'main.pathogen': file() };
    expect(isJustMain({ files: one, folders: ['x'], entryPoints: ['main.pathogen'] })).toBe(false);
    expect(isJustMain({ files: { ...one, 'b.pathogen': file() }, folders: [], entryPoints: ['main.pathogen'] })).toBe(
      false,
    );
    expect(isJustMain({ files: one, folders: [], entryPoints: [] })).toBe(false);
  });
});
