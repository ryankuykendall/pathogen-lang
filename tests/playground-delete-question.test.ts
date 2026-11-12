// What Delete… asks (2d, step 4c; mockup v7 screen F, "Deleting a folder";
// docs/workspace-files.md "Renaming, moving and deleting"): the files that go,
// and the files that import them, which will show an error at those imports.

import { describe, expect, it } from 'vitest';

import { deleteQuestion } from '../playground/utils/delete-question.js';

describe('the delete question', () => {
  it('a folder with files, and files that import them (the mockup’s words; names sorted as the tree sorts)', () => {
    expect(
      deleteQuestion('parts', true, {
        files: ['parts/labels.pathogen', 'parts/gears.pathogen', 'parts/kit.pathogen'],
        importers: ['main.pathogen', 'demos/gears.pathogen', 'try-sizes.pathogen'],
      }),
    ).toEqual({
      title: 'Delete parts/?',
      message: 'This deletes the folder and the 3 files in it:',
      items: ['gears.pathogen', 'kit.pathogen', 'labels.pathogen'],
      warning:
        'demos/gears.pathogen, main.pathogen and try-sizes.pathogen import them. They’ll show an error at those imports until you change them.',
      confirmLabel: 'Delete the folder and 3 files',
      danger: true,
    });
  });

  it('a folder’s files are named from inside it; one file, and none', () => {
    const one = deleteQuestion('lib', true, { files: ['lib/round/dot.pathogen'], importers: [] });
    expect([one.message, one.items, one.warning, one.confirmLabel]).toEqual([
      'This deletes the folder and the file in it:',
      ['round/dot.pathogen'],
      undefined,
      'Delete the folder and 1 file',
    ]);
    const none = deleteQuestion('examples', true, { files: [], importers: [] });
    expect([none.title, none.message, none.items, none.confirmLabel]).toEqual([
      'Delete examples/?',
      'This deletes the folder. There are no files in it.',
      undefined,
      'Delete the folder',
    ]);
  });

  it('a file, and one file that imports it', () => {
    expect(
      deleteQuestion('parts/kit.pathogen', false, { files: ['parts/kit.pathogen'], importers: ['main.pathogen'] }),
    ).toEqual({
      title: 'Delete kit.pathogen?',
      message: 'This deletes parts/kit.pathogen.',
      warning: 'main.pathogen imports it. It’ll show an error at that import until you change it.',
      confirmLabel: 'Delete',
      danger: true,
    });
  });

  it('a file two others import', () => {
    const summary = { files: ['kit.pathogen'], importers: ['a.pathogen', 'b.pathogen'] };
    const q = deleteQuestion('kit.pathogen', false, summary);
    expect(q.warning).toBe(
      'a.pathogen and b.pathogen import it. They’ll show an error at those imports until you change them.',
    );
  });
});
