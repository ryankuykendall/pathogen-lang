// What changed since the approved version, for a re-review (2e step 5e; note 59 answer 4,
// mockup v12 R3 and R4): the approved manifest against the submitted one, by hash, without
// reading any text.
// - a file new, changed, moved (one-to-one by hash, old path gone, new path new), removed;
// - a file renamed and edited is removed and new; two identical files, one removed, is no move;
// - a folder added or removed shows only when it's empty (a file's line already says the rest);
// - pathogen.json changes with the program list, its order alone included;
// - the card's counts leave moves and pathogen.json out.

import { describe, expect, it } from 'vitest';

import { compareManifests } from '../../website/api/review-changes';
import { entryForText } from '../../website/api/workspace-files';

import type { WorkspaceManifest } from '../../website/api/workspace-files';

/** A manifest from texts by path: the hashes are the real ones. */
async function manifest(
  texts: Record<string, string>,
  { folders = [], entryPoints = ['main.pathogen'] }: { folders?: string[]; entryPoints?: string[] } = {},
): Promise<WorkspaceManifest> {
  const files: WorkspaceManifest['files'] = {};
  for (const [path, text] of Object.entries(texts)) files[path] = await entryForText(text);
  return { files, folders, entryPoints };
}

const MAIN = 'import { gear } from "./parts/gears.pathogen";\ngear(4);\n';
const GEARS = 'module;\nexport fn gear(r) { circle(0, 0, r); }\n';
const KIT = 'module;\nexport const teeth = 12;\n';
const TRY = 'circle(1, 1, 1);\n';

describe('compareManifests', () => {
  it('nothing changed: no lines, no counts', async () => {
    const a = await manifest({ 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS });
    expect(compareManifests(a, a)).toEqual({
      files: [],
      foldersAdded: [],
      foldersRemoved: [],
      programs: null,
      counts: { new: 0, changed: 0, removed: 0 },
    });
  });

  it('a file changed, one new, one removed, and the program list with it (v12 R3)', async () => {
    const before = await manifest(
      { 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS, 'try-sizes.pathogen': TRY },
      { entryPoints: ['main.pathogen', 'try-sizes.pathogen'] },
    );
    const after = await manifest(
      { 'main.pathogen': MAIN, 'parts/gears.pathogen': `${GEARS}// deeper teeth\n`, 'parts/springs.pathogen': KIT },
      { entryPoints: ['main.pathogen'] },
    );
    expect(compareManifests(before, after)).toEqual({
      files: [
        { path: 'parts/gears.pathogen', mark: 'changed' },
        { path: 'parts/springs.pathogen', mark: 'new' },
        { path: 'try-sizes.pathogen', mark: 'removed' },
      ],
      foldersAdded: [],
      foldersRemoved: [],
      programs: {
        mainBefore: 'main.pathogen',
        mainAfter: 'main.pathogen',
        added: [],
        removed: ['try-sizes.pathogen'],
        orderOnly: false,
      },
      counts: { new: 1, changed: 1, removed: 1 },
    });
  });

  it('no file’s text changed: a move, an empty folder, and the list’s order (v12 R4)', async () => {
    const before = await manifest(
      { 'main.pathogen': MAIN, 'springs.pathogen': KIT, 'try-sizes.pathogen': TRY, 'demos/gears.pathogen': MAIN },
      { entryPoints: ['main.pathogen', 'demos/gears.pathogen', 'try-sizes.pathogen'] },
    );
    const after = await manifest(
      { 'main.pathogen': MAIN, 'parts/springs.pathogen': KIT, 'try-sizes.pathogen': TRY, 'demos/gears.pathogen': MAIN },
      { folders: ['examples'], entryPoints: ['main.pathogen', 'try-sizes.pathogen', 'demos/gears.pathogen'] },
    );
    expect(compareManifests(before, after)).toEqual({
      files: [{ path: 'parts/springs.pathogen', mark: 'moved', from: 'springs.pathogen' }],
      foldersAdded: ['examples'],
      foldersRemoved: [],
      programs: { mainBefore: 'main.pathogen', mainAfter: 'main.pathogen', added: [], removed: [], orderOnly: true },
      counts: { new: 0, changed: 0, removed: 0 },
    });
  });

  it('a file renamed and edited is removed and new, not moved', async () => {
    const before = await manifest({ 'main.pathogen': MAIN, 'kit.pathogen': KIT });
    const after = await manifest({ 'main.pathogen': MAIN, 'parts/kit.pathogen': `${KIT}// more\n` });
    expect(compareManifests(before, after).files).toEqual([
      { path: 'kit.pathogen', mark: 'removed' },
      { path: 'parts/kit.pathogen', mark: 'new' },
    ]);
  });

  it('two identical files, one removed, is a removal, not a move; a copy is new', async () => {
    const before = await manifest({ 'main.pathogen': MAIN, 'a.pathogen': KIT, 'b.pathogen': KIT });
    expect(compareManifests(before, await manifest({ 'main.pathogen': MAIN, 'a.pathogen': KIT })).files).toEqual([
      { path: 'b.pathogen', mark: 'removed' },
    ]);
    const copied = await manifest({ 'main.pathogen': MAIN, 'a.pathogen': KIT, 'b.pathogen': KIT, 'c.pathogen': KIT });
    expect(compareManifests(before, copied).files).toEqual([{ path: 'c.pathogen', mark: 'new' }]);
  });

  it('two identical files both moved pair up one to one, in path order', async () => {
    const before = await manifest({ 'main.pathogen': MAIN, 'a.pathogen': KIT, 'b.pathogen': KIT });
    const after = await manifest({ 'main.pathogen': MAIN, 'x/a.pathogen': KIT, 'x/b.pathogen': KIT });
    expect(compareManifests(before, after).files).toEqual([
      { path: 'x/a.pathogen', mark: 'moved', from: 'a.pathogen' },
      { path: 'x/b.pathogen', mark: 'moved', from: 'b.pathogen' },
    ]);
  });

  it('a new main, a program added and one removed', async () => {
    const before = await manifest(
      { 'main.pathogen': MAIN, 'a.pathogen': TRY, 'b.pathogen': TRY },
      { entryPoints: ['main.pathogen', 'a.pathogen'] },
    );
    const after = await manifest(
      { 'main.pathogen': MAIN, 'a.pathogen': TRY, 'b.pathogen': TRY },
      { entryPoints: ['b.pathogen', 'main.pathogen'] },
    );
    expect(compareManifests(before, after).programs).toEqual({
      mainBefore: 'main.pathogen',
      mainAfter: 'b.pathogen',
      added: ['b.pathogen'],
      removed: ['a.pathogen'],
      orderOnly: false,
    });
  });

  it('an empty folder removed shows; a folder that went with its files doesn’t (their lines say it)', async () => {
    const before = await manifest({ 'main.pathogen': MAIN, 'parts/gears.pathogen': GEARS }, { folders: ['spare'] });
    const after = await manifest({ 'main.pathogen': MAIN });
    expect(compareManifests(before, after)).toMatchObject({
      files: [{ path: 'parts/gears.pathogen', mark: 'removed' }],
      foldersAdded: [],
      foldersRemoved: ['spare'],
    });
  });

  it('a nested empty folder added reports itself, not its parent too', async () => {
    const before = await manifest({ 'main.pathogen': MAIN });
    const after = await manifest({ 'main.pathogen': MAIN }, { folders: ['a/b'] });
    expect(compareManifests(before, after).foldersAdded).toEqual(['a/b']);
  });

  it('an empty file gone and another added is a removal and a new file, not a move', async () => {
    const before = await manifest({ 'main.pathogen': MAIN, 'one.pathogen': '' });
    const after = await manifest({ 'main.pathogen': MAIN, 'two.pathogen': '' });
    expect(compareManifests(before, after).files).toEqual([
      { path: 'one.pathogen', mark: 'removed' },
      { path: 'two.pathogen', mark: 'new' },
    ]);
  });

  it('an approval from before phase 2 (just main.pathogen) compares in today’s rule', async () => {
    const before = await manifest({ 'main.pathogen': TRY });
    const after = await manifest({ 'main.pathogen': `${TRY}circle(2, 2, 2);\n` });
    expect(compareManifests(before, after)).toMatchObject({
      files: [{ path: 'main.pathogen', mark: 'changed' }],
      counts: { new: 0, changed: 1, removed: 0 },
    });
  });
});
