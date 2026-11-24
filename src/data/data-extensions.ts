/**
 * Which files are data files (docs/data-import.md "File types"), with no
 * imports, so the API Worker's bundle can share the rule (src/workspace/
 * files.ts) without the language around it. src/data/data-files.ts
 * re-exports it with the names a message suggests.
 */

/** How a data file is read. CSV joins in phase 3b. */
export type DataFormat = 'json';

/** docs/data-import.md "File types": GeoJSON, TopoJSON and FOLD are JSON. */
const FORMAT_BY_EXTENSION: Readonly<Record<string, DataFormat>> = {
  '.json': 'json',
  '.geojson': 'json',
  '.topojson': 'json',
  '.fold': 'json',
};

/** The data extensions, in the order the docs and messages list them. */
export const DATA_EXTENSIONS: readonly string[] = Object.keys(FORMAT_BY_EXTENSION);

/** A file name's extension, from its last dot, in lowercase; '' when it has none. */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/** How a path is read as data, by its extension (any letter case), or null when it isn't a data file. */
export function dataFormatOf(path: string): DataFormat | null {
  return FORMAT_BY_EXTENSION[extensionOf(path)] ?? null;
}
