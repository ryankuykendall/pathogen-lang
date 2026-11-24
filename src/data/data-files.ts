/**
 * Data files (docs/data-import.md): which extensions a program can import as
 * data (data-extensions.ts, which has no imports so the API Worker can share
 * it), and the names messages suggest for them. One home for the loader, the
 * workspace's rules and the editors, so they can't disagree about what a
 * data file is.
 */
import { BUILTIN_NAMES } from '../builtin-names';
import { RESERVED_UNIT_NAMES } from '../evaluator/reserved-names';
import { KEYWORDS } from '../parser/path-args-tokenizer';

export { DATA_EXTENSIONS, dataFormatOf, extensionOf } from './data-extensions';
export type { DataFormat } from './data-extensions';

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
 * `gears` → `gear`, `cities` → `city`, `phases` → `phase`. `item` when the
 * name has no plural ending, or one whose singular can't be told from the
 * spelling (`boxes`, `matches` but `caches`, `status`, `axis`, `gas`,
 * `class`), or when the singular can't be a name (`texts` → `item`: `text` is
 * a keyword). A wrong guess in a message would read as a mistake.
 */
export function singularOf(name: string): string {
  let singular: string | null = null;
  if (/[^aeiou]ies$/.test(name)) singular = `${name.slice(0, -3)}y`;
  else if (/(?:x|zz|ch|sh|ss)es$|(?:ss|us|is|as)$/.test(name)) singular = null;
  else if (name.endsWith('s')) singular = name.slice(0, -1);
  return singular !== null && canBeName(singular) ? singular : 'item';
}
