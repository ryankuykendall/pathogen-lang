/**
 * Data files (docs/data-import.md): which extensions a program can import as
 * data, and the names messages suggest for them. One home for the loader,
 * the workspace's rules and the editors, so they can't disagree about what a
 * data file is.
 */
import { BUILTIN_NAMES } from '../builtin-names';
import { RESERVED_UNIT_NAMES } from '../evaluator/reserved-names';
import { KEYWORDS } from '../parser/path-args-tokenizer';

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

/** Words that can't name a variable: keywords and the values written as words. */
const NOT_NAMES: ReadonlySet<string> = new Set([...KEYWORDS, 'true', 'false', 'null', 'as', 'from', 'module']);

/**
 * Whether a word can name a variable a program declares: a name's shape, not
 * a keyword, a built-in name or an angle unit, and not one letter, which
 * could read as a path command.
 */
export function canBeName(word: string): boolean {
  return (
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(word) &&
    word.length > 1 &&
    !NOT_NAMES.has(word) &&
    !BUILTIN_NAMES.has(word) &&
    !RESERVED_UNIT_NAMES.has(word)
  );
}

/**
 * The name a message suggests for importing a data file: the file's name
 * without its extension, as one word (`gear-sizes.json` → `gearSizes`). A
 * name that starts with a digit gets `data` in front (`data2020`); one that
 * can't be a name, such as a built-in name or a keyword, gets `Data` after
 * it (`circleData`); one with no letters or digits is `data`. Letters lose
 * their accents (`über.json` → `uber`).
 */
export function suggestedDataName(written: string): string {
  const file = written.slice(written.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  // Letters lose their accents, as an uploaded file's name does: über → uber.
  const stem = (dot > 0 ? file.slice(0, dot) : file).normalize('NFD').replace(/\p{M}+/gu, '');
  const words = stem.split(/[^A-Za-z0-9_]+/).filter(Boolean);
  if (words.length === 0) return 'data';
  let name =
    words[0] +
    words
      .slice(1)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join('');
  if (/^[0-9]/.test(name)) name = `data${name}`;
  if (!canBeName(name)) name = `${name}Data`;
  return canBeName(name) ? name : 'data';
}

/**
 * One item's name for a list's name, for a message's example code:
 * `cities` → `city`, `boxes` → `box`, `gears` → `gear`. `item` when the name
 * has no plural ending, or when the singular can't be a name (`texts` →
 * `item`: `text` is a keyword).
 */
export function singularOf(name: string): string {
  let singular: string | null = null;
  if (/[^aeiou]ies$/.test(name)) singular = `${name.slice(0, -3)}y`;
  else if (/(?:ss|x|z|ch|sh)es$/.test(name)) singular = name.slice(0, -2);
  else if (/[^s]s$/.test(name)) singular = name.slice(0, -1);
  return singular !== null && canBeName(singular) ? singular : 'item';
}
