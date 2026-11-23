// Phase 2g: the .zip writer (Download workspace) and reader (a workspace from a
// project). docs/workspace-files.md "Downloading a workspace" and "A workspace
// from a project"; note 70.
//
// The reader is checked against zips other tools made (tests/fixtures/zips,
// from tests/fixtures/zips/make-fixtures.ts: Info-ZIP's `zip -r`, the same
// with zip64 fields, and macOS's `ditto`, what Finder's Compress runs), and
// against zips built here byte by byte for the cases those tools don't make on
// demand. It reads a .zip in slices (the end record, the central directory,
// then each entry as asked), so a large .zip is never read whole. The writer
// is checked by reading its zips back, and by Info-ZIP's `unzip -t` where the
// machine has it.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { crc32, readZip, writeZip, ZipError } from '../playground/services/zip';

import type { ZipSource } from '../playground/services/zip';

const FIXTURES = join(__dirname, 'fixtures', 'zips');
const GEARS = join(__dirname, '..', 'project-docs', 'modules', 'mockups-2f-vscode-chip', 'gears-project');
const utf8 = new TextEncoder();
const text = (buffer: ArrayBuffer): string => new TextDecoder().decode(buffer);

const hasUnzip = ((): boolean => {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

// ---------- zips built byte by byte ----------

interface Built {
  /** The name as stored: a string (written as UTF-8) or raw bytes. */
  name: string | Uint8Array;
  data?: Uint8Array;
  method?: number;
  /** Store the deflated form of `data` (method 8). */
  deflate?: boolean;
  flags?: number;
  /** Sizes and CRC in a data descriptor after the data, zeros in the local header (flag bit 3). */
  descriptor?: boolean;
  /** 0xFFFFFFFF in the central directory's sizes and offset, the values in a zip64 extra field. */
  zip64?: boolean;
  /** A CRC to store instead of the right one. */
  crc?: number;
  /** An uncompressed size to store instead of the right one. */
  size?: number;
}

function build(entries: Built[], opts: { comment?: string; zip64End?: boolean; disks?: number } = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  const u64 = (v: number): number[] => [...u32(v), ...u32(Math.floor(v / 2 ** 32))];
  for (const e of entries) {
    const name = typeof e.name === 'string' ? utf8.encode(e.name) : e.name;
    const raw = e.data ?? new Uint8Array();
    const method = e.method ?? (e.deflate ? 8 : 0);
    const stored = e.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const crc = e.crc ?? crc32(raw);
    const size = e.size ?? raw.length;
    const flags = (e.flags ?? (typeof e.name === 'string' ? 0x0800 : 0)) | (e.descriptor ? 0x0008 : 0);
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(method), ...u16(0), ...u16(0x5b77),
      ...u32(e.descriptor ? 0 : crc), ...u32(e.descriptor ? 0 : stored.length), ...u32(e.descriptor ? 0 : size),
      ...u16(name.length), ...u16(0),
    ];
    const descriptor = e.descriptor ? [...u32(0x08074b50), ...u32(crc), ...u32(stored.length), ...u32(size)] : [];
    const extra = e.zip64 ? [...u16(0x0001), ...u16(24), ...u64(size), ...u64(stored.length), ...u64(offset)] : [];
    const big = 0xffffffff;
    central.push(
      new Uint8Array([
        ...u32(0x02014b50), ...u16(0x031e), ...u16(e.zip64 ? 45 : 20), ...u16(flags), ...u16(method), ...u16(0), ...u16(0x5b77),
        ...u32(crc), ...u32(e.zip64 ? big : stored.length), ...u32(e.zip64 ? big : size),
        ...u16(name.length), ...u16(extra.length), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
        ...u32(e.zip64 ? big : offset),
        ...name, ...extra,
      ]),
    );
    const chunk = new Uint8Array([...local, ...name, ...stored, ...descriptor]);
    parts.push(chunk);
    offset += chunk.length;
  }
  const cdStart = offset;
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  parts.push(...central);
  offset += cdSize;
  const comment = utf8.encode(opts.comment ?? '');
  const count = entries.length;
  if (opts.zip64End) {
    const zip64EndAt = offset;
    parts.push(
      new Uint8Array([
        ...u32(0x06064b50), ...u64(44), ...u16(45), ...u16(45), ...u32(0), ...u32(0),
        ...u64(count), ...u64(count), ...u64(cdSize), ...u64(cdStart),
      ]),
      new Uint8Array([...u32(0x07064b50), ...u32(0), ...u64(zip64EndAt), ...u32(1)]),
      new Uint8Array([
        ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(0xffff), ...u16(0xffff), ...u32(0xffffffff), ...u32(0xffffffff),
        ...u16(comment.length), ...comment,
      ]),
    );
  } else {
    const disks = opts.disks ?? 0;
    parts.push(
      new Uint8Array([
        ...u32(0x06054b50), ...u16(disks), ...u16(disks), ...u16(count), ...u16(count), ...u32(cdSize), ...u32(cdStart),
        ...u16(comment.length), ...comment,
      ]),
    );
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES, name)));
const gearsText = (path: string): string => readFileSync(join(GEARS, path), 'utf8');
const listed = (entries: { path: string; folder: boolean }[]): string[] =>
  entries.map((e) => (e.folder ? `${e.path}/` : e.path));

// ---------- crc32 ----------

describe('crc32', () => {
  it('matches the standard check value', () => {
    // The CRC-32 of "123456789" is CBF43926 (the IEEE polynomial's published check value).
    expect(crc32(utf8.encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

// ---------- reading zips other tools made ----------

describe('readZip: zips other tools made', () => {
  const EXPECTED = [
    'gears/',
    'gears/.DS_Store',
    'gears/empty/',
    'gears/sketch.pathogen',
    'gears/README.md',
    'gears/pathogen.json',
    'gears/parts/',
    'gears/parts/gears.pathogen',
    'gears/main.pathogen',
    'gears/try-sizes.pathogen',
    'gears/demos/',
    'gears/demos/train.pathogen',
  ];

  for (const name of ['zip-r.zip', 'zip64.zip']) {
    it(`${name}: every entry, with folders marked and each file's text`, async () => {
      const entries = await readZip(fixture(name));
      expect(listed(entries)).toEqual(EXPECTED);
      expect(entries.every((e) => e.problem === null)).toBe(true);
      const byPath = new Map(entries.map((e) => [e.path, e]));
      for (const path of ['main.pathogen', 'demos/train.pathogen', 'parts/gears.pathogen', 'pathogen.json']) {
        const entry = byPath.get(`gears/${path}`)!;
        expect(entry.size).toBe(Buffer.byteLength(gearsText(path)));
        expect(text(await entry.read())).toBe(gearsText(path));
      }
      expect(text(await byPath.get('gears/README.md')!.read())).toBe('# Gears\n\nA sample project.\n');
    });
  }

  it("ditto.zip (Finder's Compress): __MACOSX entries are listed as they are; the reader doesn't filter", async () => {
    const entries = await readZip(fixture('ditto.zip'));
    const paths = listed(entries);
    expect(paths).toEqual(
      expect.arrayContaining(['__MACOSX/', '__MACOSX/gears/', '__MACOSX/gears/._main.pathogen', 'gears/empty/']),
    );
    expect(paths.filter((p) => !p.startsWith('__MACOSX/')).sort()).toEqual([...EXPECTED].sort());
    const main = entries.find((e) => e.path === 'gears/main.pathogen')!;
    expect(text(await main.read())).toBe(gearsText('main.pathogen'));
  });

  it('reads a Blob (a picked File) as it reads bytes', async () => {
    const entries = await readZip(new Blob([fixture('zip-r.zip')]));
    expect(listed(entries)).toEqual(EXPECTED);
    const main = entries.find((e) => e.path === 'gears/main.pathogen')!;
    expect(text(await main.read())).toBe(gearsText('main.pathogen'));
  });
});

// ---------- reading in slices ----------

describe('readZip: reads only what it needs', () => {
  it('lists a large .zip from its end, and reads an entry without the others', async () => {
    const big = new Uint8Array(8 * 1024 * 1024).fill(7);
    const small = utf8.encode('M 0 0 l 10 10;\n');
    const bytes = build([
      { name: 'out/big.svg', data: big },
      { name: 'main.pathogen', data: small },
    ]);
    let read = 0;
    const source: ZipSource = {
      size: bytes.length,
      read: async (start, end) => {
        read += end - start;
        return bytes.slice(start, end);
      },
    };
    const entries = await readZip(source);
    expect(entries.map((e) => [e.path, e.size])).toEqual([
      ['out/big.svg', big.length],
      ['main.pathogen', small.length],
    ]);
    // The end record's search window (at most 64 KB and the record) and the central directory.
    expect(read).toBeLessThan(70 * 1024);
    read = 0;
    expect(new Uint8Array(await entries[1].read())).toEqual(small);
    expect(read).toBeLessThan(1024);
  });
});

// ---------- reading: the shapes tools write ----------

describe('readZip: the shapes zips come in', () => {
  it('reads a deflated entry, and one with its sizes in a data descriptor', async () => {
    const body = utf8.encode('M 0 0 l 10 10;\n'.repeat(40));
    const zip = build([
      { name: 'a.pathogen', data: body, deflate: true },
      { name: 'b.pathogen', data: body, deflate: true, descriptor: true },
      { name: 'c.pathogen', data: body, descriptor: true },
    ]);
    const entries = await readZip(zip);
    expect(entries.map((e) => [e.path, e.size])).toEqual([
      ['a.pathogen', body.length],
      ['b.pathogen', body.length],
      ['c.pathogen', body.length],
    ]);
    for (const entry of entries) expect(new Uint8Array(await entry.read())).toEqual(body);
  });

  it('reads zip64 sizes and offsets, and the zip64 end record', async () => {
    const body = utf8.encode('circle(10, 10, 5);\n');
    const zip = build(
      [
        { name: 'one.pathogen', data: body, zip64: true },
        { name: 'two.pathogen', data: body, deflate: true, zip64: true },
      ],
      { zip64End: true },
    );
    const entries = await readZip(zip);
    expect(entries.map((e) => [e.path, e.size])).toEqual([
      ['one.pathogen', body.length],
      ['two.pathogen', body.length],
    ]);
    for (const entry of entries) expect(new Uint8Array(await entry.read())).toEqual(body);
  });

  it('finds the end record behind a zip comment', async () => {
    const zip = build([{ name: 'a.pathogen', data: utf8.encode('M 0 0;') }], { comment: 'made by a tool' });
    expect((await readZip(zip)).map((e) => e.path)).toEqual(['a.pathogen']);
  });

  it("isn't fooled by a comment holding the end record's signature", async () => {
    // "PK\x05\x06" and 18 bytes that would read as an end record pointing nowhere.
    const fake = String.fromCharCode(0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0x41));
    const zip = build([{ name: 'a.pathogen', data: utf8.encode('M 0 0;') }], { comment: `note ${fake} end` });
    expect((await readZip(zip)).map((e) => e.path)).toEqual(['a.pathogen']);
  });

  it("turns Windows' backslashes into slashes, and drops a leading ./ or /", async () => {
    const zip = build([
      { name: 'gears\\parts\\gears.pathogen', data: utf8.encode('module;') },
      { name: './gears/main.pathogen', data: utf8.encode('M 0 0;') },
      { name: '/gears/demos/' },
    ]);
    expect((await readZip(zip)).map((e) => [e.path, e.folder])).toEqual([
      ['gears/parts/gears.pathogen', false],
      ['gears/main.pathogen', false],
      ['gears/demos', true],
    ]);
  });

  it('reads names as UTF-8 when flagged, as UTF-8 when they decode, and as Windows-1252 otherwise', async () => {
    const latin1 = new Uint8Array([0xfc, 0x62, 0x65, 0x72, 0x2e, 0x70, 0x61, 0x74, 0x68, 0x6f, 0x67, 0x65, 0x6e]);
    const zip = build([
      { name: 'über.pathogen', data: utf8.encode('M 0 0;') },
      { name: utf8.encode('größe.pathogen'), data: utf8.encode('M 0 0;') },
      { name: latin1, data: utf8.encode('M 0 0;') },
    ]);
    expect((await readZip(zip)).map((e) => e.path)).toEqual(['über.pathogen', 'größe.pathogen', 'über.pathogen']);
  });

  it("keeps a '..' segment for the caller to leave out, rather than resolving it", async () => {
    const zip = build([{ name: 'gears/../../evil.pathogen', data: utf8.encode('M 0 0;') }]);
    expect((await readZip(zip)).map((e) => e.path)).toEqual(['gears/../../evil.pathogen']);
  });
});

// ---------- reading: entries it can't read, and zips that aren't ----------

describe('readZip: what it refuses', () => {
  it('marks an encrypted entry, and one compressed another way, with a problem; others read', async () => {
    const zip = build([
      { name: 'secret.pathogen', data: utf8.encode('M 0 0;'), flags: 0x0801 },
      { name: 'bz.pathogen', data: utf8.encode('M 0 0;'), method: 12 },
      { name: 'fine.pathogen', data: utf8.encode('M 0 0;') },
    ]);
    const [secret, bz, fine] = await readZip(zip);
    expect(secret.problem).toBe("is encrypted, and the playground can't open encrypted files.");
    expect(bz.problem).toBe(
      "is compressed in a way the playground can't read. Make the .zip again with your computer's own Compress.",
    );
    expect(fine.problem).toBeNull();
    await expect(secret.read()).rejects.toThrow(ZipError);
    expect(text(await fine.read())).toBe('M 0 0;');
  });

  it("refuses a file that isn't a .zip", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]);
    await expect(readZip(png)).rejects.toThrow(new ZipError("it isn't a .zip file."));
    await expect(readZip(new Uint8Array())).rejects.toThrow(new ZipError("it isn't a .zip file."));
  });

  it('refuses a .zip cut short', async () => {
    const zip = fixture('zip-r.zip');
    // The end record survives, but the central directory it points to is cut away.
    const cut = new Uint8Array([...zip.slice(0, 200), ...zip.slice(zip.length - 22)]);
    await expect(readZip(cut)).rejects.toThrow(new ZipError("it's damaged or cut short."));
    // The end record itself is gone.
    await expect(readZip(zip.slice(0, zip.length - 10))).rejects.toThrow(ZipError);
  });

  it('refuses a .zip split across several files', async () => {
    const zip = build([{ name: 'a.pathogen', data: utf8.encode('M 0 0;') }], { disks: 1 });
    await expect(readZip(zip)).rejects.toThrow(
      new ZipError("it's split across several files; join them into one .zip first."),
    );
  });

  it("rejects a read whose data doesn't match its CRC, or inflates to another size", async () => {
    const body = utf8.encode('M 0 0 l 10 10;\n'.repeat(20));
    const [badCrc, tooBig, tooSmall] = await readZip(
      build([
        { name: 'crc.pathogen', data: body, crc: 0x12345678 },
        { name: 'big.pathogen', data: body, deflate: true, size: 10 },
        { name: 'small.pathogen', data: body, deflate: true, size: body.length + 50 },
      ]),
    );
    const damaged = new ZipError('is damaged in the .zip, so it couldn’t be read.');
    await expect(badCrc.read()).rejects.toThrow(damaged);
    await expect(tooBig.read()).rejects.toThrow(damaged);
    await expect(tooSmall.read()).rejects.toThrow(damaged);
  });

  it('rejects a read whose size no browser could hold as damaged, not with a crash', async () => {
    const body = utf8.encode('M 0 0;');
    // zip64 lets a size run past what a typed array can be.
    const [entry] = await readZip(build([{ name: 'huge.pathogen', data: body, deflate: true, zip64: true, size: 2 ** 40 }], { zip64End: true }));
    expect(entry.size).toBe(2 ** 40);
    await expect(entry.read()).rejects.toThrow(new ZipError('is damaged in the .zip, so it couldn’t be read.'));
  });

  it('rejects a read of deflate data that is broken, without an unhandled rejection', async () => {
    const zip = build([{ name: 'x.pathogen', data: new Uint8Array([1, 2, 3, 4, 5, 6]), method: 8, size: 40 }]);
    await expect((await readZip(zip))[0].read()).rejects.toThrow(
      new ZipError('is damaged in the .zip, so it couldn’t be read.'),
    );
  });
});

// ---------- writing ----------

describe('writeZip', () => {
  const when = new Date(2026, 10, 23, 14, 30, 10);
  const files = [
    { path: 'Gear-studies/' },
    { path: 'Gear-studies/pathogen.json', bytes: utf8.encode('{\n  "entryPoints": ["main.pathogen"]\n}\n') },
    { path: 'Gear-studies/main.pathogen', bytes: utf8.encode('M 0 0 l 10 10;\n') },
    { path: 'Gear-studies/parts/' },
    { path: 'Gear-studies/parts/über.pathogen', bytes: utf8.encode('module;\n') },
    { path: 'Gear-studies/empty/' },
  ];

  it('reads back as written: every folder and file, in order, byte for byte', async () => {
    const entries = await readZip(writeZip(files, when));
    expect(entries.map((e) => [e.path, e.folder, e.problem])).toEqual([
      ['Gear-studies', true, null],
      ['Gear-studies/pathogen.json', false, null],
      ['Gear-studies/main.pathogen', false, null],
      ['Gear-studies/parts', true, null],
      ['Gear-studies/parts/über.pathogen', false, null],
      ['Gear-studies/empty', true, null],
    ]);
    for (const [i, entry] of entries.entries()) {
      if (!entry.folder) expect(new Uint8Array(await entry.read())).toEqual(files[i].bytes);
    }
  });

  it('stores each file uncompressed, with UTF-8 names flagged and the time given', () => {
    const zip = writeZip(files, when);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // The first local header: signature, flags with bit 11 (UTF-8 names), method 0 (stored).
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(view.getUint16(8, true)).toBe(0);
    // DOS time and date: 14:30:10 and 2026-11-23.
    expect(view.getUint16(10, true)).toBe((14 << 11) | (30 << 5) | (10 >> 1));
    expect(view.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (11 << 5) | 23);
    // The end record counts the six entries.
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(6);
  });

  it.skipIf(!hasUnzip)("passes Info-ZIP's own check, with Unix modes and the UTF-8 name intact", () => {
    const dir = mkdtempSync(join(tmpdir(), 'pathogen-zip-'));
    try {
      const file = join(dir, 'Gear-studies.zip');
      writeFileSync(file, writeZip(files, when));
      const tested = execFileSync('unzip', ['-t', file]).toString();
      expect(tested).toMatch(/No errors detected/);
      const info = execFileSync('unzip', ['-Z', file]).toString();
      expect(info).toMatch(/^drwxr-xr-x .* Gear-studies\/$/m);
      expect(info).toMatch(/^-rw-r--r-- .* Gear-studies\/main\.pathogen$/m);
      expect(info).toContain('Gear-studies/parts/über.pathogen');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
