import { deflateSync } from 'node:zlib';

/**
 * A stand-in for the network, for a Node font host's `fetchImpl`: while
 * `online()` is true, Google Fonts answers every css2 request with `font` at
 * the weight asked for; otherwise every request fails the way Node's fetch
 * does with no connection.
 */
export function scriptedGoogle(font: Uint8Array, online: () => boolean): typeof fetch {
  const fileUrl = 'https://fonts.gstatic.com/s/scripted/v1/font.ttf';
  return async (input: string | URL | Request) => {
    if (!online()) throw new TypeError('fetch failed');
    const url = input instanceof Request ? input.url : String(input);
    if (url === fileUrl) return new Response(new Uint8Array(font));
    const weight = /wght@(\d+)/.exec(decodeURIComponent(url))?.[1] ?? '400';
    return new Response(`@font-face {\n  font-weight: ${weight};\n  src: url(${fileUrl}) format('truetype');\n}\n`);
  };
}

/**
 * The smallest TrueType file the loader accepts as complete: a header and one
 * table record whose data — `marker`, so tests can tell files apart — lies
 * inside the file. Enough for code that checks a font file is whole (the
 * installed-font search, the cache); not enough to draw a glyph. Tests that
 * draw use the real font in tests/fixtures/fonts/.
 */
export function minimalSfnt(marker = 'font'): Uint8Array {
  const data = new TextEncoder().encode(marker);
  const bytes = new Uint8Array(12 + 16 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x00010000); // TrueType
  view.setUint16(4, 1); // one table
  bytes.set(new TextEncoder().encode('name'), 12); // its tag
  view.setUint32(12 + 8, 28); // where its data starts
  view.setUint32(12 + 12, data.length); // and how long it is
  bytes.set(data, 28);
  return bytes;
}

/** The marker a minimalSfnt file carries. */
export function sfntMarker(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.subarray(28));
}

/**
 * A WOFF (1.0) file made from a TrueType file the way a font tool writes one:
 * the same tables, each zlib-compressed when that makes it smaller, or stored
 * as is with `compress: false`. Tests make their own because the repo has no
 * real WOFF 1.0 file (fonts/Raleway/*.woff hold WOFF2 data).
 */
export function ttfToWoff(ttf: Uint8Array, { compress = true } = {}): Uint8Array {
  const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const numTables = view.getUint16(4);
  const pad4 = (n: number) => (n + 3) & ~3;
  const tables = Array.from({ length: numTables }, (_, i) => {
    const record = 12 + i * 16;
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    const data = ttf.subarray(offset, offset + length);
    const packed = compress ? new Uint8Array(deflateSync(data)) : data;
    return {
      tag: ttf.subarray(record, record + 4),
      checksum: view.getUint32(record + 4),
      origLength: length,
      stored: packed.length < length ? packed : data,
    };
  });
  let end = 44 + numTables * 20;
  const placed = tables.map((table) => {
    const at = end;
    end = pad4(end + table.stored.length);
    return at;
  });
  const woff = new Uint8Array(end);
  const out = new DataView(woff.buffer);
  out.setUint32(0, 0x774f4646); // 'wOFF'
  out.setUint32(4, view.getUint32(0)); // flavor: the TrueType version
  out.setUint32(8, woff.length);
  out.setUint16(12, numTables);
  out.setUint32(16, 12 + numTables * 16 + tables.reduce((sum, table) => sum + pad4(table.origLength), 0));
  out.setUint16(20, 1); // version 1.0; no metadata or private data
  tables.forEach((table, i) => {
    const entry = 44 + i * 20;
    woff.set(table.tag, entry);
    out.setUint32(entry + 4, placed[i]);
    out.setUint32(entry + 8, table.stored.length);
    out.setUint32(entry + 12, table.origLength);
    out.setUint32(entry + 16, table.checksum);
    woff.set(table.stored, placed[i]);
  });
  return woff;
}
