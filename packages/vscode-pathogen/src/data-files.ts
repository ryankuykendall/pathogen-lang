/**
 * Which files are data files (docs/data-import.md "File types"), for the
 * extension's watchers and its open tabs. A copy of src/data/data-files.ts's
 * list (the extension's build can't import src/), pinned to it by
 * tests/vscode-preview-parity.test.ts.
 */
export const DATA_EXTENSIONS: readonly string[] = ['.json', '.geojson', '.topojson', '.fold'];

/** The project file every folder may hold: it is JSON, but never data. */
const PROJECT_FILE = 'pathogen.json';

/** Whether a file path names a data file a program can import. */
export function isDataFile(filePath: string): boolean {
  const name = filePath.slice(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 && name !== PROJECT_FILE && DATA_EXTENSIONS.includes(name.slice(dot).toLowerCase());
}

/** A file watcher's glob for every file an import may read, and the project files. */
export const IMPORTABLE_FILES_GLOB = `**/*.{pathogen,${DATA_EXTENSIONS.map((e) => e.slice(1)).join(',')}}`;
