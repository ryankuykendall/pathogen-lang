// What Delete… asks before it deletes (phase 2d, step 4c; mockup v7 screen F,
// "Deleting a folder"; docs/workspace-files.md "Renaming, moving and
// deleting"): the files that go, and the files left that import them, which
// will show an error at those imports. The answer comes from step 2's
// deleteSummary; this is only the wording, for the confirmation dialog.

import type { ConfirmOptions } from '../components/shared/confirm-dialog.js';

const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** "a, b and c". */
function nameList(names: readonly string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
}

/** The warning about the files that import what goes, if any do. */
function importersWarning(importers: readonly string[], goneCount: number): string | undefined {
  if (importers.length === 0) return undefined;
  const one = importers.length === 1;
  const them = goneCount === 1 ? 'it' : 'them';
  return `${nameList(importers)} ${one ? 'imports' : 'import'} ${them}. ${one ? 'It' : 'They'}’ll show an error at ${one ? 'that import' : 'those imports'} until you change ${one ? 'it' : 'them'}.`;
}

/** By name, numbers by value, as the tree sorts them, so the list doesn't depend on the order files were added. */
const sorted = (paths: readonly string[]): string[] =>
  [...paths].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }) || (a < b ? -1 : 1));

export function deleteQuestion(
  path: string,
  isFolder: boolean,
  given: { files: readonly string[]; importers: readonly string[] },
): ConfirmOptions {
  const summary = { files: sorted(given.files), importers: sorted(given.importers) };
  const warning = importersWarning(summary.importers, summary.files.length);
  if (!isFolder) {
    return {
      title: `Delete ${baseOf(path)}?`,
      message: `This deletes ${path}.`,
      ...(warning ? { warning } : {}),
      confirmLabel: 'Delete',
      danger: true,
    };
  }
  const count = summary.files.length;
  if (count === 0) {
    return {
      title: `Delete ${path}/?`,
      message: 'This deletes the folder. There are no files in it.',
      confirmLabel: 'Delete the folder',
      danger: true,
    };
  }
  return {
    title: `Delete ${path}/?`,
    message: `This deletes the folder and the ${count === 1 ? 'file' : `${count} files`} in it:`,
    // Named from inside the folder, as the tree shows them under it.
    items: summary.files.map((file) => file.slice(path.length + 1)),
    ...(warning ? { warning } : {}),
    confirmLabel: `Delete the folder and ${count === 1 ? '1 file' : `${count} files`}`,
    danger: true,
  };
}
