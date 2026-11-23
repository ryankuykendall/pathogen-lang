// .zip files, both ways (phase 2g, note 70; docs/workspace-files.md
// "Downloading a workspace" and "A workspace from a project").
//
// Writing (Download workspace) stores each file as it is, uncompressed: a
// workspace is at most 20 small text files, and a stored .zip needs only a
// CRC per file. Names are UTF-8, flagged as such, with Unix modes so an
// unzipped folder and its files open as usual.
//
// Reading (the import) takes a .zip in slices: the end record from the file's
// tail, then the central directory, then each entry only when asked. So a
// large .zip (a project zipped with its node_modules) is never read whole,
// and the entries the import leaves out are never read at all. Entries are
// stored or deflated; deflated ones go through the browser's own
// DecompressionStream('deflate-raw'), with each entry's size and CRC checked.

/** Why a .zip can't be read at all, or why one of its entries can't: a reason the page shows after a name. */
export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

/** Where a .zip's bytes come from: a picked File (read in slices) or bytes already in hand. */
export interface ZipSource {
  size: number;
  read: (start: number, end: number) => Promise<Uint8Array>;
}

/** An entry of a .zip: a file, or a folder (its path without the trailing slash). */
export interface ZipEntry {
  /** As stored, with `\` turned into `/` and a leading `/` or `./` dropped. A `..` segment is kept. */
  path: string;
  folder: boolean;
  /** Its size once read, as the .zip says. */
  size: number;
  /** Why it can't be read (encrypted, an unknown compression), or null. */
  problem: string | null;
  /** Its bytes. Rejects with a ZipError when the entry is damaged or has a problem. */
  read: () => Promise<ArrayBuffer>;
}

/** One entry to write: a file with its bytes, or a folder, whose path ends with `/`. */
export interface ZipInput {
  path: string;
  bytes?: Uint8Array;
}

// ---------- CRC-32 (the IEEE polynomial, as every .zip uses) ----------

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------- writing ----------

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const ZIP64_END_SIG = 0x06064b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const UTF8_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;
/** Made by Unix (3), spec version 2.0: the external attributes hold Unix modes. */
const MADE_BY_UNIX = (3 << 8) | 20;
const FILE_MODE = 0o100644;
const FOLDER_MODE = 0o040755;
/** The MS-DOS directory attribute, for tools that read only that. */
const DOS_DIRECTORY = 0x10;

/** The MS-DOS time and date a .zip stores, in local time (two seconds apart; 1980 at the earliest). */
function dosTime(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/**
 * A .zip holding `entries` in order, each file stored uncompressed. A folder's
 * path ends with `/`. A workspace's .zip is far below the 4 GB and 65,535
 * entries a .zip holds without zip64 records.
 */
export function writeZip(entries: readonly ZipInput[], when: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosTime(when);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const folder = entry.path.endsWith('/');
    const name = encoder.encode(entry.path);
    const data = folder ? new Uint8Array() : (entry.bytes ?? new Uint8Array());
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL_SIG, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, CENTRAL_SIG, true);
    cv.setUint16(4, MADE_BY_UNIX, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    // Extra field, comment, disk and internal attributes: all zero.
    cv.setUint32(38, (((folder ? FOLDER_MODE : FILE_MODE) << 16) | (folder ? DOS_DIRECTORY : 0)) >>> 0, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, END_SIG, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ---------- reading ----------

const NOT_A_ZIP = "it isn't a .zip file.";
const DAMAGED = "it's damaged or cut short.";
const SPLIT = "it's split across several files; join them into one .zip first.";
const ENTRY_DAMAGED = 'is damaged in the .zip, so it couldn’t be read.';
const ENCRYPTED = "is encrypted, and the playground can't open encrypted files.";
const UNKNOWN_METHOD =
  "is compressed in a way the playground can't read. Make the .zip again with your computer's own Compress.";
const STORED = 0;
const DEFLATED = 8;
/** The end record's fixed part, and the longest comment that can follow it. */
const END_SIZE = 22;
const MAX_COMMENT = 0xffff;

function bytesSource(bytes: Uint8Array): ZipSource {
  return { size: bytes.length, read: async (start, end) => bytes.subarray(start, end) };
}

/** A Blob's slice as bytes: `arrayBuffer()` where the Blob has it, else a FileReader (older test DOMs). */
async function sliceBytes(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  const part = blob.slice(start, end);
  if (typeof part.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsArrayBuffer(part);
  });
}

function blobSource(blob: Blob): ZipSource {
  return { size: blob.size, read: async (start, end) => sliceBytes(blob, start, end) };
}

const view = (bytes: Uint8Array): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u64 = (v: DataView, at: number): number => Number(v.getBigUint64(at, true));

/** The bytes of `start` to `end`, all of them, or the .zip is damaged. */
async function readExactly(source: ZipSource, start: number, end: number, why = DAMAGED): Promise<Uint8Array> {
  if (start < 0 || end > source.size || end < start) throw new ZipError(why);
  const bytes = await source.read(start, end);
  if (bytes.length !== end - start) throw new ZipError(why);
  return bytes;
}

const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const utf8Loose = new TextDecoder('utf-8');
// WHATWG maps "latin1" to Windows-1252, the code page older Windows tools wrote names in.
const windows1252 = new TextDecoder('latin1');

/** A stored name: UTF-8 when flagged or when it decodes as such, else Windows-1252. */
function decodeName(raw: Uint8Array, flags: number): string {
  if (flags & UTF8_FLAG) return utf8Loose.decode(raw);
  try {
    return utf8Strict.decode(raw);
  } catch {
    return windows1252.decode(raw);
  }
}

/** Slashes for backslashes; a leading `/` or `./` dropped. A `..` stays, for the caller's dot rule. */
function cleanPath(name: string): { path: string; folder: boolean } {
  let path = name.replace(/\\/g, '/');
  for (;;) {
    if (path.startsWith('/')) path = path.slice(1);
    else if (path.startsWith('./')) path = path.slice(2);
    else break;
  }
  const folder = path.endsWith('/');
  return { path: folder ? path.replace(/\/+$/, '') : path, folder };
}

/** Where the central directory is, and how many entries it holds. */
async function findDirectory(source: ZipSource): Promise<{ count: number; size: number; offset: number }> {
  if (source.size < END_SIZE) throw new ZipError(NOT_A_ZIP);
  const tailStart = Math.max(0, source.size - END_SIZE - MAX_COMMENT);
  const tail = await readExactly(source, tailStart, source.size, NOT_A_ZIP);
  const tv = view(tail);
  // The end record is the one whose comment reaches the end of the file: a
  // comment can hold the record's signature too. Failing that (bytes added
  // after the .zip), the last signature that leaves room for a record.
  let at = -1;
  let fallback = -1;
  for (let i = tail.length - END_SIZE; i >= 0; i--) {
    if (tv.getUint32(i, true) !== END_SIG) continue;
    if (fallback < 0) fallback = i;
    if (i + END_SIZE + tv.getUint16(i + 20, true) === tail.length) {
      at = i;
      break;
    }
  }
  if (at < 0) at = fallback;
  if (at < 0) throw new ZipError(NOT_A_ZIP);
  const disk = tv.getUint16(at + 4, true);
  const directoryDisk = tv.getUint16(at + 6, true);
  let count = tv.getUint16(at + 10, true);
  let size = tv.getUint32(at + 12, true);
  let offset = tv.getUint32(at + 16, true);
  const zip64 = count === 0xffff || size === 0xffffffff || offset === 0xffffffff;
  if (!zip64) {
    if (disk !== 0 || directoryDisk !== 0 || tv.getUint16(at + 8, true) !== count) throw new ZipError(SPLIT);
    return { count, size, offset };
  }
  // A zip64 end record, found through the locator just before the end record.
  const locatorAt = tailStart + at - 20;
  const locator = await readExactly(source, locatorAt, locatorAt + 20);
  const lv = view(locator);
  if (lv.getUint32(0, true) !== ZIP64_LOCATOR_SIG) throw new ZipError(DAMAGED);
  if (lv.getUint32(16, true) > 1) throw new ZipError(SPLIT);
  const recordAt = u64(lv, 8);
  const record = await readExactly(source, recordAt, recordAt + 56);
  const rv = view(record);
  if (rv.getUint32(0, true) !== ZIP64_END_SIG) throw new ZipError(DAMAGED);
  if (rv.getUint32(16, true) !== 0 || rv.getUint32(20, true) !== 0) throw new ZipError(SPLIT);
  count = u64(rv, 32);
  size = u64(rv, 40);
  offset = u64(rv, 48);
  return { count, size, offset };
}

/** Inflate raw deflate data to exactly `expected` bytes, or reject as damaged. */
async function inflate(data: Uint8Array, expected: number): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  // The reader carries any error; these would otherwise be unhandled rejections.
  writer.write(data as Uint8Array<ArrayBuffer>).catch(() => undefined);
  writer.close().catch(() => undefined);
  const reader = stream.readable.getReader();
  try {
    // A size no browser can hold (a .zip can say 4 GB, or more with zip64) is a damaged entry, not a crash.
    const out = new Uint8Array(expected);
    let at = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // More than the .zip says: stop at once rather than inflate the rest (a .zip can lie about its sizes).
      if (at + value.length > expected) {
        await reader.cancel().catch(() => undefined);
        throw new ZipError(ENTRY_DAMAGED);
      }
      out.set(value, at);
      at += value.length;
    }
    if (at !== expected) throw new ZipError(ENTRY_DAMAGED);
    return out;
  } catch {
    throw new ZipError(ENTRY_DAMAGED);
  }
}

/**
 * The entries of a .zip, in the order its central directory lists them. Reads
 * the end record and the central directory only; each entry's `read()` reads
 * that entry. Rejects with a ZipError when the file isn't a .zip, is damaged
 * or cut short, or is split across several files.
 */
export async function readZip(input: ZipSource | Uint8Array | Blob): Promise<ZipEntry[]> {
  const source: ZipSource =
    input instanceof Uint8Array ? bytesSource(input) : 'read' in input ? input : blobSource(input);
  const { count, size, offset } = await findDirectory(source);
  const directory = await readExactly(source, offset, offset + size);
  const dv = view(directory);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > directory.length || dv.getUint32(p, true) !== CENTRAL_SIG) throw new ZipError(DAMAGED);
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    let compressed = dv.getUint32(p + 20, true);
    let uncompressed = dv.getUint32(p + 24, true);
    const nameLength = dv.getUint16(p + 28, true);
    const extraLength = dv.getUint16(p + 30, true);
    const commentLength = dv.getUint16(p + 32, true);
    let localAt = dv.getUint32(p + 42, true);
    const end = p + 46 + nameLength + extraLength + commentLength;
    if (end > directory.length) throw new ZipError(DAMAGED);
    const name = decodeName(directory.subarray(p + 46, p + 46 + nameLength), flags);
    // zip64 sizes and offset: in the extra field, in this order, for each value the header marks with all ones.
    for (let x = p + 46 + nameLength; x + 4 <= p + 46 + nameLength + extraLength;) {
      const id = dv.getUint16(x, true);
      const length = dv.getUint16(x + 2, true);
      if (id === 0x0001) {
        let y = x + 4;
        const take = (): number => {
          if (y + 8 > x + 4 + length) throw new ZipError(DAMAGED);
          const v = u64(dv, y);
          y += 8;
          return v;
        };
        if (uncompressed === 0xffffffff) uncompressed = take();
        if (compressed === 0xffffffff) compressed = take();
        if (localAt === 0xffffffff) localAt = take();
      }
      x += 4 + length;
    }
    p = end;

    const { path, folder } = cleanPath(name);
    const problem = folder
      ? null
      : flags & ENCRYPTED_FLAG
        ? ENCRYPTED
        : method !== STORED && method !== DEFLATED
          ? UNKNOWN_METHOD
          : null;
    const read = async (): Promise<ArrayBuffer> => {
      if (problem !== null) throw new ZipError(problem);
      if (folder) return new ArrayBuffer(0);
      const header = await readExactly(source, localAt, localAt + 30, ENTRY_DAMAGED);
      const hv = view(header);
      if (hv.getUint32(0, true) !== LOCAL_SIG) throw new ZipError(ENTRY_DAMAGED);
      const dataAt = localAt + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
      const data = await readExactly(source, dataAt, dataAt + compressed, ENTRY_DAMAGED);
      let bytes: Uint8Array;
      if (method === STORED) {
        if (compressed !== uncompressed) throw new ZipError(ENTRY_DAMAGED);
        bytes = data.slice();
      } else {
        bytes = await inflate(data, uncompressed);
      }
      if (crc32(bytes) !== crc) throw new ZipError(ENTRY_DAMAGED);
      return bytes.buffer as ArrayBuffer;
    };
    entries.push({ path, folder, size: uncompressed, problem, read });
  }
  return entries;
}
